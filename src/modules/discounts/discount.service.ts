import { DiscountStatus } from "../../constants/discountStatus.js";
import { SellerStatus } from "../../constants/sellerStatus.js";
import { AppError } from "../../errors/AppError.js";
import { UserRole } from "../../constants/roles.js";
import { logAudit } from "../../services/audit.service.js";
import { getCacheKey, invalidateCache } from "../../config/redis.js";
import type { IDiscount } from "../../models/Discount.js";
import { findSellerByUserId } from "../sellers/seller.repository.js";
import {
  findActiveCategoryById,
  findProductByIdAndSeller,
} from "../products/product.repository.js";
import {
  createDiscount,
  findDiscountByIdAndSeller,
  listDiscountsBySeller,
  updateDiscountById,
} from "./discount.repository.js";
import {
  createDiscountSchema,
  listDiscountsQuerySchema,
  updateDiscountSchema,
  type CreateDiscountInput,
  type ListDiscountsQuery,
  type UpdateDiscountInput,
} from "./discount.schema.js";
import type {
  DiscountResponse,
  PaginatedDiscounts,
} from "./discount.types.js";

const toDiscountResponse = (
  discount: IDiscount,
): DiscountResponse => {
  return {
    id: discount._id.toString(),
    sellerId: discount.sellerId.toString(),
    productId: discount.productId
      ? discount.productId.toString()
      : null,
    categoryId: discount.categoryId
      ? discount.categoryId.toString()
      : null,
    discountType: discount.discountType,
    discountValue: discount.discountValue,
    startAt: discount.startAt,
    endAt: discount.endAt,
    status: discount.status,
    createdAt: discount.createdAt,
    updatedAt: discount.updatedAt,
  };
};

/*
 * Only approved sellers may create discounts (mirrors the product
 * listing gate). Discounts change public pricing, so the same rule
 * applies.
 */
const requireApprovedSeller = async (
  sellerId: string,
): Promise<void> => {
  const seller = await findSellerByUserId(sellerId);

  if (!seller || seller.status !== SellerStatus.APPROVED) {
    throw new AppError(
      "Your seller account must be approved before you can create discounts",
      403,
      "SELLER_NOT_APPROVED",
    );
  }
};

/*
 * Validates the discount target:
 * - a product target must exist AND belong to the seller
 * - a category target must exist and be active (categories are global)
 */
const validateTarget = async (
  sellerId: string,
  productId?: string | null,
  categoryId?: string | null,
): Promise<void> => {
  if (productId) {
    const product = await findProductByIdAndSeller(
      productId,
      sellerId,
    );

    if (!product) {
      throw new AppError(
        "Product not found or does not belong to you",
        404,
        "PRODUCT_NOT_FOUND",
      );
    }
  }

  if (categoryId) {
    const exists = await findActiveCategoryById(
      categoryId,
    );

    if (!exists) {
      throw new AppError(
        "Category does not exist or is inactive",
        400,
        "INVALID_CATEGORY",
      );
    }
  }
};

export const createDiscountForSeller = async (
  sellerId: string,
  input: unknown,
): Promise<DiscountResponse> => {
  const data: CreateDiscountInput =
    createDiscountSchema.parse(input);

  await requireApprovedSeller(sellerId);
  await validateTarget(
    sellerId,
    data.productId,
    data.categoryId,
  );

  const discount = await createDiscount({
    sellerId,
    productId: data.productId ?? null,
    categoryId: data.categoryId ?? null,
    discountType: data.discountType,
    discountValue: data.discountValue,
    startAt: data.startAt,
    endAt: data.endAt,
    status: data.status,
  });

  await logAudit({
    actorId: sellerId,
    actorRole: UserRole.SELLER,
    action: "DISCOUNT_CREATED",
    entityType: "DISCOUNT",
    entityId: discount._id.toString(),
  });

  /* Discounts change public product pricing - refresh the catalog cache. */
  await invalidateCache(getCacheKey("products", "*"));

  return toDiscountResponse(discount);
};

