import {
  Coupon,
  type ICoupon,
} from "../../models/Coupon.js";
import {
  CouponUsage,
  type ICouponUsage,
} from "../../models/CouponUsage.js";
import { CouponStatus } from "../../constants/couponStatus.js";

export const createCoupon = async (
  data: Record<string, unknown>,
): Promise<ICoupon> => {
  return Coupon.create(data);
};

export const findCouponByIdAndSeller = async (
  id: string,
  sellerId: string,
): Promise<ICoupon | null> => {
  return Coupon.findOne({
    _id: id,
    sellerId,
  }).exec();
};

/*
 * Lookup by normalized code (schema stores codes uppercase).
 */
export const findCouponByCode = async (
  code: string,
): Promise<ICoupon | null> => {
  return Coupon.findOne({
    code: code.toUpperCase(),
  }).exec();
};

export const listCouponsBySeller = async (
  sellerId: string,
  filter: Record<string, unknown>,
  page: number,
  limit: number,
): Promise<{
  items: ICoupon[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    Coupon.find({ sellerId, ...filter })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Coupon.countDocuments({
      sellerId,
      ...filter,
    }).exec(),
  ]);

  return { items, total };
};

export const updateCouponById = async (
  id: string,
  data: Record<string, unknown>,
): Promise<ICoupon | null> => {
  return Coupon.findByIdAndUpdate(
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
 * Atomic claim of one usage slot: the update only applies while the
 * coupon is live AND (usageLimit is null OR usageCount < usageLimit).
 * Concurrent requests beyond the limit fail here, so request N+1 can
 * never slip through a read-then-write race. Returns the updated
 * coupon or null when the limit is exhausted.
 */
export const claimCouponSlot = async (
  couponId: string,
  now: Date,
): Promise<ICoupon | null> => {
  return Coupon.findOneAndUpdate(
    {
      _id: couponId,
      status: CouponStatus.ACTIVE,
      startAt: { $lte: now },
      endAt: { $gte: now },
      $expr: {
        $or: [
          { $eq: ["$usageLimit", null] },
          { $lt: ["$usageCount", "$usageLimit"] },
        ],
      },
    },
    {
      $inc: { usageCount: 1 },
    },
    {
      new: true,
    },
  ).exec();
};

export const releaseCouponSlot = async (
  couponId: string,
): Promise<void> => {
  await Coupon.updateOne(
    { _id: couponId },
    {
      $inc: { usageCount: -1 },
    },
  ).exec();
};

export const countCouponUsageByUser = async (
  couponId: string,
  userId: string,
): Promise<number> => {
  return CouponUsage.countDocuments({
    couponId,
    userId,
  }).exec();
};

export const createCouponUsage = async (
  data: {
    couponId: string;
    userId: string;
    orderId: string;
    discountAmount: number;
    enforcePerUserOne?: boolean;
  },
): Promise<ICouponUsage> => {
  return CouponUsage.create({
    couponId: data.couponId,
    userId: data.userId,
    orderId: data.orderId,
    discountAmount: data.discountAmount,
    usedAt: new Date(),
    enforcePerUserOne: data.enforcePerUserOne ?? false,
  });
};

export const findUsageByOrderId = async (
  orderId: string,
): Promise<ICouponUsage | null> => {
  return CouponUsage.findOne({ orderId }).exec();
};

/*
 * Releases a coupon usage (order cancelled): deletes the usage record
 * and decrements the counter. Idempotent - a second call finds no
 * usage record and does nothing, so a cancelled order can never
 * release the same coupon twice.
 */
export const releaseCouponUsage = async (
  orderId: string,
): Promise<void> => {
  const usage = await findUsageByOrderId(orderId);

  if (!usage) {
    return;
  }

  await CouponUsage.deleteOne({
    _id: usage._id,
  }).exec();

  await releaseCouponSlot(
    usage.couponId.toString(),
  );
};
