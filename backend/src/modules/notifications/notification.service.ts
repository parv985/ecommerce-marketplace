import { User } from "../../models/User.js";
import { UserRole } from "../../constants/roles.js";
import type { ISeller } from "../../models/Seller.js";
import type { IOrder } from "../../models/Order.js";
import type { IReturnRequest } from "../../models/ReturnRequest.js";
import { AppError } from "../../errors/AppError.js";
import { OrderStatus } from "../../constants/orderStatus.js";
import { SellerStatus } from "../../constants/sellerStatus.js";
import { ReturnStatus } from "../../constants/returnStatus.js";
import { RefundMethod } from "../../constants/payment.js";
import {
  NotificationChannel,
  NotificationType,
  RETURN_APPROVED_REFUND_MESSAGE,
} from "../../constants/notificationTypes.js";
import { sendNotificationEmail, isValidEmailAddress } from "../../services/email.service.js";
import { logAudit } from "../../services/audit.service.js";
import {
  MAX_EMAIL_DISPATCH_ROUNDS,
  NotificationEmailStatus,
} from "../../models/Notification.js";
import {
  claimEmailRetry,
  countFailedEmails,
  countUnreadForUser,
  createDefaultPreference,
  createNotificationIfNew,
  findNotificationByDedupeKey,
  findNotificationByIdAndUser,
  findPreferenceByUserId,
  listFailedEmailNotifications,
  listNotificationsForUser,
  markAllNotificationsRead,
  markEmailStatus,
  markNotificationRead,
  updatePreferenceByUserId,
} from "./notification.repository.js";
import {
  listNotificationsQuerySchema,
  updatePreferencesSchema,
  type ListNotificationsQuery,
  type UpdatePreferencesInput,
} from "./notification.schema.js";
import type {
  NotificationResponse,
  PaginatedNotifications,
} from "./notification.types.js";

/*
 * Notification delivery rules (documented in Swagger):
 * - In-app notifications are created unless the recipient disabled
 *   the in-app channel.
 * - Every in-app notification created for a BUYER is also emailed to
 *   their registered address (real inbox or YOPmail - any deliverable
 *   mailbox), so buyers always receive the same content they see in
 *   the app even when they are offline. For non-buyers the explicit
 *   channel decides (EMAIL / BOTH send email; IN_APP does not).
 * - Emails are sent when the recipient's preferences enable the
 *   relevant category (order / payment / promotional - all enabled by
 *   default), and are fire-and-forget: a failed email must never break
 *   the business flow that triggered it, and never removes the in-app
 *   notification.
 * - Event-driven notifications carry a dedupeKey; re-fired events are
 *   ignored entirely, so no duplicate notification and no duplicate
 *   email can be produced.
 */

type EmailCategory =
  | "order"
  | "payment"
  | "promotional";

export interface NotifyInput {
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  channel?: NotificationChannel;
  emailCategory?: EmailCategory;
  /*
   * Idempotency key ("order:<id>:status:SHIPPED", ...). Optional: pass
   * one for event-driven notifications so re-delivery of the same
   * event is a no-op; leave it off for intentional user-to-user
   * messages (seller/admin sends), where repeats are legitimate.
   */
  dedupeKey?: string;
}

const toNotificationResponse = (
  notification: {
    _id: { toString(): string };
    type: string;
    title: string;
    message: string;
    entityType?: string | null;
    entityId?: { toString(): string } | null;
    isRead: boolean;
    emailStatus?: NotificationEmailStatus;
    createdAt: Date;
  },
): NotificationResponse => {
  return {
    id: notification._id.toString(),
    type: notification.type as NotificationType,
    title: notification.title,
    message: notification.message,
    entityType: notification.entityType ?? null,
    entityId: notification.entityId
      ? notification.entityId.toString()
      : null,
    isRead: notification.isRead,
    emailStatus:
      notification.emailStatus ??
      NotificationEmailStatus.NOT_REQUIRED,
    createdAt: notification.createdAt,
  };
};

const getPreferences = async (
  userId: string,
) => {
  const existing = await findPreferenceByUserId(
    userId,
  );

  if (existing) {
    return existing;
  }

  return createDefaultPreference(userId);
};

