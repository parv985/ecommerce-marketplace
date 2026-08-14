import { Types } from "mongoose";

import {
  Review,
  type IReview,
} from "../../models/Review.js";
import { User } from "../../models/User.js";
import { Order } from "../../models/Order.js";
import { OrderStatus } from "../../constants/orderStatus.js";

/*
 * A user is eligible to review a product only after an order
 * containing it has been delivered.
 */
export const hasDeliveredOrderWithProduct = async (
  userId: string,
  productId: string,
): Promise<boolean> => {
  const count = await Order.countDocuments({
    userId,
    status: OrderStatus.DELIVERED,
    "items.productId": productId,
  }).exec();

  return count > 0;
};

export const findReviewById = async (
  id: string,
): Promise<IReview | null> => {
  return Review.findById(id).exec();
};

export const findReviewByUserAndProduct = async (
  userId: string,
  productId: string,
): Promise<IReview | null> => {
  return Review.findOne({
    userId,
    productId,
  }).exec();
};

export const createReview = async (
  data: Record<string, unknown>,
): Promise<IReview> => {
  return Review.create(data);
};

export const updateReviewById = async (
  id: string,
  data: Record<string, unknown>,
): Promise<IReview | null> => {
  return Review.findByIdAndUpdate(
    id,
    {
      $set: data,
    },
    {
      new: true,
    },
  ).exec();
};

export const deleteReviewById = async (
  id: string,
): Promise<IReview | null> => {
  return Review.findByIdAndDelete(id).exec();
};

export const listReviewsByProduct = async (
  productId: string,
  page: number,
  limit: number,
): Promise<{
  items: IReview[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    Review.find({ productId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Review.countDocuments({ productId }).exec(),
  ]);

  return { items, total };
};

export const aggregateProductRating = async (
  productId: string,
): Promise<{ average: number; count: number }> => {
  const result = await Review.aggregate([
    /*
     * Aggregation pipelines do not cast strings to ObjectId the way
     * find() does, so convert explicitly.
     */
    {
      $match: {
        productId: new Types.ObjectId(
          productId,
        ),
      },
    },
    {
      $group: {
        _id: null,
        average: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]).exec();

  const row = result[0] as
    | { average: number; count: number }
    | undefined;

  if (!row) {
    return { average: 0, count: 0 };
  }

  return {
    average: Math.round(row.average * 10) / 10,
    count: row.count,
  };
};

export const findReviewUserNames = async (
  userIds: string[],
): Promise<Map<string, { name: string; avatar: string | null }>> => {
  const users = await User.find({
    _id: { $in: userIds },
  })
    .select("name avatar")
    .exec();

  const map = new Map<
    string,
    { name: string; avatar: string | null }
  >();

  for (const user of users) {
    map.set(user._id.toString(), {
      name: user.name,
      avatar: user.avatar ?? null,
    });
  }

  return map;
};
