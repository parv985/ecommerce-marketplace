/*
 * Settlement lifecycle.
 *
 * PENDING  - generated for a period, awaiting payout
 * PROCESSING - payout in progress
 * PAID     - payout completed
 * FAILED   - payout failed (can be retried to PROCESSING)
 * CANCELLED - payout cancelled
 */
export enum SettlementStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  PAID = "PAID",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}