const shouldSendEmail = (
  category: EmailCategory | undefined,
  preferences: Awaited<ReturnType<typeof getPreferences>>,
): boolean => {
  switch (category) {
    case "order":
      return preferences.emailOrderUpdates;
    case "payment":
      return preferences.emailPaymentUpdates;
    case "promotional":
      return preferences.emailPromotional;
    default:
      return true;
  }
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

/*
 * Email delivery for one persisted notification.
 *
 * The in-app record is always stored before this runs, so a slow or dead
 * SMTP relay can never block or fail the business flow that produced the
 * notification - event callers fire this and ignore the result. The outcome
 * is written back onto the same document (SENT / FAILED with the failure
 * reason, plus an attempt counter), which is what keeps the inbox and the
 * bell in sync and makes the failed copy findable by the retry path.
 * Transient failures are already retried inside sendNotificationEmail, so
 * one round here means "attempted as hard as the budget allows".
 *
 * Which status means what, for whoever reads it later:
 *   SENT            - the relay accepted the message for that recipient.
 *   FAILED          - retryable (relay down, timeout, recipient refused);
 *                     `emailError` says why, and the admin retry pass picks
 *                     it up until the attempt budget runs out.
 *   INVALID_ADDRESS - nothing deliverable on the account; terminal, because
 *                     no retry can fix an address that does not exist.
 *
 * Never throws: a broken status write must not surface as a failed order.
 */
const deliverEmailCopy = async (
  notificationId: string | null,
  email: string | null,
  title: string,
  message: string,
): Promise<NotificationEmailStatus> => {
  /*
   * Nothing sendable (missing address, or a stored value that is not a
   * single valid address - legacy rows and hand-edited documents can hold
   * both). Checked here rather than left to the transport so the record is
   * never claimed as SENT for an email nobody was asked to deliver.
   */
  if (!email || !isValidEmailAddress(email)) {
    /*
     * Recorded on the record (rather than left PENDING by a retry claim) so
     * the state never lies and the document is not picked up by the next
     * retry round either - retrying cannot fix an address that does not
     * exist, only a new address on the account can.
     */
    if (notificationId) {
      await markEmailStatus(
        notificationId,
        NotificationEmailStatus.INVALID_ADDRESS,
      ).catch(() => undefined);
    }

    return NotificationEmailStatus.INVALID_ADDRESS;
  }

  try {
    /*
     * The notification's own title and message become the email subject
     * and body, so the inbox copy says exactly what the bell showed. The
     * signature/footer is added by the email service (one place, so every
     * mirrored notification carries the same one).
     */
    await sendNotificationEmail(email, title, message);

    if (notificationId) {
      await markEmailStatus(
        notificationId,
        NotificationEmailStatus.SENT,
      );
    }

    return NotificationEmailStatus.SENT;
  } catch (error) {
    console.error(
      "[NOTIFICATION] Email delivery failed:",
      notificationId ?? "email-only",
      errorMessage(error),
    );

    if (notificationId) {
      try {
        await markEmailStatus(
          notificationId,
          NotificationEmailStatus.FAILED,
          { error: errorMessage(error) },
        );
      } catch (statusError) {
        console.error(
          "[NOTIFICATION] Could not record email failure:",
          statusError,
        );
      }
    }

    return NotificationEmailStatus.FAILED;
  }
};

/*
 * Fire-and-forget wrapper for the event pipeline: the caller has already
 * persisted (or deliberately skipped) the in-app copy and must not wait
 * for SMTP.
 */
const queueEmailCopy = (
  notificationId: string | null,
  email: string | null,
  title: string,
  message: string,
): void => {
  void deliverEmailCopy(notificationId, email, title, message);
};

/*
 * The address the notification may be emailed to, or null when the
 * recipient profile has nothing deliverable. Reading it from the user
 * record (never from request input) is what guarantees emails always go
 * to the registered address and that no caller can steer a send elsewhere.
 */
const resolveEmailTarget = (
  user: { email?: string | null },
): string | null =>
  isValidEmailAddress(user.email)
    ? user.email.trim()
    : null;

/*
 * Result of one notifyUser call, reported back to the batch senders so
 * they can tell the seller what actually happened instead of assuming
 * "one request = one delivered message".
 */
export type NotifyStatus =
  /** A new in-app notification was persisted for the recipient. */
  | "CREATED"
  /** A dedupeKey already existed: nothing was created or emailed again. */
  | "DUPLICATE"
  /** The recipient id does not resolve to an account. */
  | "RECIPIENT_NOT_FOUND"
  /** Recipient preferences suppressed every channel: nothing stored. */
  | "SUPPRESSED";

export type NotifyEmailStatus =
  | "NOT_APPLICABLE"
  /** Dispatch started; the final outcome lands on the notification. */
  | "QUEUED"
  /** Dispatch started because a previous round had failed. */
  | "RETRY_QUEUED"
  /** Sent synchronously (email-only delivery). */
  | "SENT"
  /** No deliverable address on the recipient's profile. */
  | "INVALID_ADDRESS";

export interface NotifyOutcome {
  status: NotifyStatus;
  notificationId: string | null;
  email: NotifyEmailStatus;
}

/*
 * Core delivery primitive used by every event helper below.
 *
 * Guarantees:
 * - The in-app notification is persisted before any email attempt, so
 *   email failures never lose it.
 * - A buyer's in-app notification is always mirrored to their
 *   registered email address (subject to their category opt-out).
 * - When a dedupeKey already exists, the whole delivery is skipped:
 *   no duplicate notification and no duplicate email. The one exception
 *   is an email that had already failed for that record: re-firing the
 *   event reschedules that email (never the notification), which is how
 *   a retried broadcast heals itself.
 */
export const notifyUser = async (
  input: NotifyInput,
): Promise<NotifyOutcome> => {
  /* Duplicate-email / duplicate-notification prevention. */
  if (input.dedupeKey) {
    const existing = await findNotificationByDedupeKey(
      input.dedupeKey,
    );

    if (existing) {
      /*
       * Same event, already delivered. Only heal the email copy, and
       * only when the previous round actually failed - the claim is
       * atomic, so concurrent retries cannot both resend it. The
       * notification itself (and the unread badge it drives) is never
       * touched, which is exactly what a retried broadcast needs: the
       * buyer gets their email, not a duplicate message.
       */
      if (
        existing.emailStatus === NotificationEmailStatus.FAILED
      ) {
        const claimed = await claimEmailRetry(
          existing._id.toString(),
          MAX_EMAIL_DISPATCH_ROUNDS,
        );

        if (claimed) {
          const recipient = await User.findById(existing.recipientId)
            .select("email")
            .exec();

          queueEmailCopy(
            existing._id.toString(),
            recipient ? resolveEmailTarget(recipient) : null,
            existing.title,
            existing.message,
          );

          return {
            status: "DUPLICATE",
            notificationId: existing._id.toString(),
            email: "RETRY_QUEUED",
          };
        }
      }

      return {
        status: "DUPLICATE",
        notificationId: existing._id.toString(),
        email: "NOT_APPLICABLE",
      };
    }
  }

  const channel = input.channel ?? NotificationChannel.IN_APP;

  const user = await User.findById(input.recipientId)
    .select("email role")
    .exec();

  if (!user) {
    console.error(
      "[NOTIFICATION] Recipient not found:",
      input.recipientId,
    );

    return {
      status: "RECIPIENT_NOT_FOUND",
      notificationId: null,
      email: "NOT_APPLICABLE",
    };
  }

  const preferences = await getPreferences(input.recipientId);

  const wantsInApp =
    (channel === NotificationChannel.IN_APP ||
      channel === NotificationChannel.BOTH) &&
    preferences.inApp;

  const categoryAllowed = shouldSendEmail(
    input.emailCategory,
    preferences,
  );

  /*
   * The registered address is resolved once up front: an unusable one
   * must be reported (INVALID_ADDRESS) instead of silently pretending a
   * copy went out.
   */
  const emailTarget = resolveEmailTarget(user);

  /*
   * Email rules:
   * - Explicit EMAIL / BOTH channels email (as requested by the
   *   caller), subject to the recipient's category preference.
   * - An IN_APP delivery for a BUYER is mirrored to email as well -
   *   every notification shown in a buyer's in-app list must also
   *   reach their registered inbox, even when they are offline.
   */
  const wantsEmail = categoryAllowed && emailTarget !== null
    ? channel === NotificationChannel.EMAIL ||
      channel === NotificationChannel.BOTH ||
      (wantsInApp && user.role === UserRole.BUYER)
    : false;

  const invalidAddress =
    categoryAllowed && emailTarget === null &&
    (channel !== NotificationChannel.IN_APP ||
      user.role === UserRole.BUYER);

  if (!wantsInApp && !wantsEmail) {
    return {
      status: "SUPPRESSED",
      notificationId: null,
      email: invalidAddress ? "INVALID_ADDRESS" : "NOT_APPLICABLE",
    };
  }

  if (wantsInApp) {
    const notification = await createNotificationIfNew({
      recipientId: input.recipientId,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      isRead: false,
      ...(input.dedupeKey
        ? { dedupeKey: input.dedupeKey }
        : {}),
      emailStatus: wantsEmail
        ? NotificationEmailStatus.PENDING
        : invalidAddress
          ? NotificationEmailStatus.INVALID_ADDRESS
          : NotificationEmailStatus.NOT_REQUIRED,
    });

    /*
     * Lost the unique-index race against a concurrent copy of the
     * same event: the winner owns the notification AND the email.
     */
    if (!notification) {
      return {
        status: "DUPLICATE",
        notificationId: null,
        email: "NOT_APPLICABLE",
      };
    }

    const notificationId = notification._id.toString();

    if (wantsEmail) {
      queueEmailCopy(
        notificationId,
        emailTarget,
        input.title,
        input.message,
      );
    }

    return {
      status: "CREATED",
      notificationId,
      email: wantsEmail
        ? "QUEUED"
        : invalidAddress
          ? "INVALID_ADDRESS"
          : "NOT_APPLICABLE",
    };
  }

  /*
   * Email-only delivery (channel EMAIL, or in-app disabled by the
   * recipient): no in-app record is created, so the email is sent
   * directly. Dedupe of email-only sends is intentionally left to the
   * caller - these are explicit, user-initiated sends.
   */
  if (wantsEmail) {
    const status = await deliverEmailCopy(
      null,
      emailTarget,
      input.title,
      input.message,
    );

    return {
      status: "SUPPRESSED",
      notificationId: null,
      email: status === NotificationEmailStatus.SENT ? "SENT" : "QUEUED",
    };
  }

  return {
    status: "SUPPRESSED",
    notificationId: null,
    email: invalidAddress ? "INVALID_ADDRESS" : "NOT_APPLICABLE",
  };
};


/*
 * Buyer-facing order lifecycle notifications.
 */
export const notifyOrderStatusChange = async (
  order: IOrder,
  status: OrderStatus,
): Promise<void> => {
  const map: Partial<
    Record<
      OrderStatus,
      { type: NotificationType; title: string; message: string }
    >
  > = {
    [OrderStatus.CONFIRMED]: {
      type: NotificationType.ORDER_CONFIRMED,
      title: "Order confirmed",
      message: `Your order ${order.orderNumber} has been confirmed by the seller.`,
    },
    [OrderStatus.SHIPPED]: {
      type: NotificationType.ORDER_SHIPPED,
      title: "Order shipped",
      message: `Your order ${order.orderNumber} has been shipped.`,
    },
    [OrderStatus.DELIVERED]: {
      type: NotificationType.ORDER_DELIVERED,
      title: "Order delivered",
      message: `Your order ${order.orderNumber} has been delivered.`,
    },
    [OrderStatus.CANCELLED]: {
      type: NotificationType.ORDER_CANCELLED,
      title: "Order cancelled",
      message: `Your order ${order.orderNumber} has been cancelled.`,
    },
  };

  const content = map[status];

  if (!content) {
    return;
  }

  try {
    await notifyUser({
      recipientId: order.userId.toString(),
      type: content.type,
      title: content.title,
      message: content.message,
      entityType: "ORDER",
      entityId: order._id.toString(),
      channel: NotificationChannel.IN_APP,
      emailCategory: "order",
      dedupeKey: `order:${order._id.toString()}:status:${status}`,
    });
  } catch (error) {
    console.error(
      "[NOTIFICATION] Order notification failed:",
      error,
    );
  }
};

/*
 * Seller-facing payment notification (COD payment received).
 */
export const notifyPaymentReceived = async (
  order: IOrder,
): Promise<void> => {
  try {
    await notifyUser({
      recipientId: order.sellerId.toString(),
      type: NotificationType.PAYMENT_RECEIVED,
      title: "Payment received",
      message: `Payment of ${order.total} for order ${order.orderNumber} has been received.`,
      entityType: "ORDER",
      entityId: order._id.toString(),
      channel: NotificationChannel.IN_APP,
      emailCategory: "payment",
      dedupeKey: `order:${order._id.toString()}:payment-received`,
    });
  } catch (error) {
    console.error(
      "[NOTIFICATION] Payment notification failed:",
      error,
    );
  }
};

/*
 * Buyer-facing refund notification (online payment refunded).
 */
export const notifyPaymentRefunded = async (
  order: IOrder,
): Promise<void> => {
  try {
    await notifyUser({
      recipientId: order.userId.toString(),
      type: NotificationType.PAYMENT_REFUNDED,
      title: "Payment refunded",
      message: `Your payment of ${order.total} for order ${order.orderNumber} has been refunded.`,
      entityType: "ORDER",
      entityId: order._id.toString(),
      channel: NotificationChannel.IN_APP,
      emailCategory: "payment",
      dedupeKey: `order:${order._id.toString()}:payment-refunded`,
    });
  } catch (error) {
    console.error(
      "[NOTIFICATION] Refund notification failed:",
      error,
    );
  }
};

/*
 * Seller approval/rejection notification.
 */
export const notifySellerDecision = async (
  seller: ISeller,
  status: SellerStatus,
): Promise<void> => {
  const approved = status === SellerStatus.APPROVED;

  try {
    await notifyUser({
      recipientId: seller.userId.toString(),
      type: approved
        ? NotificationType.SELLER_APPROVED
        : NotificationType.SELLER_REJECTED,
      title: approved
        ? "Seller account approved"
        : "Seller account not approved",
      message: approved
        ? "Your seller account has been approved. You can now list products and create discounts and coupons."
        : `Your seller account was not approved.${seller.statusReason ? ` Reason: ${seller.statusReason}` : ""}`,
      entityType: "SELLER",
      entityId: seller._id.toString(),
      channel: NotificationChannel.IN_APP,
      emailCategory: "order",
      dedupeKey: `seller:${seller._id.toString()}:decision:${status}`,
    });
  } catch (error) {
    console.error(
      "[NOTIFICATION] Seller decision notification failed:",
      error,
    );
  }
};

/*
 * Buyer-facing return status notification.
 */
export const notifyReturnStatusChange = async (
  returnRequest: IReturnRequest,
  status: ReturnStatus,
): Promise<void> => {
  const titles: Partial<
    Record<ReturnStatus, string>
  > = {
    [ReturnStatus.APPROVED]: "Return approved",
    [ReturnStatus.REJECTED]: "Return rejected",
    [ReturnStatus.COMPLETED]: "Return completed",
    [ReturnStatus.CANCELLED]: "Return cancelled",
  };

  const title = titles[status];

  if (!title) {
    return;
  }

  try {
    await notifyUser({
      recipientId: returnRequest.userId.toString(),
      type: NotificationType.RETURN_STATUS,
      title,
      message: `${title}.${returnRequest.statusReason ? ` Reason: ${returnRequest.statusReason}` : ""}`,
      entityType: "RETURN",
      entityId: returnRequest._id.toString(),
      channel: NotificationChannel.IN_APP,
      emailCategory: "order",
      dedupeKey: `return:${returnRequest._id.toString()}:status:${status}`,
    });
  } catch (error) {
    console.error(
      "[NOTIFICATION] Return notification failed:",
      error,
    );
  }
};

/*
 * ---------------------------------------------------------------------
 * Return approval + refund notifications
 * ---------------------------------------------------------------------
 */

const formatMoney = (amount: number): string =>
  `₹${amount}`;

/*
 * Buyer-facing confirmation that the return was approved AND the money
 * is on its way back - one notification covering both facts, sent only
 * after the refund and every rollback committed.
 */
export const notifyReturnApprovedWithRefund = async (
  input: {
    returnRequest: IReturnRequest;
    order: IOrder;
    refund: {
      amount: number;
      method: RefundMethod;
    };
  },
): Promise<void> => {
  const { returnRequest, order, refund } = input;

  const title =
    refund.amount > 0
      ? `Return approved: ${formatMoney(refund.amount)} refund processed`
      : "Return approved";

  /*
   * An order that was never paid has nothing to send back; saying a
   * refund was processed would be a lie, so the copy adapts.
   */
  const message =
    refund.method === RefundMethod.NONE
      ? `Your return for order ${order.orderNumber} has been approved. No payment was captured for this order, so there is nothing to refund.`
      : RETURN_APPROVED_REFUND_MESSAGE;

  try {
    await notifyUser({
      recipientId: returnRequest.userId.toString(),
      type: NotificationType.RETURN_STATUS,
      title,
      message,
      entityType: "RETURN",
      entityId: returnRequest._id.toString(),
      channel: NotificationChannel.BOTH,
      emailCategory: "payment",
      dedupeKey: `return:${returnRequest._id.toString()}:approved-refund`,
    });
  } catch (error) {
    console.error(
      "[NOTIFICATION] Return refund notification failed:",
      error,
    );
  }
};

/*
 * Seller-facing summary of what the approval changed on their side:
 * the refund, the stock credited back and the earnings/commission
 * taken out of their settlement.
 */
export const notifySellerReturnRefund = async (
  input: {
    returnRequest: IReturnRequest;
    order: IOrder;
    refund: { amount: number; method: RefundMethod };
    restockedUnits: number;
    reversal?: {
      reversed: boolean;
      periodKey: string | null;
      sellerPayableReversed: number;
      commissionReversed: number;
      alreadyPaidOut: boolean;
    };
  },
): Promise<void> => {
  const {
    returnRequest,
    order,
    refund,
    restockedUnits,
    reversal,
  } = input;

  const parts = [
    `Return for order ${order.orderNumber} was approved and ${formatMoney(refund.amount)} was refunded to the buyer.`,
  ];

  if (restockedUnits > 0) {
    parts.push(
      `${restockedUnits} unit(s) were added back to your inventory.`,
    );
  }

  if (reversal?.reversed) {
    parts.push(
      reversal.alreadyPaidOut
        ? `Settlement ${reversal.periodKey} was adjusted: ${formatMoney(reversal.sellerPayableReversed)} payable and ${formatMoney(reversal.commissionReversed)} commission reversed. As that settlement was already paid, the payable is recovered from your next settlement.`
        : `Settlement ${reversal.periodKey} was adjusted: ${formatMoney(reversal.sellerPayableReversed)} payable and ${formatMoney(reversal.commissionReversed)} commission reversed.`,
    );
  }

  try {
    await notifyUser({
      recipientId: returnRequest.sellerId.toString(),
      type: NotificationType.RETURN_STATUS,
      title: "Return approved and refunded",
      message: parts.join(" "),
      entityType: "RETURN",
      entityId: returnRequest._id.toString(),
      channel: NotificationChannel.IN_APP,
      emailCategory: "payment",
      dedupeKey: `return:${returnRequest._id.toString()}:seller-refund`,
    });
  } catch (error) {
    console.error(
      "[NOTIFICATION] Seller return notification failed:",
      error,
    );
  }
};

/*
 * ---------------------------------------------------------------------
 * User-facing notification APIs
 * ---------------------------------------------------------------------
 */

export const listNotifications = async (
  userId: string,
  query: unknown,
): Promise<PaginatedNotifications> => {
  const parsed: ListNotificationsQuery =
    listNotificationsQuerySchema.parse(query);

  const unreadOnly = parsed.unread === "true";

  const { items, total } =
    await listNotificationsForUser(
      userId,
      unreadOnly,
      parsed.page,
      parsed.limit,
    );

  return {
    items: items.map(toNotificationResponse),
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) || 0,
  };
};

