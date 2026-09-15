import type { IDiscount } from "../../models/Discount.js";
import { DiscountStatus } from "../../constants/discountStatus.js";
import { findApplicableDiscounts } from "./discount.repository.js";

/*
 * Shared sales-discount calculation.
 *
 * This module is the ONLY place discount math lives so cart, checkout,
 * order and (later) payment stay consistent. The deterministic rule,
 * documented here and in Swagger:
 *
 * 1. A discount applies to a product when its status is ACTIVE and the
 *    current time is within [startAt, endAt].
 * 2. A product-specific discount (productId match) always beats a
 *    category discount for the same product.
 * 3. Among several applicable discounts of the same kind, the highest
 *    percentage wins; ties are broken by earliest endAt, then earliest
 *    createdAt.
 * 4. Discounts are never stacked.
 *
 * All money values are rounded to 2 decimal places.
 */

export const roundMoney = (value: number): number =>
  Math.round(value * 100) / 100;

export interface DiscountableProduct {
  id: string;
  categoryId?: string | null;
  /* Authoritative original price, always read from the database. */
  price: number;
}

export interface AppliedDiscount {
  productId: string;
  discountId: string;
  discountValue: number;
  /* Original unit price. */
  originalPrice: number;
  /* Absolute discount per unit. */
  discountAmount: number;
  /* Final unit price after the discount. */
  discountedPrice: number;
}

export const isDiscountLive = (
  discount: IDiscount,
  now: Date,
): boolean => {
  return (
    discount.status === DiscountStatus.ACTIVE &&
    discount.startAt.getTime() <= now.getTime() &&
    discount.endAt.getTime() >= now.getTime()
  );
};

/*
 * Orders candidates by the documented deterministic rule:
 * highest percentage first, then earliest endAt, then earliest
 * createdAt. Sorting happens here (not just in the repository) so the
 * selection is stable regardless of the input order.
 */
const sortByRule = (
  discounts: IDiscount[],
): IDiscount[] => {
  return [...discounts].sort((a, b) => {
    if (b.discountValue !== a.discountValue) {
      return b.discountValue - a.discountValue;
    }

    if (
      a.endAt.getTime() !== b.endAt.getTime()
    ) {
      return (
        a.endAt.getTime() - b.endAt.getTime()
      );
    }

    return (
      a.createdAt.getTime() -
      b.createdAt.getTime()
    );
  });
};

/*
 * Picks the winning discount for a single product from an already
 * fetched set, applying the product-vs-category precedence rule.
 */
export const selectDiscountForProduct = (
  product: DiscountableProduct,
  discounts: IDiscount[],
  now: Date,
): IDiscount | null => {
  const productDiscounts = sortByRule(
    discounts.filter(
      (discount) =>
        discount.productId &&
        discount.productId.toString() ===
          product.id &&
        isDiscountLive(discount, now),
    ),
  );

  if (productDiscounts.length > 0) {
    return productDiscounts[0]!;
  }

  if (!product.categoryId) {
    return null;
  }

  const categoryDiscounts = sortByRule(
    discounts.filter(
      (discount) =>
        discount.categoryId &&
        discount.categoryId.toString() ===
          product.categoryId &&
        isDiscountLive(discount, now),
    ),
  );

  return categoryDiscounts[0] ?? null;
};

/*
 * Applies a percentage discount to a price with consistent rounding.
 */
export const applyDiscountToPrice = (
  originalPrice: number,
  percent: number,
): number => {
  return roundMoney(
    originalPrice * (1 - percent / 100),
  );
};

export const buildAppliedDiscount = (
  product: DiscountableProduct,
  discount: IDiscount,
): AppliedDiscount => {
  const discountedPrice = applyDiscountToPrice(
    product.price,
    discount.discountValue,
  );

  return {
    productId: product.id,
    discountId: discount._id.toString(),
    discountValue: discount.discountValue,
    originalPrice: product.price,
    discountAmount: roundMoney(
      product.price - discountedPrice,
    ),
    discountedPrice,
  };
};

/*
 * Resolves the applicable discount for every product in one batched
 * query. Returns a Map keyed by product id; products without a live
 * discount are simply absent from the map.
 */
export const resolveDiscountsForProducts = async (
  products: DiscountableProduct[],
  now: Date = new Date(),
): Promise<Map<string, AppliedDiscount>> => {
  if (products.length === 0) {
    return new Map();
  }

  const productIds = products.map(
    (product) => product.id,
  );

  const categoryIds = Array.from(
    new Set(
      products
        .map((product) => product.categoryId)
        .filter(
          (id): id is string => Boolean(id),
        ),
    ),
  );

  const discounts = await findApplicableDiscounts(
    productIds,
    categoryIds,
    now,
  );

  const result = new Map<
    string,
    AppliedDiscount
  >();

  for (const product of products) {
    const discount = selectDiscountForProduct(
      product,
      discounts,
      now,
    );

    if (discount) {
      result.set(
        product.id,
        buildAppliedDiscount(
          product,
          discount,
        ),
      );
    }
  }

  return result;
};
