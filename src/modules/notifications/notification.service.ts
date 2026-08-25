import { User } from "../../models/User.js";
import { UserRole } from "../../constants/roles.js";
import type { ISeller } from "../../models/Seller.js";
import type { IOrder } from "../../models/Order.js";
import type { IReturnRequest } from "../../models/ReturnRequest.js";
import { AppError } from "../../errors/AppError.js";
import { OrderStatus } from "../../constants/orderStatus.js";
import { SellerStatus } from "../../constants/sellerStatus.js";
import { ReturnStatus } from "../../constants/returnStatus.js";
import {
  NotificationChannel,
  NotificationType,
} from "../../constants/notificationTypes.js";
import { sendNotificationEmail } from "../../services/email.service.js";
import { logAudit } from "../../services/audit.service.js";
import {
  countUnreadForUser,
  createDefaultPreference,
  createNotification,
  findNotificationByIdAndUser,
  findPreferenceByUserId,
  listNotificationsForUser,
  markAllNotificationsRead,
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
 * - Emails are only sent when the recipient's preferences enable the
 *   relevant category (order / payment / promotional), never in the
 *   test environment, and are fire-and-forget: a failed email must
 *   never break the business flow that triggered it.
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
  if (process.env.NODE_ENV === "test") {
    return false;
  }

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
 * Core delivery primitive used by every event helper below.
 */
export const notifyUser = async (
  input: NotifyInput,
): Promise<void> => {
  const channel = input.channel ?? NotificationChannel.IN_APP;
  const preferences = await getPreferences(input.recipientId);

  if (
    (channel === NotificationChannel.IN_APP ||
      channel === NotificationChannel.BOTH) &&
    preferences.inApp
  ) {
    await createNotification({
      recipientId: input.recipientId,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      isRead: false,
    });
  }

  if (
    channel === NotificationChannel.EMAIL ||
    channel === NotificationChannel.BOTH
  ) {
    if (!shouldSendEmail(input.emailCategory, preferences)) {
      return;
    }

    const user = await User.findById(
      input.recipientId,
    )
      .select("email")
      .exec();

    if (!user) {
      return;
    }

    sendNotificationEmail(
      user.email,
      input.title,
      `${input.message}\n\n- E-Commerce Marketplace`,
    ).catch((error) => {
      console.error(
        "[NOTIFICATION] Email delivery failed:",
        error,
      );
    });
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