export const getUnreadCount = async (
  userId: string,
): Promise<{ unread: number }> => {
  return {
    unread: await countUnreadForUser(userId),
  };
};

export const markRead = async (
  userId: string,
  notificationId: string,
): Promise<NotificationResponse> => {
  const notification =
    await findNotificationByIdAndUser(
      notificationId,
      userId,
    );

  if (!notification) {
    throw new AppError(
      "Notification not found",
      404,
      "NOTIFICATION_NOT_FOUND",
    );
  }

  const updated = await markNotificationRead(
    notificationId,
  );

  if (!updated) {
    throw new AppError(
      "Notification not found",
      404,
      "NOTIFICATION_NOT_FOUND",
    );
  }

  return toNotificationResponse(updated);
};

export const markAllRead = async (
  userId: string,
): Promise<{ marked: number }> => {
  return {
    marked: await markAllNotificationsRead(userId),
  };
};

export const getPreferencesForUser = async (
  userId: string,
) => {
  return getPreferences(userId);
};

export const updatePreferencesForUser = async (
  userId: string,
  input: unknown,
) => {
  const data: UpdatePreferencesInput =
    updatePreferencesSchema.parse(input);

  const updated = await updatePreferenceByUserId(
    userId,
    data,
  );

  return updated!;
};

