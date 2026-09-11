import {
  CouponStatus,
  CouponType,
} from "../../constants/couponStatus.js";
import { SellerStatus } from "../../constants/sellerStatus.js";
import { AppError } from "../../errors/AppError.js";
import { UserRole } from "../../constants/roles.js";
import { logAudit } from "../../services/audit.service.js";
import type { ICoupon } from "../../models/Coupon.js";
import { roundMoney } from "../discounts/discount.pricing.js";
import { findSellerByUserId } from "../sellers/seller.repository.js";
import { countProductsOwnedBySeller } from "../products/product.repository.js";
import { countActiveCategoriesByIds } from "../categories/category.repository.js";
import {
  buildCouponStatusFilter,
  claimCouponSlot,
  countCouponUsageByUser,
  createCoupon,
  createCouponUsage,
  findCouponByIdAndSeller,
  findCouponByCode,
  listCouponsBySeller,
  releaseCouponSlot,
  updateCouponById,
} from "./coupon.repository.js";
import {
  createCouponSchema,
  listCouponsQuerySchema,
  updateCouponSchema,
  type CreateCouponInput,
  type ListCouponsQuery,
  type UpdateCouponInput,
} from "./coupon.schema.js";
import type {
  CouponResponse,
  PaginatedCoupons,
} from "./coupon.types.js";

/*
 * ---------------------------------------------------------------------
 * Derived coupon status
 * ---------------------------------------------------------------------
 * The stored `status` column only records the seller's manual switch
 * (ACTIVE by default, INACTIVE after a deactivation). The status the
 * API reports - and the one checkout enforces - is always DERIVED from
 * the current date and the remaining usage limit:
 *
 *   ACTIVE   <=>  manually ACTIVE
 *                 AND now is within [startAt, endAt]  (not expired)
 *                 AND usageLimit is null OR usageCount < usageLimit
 *   INACTIVE otherwise (expired, fully used, scheduled or deactivated)
 *
 * Deriving instead of persisting also means a coupon whose slot is
 * released again (order cancelled) or whose end date is pushed into
 * the future automatically becomes Active again.
 */

/** True when the coupon's end date has passed. */
export const isCouponExpired = (
  coupon: ICoupon,
  now: Date = new Date(),
): boolean => {
  return coupon.endAt.getTime() < now.getTime();
};

/** True when every allowed use has been consumed. */
export const isCouponUsageLimitReached = (
  coupon: ICoupon,
): boolean => {
  return (
    coupon.usageLimit !== null &&
    coupon.usageLimit !== undefined &&
    coupon.usageCount >= coupon.usageLimit
  );
};

/**
 * Effective coupon status for the current date/time. A coupon is
 * Active only while it is manually enabled, inside its date window and
 * still has a usage slot left; everything else is Inactive.
 */
export const resolveCouponStatus = (
  coupon: ICoupon,
  now: Date = new Date(),
): CouponStatus => {
  if (
    coupon.status !== CouponStatus.ACTIVE ||
    coupon.startAt.getTime() > now.getTime() ||
    isCouponExpired(coupon, now) ||
    isCouponUsageLimitReached(coupon)
  ) {
    return CouponStatus.INACTIVE;
  }

  return CouponStatus.ACTIVE;
};

const toCouponResponse = (
  coupon: ICoupon,
  now: Date = new Date(),
): CouponResponse => {
  return {
    id: coupon._id.toString(),
    sellerId: coupon.sellerId.toString(),
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    minOrderValue: coupon.minOrderValue,
    maxDiscount: coupon.maxDiscount ?? null,
    productIds: coupon.productIds.map((id) =>
      id.toString(),
    ),
    categoryIds: coupon.categoryIds.map((id) =>
      id.toString(),
    ),
    startAt: coupon.startAt,
    endAt: coupon.endAt,
    usageLimit: coupon.usageLimit ?? null,
    perUserLimit: coupon.perUserLimit ?? null,
    usageCount: coupon.usageCount,
    status: resolveCouponStatus(coupon, now),
    createdAt: coupon.createdAt,
    updatedAt: coupon.updatedAt,
  };
};

const requireApprovedSeller = async (
  sellerId: string,
): Promise<void> => {
  const seller = await findSellerByUserId(sellerId);

  if (!seller || seller.status !== SellerStatus.APPROVED) {
    throw new AppError(
      "Your seller account must be approved before you can create coupons",
      403,
      "SELLER_NOT_APPROVED",
    );
  }
};

/*
 * Validates coupon restrictions:
 * - every restricted product must exist AND belong to the seller
 * - every restricted category must exist and be active
 */
