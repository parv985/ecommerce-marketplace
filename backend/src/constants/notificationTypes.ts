export enum NotificationType {
  ORDER_CONFIRMED = "ORDER_CONFIRMED",
  ORDER_SHIPPED = "ORDER_SHIPPED",
  ORDER_DELIVERED = "ORDER_DELIVERED",
  ORDER_CANCELLED = "ORDER_CANCELLED",
  PAYMENT_RECEIVED = "PAYMENT_RECEIVED",
  PAYMENT_REFUNDED = "PAYMENT_REFUNDED",
  SELLER_APPROVED = "SELLER_APPROVED",
  SELLER_REJECTED = "SELLER_REJECTED",
  RETURN_STATUS = "RETURN_STATUS",
  ADMIN_MESSAGE = "ADMIN_MESSAGE",
  SETTLEMENT = "SETTLEMENT",
  INVENTORY_LOW = "INVENTORY_LOW",
  OUT_OF_STOCK = "OUT_OF_STOCK",
}

export enum NotificationChannel {
  IN_APP = "IN_APP",
  EMAIL = "EMAIL",
  BOTH = "BOTH",
}

/*
 * Buyer-facing confirmation for an approved return whose refund has
 * been issued. Shared by the notification service, the API docs and
 * the frontend banner, so the wording can never drift apart.
 */
export const RETURN_APPROVED_REFUND_MESSAGE =
  "Your return has been approved and your refund has been processed successfully.";