/*
 * ---------------------------------------------------------------------
 * Shared fan-out for multi-recipient sends (admin broadcast, seller
 * broadcast)
 * ---------------------------------------------------------------------
 *
 * One notifyUser call per recipient, sequentially: each call does its own
 * in-app write and queues its own email, so a recipient whose profile is
 * unusable (or whose preferences suppress every channel) cannot abort the
 * rest of the batch. The returned counters are what the API reports back,
 * so a "sent to 12 buyers" message always reflects real deliveries rather
 * than the size of the request.
 */
interface DeliverySummary {
  /** New in-app notifications created. */
  deliveredTo: number;
  /** Recipients that already had this exact message (idempotent retry). */
  duplicates: number;
  /** Email copies handed to the transport. */
  emailsQueued: number;
  /** Recipients with no deliverable address on file. */
  emailsInvalidAddress: number;
  /** Preferences suppressed both channels for these recipients. */
  suppressed: number;
}

const emptySummary = (): DeliverySummary => ({
  deliveredTo: 0,
  duplicates: 0,
  emailsQueued: 0,
  emailsInvalidAddress: 0,
  suppressed: 0,
});

const fanOutNotification = async (
  recipientIds: string[],
  buildPayload: (recipientId: string) => Omit<NotifyInput, "recipientId">,
): Promise<DeliverySummary> => {
  const summary = emptySummary();

  for (const recipientId of recipientIds) {
    const outcome = await notifyUser({
      recipientId,
      ...buildPayload(recipientId),
    });

    switch (outcome.status) {
      case "CREATED":
        summary.deliveredTo += 1;
        break;
      case "DUPLICATE":
        summary.duplicates += 1;
        break;
      case "SUPPRESSED":
        summary.suppressed += 1;
        break;
      case "RECIPIENT_NOT_FOUND":
        break;
    }

    if (
      outcome.email === "QUEUED" ||
      outcome.email === "SENT" ||
      outcome.email === "RETRY_QUEUED"
    ) {
      summary.emailsQueued += 1;
    } else if (outcome.email === "INVALID_ADDRESS") {
      summary.emailsInvalidAddress += 1;
    }
  }

  return summary;
};

