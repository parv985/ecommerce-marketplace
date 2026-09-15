export enum ReturnStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  CANCELLED = "CANCELLED",
  COMPLETED = "COMPLETED",
}

/*
 * Buyers may request a return within this many days of delivery.
 */
export const RETURN_WINDOW_DAYS = 7;