const validateRestrictions = async (
  sellerId: string,
  productIds: string[],
  categoryIds: string[],
): Promise<void> => {
  if (productIds.length > 0) {
    const owned = await countProductsOwnedBySeller(
      productIds,
      sellerId,
    );

    if (owned !== productIds.length) {
      throw new AppError(
        "One or more restricted products do not exist or do not belong to you",
        400,
        "INVALID_COUPON_RESTRICTION",
      );
    }
  }

  if (categoryIds.length > 0) {
    const active = await countActiveCategoriesByIds(
      categoryIds,
    );

    if (active !== categoryIds.length) {
      throw new AppError(
        "One or more restricted categories do not exist or are inactive",
        400,
        "INVALID_COUPON_RESTRICTION",
      );
    }
  }
};

export const createCouponForSeller = async (
  sellerId: string,
  input: unknown,
): Promise<CouponResponse> => {
  const data: CreateCouponInput =
    createCouponSchema.parse(input);

  await requireApprovedSeller(sellerId);

  const existing = await findCouponByCode(data.code);

  if (existing) {
    throw new AppError(
      "A coupon with this code already exists",
      409,
      "COUPON_CODE_EXISTS",
    );
  }

  await validateRestrictions(
    sellerId,
    data.productIds,
    data.categoryIds,
  );

  const coupon = await createCoupon({
    sellerId,
    code: data.code,
    type: data.type,
    value: data.value,
    minOrderValue: data.minOrderValue,
    maxDiscount: data.maxDiscount ?? null,
    productIds: data.productIds,
    categoryIds: data.categoryIds,
    startAt: data.startAt,
    endAt: data.endAt,
    usageLimit: data.usageLimit ?? null,
    perUserLimit: data.perUserLimit ?? null,
    status: data.status,
  });

  await logAudit({
    actorId: sellerId,
    actorRole: UserRole.SELLER,
    action: "COUPON_CREATED",
    entityType: "COUPON",
    entityId: coupon._id.toString(),
    metadata: { code: coupon.code },
  });

  return toCouponResponse(coupon);
};

export const listSellerCoupons = async (
  sellerId: string,
  query: unknown,
): Promise<PaginatedCoupons> => {
  const parsed: ListCouponsQuery =
    listCouponsQuerySchema.parse(query);

  const now = new Date();

  /*
   * The status filter matches the DERIVED status, not just the stored
   * flag, so `?status=ACTIVE` never returns an expired or exhausted
   * coupon and `?status=INACTIVE` always includes them.
   */
  const filter: Record<string, unknown> =
    parsed.status !== undefined
      ? buildCouponStatusFilter(parsed.status, now)
      : {};

  const { items, total } = await listCouponsBySeller(
    sellerId,
    filter,
    parsed.page,
    parsed.limit,
  );

  return {
    items: items.map((coupon) =>
      toCouponResponse(coupon, now),
    ),
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) || 0,
  };
};

export const getSellerCoupon = async (
  sellerId: string,
  couponId: string,
): Promise<CouponResponse> => {
  const coupon = await findCouponByIdAndSeller(
    couponId,
    sellerId,
  );

  if (!coupon) {
    throw new AppError(
      "Coupon not found",
      404,
      "COUPON_NOT_FOUND",
    );
  }

  return toCouponResponse(coupon);
};

/*
 * Coupon codes are immutable identifiers (customers type them in), so
 * the code itself is intentionally not updatable.
 */
export const updateSellerCoupon = async (
  sellerId: string,
  couponId: string,
  input: unknown,
): Promise<CouponResponse> => {
  const data: UpdateCouponInput =
    updateCouponSchema.parse(input);

  const existing = await findCouponByIdAndSeller(
    couponId,
    sellerId,
  );

  if (!existing) {
    throw new AppError(
      "Coupon not found",
      404,
      "COUPON_NOT_FOUND",
    );
  }

  if (data.productIds || data.categoryIds) {
    await validateRestrictions(
      sellerId,
      data.productIds ?? existing.productIds.map((id) =>
        id.toString(),
      ),
      data.categoryIds ?? existing.categoryIds.map((id) =>
        id.toString(),
      ),
    );
  }

  const updated = await updateCouponById(
    couponId,
    {
      ...(data.type !== undefined && {
        type: data.type,
      }),
      ...(data.value !== undefined && {
        value: data.value,
      }),
      ...(data.minOrderValue !== undefined && {
        minOrderValue: data.minOrderValue,
      }),
      ...(data.maxDiscount !== undefined && {
        maxDiscount: data.maxDiscount ?? null,
      }),
      ...(data.productIds !== undefined && {
        productIds: data.productIds,
      }),
      ...(data.categoryIds !== undefined && {
        categoryIds: data.categoryIds,
      }),
      ...(data.startAt !== undefined && {
        startAt: data.startAt,
      }),
      ...(data.endAt !== undefined && {
        endAt: data.endAt,
      }),
      ...(data.usageLimit !== undefined && {
        usageLimit: data.usageLimit ?? null,
      }),
      ...(data.perUserLimit !== undefined && {
        perUserLimit: data.perUserLimit ?? null,
      }),
      ...(data.status !== undefined && {
        status: data.status,
      }),
    },
  );

  if (!updated) {
    throw new AppError(
      "Coupon not found",
      404,
      "COUPON_NOT_FOUND",
    );
  }

  await logAudit({
    actorId: sellerId,
    actorRole: UserRole.SELLER,
    action: "COUPON_UPDATED",
    entityType: "COUPON",
    entityId: couponId,
  });

  return toCouponResponse(updated);
};

