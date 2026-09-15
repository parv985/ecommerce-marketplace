export enum OrderStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  SHIPPED = "SHIPPED",
  DELIVERED = "DELIVERED",
  CANCELLED = "CANCELLED",
  /*
   * Terminal state reached only through the return flow: the seller
   * approved the buyer's return, the refund was issued and every
   * purchase side effect (stock, coupon, commission, settlement) was
   * rolled back. It is never reachable through the manual order-status
   * endpoint - only `PATCH /returns/:id/status` can set it.
   */
  RETURNED = "RETURNED",
}

export enum PaymentMethod {
  CASH_ON_DELIVERY = "CASH_ON_DELIVERY",
  /* Paid through the payment gateway (Razorpay), verified server-side. */
  ONLINE = "ONLINE",
}

export enum PaymentStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
}
