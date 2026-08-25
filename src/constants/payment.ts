/*
 * Gateway constants.
 *
 * PaymentRecordStatus tracks a payment *record* (one per order) while
 * Order.paymentStatus mirrors the buyer-visible state. REFUNDED means a
 * refund has been issued for the full paid amount.
 */
export enum PaymentGateway {
  RAZORPAY = "RAZORPAY",
  MOCK = "MOCK",
}

export enum PaymentRecordStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
}

/*
 * Razorpay refunds are asynchronous: created as PENDING and completed
 * via the refund.processed webhook. The mock gateway completes
 * immediately, so tests exercise the PROCESSED path too.
 */
export enum RefundStatus {
  PENDING = "PENDING",
  PROCESSED = "PROCESSED",
  FAILED = "FAILED",
}