export const deactivateSellerCoupon = async (
  sellerId: string,
  couponId: string,
): Promise<void> => {
  const existing = await findCouponByIdAndSeller(
    couponId,
    sellerId,
  );

  if (!existing) {
    throw new AppError(
      "Coupon not found",
      404,
      "COUPON_NOT_FOUND",
    );
  }

  if (existing.status === CouponStatus.INACTIVE) {
    return;
  }

  await updateCouponById(couponId, {
    status: CouponStatus.INACTIVE,
  });

  await logAudit({
    actorId: sellerId,
    actorRole: UserRole.SELLER,
    action: "COUPON_DEACTIVATED",
    entityType: "COUPON",
    entityId: couponId,
  });
};

/*
 * ---------------------------------------------------------------------
 * Checkout-facing logic (used by the order service)
 * ---------------------------------------------------------------------
 */

export interface CouponEligibleItem {
  productId: string;
  categoryId?: string | null;
}

export interface CouponEvaluation {
  coupon: ICoupon;
  discountAmount: number;
  /* Owner of the coupon; the caller matches it against the cart's sellers. */
  sellerId: string;
}

export const isCouponLive = (
  coupon: ICoupon,
  now: Date,
): boolean => {
  return (
    resolveCouponStatus(coupon, now) ===
    CouponStatus.ACTIVE
  );
};

/*
 * Buyer-facing text for a coupon that can no longer be redeemed,
 * whether its end date has passed or all of its allowed uses have
 * been consumed. Both states look identical to a buyer, so both
 * report "Coupon code expired"; the machine-readable error code still
 * tells them apart.
 */
export const COUPON_EXPIRED_MESSAGE =
  "Coupon code expired";

/*
 * Throws when the coupon is past its end date or has consumed its
 * whole usage limit - the two states a buyer sees as "expired".
 * Call this before any other coupon check so the buyer always gets
 * the message that matches the coupon's actual state.
 */
export const assertCouponNotExpiredOrExhausted = (
  coupon: ICoupon,
  now: Date = new Date(),
): void => {
  if (isCouponExpired(coupon, now)) {
    throw new AppError(
      COUPON_EXPIRED_MESSAGE,
      400,
      "COUPON_EXPIRED",
    );
  }

  if (isCouponUsageLimitReached(coupon)) {
    throw new AppError(
      COUPON_EXPIRED_MESSAGE,
      400,
      "COUPON_USAGE_LIMIT_REACHED",
    );
  }
};

/*
 * Deterministic coupon amount for a single seller's order. Rule
 * (documented in Swagger): the coupon is applied AFTER sales
 * discounts, on (itemsTotal - discountTotal). PERCENTAGE coupons take
 * that percentage; FIXED coupons give min(value, payable). The result
 * is capped by maxDiscount and never exceeds the payable amount.
 */
export const computeCouponDiscount = (
  coupon: ICoupon,
  orderValueAfterDiscount: number,
): number => {
  let amount: number;

  if (coupon.type === CouponType.PERCENTAGE) {
    amount = roundMoney(
      (orderValueAfterDiscount * coupon.value) / 100,
    );
  } else {
    amount = roundMoney(coupon.value);
  }

  if (coupon.maxDiscount !== null && coupon.maxDiscount !== undefined) {
    amount = Math.min(amount, coupon.maxDiscount);
  }

  return roundMoney(
    Math.min(amount, orderValueAfterDiscount),
  );
};

/*
 * Validates a coupon against an order and returns the amount it would
 * discount. No side effects - the atomic claim happens separately.
 */
