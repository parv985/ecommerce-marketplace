import mongoose from "mongoose";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  CouponStatus,
  CouponType,
} from "../src/constants/couponStatus.js";
import type { ICoupon } from "../src/models/Coupon.js";

/*
 * Service-level coverage for the derived coupon status and the buyer
 * error messages. The coupon repository is mocked so these assertions
 * need no database: they pin the validation order in
 * `evaluateCouponForOrder` (expired -> fully used -> inactive) and the
 * status the seller endpoints report.
 */
const repo = vi.hoisted(() => ({
  buildCouponStatusFilter: vi.fn(),
  claimCouponSlot: vi.fn(),
  countCouponUsageByUser: vi.fn(),
  createCoupon: vi.fn(),
  createCouponUsage: vi.fn(),
  findCouponByIdAndSeller: vi.fn(),
  findCouponByCode: vi.fn(),
  listCouponsBySeller: vi.fn(),
  releaseCouponSlot: vi.fn(),
  updateCouponById: vi.fn(),
}));

vi.mock(
  "../src/modules/coupons/coupon.repository.js",
  () => repo,
);

const {
  evaluateCouponForOrder,
  getSellerCoupon,
  listSellerCoupons,
} = await import(
  "../src/modules/coupons/coupon.service.js"
);

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
    perUserLimit: null,
    status: CouponStatus.ACTIVE,
    usageCount: 0,
    createdAt: new Date(now),
    updatedAt: new Date(now),
    ...overrides,
  };
};

const orderInput = {
  code: "TEST10",
  userId: new mongoose.Types.ObjectId().toString(),
  itemsTotal: 1000,
  discountTotal: 0,
  items: [
    {
      productId: new mongoose.Types.ObjectId().toString(),
      categoryId: null,
    },
  ],
};

const errorOf = async (
  promise: Promise<unknown>,
): Promise<{ code: string; message: string; statusCode: number }> => {
  try {
    await promise;
  } catch (error) {
    return error as {
      code: string;
      message: string;
      statusCode: number;
    };
  }

  throw new Error("Expected the promise to reject");
};

describe("coupon checkout validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.countCouponUsageByUser.mockResolvedValue(0);
  });

  it("reports an expired coupon as expired", async () => {
    repo.findCouponByCode.mockResolvedValue(
      makeCoupon({
        endAt: new Date(Date.now() - HOUR),
      }),
    );

    const error = await errorOf(
      evaluateCouponForOrder(orderInput),
    );

    expect(error.code).toBe("COUPON_EXPIRED");
    expect(error.message).toBe("Coupon code expired");
    expect(error.statusCode).toBe(400);
  });

  it("reports a fully-used coupon as expired, not invalid", async () => {
    repo.findCouponByCode.mockResolvedValue(
      makeCoupon({ usageLimit: 3, usageCount: 3 }),
    );

    const error = await errorOf(
      evaluateCouponForOrder(orderInput),
    );

    expect(error.code).toBe(
      "COUPON_USAGE_LIMIT_REACHED",
    );
    expect(error.message).toBe("Coupon code expired");
  });

  it("prefers the expired message when a coupon is both over and exhausted", async () => {
    repo.findCouponByCode.mockResolvedValue(
      makeCoupon({
        endAt: new Date(Date.now() - HOUR),
        usageLimit: 1,
        usageCount: 1,
      }),
    );

    const error = await errorOf(
      evaluateCouponForOrder(orderInput),
    );

    expect(error.code).toBe("COUPON_EXPIRED");
    expect(error.message).toBe("Coupon code expired");
  });

  it("keeps the inactive code for a deactivated coupon", async () => {
    repo.findCouponByCode.mockResolvedValue(
      makeCoupon({ status: CouponStatus.INACTIVE }),
    );

    const error = await errorOf(
      evaluateCouponForOrder(orderInput),
    );

    expect(error.code).toBe("COUPON_INACTIVE");
    expect(error.message).toBe("Coupon is not active");
  });

  it("rejects a coupon that has not started yet", async () => {
    repo.findCouponByCode.mockResolvedValue(
      makeCoupon({
        startAt: new Date(Date.now() + DAY),
        endAt: new Date(Date.now() + 2 * DAY),
      }),
    );

    const error = await errorOf(
      evaluateCouponForOrder(orderInput),
    );

    expect(error.code).toBe("COUPON_INACTIVE");
  });

  it("accepts a live coupon and computes the discount", async () => {
    repo.findCouponByCode.mockResolvedValue(makeCoupon());

    const evaluation = await evaluateCouponForOrder(
      orderInput,
    );

    expect(evaluation.discountAmount).toBe(100);
  });
});

describe("seller-facing derived status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns INACTIVE for an expired coupon", async () => {
    repo.findCouponByIdAndSeller.mockResolvedValue(
      makeCoupon({
        endAt: new Date(Date.now() - HOUR),
      }),
    );

    const coupon = await getSellerCoupon("seller", "coupon");

    expect(coupon.status).toBe("INACTIVE");
  });

  it("returns INACTIVE for an exhausted coupon", async () => {
    repo.findCouponByIdAndSeller.mockResolvedValue(
      makeCoupon({ usageLimit: 2, usageCount: 2 }),
    );

    const coupon = await getSellerCoupon("seller", "coupon");

    expect(
      new Date(coupon.endAt).getTime(),
    ).toBeGreaterThan(Date.now());
    expect(coupon.status).toBe("INACTIVE");
  });

  it("returns ACTIVE for a live coupon", async () => {
    repo.findCouponByIdAndSeller.mockResolvedValue(
      makeCoupon(),
    );

    const coupon = await getSellerCoupon("seller", "coupon");

    expect(coupon.status).toBe("ACTIVE");
  });

  it("derives the status of every item in the list", async () => {
    repo.listCouponsBySeller.mockResolvedValue({
      items: [
        makeCoupon({ code: "LIVE" }),
        makeCoupon({
          code: "OLD",
          endAt: new Date(Date.now() - HOUR),
        }),
        makeCoupon({
          code: "USED",
          usageLimit: 1,
          usageCount: 1,
        }),
      ],
      total: 3,
    });

    const page = await listSellerCoupons("seller", {});

    expect(
      page.items.map((coupon) => coupon.status),
    ).toEqual(["ACTIVE", "INACTIVE", "INACTIVE"]);
  });
});