/*
 * ---------------------------------------------------------------------
 * Admin broadcast (V2.13)
 * ---------------------------------------------------------------------
 */
export const broadcastAdminMessage = async (
  admin: { id: string; role: string },
  input: {
    title: string;
    message: string;
    channel: NotificationChannel;
    recipientIds?: string[] | undefined;
    audience?: "SELLERS" | "USERS" | undefined;
  },
): Promise<DeliverySummary & { requested: number }> => {
  let recipients: Array<{ _id: { toString(): string } }>;

  if (input.recipientIds && input.recipientIds.length > 0) {
    recipients = (await User.find({
      _id: { $in: input.recipientIds },
    })
      .select("_id email")
      .exec()) as unknown as Array<{ _id: { toString(): string } }>;
  } else {
    const role =
      input.audience === "SELLERS"
        ? UserRole.SELLER
        : UserRole.BUYER;

    recipients = (await User.find({ role })
      .select("_id email")
      .exec()) as unknown as Array<{ _id: { toString(): string } }>;
  }

  const summary = await fanOutNotification(
    recipients.map((recipient) => recipient._id.toString()),
    () => ({
      type: NotificationType.ADMIN_MESSAGE,
      title: input.title,
      message: input.message,
      entityType: "ADMIN",
      channel: input.channel as NotificationChannel,
      emailCategory: "promotional",
    }),
  );

  await logAudit({
    actorId: admin.id,
    actorRole: admin.role,
    action: "ADMIN_BROADCAST",
    entityType: "NOTIFICATION",
    metadata: {
      title: input.title,
      channel: input.channel,
      recipientCount: recipients.length,
      audience: input.audience ?? null,
      ...summary,
    },
  });

  return { ...summary, requested: recipients.length };
};