export const listSellerDiscounts = async (
  sellerId: string,
  query: unknown,
): Promise<PaginatedDiscounts> => {
  const parsed: ListDiscountsQuery =
    listDiscountsQuerySchema.parse(query);

  const filter: Record<string, unknown> = {};

  if (parsed.status) {
    filter.status = parsed.status;
  }

  const { items, total } =
    await listDiscountsBySeller(
      sellerId,
      filter,
      parsed.page,
      parsed.limit,
    );

  return {
    items: items.map(toDiscountResponse),
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) || 0,
  };
};

export const getSellerDiscount = async (
  sellerId: string,
  discountId: string,
): Promise<DiscountResponse> => {
  const discount =
    await findDiscountByIdAndSeller(
      discountId,
      sellerId,
    );

  if (!discount) {
    throw new AppError(
      "Discount not found",
      404,
      "DISCOUNT_NOT_FOUND",
    );
  }

  return toDiscountResponse(discount);
};

export const updateSellerDiscount = async (
  sellerId: string,
  discountId: string,
  input: unknown,
): Promise<DiscountResponse> => {
  const data: UpdateDiscountInput =
    updateDiscountSchema.parse(input);

  const existing =
    await findDiscountByIdAndSeller(
      discountId,
      sellerId,
    );

  if (!existing) {
    throw new AppError(
      "Discount not found",
      404,
      "DISCOUNT_NOT_FOUND",
    );
  }

  /*
   * The target stays mutually exclusive after the update: merge the
   * incoming fields with the current target and reject the result if
   * it would end up with neither (or both) targets.
   */
  const effectiveProductId =
    data.productId !== undefined
      ? data.productId
      : (existing.productId?.toString() ?? null);

  const effectiveCategoryId =
    data.categoryId !== undefined
      ? data.categoryId
      : (existing.categoryId?.toString() ?? null);

  if (!effectiveProductId && !effectiveCategoryId) {
    throw new AppError(
      "Either productId or categoryId is required",
      400,
      "VALIDATION_ERROR",
    );
  }

  if (effectiveProductId && effectiveCategoryId) {
    throw new AppError(
      "Provide either productId or categoryId, not both",
      400,
      "VALIDATION_ERROR",
    );
  }

  await validateTarget(
    sellerId,
    effectiveProductId,
    effectiveCategoryId,
  );

  const updated = await updateDiscountById(
    discountId,
    {
      ...(data.discountType !== undefined && {
        discountType: data.discountType,
      }),
      ...(data.discountValue !== undefined && {
        discountValue: data.discountValue,
      }),
      ...(data.startAt !== undefined && {
        startAt: data.startAt,
      }),
      ...(data.endAt !== undefined && {
        endAt: data.endAt,
      }),
      ...(data.status !== undefined && {
        status: data.status,
      }),
      productId: effectiveProductId,
      categoryId: effectiveCategoryId,
    },
  );

  if (!updated) {
    throw new AppError(
      "Discount not found",
      404,
      "DISCOUNT_NOT_FOUND",
    );
  }

  await logAudit({
    actorId: sellerId,
    actorRole: UserRole.SELLER,
    action: "DISCOUNT_UPDATED",
    entityType: "DISCOUNT",
    entityId: discountId,
  });

  /* Discounts change public product pricing - refresh the catalog cache. */
  await invalidateCache(getCacheKey("products", "*"));

  return toDiscountResponse(updated);
};

/*
 * Soft delete: deactivates the discount so checkout stops applying it
 * while the record (and its audit trail) stays intact.
 */
export const deactivateSellerDiscount = async (
  sellerId: string,
  discountId: string,
): Promise<void> => {
  const existing =
    await findDiscountByIdAndSeller(
      discountId,
      sellerId,
    );

  if (!existing) {
    throw new AppError(
      "Discount not found",
      404,
      "DISCOUNT_NOT_FOUND",
    );
  }

  if (existing.status === DiscountStatus.INACTIVE) {
    return;
  }

  await updateDiscountById(discountId, {
    status: DiscountStatus.INACTIVE,
  });

  await logAudit({
    actorId: sellerId,
    actorRole: UserRole.SELLER,
    action: "DISCOUNT_DEACTIVATED",
    entityType: "DISCOUNT",
    entityId: discountId,
  });

  /* Discounts change public product pricing - refresh the catalog cache. */
  await invalidateCache(getCacheKey("products", "*"));
};
