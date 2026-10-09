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
import { sendNotificationEmail } from "../../services/email.service.js";
import { logAudit } from "../../services/audit.service.js";
import {
  NotificationEmailStatus,
} from "../../models/Notification.js";
import {
  countUnreadForUser,
  createDefaultPreference,
  createNotificationIfNew,
  findNotificationByDedupeKey,
  findNotificationByIdAndUser,
  findPreferenceByUserId,
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

/*
 * Email delivery for one persisted notification. Fire-and-forget so a
 * slow or dead SMTP relay can never block or fail the business flow
 * that produced the notification: the in-app record is already stored
 * before this runs. The outcome (SENT / FAILED) is recorded on the
 * notification for observability; transient failures are retried
 * inside sendNotificationEmail.
 */
const deliverEmailCopy = (
  notificationId: string | null,
  email: string,
  title: string,
  message: string,
): void => {
  void (async () => {
    try {
      await sendNotificationEmail(
        email,
        title,
        `${message}\n\n- E-Commerce Marketplace`,
      );

      if (notificationId) {
        await markEmailStatus(
          notificationId,
          NotificationEmailStatus.SENT,
        );
      }
    } catch (error) {
      console.error(
        "[NOTIFICATION] Email delivery failed:",
        error,
      );

      if (notificationId) {
        try {
          await markEmailStatus(
            notificationId,
            NotificationEmailStatus.FAILED,
          );
        } catch (statusError) {
          console.error(
            "[NOTIFICATION] Could not record email failure:",
            statusError,
          );
        }
      }
    }
  })();
};

/*
 * Core delivery primitive used by every event helper below.
 *
 * Guarantees:
 * - The in-app notification is persisted before any email attempt, so
 *   email failures never lose it.
 * - A buyer's in-app notification is always mirrored to their
 *   registered email address (subject to their category opt-out).
 * - When a dedupeKey already exists, the whole delivery is skipped:
 *   no duplicate notification and no duplicate email.
 */
export const notifyUser = async (
  input: NotifyInput,
): Promise<void> => {
  /* Duplicate-email / duplicate-notification prevention. */
  if (input.dedupeKey) {
    const existing = await findNotificationByDedupeKey(
      input.dedupeKey,
    );

    if (existing) {
      return;
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

    return;
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
   * Email rules:
   * - Explicit EMAIL / BOTH channels email (as requested by the
   *   caller), subject to the recipient's category preference.
   * - An IN_APP delivery for a BUYER is mirrored to email as well -
   *   every notification shown in a buyer's in-app list must also
   *   reach their registered inbox, even when they are offline.
   */
  const wantsEmail = categoryAllowed
    ? channel === NotificationChannel.EMAIL ||
      channel === NotificationChannel.BOTH ||
      (wantsInApp && user.role === UserRole.BUYER)
    : false;

  if (!wantsInApp && !wantsEmail) {
    return;
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
        : NotificationEmailStatus.NOT_REQUIRED,
    });

    /*
     * Lost the unique-index race against a concurrent copy of the
     * same event: the winner owns the notification AND the email.
     */
    if (!notification) {
      return;
    }

    if (wantsEmail) {
      deliverEmailCopy(
        notification._id.toString(),
        user.email,
        input.title,
        input.message,
      );
    }

    return;
  }

  /*
   * Email-only delivery (channel EMAIL, or in-app disabled by the
   * recipient): no in-app record is created, so the email is sent
   * directly. Dedupe of email-only sends is intentionally left to the
   * caller - these are explicit, user-initiated sends.
   */
  if (wantsEmail) {
    deliverEmailCopy(
      null,
      user.email,
      input.title,
      input.message,
    );
  }
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
): Promise<{ deliveredTo: number }> => {
  let recipients: Array<{ _id: { toString(): string }; email: string }>;

  if (input.recipientIds && input.recipientIds.length > 0) {
    recipients = (await User.find({
      _id: { $in: input.recipientIds },
    })
      .select("_id email")
      .exec()) as Array<{
      _id: { toString(): string };
      email: string;
    }>;
  } else {
    const role =
      input.audience === "SELLERS"
        ? UserRole.SELLER
        : UserRole.BUYER;

    recipients = (await User.find({ role })
      .select("_id email")
      .exec()) as Array<{
      _id: { toString(): string };
      email: string;
    }>;
  }

  for (const recipient of recipients) {
    await notifyUser({
      recipientId: recipient._id.toString(),
      type: NotificationType.ADMIN_MESSAGE,
      title: input.title,
      message: input.message,
      entityType: "ADMIN",
      channel: input.channel as NotificationChannel,
      emailCategory: "promotional",
    });
  }

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
    },
  });

  return { deliveredTo: recipients.length };
};

/*
 * ---------------------------------------------------------------------
 * Seller-sent custom notifications
 * ---------------------------------------------------------------------
 *
 * An authenticated seller can message one specific buyer or broadcast
 * to every registered buyer. Each message is delivered like any other
 * notification: persisted in the buyer's in-app feed (read/unread
 * tracked as usual) and mirrored to their registered email address,
 * so it reaches buyers who are offline. The send is audit-logged.
 */
export const sendSellerNotification = async (
  seller: { id: string; role: string },
  input: {
    title: string;
    message: string;
    channel: NotificationChannel;
    buyerId?: string | undefined;
    audience?: "ALL_BUYERS" | undefined;
  },
): Promise<{ deliveredTo: number }> => {
  let recipients: Array<{ _id: { toString(): string } }>;

  if (input.buyerId) {
    /*
     * Point-to-point: the target must be a registered, active BUYER.
     * Sellers cannot message other sellers or admins, and unknown /
     * deactivated accounts are rejected up front.
     */
    const buyer = await User.findOne({
      _id: input.buyerId,
      role: UserRole.BUYER,
      isActive: true,
    })
      .select("_id")
      .exec();

    if (!buyer) {
      throw new AppError(
        "Buyer not found",
        404,
        "BUYER_NOT_FOUND",
      );
    }

    recipients = [
      buyer as unknown as { _id: { toString(): string } },
    ];
  } else {
    recipients = (await User.find({
      role: UserRole.BUYER,
      isActive: true,
    })
      .select("_id")
      .exec()) as unknown as Array<{
      _id: { toString(): string };
    }>;
  }

  for (const recipient of recipients) {
    await notifyUser({
      recipientId: recipient._id.toString(),
      type: NotificationType.SELLER_MESSAGE,
      title: input.title,
      message: input.message,
      entityType: "SELLER",
      entityId: seller.id,
      channel: input.channel,
      emailCategory: "promotional",
    });
  }

  await logAudit({
    actorId: seller.id,
    actorRole: seller.role,
    action: input.buyerId
      ? "SELLER_NOTIFICATION_SENT"
      : "SELLER_NOTIFICATION_BROADCAST",
    entityType: "NOTIFICATION",
    metadata: {
      title: input.title,
      channel: input.channel,
      recipientCount: recipients.length,
      target: input.buyerId ?? "ALL_BUYERS",
    },
  });

  return { deliveredTo: recipients.length };
};