/*
 * ---------------------------------------------------------------------
 * Seller-sent custom notifications
 * ---------------------------------------------------------------------
 *
 * An authenticated seller can message one specific buyer, any selection of
 * their buyers (the Seller Customers broadcast multi-select), or every
 * registered buyer. Each message is delivered like any other
 * notification: persisted in the buyer's in-app feed (read/unread tracked
 * as usual) and mirrored to their registered email address, so it reaches
 * buyers who are offline. Every send is audit-logged.
 *
 * Idempotency: when the caller supplies `requestId` (the compose dialog
 * generates one per submission), each recipient's notification is keyed by
 * `seller-message:<sellerId>:<requestId>:<buyerId>`. Re-sending the same
 * request - a double click, or a retry after a network timeout - therefore
 * creates no second notification and sends no second email; it only heals
 * email copies whose previous round failed.
 */
export interface SellerNotificationResult extends DeliverySummary {
  /** Requested buyer ids that are not eligible targets. */
  notFoundBuyerIds: string[];
  /** Buyers the seller asked for, after de-duplication. */
  requested: number;
}

export const sendSellerNotification = async (
  seller: { id: string; role: string },
  input: {
    title: string;
    message: string;
    channel: NotificationChannel;
    buyerId?: string | undefined;
    buyerIds?: string[] | undefined;
    audience?: "ALL_BUYERS" | undefined;
    requestId?: string | undefined;
  },
): Promise<SellerNotificationResult> => {
  /*
   * Resolve the requested target set. Explicit ids always go through a
   * role + status filter, so a seller can only ever reach active BUYER
   * accounts - never another seller, an admin, or a deactivated profile.
   */
  const uniqueRequestedIds = Array.from(
    new Set([
      ...(input.buyerId ? [input.buyerId] : []),
      ...(input.buyerIds ?? []),
    ].map((id) => id.trim())),
  );

  let recipients: Array<{ _id: { toString(): string } }>;

  if (uniqueRequestedIds.length > 0) {
    recipients = (await User.find({
      _id: { $in: uniqueRequestedIds },
      role: UserRole.BUYER,
      isActive: true,
    })
      .select("_id")
      .exec()) as unknown as Array<{ _id: { toString(): string } }>;

    if (recipients.length === 0) {
      /* Preserve the historical point-to-point contract. */
      throw new AppError(
        "Buyer not found",
        404,
        "BUYER_NOT_FOUND",
      );
    }
  } else {
    recipients = (await User.find({
      role: UserRole.BUYER,
      isActive: true,
    })
      .select("_id")
      .exec()) as unknown as Array<{ _id: { toString(): string } }>;
  }

  const recipientIds = recipients.map((recipient) =>
    recipient._id.toString(),
  );

  const notified = new Set(recipientIds);

  const summary = await fanOutNotification(
    recipientIds,
    (recipientId) => ({
      type: NotificationType.SELLER_MESSAGE,
      title: input.title,
      message: input.message,
      entityType: "SELLER",
      entityId: seller.id,
      channel: input.channel,
      emailCategory: "promotional",
      ...(input.requestId
        ? {
            dedupeKey: `seller-message:${seller.id}:${input.requestId}:${recipientId}`,
          }
        : {}),
    }),
  );

  const isBroadcast =
    input.audience === "ALL_BUYERS" || uniqueRequestedIds.length > 1;

  await logAudit({
    actorId: seller.id,
    actorRole: seller.role,
    action: isBroadcast
      ? "SELLER_NOTIFICATION_BROADCAST"
      : "SELLER_NOTIFICATION_SENT",
    entityType: "NOTIFICATION",
    metadata: {
      title: input.title,
      channel: input.channel,
      recipientCount: recipients.length,
      target: isBroadcast
        ? (input.audience ?? "SELECTED_BUYERS")
        : recipientIds[0],
      ...summary,
      notFoundCount: uniqueRequestedIds.length - notified.size,
    },
  });

  return {
    ...summary,
    requested: uniqueRequestedIds.length,
    notFoundBuyerIds: uniqueRequestedIds.filter(
      (id) => !notified.has(id),
    ),
  };
};

