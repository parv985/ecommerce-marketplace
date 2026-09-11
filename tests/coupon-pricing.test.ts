import mongoose from "mongoose";
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  CouponStatus,
  CouponType,
} from "../src/constants/couponStatus.js";
import type { ICoupon } from "../src/models/Coupon.js";
import {
  computeCouponDiscount,
  isCouponExpired,
  isCouponLive,
  isCouponUsageLimitReached,
  resolveCouponStatus,
} from "../src/modules/coupons/coupon.service.js";
import { buildCouponStatusFilter } from "../src/modules/coupons/coupon.repository.js";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const makeCoupon = (
  overrides: Partial<ICoupon> = {},
): ICoupon => {
  const now = Date.now();

  return {
    _id: new mongoose.Types.ObjectId(),
    sellerId: new mongoose.Types.ObjectId(),
    code: "TEST10",
    type: CouponType.PERCENTAGE,
    value: 10,
    minOrderValue: 0,
    maxDiscount: null,
    productIds: [],
    categoryIds: [],
    startAt: new Date(now - HOUR),
    endAt: new Date(now + 30 * DAY),
    usageLimit: null,
    perUserLimit: 1,
    status: CouponStatus.ACTIVE,
    usageCount: 0,
    createdAt: new Date(now),
    updatedAt: new Date(now),
    ...overrides,
  };
};

describe("coupon status filter", () => {
  /*
   * The list filter must mirror `resolveCouponStatus` exactly, so these
   * assertions are a regression guard: changing one without the other
   * breaks the seller panel's status filter.
   */
  const now = new Date();

  it("matches the derived rule for ACTIVE", () => {
    expect(
      buildCouponStatusFilter(CouponStatus.ACTIVE, now),
    ).toEqual({
      status: CouponStatus.ACTIVE,
      startAt: { $lte: now },
      endAt: { $gte: now },
      $or: [
        { usageLimit: null },
        {
          $expr: {
            $lt: ["$usageCount", "$usageLimit"],
          },
        },
      ],
    });
  });

  it("is the exact complement for INACTIVE", () => {
    expect(
      buildCouponStatusFilter(CouponStatus.INACTIVE, now),
    ).toEqual({
      $or: [
        { status: CouponStatus.INACTIVE },
        { startAt: { $gt: now } },
        { endAt: { $lt: now } },
        {
          usageLimit: { $ne: null },
          $expr: {
            $gte: ["$usageCount", "$usageLimit"],
          },
        },
      ],
    });
  });
});

describe("coupon calculation", () => {
  it("applies a percentage coupon to the post-sales-discount value", () => {
    const coupon = makeCoupon({
      type: CouponType.PERCENTAGE,
      value: 10,
    });

    expect(computeCouponDiscount(coupon, 1000)).toBe(
      100,
    );
  });

  it("applies a fixed coupon capped at the payable amount", () => {
    const coupon = makeCoupon({
      type: CouponType.FIXED,
      value: 1500,
    });

    expect(computeCouponDiscount(coupon, 1000)).toBe(
      1000,
    );
  });

  it("applies a fixed coupon", () => {
    const coupon = makeCoupon({
      type: CouponType.FIXED,
      value: 500,
    });

    expect(computeCouponDiscount(coupon, 1000)).toBe(
      500,
    );
  });

  it("caps the discount with maxDiscount", () => {
    const percentage = makeCoupon({
      type: CouponType.PERCENTAGE,
      value: 20,
      maxDiscount: 50,
    });

    expect(
      computeCouponDiscount(percentage, 1000),
    ).toBe(50);

    const fixed = makeCoupon({
      type: CouponType.FIXED,
      value: 200,
      maxDiscount: 50,
    });

    expect(computeCouponDiscount(fixed, 1000)).toBe(
      50,
    );
  });

  it("rounds money consistently", () => {
    const coupon = makeCoupon({
      type: CouponType.PERCENTAGE,
      value: 33.33,
    });

    expect(computeCouponDiscount(coupon, 999)).toBe(
      332.97,
    );
  });

  it("never discounts below zero", () => {
    const coupon = makeCoupon({
      type: CouponType.FIXED,
      value: 500,
    });

    expect(computeCouponDiscount(coupon, 100)).toBe(
      100,
    );
  });
});

describe("coupon liveness", () => {
  const now = new Date();

  it("is live within the active window", () => {
    expect(isCouponLive(makeCoupon(), now)).toBe(
      true,
    );
  });

  it("is not live before start", () => {
    const coupon = makeCoupon({
      startAt: new Date(Date.now() + DAY),
    });

    expect(isCouponLive(coupon, now)).toBe(false);
  });

  it("is not live after end", () => {
    const coupon = makeCoupon({
      endAt: new Date(Date.now() - DAY),
    });

    expect(isCouponLive(coupon, now)).toBe(false);
  });

  it("is not live when inactive", () => {
    const coupon = makeCoupon({
      status: CouponStatus.INACTIVE,
    });

    expect(isCouponLive(coupon, now)).toBe(false);
  });
});

describe("coupon derived status", () => {
  const now = new Date();

  it("is ACTIVE inside its window with uses left", () => {
    expect(
      resolveCouponStatus(makeCoupon(), now),
    ).toBe(CouponStatus.ACTIVE);
  });

  it("is INACTIVE once the end date has passed", () => {
    expect(
      isCouponExpired(
        makeCoupon({
          endAt: new Date(Date.now() - DAY),
        }),
        now,
      ),
    ).toBe(true);

    expect(
      resolveCouponStatus(
        makeCoupon({
          endAt: new Date(Date.now() - DAY),
        }),
        now,
      ),
    ).toBe(CouponStatus.INACTIVE);
  });

  it("is INACTIVE when the usage limit has been reached", () => {
    expect(
      isCouponUsageLimitReached(
        makeCoupon({ usageLimit: 5, usageCount: 5 }),
      ),
    ).toBe(true);

    expect(
      resolveCouponStatus(
        makeCoupon({ usageLimit: 5, usageCount: 5 }),
        now,
      ),
    ).toBe(CouponStatus.INACTIVE);

    // One slot left -> still ACTIVE.
    expect(
      resolveCouponStatus(
        makeCoupon({ usageLimit: 5, usageCount: 4 }),
        now,
      ),
    ).toBe(CouponStatus.ACTIVE);

    // Unlimited coupons never hit a limit.
    expect(
      resolveCouponStatus(
        makeCoupon({ usageLimit: null, usageCount: 999 }),
        now,
      ),
    ).toBe(CouponStatus.ACTIVE);
  });

  it("is INACTIVE before the start date or when deactivated", () => {
    expect(
      resolveCouponStatus(
        makeCoupon({
          startAt: new Date(Date.now() + DAY),
        }),
        now,
      ),
    ).toBe(CouponStatus.INACTIVE);

    expect(
      resolveCouponStatus(
        makeCoupon({ status: CouponStatus.INACTIVE }),
        now,
      ),
    ).toBe(CouponStatus.INACTIVE);
  });

  it("keeps isCouponLive aligned with the derived status", () => {
    expect(
      isCouponLive(
        makeCoupon({ usageLimit: 1, usageCount: 1 }),
        now,
      ),
    ).toBe(false);
  });
});
