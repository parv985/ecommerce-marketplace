import { Types, type PipelineStage } from "mongoose";

import { Order } from "../../models/Order.js";
import { Product } from "../../models/Product.js";
import { ReturnRequest } from "../../models/ReturnRequest.js";
import { Coupon } from "../../models/Coupon.js";
import { Discount } from "../../models/Discount.js";
import { ProductStatus } from "../../constants/productStatus.js";
import { PaymentStatus } from "../../constants/orderStatus.js";
import { ReturnStatus } from "../../constants/returnStatus.js";

const sellerMatch = (
  sellerId: string,
): Record<string, unknown> => ({
  sellerId: new Types.ObjectId(sellerId),
});

const dateMatch = (
  from?: Date,
  to?: Date,
): Record<string, unknown> => {
  const range: Record<string, Date> = {};

  if (from) {
    range.$gte = from;
  }

  if (to) {
    range.$lte = to;
  }

  return Object.keys(range).length > 0
    ? { createdAt: range }
    : {};
};

/*
 * Revenue is counted only for orders whose payment was actually
 * received (PAID). Under the COD flow payment is marked received only
 * after delivery, so cancelled orders can never contribute revenue.
 */
const PAID_REVENUE = {
  $cond: [
    { $eq: ["$paymentStatus", PaymentStatus.PAID] },
    "$total",
    0,
  ],
};

export const aggregateDashboard = async (
  sellerId: string,
): Promise<Record<string, number> | null> => {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [orders] = await Order.aggregate([
    { $match: sellerMatch(sellerId) },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pending: {
          $sum: {
            $cond: [
              { $eq: ["$status", "PENDING"] },
              1,
              0,
            ],
          },
        },
        confirmed: {
          $sum: {
            $cond: [
              { $eq: ["$status", "CONFIRMED"] },
              1,
              0,
            ],
          },
        },
        shipped: {
          $sum: {
            $cond: [
              { $eq: ["$status", "SHIPPED"] },
              1,
              0,
            ],
          },
        },
        delivered: {
          $sum: {
            $cond: [
              { $eq: ["$status", "DELIVERED"] },
              1,
              0,
            ],
          },
        },
        cancelled: {
          $sum: {
            $cond: [
              { $eq: ["$status", "CANCELLED"] },
              1,
              0,
            ],
          },
        },
        totalRevenue: { $sum: PAID_REVENUE },
        currentMonthRevenue: {
          $sum: {
            $cond: [
              {
                $and: [
                  {
                    $eq: [
                      "$paymentStatus",
                      PaymentStatus.PAID,
                    ],
                  },
                  { $gte: ["$createdAt", startOfMonth] },
                ],
              },
              "$total",
              0,
            ],
          },
        },
      },
    },
  ]).exec();

  if (!orders) {
    return null;
  }

  const [totalProducts, activeProducts, lowStockProducts, pendingReturns, coupons, discounts] =
    await Promise.all([
      Product.countDocuments({ sellerId }).exec(),
      Product.countDocuments({
        sellerId,
        status: ProductStatus.ACTIVE,
      }).exec(),
      Product.countDocuments({
        sellerId,
        status: ProductStatus.ACTIVE,
        stock: { $lte: 5 },
      }).exec(),
      ReturnRequest.countDocuments({
        sellerId,
        status: ReturnStatus.PENDING,
      }).exec(),
      Coupon.countDocuments({ sellerId }).exec(),
      Discount.countDocuments({ sellerId }).exec(),
    ]);

  return {
    ...orders,
    totalProducts,
    activeProducts,
    lowStockProducts,
    pendingReturns,
    coupons,
    discounts,
  };
};

export const aggregateSalesSeries = async (
  sellerId: string,
  from: Date | undefined,
  to: Date | undefined,
  groupBy: "day" | "month",
): Promise<Array<Record<string, unknown>>> => {
  const format =
    groupBy === "day" ? "%Y-%m-%d" : "%Y-%m";

  return Order.aggregate([
    {
      $match: {
        ...sellerMatch(sellerId),
        ...dateMatch(from, to),
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format,
            date: "$createdAt",
          },
        },
        orders: { $sum: 1 },
        revenue: { $sum: PAID_REVENUE },
      },
    },
    { $sort: { _id: 1 } },
  ]).exec();
};