/*
 * ---------------------------------------------------------------------
 * Email retry (repairs the in-app <-> inbox synchronization)
 * ---------------------------------------------------------------------
 *
 * The in-app notification is the source of truth and is written exactly
 * once, by notifyUser. When its email copy fails (relay outage, timeout,
 * greylisting) the record stays at emailStatus FAILED waiting for a second
 * round. This function is that round:
 *
 * - it never creates a notification, so a retry can never duplicate the
 *   in-app copy or inflate the unread counter;
 * - every document is claimed atomically (FAILED -> PENDING), so two
 *   overlapping retry runs cannot send the same email twice;
 * - each round bumps emailAttempts and the MAX_EMAIL_DISPATCH_ROUNDS budget
 *   stops a permanently broken relay from retrying forever;
 * - recipients without a deliverable address are marked INVALID_ADDRESS, a
 *   terminal state no future retry will pick up again.
 *
 * Emails are awaited here (bounded by `limit`) because whoever triggers a
 * manual retry wants the real outcome rather than "queued".
 */
export const retryFailedNotificationEmails = async (
  input: { limit?: number } = {},
  actor?: { id: string; role: string },
): Promise<{
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
}> => {
  const limit = Math.min(
    Math.max(input.limit ?? 25, 1),
    100,
  );

  const candidates = await listFailedEmailNotifications(
    limit,
    MAX_EMAIL_DISPATCH_ROUNDS,
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const claimed = await claimEmailRetry(
      candidate.id,
      MAX_EMAIL_DISPATCH_ROUNDS,
    );

    if (!claimed) {
      /* Another retry run owns it now - never send a second copy. */
      skipped += 1;
      continue;
    }

    if (!isValidEmailAddress(candidate.email)) {
      await markEmailStatus(
        candidate.id,
        NotificationEmailStatus.INVALID_ADDRESS,
      );

      skipped += 1;
      continue;
    }

    const status = await deliverEmailCopy(
      candidate.id,
      candidate.email,
      candidate.title,
      candidate.message,
    );

    if (status === NotificationEmailStatus.SENT) {
      sent += 1;
    } else {
      /*
       * Still FAILED (or, for a profile whose address vanished in the
       * meantime, INVALID_ADDRESS). deliverEmailCopy already wrote the
       * final status, so there is nothing to roll back here.
       */
      failed += 1;
    }
  }

  /*
   * The backlog left for the next run. A counting failure must not hide a
   * retry that did work, so it degrades to 0 rather than throwing.
   */
  const pending = await countFailedEmails().catch((error: unknown) => {
    console.error(
      "[NOTIFICATION] Could not count the remaining email backlog:",
      error,
    );

    return 0;
  });

  if (actor) {
    await logAudit({
      actorId: actor.id,
      actorRole: actor.role,
      action: "NOTIFICATION_EMAIL_RETRY",
      entityType: "NOTIFICATION",
      metadata: {
        limit,
        attempted: candidates.length,
        sent,
        failed,
        skipped,
        remainingFailed: pending,
      },
    });
  }

  return {
    attempted: candidates.length,
    sent,
    failed,
    skipped,
    pending,
  };
};