export const evaluateCouponForOrder = async (
  input: {
    code: string;
    userId: string;
    itemsTotal: number;
    discountTotal: number;
    items: CouponEligibleItem[];
  },
  now: Date = new Date(),
): Promise<CouponEvaluation> => {
  const coupon = await findCouponByCode(input.code);

  if (!coupon) {
    throw new AppError(
      "Coupon not found",
      404,
      "COUPON_NOT_FOUND",
    );
  }

  /*
   * Expiry first, then a fully-used limit, so neither state is ever
   * reported as a generic "inactive/invalid" coupon.
   */
  assertCouponNotExpiredOrExhausted(coupon, now);

  if (
    coupon.status !== CouponStatus.ACTIVE ||
    coupon.startAt.getTime() > now.getTime()
  ) {
    throw new AppError(
      "Coupon is not active",
      400,
      "COUPON_INACTIVE",
    );
  }

  const orderValueAfterDiscount = roundMoney(
    input.itemsTotal - input.discountTotal,
  );

  if (orderValueAfterDiscount < coupon.minOrderValue) {
    throw new AppError(
      `Minimum order value of ${coupon.minOrderValue} required for this coupon`,
      400,
      "COUPON_MIN_ORDER_NOT_MET",
    );
  }

  /*
   * Restriction rule: when product/category restrictions exist, EVERY
   * item in the seller's order must qualify (product in productIds OR
   * its category in categoryIds). No restrictions = any item qualifies.
   */
  const hasRestrictions =
    coupon.productIds.length > 0 ||
    coupon.categoryIds.length > 0;

  if (hasRestrictions) {
    const productSet = new Set(
      coupon.productIds.map((id) => id.toString()),
    );
    const categorySet = new Set(
      coupon.categoryIds.map((id) => id.toString()),
    );

    const allQualify = input.items.every(
      (item) =>
        productSet.has(item.productId) ||
        (item.categoryId !== null &&
          item.categoryId !== undefined &&
          categorySet.has(item.categoryId)),
    );

    if (!allQualify) {
      throw new AppError(
        "Coupon is not valid for all items in your order",
        400,
        "COUPON_RESTRICTION_FAILED",
      );
    }
  }

  if (
    coupon.perUserLimit !== null &&
    coupon.perUserLimit !== undefined
  ) {
    const usedByUser =
      await countCouponUsageByUser(
        coupon._id.toString(),
        input.userId,
      );

    if (usedByUser >= coupon.perUserLimit) {
      throw new AppError(
        "You have already used this coupon",
        400,
        "COUPON_PER_USER_LIMIT_REACHED",
      );
    }
  }

  const discountAmount = computeCouponDiscount(
    coupon,
    orderValueAfterDiscount,
  );

  return {
    coupon,
    discountAmount,
    sellerId: coupon.sellerId.toString(),
  };
};

/*
 * Atomically reserves one usage slot BEFORE the order is persisted so
 * a checkout can never apply a coupon that is already exhausted. The
 * atomic counter guard makes request N+1 fail even under concurrency.
 * Returns the claimed coupon (used to derive per-user enforcement).
 */
export const reserveCouponSlot = async (
  couponId: string,
): Promise<ICoupon> => {
  const claimed = await claimCouponSlot(
    couponId,
    new Date(),
  );

  if (!claimed) {
    throw new AppError(
      COUPON_EXPIRED_MESSAGE,
      400,
      "COUPON_USAGE_LIMIT_REACHED",
    );
  }

  return claimed;
};

/*
 * Records the usage against the order. If the insert fails (e.g. the
 * per-user=1 unique index rejects a concurrent duplicate) the reserved
 * slot is released again; the caller is responsible for resetting the
 * order's coupon fields so the discount is not leaked.
 */
export const recordCouponUsage = async (input: {
  couponId: string;
  userId: string;
  orderId: string;
  discountAmount: number;
  perUserLimit: number | null | undefined;
}): Promise<void> => {
  try {
    await createCouponUsage({
      couponId: input.couponId,
      userId: input.userId,
      orderId: input.orderId,
      discountAmount: input.discountAmount,
      enforcePerUserOne:
        input.perUserLimit === 1,
    });
  } catch (error) {
    await releaseCouponSlot(input.couponId);
    throw error;
  }
};

/*
 * Returns a reserved slot when order creation fails after the reserve.
 * Separate from releaseCouponUsage (order-cancellation path) because
 * no usage record exists at this point.
 */
export const releaseCouponSlotOnly = async (
  couponId: string,
): Promise<void> => {
  await releaseCouponSlot(couponId);
};