export const aggregateTopProducts = async (
  sellerId: string,
  limit: number,
): Promise<Array<Record<string, unknown>>> => {
  return Order.aggregate([
    { $match: sellerMatch(sellerId) },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.productId",
        name: { $first: "$items.name" },
        quantity: { $sum: "$items.quantity" },
        orders: { $sum: 1 },
        revenue: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$paymentStatus",
                  PaymentStatus.PAID,
                ],
              },
              {
                $subtract: [
                  "$items.subtotal",
                  "$items.discountAmount",
                ],
              },
              0,
            ],
          },
        },
      },
    },
    { $sort: { quantity: -1 } },
    { $limit: limit },
  ]).exec();
};

/*
 * Revenue per category uses item-level sales discounts; order-level
 * coupon discounts are not attributed per item (documented).
 */
export const aggregateCategoryPerformance = async (
  sellerId: string,
): Promise<Array<Record<string, unknown>>> => {
  return Order.aggregate([
    { $match: sellerMatch(sellerId) },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "products",
        localField: "items.productId",
        foreignField: "_id",
        as: "product",
      },
    },
    {
      $unwind: {
        path: "$product",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $group: {
        _id: "$product.category",
        quantity: { $sum: "$items.quantity" },
        revenue: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$paymentStatus",
                  PaymentStatus.PAID,
                ],
              },
              {
                $subtract: [
                  "$items.subtotal",
                  "$items.discountAmount",
                ],
              },
              0,
            ],
          },
        },
      },
    },
    { $match: { _id: { $ne: null } } },
    { $sort: { quantity: -1 } },
  ]).exec();
};

/*
 * Distinct customers of this seller: only users who have placed at
 * least one order with the seller appear here (never the whole user
 * collection). Supports search on name/email and pagination.
 */
export const aggregateCustomers = async (
  sellerId: string,
  search: string | undefined,
  page: number,
  limit: number,
): Promise<{
  items: Array<Record<string, unknown>>;
  total: number;
}> => {
  const escaped = search
    ? search.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      )
    : null;

  /*
   * The $project above flattens the user fields to top-level
   * name/email, so the search matches those flattened fields.
   */
  const searchMatch: PipelineStage.Match | null =
    escaped
      ? {
          $match: {
            $or: [
              {
                name: {
                  $regex: escaped,
                  $options: "i",
                },
              },
              {
                email: {
                  $regex: escaped,
                  $options: "i",
                },
              },
            ],
          },
        }
      : null;

  const pipeline: PipelineStage[] = [
    { $match: sellerMatch(sellerId) },
    {
      $group: {
        _id: "$userId",
        orderCount: { $sum: 1 },
        totalSpent: { $sum: PAID_REVENUE },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $project: {
        _id: 0,
        customerId: "$_id",
        name: "$user.name",
        email: "$user.email",
        orderCount: 1,
        totalSpent: 1,
      },
    },
  ];

  if (searchMatch) {
    pipeline.push(searchMatch);
  }

  pipeline.push({ $sort: { totalSpent: -1 } });
  pipeline.push({
    $facet: {
      items: [
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ],
      total: [{ $count: "count" }],
    },
  });

  const [result] = await Order.aggregate(
    pipeline,
  ).exec();

  const items = (result?.items ?? []) as Array<
    Record<string, unknown>
  >;
  const total = (result?.total?.[0]?.count ?? 0) as number;

  return { items, total };
};

export const aggregateRevenue = async (
  sellerId: string,
  from: Date | undefined,
  to: Date | undefined,
): Promise<Record<string, unknown> | null> => {
  const [result] = await Order.aggregate([
    {
      $match: {
        ...sellerMatch(sellerId),
        ...dateMatch(from, to),
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: PAID_REVENUE },
        totalOrders: { $sum: 1 },
        deliveredOrders: {
          $sum: {
            $cond: [
              { $eq: ["$status", "DELIVERED"] },
              1,
              0,
            ],
          },
        },
        cancelledOrders: {
          $sum: {
            $cond: [
              { $eq: ["$status", "CANCELLED"] },
              1,
              0,
            ],
          },
        },
      },
    },
  ]).exec();

  return result ?? null;
};
