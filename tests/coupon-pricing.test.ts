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
  isCouponLive,
} from "../src/modules/coupons/coupon.service.js";

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
