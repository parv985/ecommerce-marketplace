import {
  Discount,
  type IDiscount,
} from "../../models/Discount.js";
import { DiscountStatus } from "../../constants/discountStatus.js";

export const createDiscount = async (
  data: Record<string, unknown>,
): Promise<IDiscount> => {
  return Discount.create(data);
};

/*
 * Ownership-scoped lookup: returns the discount only when it belongs
 * to the given seller. All seller write/read APIs go through this so a
 * seller can never see or modify another seller's discount.
 */
export const findDiscountByIdAndSeller = async (
  id: string,
  sellerId: string,
): Promise<IDiscount | null> => {
  return Discount.findOne({
    _id: id,
    sellerId,
  }).exec();
};

export const listDiscountsBySeller = async (
  sellerId: string,
  filter: Record<string, unknown>,
  page: number,
  limit: number,
): Promise<{
  items: IDiscount[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    Discount.find({ sellerId, ...filter })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Discount.countDocuments({
      sellerId,
      ...filter,
    }).exec(),
  ]);

  return { items, total };
};

export const updateDiscountById = async (
  id: string,
  data: Record<string, unknown>,
): Promise<IDiscount | null> => {
  return Discount.findByIdAndUpdate(
    id,
    {
      $set: data,
    },
    {
      new: true,
    },
  ).exec();
};

/*
 * Fetches the discounts that are currently live (ACTIVE status and
 * within their date window) for the given products/categories. The
 * result is pre-sorted so the pricing service can pick the winning
 * discount deterministically: highest percentage first, then earliest
 * end date, then earliest creation.
 */
export const findApplicableDiscounts = async (
  productIds: string[],
  categoryIds: string[],
  now: Date,
): Promise<IDiscount[]> => {
  if (
    productIds.length === 0 &&
    categoryIds.length === 0
  ) {
    return [];
  }

  const targetFilter: Array<
    Record<string, unknown>
  > = [];

  if (productIds.length > 0) {
    targetFilter.push({
      productId: { $in: productIds },
    });
  }

  if (categoryIds.length > 0) {
    targetFilter.push({
      categoryId: { $in: categoryIds },
    });
  }

  return Discount.find({
    status: DiscountStatus.ACTIVE,
    startAt: { $lte: now },
    endAt: { $gte: now },
    $or: targetFilter,
  })
    .sort({
      discountValue: -1,
      endAt: 1,
      createdAt: 1,
    })
    .exec();
};
