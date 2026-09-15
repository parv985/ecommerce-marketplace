import type { Coupon } from '@/types/api'

/**
 * Dynamic coupon status helpers.
 *
 * The backend never trusts the stored `status` flag alone: a coupon is
 * ACTIVE only while it is manually enabled, the current date is inside
 * `[startAt, endAt]` and the usage limit has not been reached (see
 * `resolveCouponStatus` in `src/modules/coupons/coupon.service.ts`).
 * The helpers here mirror that rule on the client so the seller panel
 * stays correct for a cached list and the checkout page can explain
 * exactly why a coupon was rejected.
 */

/** The coupon fields that decide whether it can still be redeemed. */
export type CouponStateInput = Pick<
  Coupon,
  'status' | 'startAt' | 'endAt' | 'usageLimit' | 'usageCount'
>

export type CouponState =
  | 'ACTIVE'
  | 'EXPIRED'
  | 'USAGE_LIMIT_REACHED'
  | 'DEACTIVATED'
  | 'SCHEDULED'

/** Message the buyer sees for a coupon that can no longer be redeemed. */
export const COUPON_EXPIRED_MESSAGE = 'Coupon code expired'

/** Deduplicates the toast when several requests report the same coupon. */
export const COUPON_EXPIRED_TOAST_ID = 'checkout-coupon-expired'

/**
 * Error codes the API returns for a coupon whose end date has passed or
 * whose usage limit is exhausted. Both mean the same thing to a buyer.
 */
const COUPON_EXPIRED_CODES = ['COUPON_EXPIRED', 'COUPON_USAGE_LIMIT_REACHED']

const toTime = (value: string | Date | null | undefined): number | null => {
  if (value === null || value === undefined) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

/** Machine-readable error code from an API error (or `undefined`). */
export function getCouponErrorCode(error: unknown): string | undefined {
  return (error as { response?: { data?: { code?: string } } } | undefined)
    ?.response?.data?.code
}

/** True for the two codes that represent an "expired" coupon to a buyer. */
export function isCouponExpiredError(error: unknown): boolean {
  const code = getCouponErrorCode(error)
  return !!code && COUPON_EXPIRED_CODES.includes(code)
}

/**
 * Buyer-facing toast text for a rejected coupon. Expired and fully-used
 * coupons always read "Coupon code expired"; anything else keeps the
 * existing generic message.
 */
export function getCouponErrorMessage(error: unknown): string {
  return isCouponExpiredError(error) ? COUPON_EXPIRED_MESSAGE : 'Invalid coupon code.'
}

/**
 * Effective state of a coupon at `now`. Expiry and the usage limit are
 * checked before the manual switch so an expired or fully-used coupon
 * is reported as such even if it is still flagged ACTIVE in the
 * database (and a released slot can make it ACTIVE again).
 */
export function getCouponState(
  coupon: CouponStateInput,
  now: Date = new Date()
): CouponState {
  const endAt = toTime(coupon.endAt)
  if (endAt !== null && endAt < now.getTime()) return 'EXPIRED'

  if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
    return 'USAGE_LIMIT_REACHED'
  }

  if (coupon.status !== 'ACTIVE') return 'DEACTIVATED'

  const startAt = toTime(coupon.startAt)
  if (startAt !== null && startAt > now.getTime()) return 'SCHEDULED'

  return 'ACTIVE'
}

/** A coupon counts as Active only when it can actually be redeemed. */
export function isCouponActive(
  coupon: CouponStateInput,
  now: Date = new Date()
): boolean {
  return getCouponState(coupon, now) === 'ACTIVE'
}

/** Short reason shown in the seller panel next to an Inactive badge. */
export const couponInactiveReasons: Record<Exclude<CouponState, 'ACTIVE'>, string> = {
  EXPIRED: 'Expired',
  USAGE_LIMIT_REACHED: 'Usage limit reached',
  DEACTIVATED: 'Deactivated',
  SCHEDULED: 'Starts later',
}
