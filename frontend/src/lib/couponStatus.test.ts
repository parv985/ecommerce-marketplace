import { describe, expect, it } from 'vitest'

import {
  COUPON_EXPIRED_MESSAGE,
  getCouponErrorMessage,
  getCouponState,
  isCouponActive,
  isCouponExpiredError,
  type CouponStateInput,
} from './couponStatus'

const DAY = 24 * 3600 * 1000
const now = new Date('2026-01-15T12:00:00.000Z')

const coupon = (
  overrides: Partial<CouponStateInput> = {}
): CouponStateInput => ({
  status: 'ACTIVE',
  startAt: new Date(now.getTime() - DAY).toISOString(),
  endAt: new Date(now.getTime() + DAY).toISOString(),
  usageLimit: null,
  usageCount: 0,
  ...overrides,
})

const apiError = (code: string) => ({
  response: { data: { code } },
})

describe('getCouponState', () => {
  it('is ACTIVE inside its window with uses left', () => {
    expect(getCouponState(coupon(), now)).toBe('ACTIVE')
    expect(isCouponActive(coupon(), now)).toBe(true)
  })

  it('is EXPIRED once the end date has passed', () => {
    expect(
      getCouponState(
        coupon({
          endAt: new Date(now.getTime() - DAY).toISOString(),
        }),
        now
      )
    ).toBe('EXPIRED')
  })

  it('is USAGE_LIMIT_REACHED even before the end date', () => {
    expect(
      getCouponState(
        coupon({ usageLimit: 3, usageCount: 3 }),
        now
      )
    ).toBe('USAGE_LIMIT_REACHED')

    expect(
      isCouponActive(
        coupon({ usageLimit: 3, usageCount: 2 }),
        now
      )
    ).toBe(true)
  })

  it('is DEACTIVATED when the manual switch is off', () => {
    expect(
      getCouponState(coupon({ status: 'INACTIVE' }), now)
    ).toBe('DEACTIVATED')
  })

  it('is SCHEDULED before the start date', () => {
    expect(
      getCouponState(
        coupon({
          startAt: new Date(now.getTime() + DAY).toISOString(),
        }),
        now
      )
    ).toBe('SCHEDULED')
  })
})

describe('coupon error messages', () => {
  it('maps both expired states to the required toast', () => {
    for (const code of [
      'COUPON_EXPIRED',
      'COUPON_USAGE_LIMIT_REACHED',
    ]) {
      expect(getCouponErrorMessage(apiError(code))).toBe(
        COUPON_EXPIRED_MESSAGE
      )
      expect(isCouponExpiredError(apiError(code))).toBe(true)
    }
  })

  it('keeps the generic message for other coupon errors', () => {
    expect(
      getCouponErrorMessage(apiError('COUPON_INACTIVE'))
    ).toBe('Invalid coupon code.')
    expect(getCouponErrorMessage(new Error('boom'))).toBe(
      'Invalid coupon code.'
    )
    expect(isCouponExpiredError(undefined)).toBe(false)
  })
})
