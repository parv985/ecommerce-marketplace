import mongoose from "mongoose";
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  DiscountStatus,
  DiscountType,
} from "../src/constants/discountStatus.js";
import type { IDiscount } from "../src/models/Discount.js";
import {
  applyDiscountToPrice,
  buildAppliedDiscount,
  isDiscountLive,
  selectDiscountForProduct,
  type DiscountableProduct,
} from "../src/modules/discounts/discount.pricing.js";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const makeDiscount = (
  overrides: Partial<IDiscount> = {},
): IDiscount => {
  const now = Date.now();

  return {
    _id: new mongoose.Types.ObjectId(),
    sellerId: new mongoose.Types.ObjectId(),
    productId: null,
    categoryId: null,
    discountType: DiscountType.PERCENTAGE,
    discountValue: 10,
    startAt: new Date(now - HOUR),
    endAt: new Date(now + 30 * DAY),
    status: DiscountStatus.ACTIVE,
    createdAt: new Date(now),
    updatedAt: new Date(now),
    ...overrides,
  };
};

const product = (
  id: string,
  categoryId?: string | null,
  price = 1000,
): DiscountableProduct => ({
  id,
  categoryId: categoryId ?? null,
  price,
});

describe("discount pricing", () => {
  const now = new Date();

  it("applies an active product discount", () => {
    const discount = makeDiscount({
      productId: new mongoose.Types.ObjectId(
        "aaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    });

    const selected = selectDiscountForProduct(
      product("aaaaaaaaaaaaaaaaaaaaaaaa"),
      [discount],
      now,
    );

    expect(selected?._id.toString()).toBe(
      discount._id.toString(),
    );
  });

  it("does not apply when no discount exists", () => {
    const discount = makeDiscount({
      productId: new mongoose.Types.ObjectId(
        "aaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    });

    const selected = selectDiscountForProduct(
      product("bbbbbbbbbbbbbbbbbbbbbbbb"),
      [discount],
      now,
    );

    expect(selected).toBeNull();
  });

  it("does not apply an expired discount", () => {
    const discount = makeDiscount({
      productId: new mongoose.Types.ObjectId(
        "aaaaaaaaaaaaaaaaaaaaaaaa",
      ),
      endAt: new Date(Date.now() - DAY),
    });

    expect(isDiscountLive(discount, now)).toBe(false);

    const selected = selectDiscountForProduct(
      product("aaaaaaaaaaaaaaaaaaaaaaaa"),
      [discount],
      now,
    );

    expect(selected).toBeNull();
  });

  it("does not apply a future discount", () => {
    const discount = makeDiscount({
      productId: new mongoose.Types.ObjectId(
        "aaaaaaaaaaaaaaaaaaaaaaaa",
      ),
      startAt: new Date(Date.now() + DAY),
    });

    expect(isDiscountLive(discount, now)).toBe(false);

    const selected = selectDiscountForProduct(
      product("aaaaaaaaaaaaaaaaaaaaaaaa"),
      [discount],
      now,
    );

    expect(selected).toBeNull();
  });

  it("does not apply an inactive discount", () => {
    const discount = makeDiscount({
      productId: new mongoose.Types.ObjectId(
        "aaaaaaaaaaaaaaaaaaaaaaaa",
      ),
      status: DiscountStatus.INACTIVE,
    });

    expect(isDiscountLive(discount, now)).toBe(false);

    const selected = selectDiscountForProduct(
      product("aaaaaaaaaaaaaaaaaaaaaaaa"),
      [discount],
      now,
    );

    expect(selected).toBeNull();
  });

  it("applies a category discount to a product in the category", () => {
    const categoryId = new mongoose.Types.ObjectId(
      "cccccccccccccccccccccccc",
    );
    const discount = makeDiscount({ categoryId });

    const selected = selectDiscountForProduct(
      product(
        "aaaaaaaaaaaaaaaaaaaaaaaa",
        "cccccccccccccccccccccccc",
      ),
      [discount],
      now,
    );

    expect(selected?._id.toString()).toBe(
      discount._id.toString(),
    );
  });

  it("does not apply a category discount to a product without that category", () => {
    const discount = makeDiscount({
      categoryId: new mongoose.Types.ObjectId(
        "cccccccccccccccccccccccc",
      ),
    });

    const selected = selectDiscountForProduct(
      product("aaaaaaaaaaaaaaaaaaaaaaaa", null),
      [discount],
      now,
    );

    expect(selected).toBeNull();
  });

  it("product discount beats category discount", () => {
    const categoryId = new mongoose.Types.ObjectId(
      "cccccccccccccccccccccccc",
    );
    const productDiscount = makeDiscount({
      _id: new mongoose.Types.ObjectId(
        "dddddddddddddddddddddddd",
      ),
      productId: new mongoose.Types.ObjectId(
        "aaaaaaaaaaaaaaaaaaaaaaaa",
      ),
      discountValue: 5,
    });
    const categoryDiscount = makeDiscount({
      _id: new mongoose.Types.ObjectId(
        "eeeeeeeeeeeeeeeeeeeeeeee",
      ),
      categoryId,
      discountValue: 20,
    });

    const selected = selectDiscountForProduct(
      product(
        "aaaaaaaaaaaaaaaaaaaaaaaa",
        "cccccccccccccccccccccccc",
      ),
      [categoryDiscount, productDiscount],
      now,
    );

    // Even though the category discount is larger, the product
    // discount wins by the documented precedence rule.
    expect(selected?._id.toString()).toBe(
      "dddddddddddddddddddddddd",
    );
  });

  it("picks the highest percentage among same-kind discounts", () => {
    const productId = new mongoose.Types.ObjectId(
      "aaaaaaaaaaaaaaaaaaaaaaaa",
    );
    const small = makeDiscount({
      _id: new mongoose.Types.ObjectId(
        "dddddddddddddddddddddddd",
      ),
      productId,
      discountValue: 5,
      createdAt: new Date(Date.now() - 2 * DAY),
    });
    const large = makeDiscount({
      _id: new mongoose.Types.ObjectId(
        "eeeeeeeeeeeeeeeeeeeeeeee",
      ),
      productId,
      discountValue: 25,
      createdAt: new Date(Date.now() - DAY),
    });

    const selected = selectDiscountForProduct(
      product("aaaaaaaaaaaaaaaaaaaaaaaa"),
      [small, large],
      now,
    );

    expect(selected?._id.toString()).toBe(
      "eeeeeeeeeeeeeeeeeeeeeeee",
    );
  });

  it("breaks value ties by earliest end date", () => {
    const productId = new mongoose.Types.ObjectId(
      "aaaaaaaaaaaaaaaaaaaaaaaa",
    );
    const later = makeDiscount({
      _id: new mongoose.Types.ObjectId(
        "dddddddddddddddddddddddd",
      ),
      productId,
      discountValue: 10,
      endAt: new Date(Date.now() + 10 * DAY),
    });
    const sooner = makeDiscount({
      _id: new mongoose.Types.ObjectId(
        "eeeeeeeeeeeeeeeeeeeeeeee",
      ),
      productId,
      discountValue: 10,
      endAt: new Date(Date.now() + 2 * DAY),
    });

    const selected = selectDiscountForProduct(
      product("aaaaaaaaaaaaaaaaaaaaaaaa"),
      [later, sooner],
      now,
    );

    expect(selected?._id.toString()).toBe(
      "eeeeeeeeeeeeeeeeeeeeeeee",
    );
  });

  it("calculates the discounted price with rounding", () => {
    expect(applyDiscountToPrice(1000, 10)).toBe(900);
    expect(applyDiscountToPrice(999, 10)).toBe(899.1);
    expect(applyDiscountToPrice(333.33, 10)).toBe(300);
  });

  it("builds an applied discount with amounts", () => {
    const discount = makeDiscount({
      productId: new mongoose.Types.ObjectId(
        "aaaaaaaaaaaaaaaaaaaaaaaa",
      ),
      discountValue: 10,
    });

    const applied = buildAppliedDiscount(
      product("aaaaaaaaaaaaaaaaaaaaaaaa", null, 1000),
      discount,
    );

    expect(applied.discountAmount).toBe(100);
    expect(applied.discountedPrice).toBe(900);
    expect(applied.originalPrice).toBe(1000);
  });
});
