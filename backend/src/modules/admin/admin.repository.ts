import mongoose from "mongoose";
import { User, type UserDocument } from "../../models/User.js";
import {
  Seller,
  type ISeller,
} from "../../models/Seller.js";
import {
  Product,
  type IProduct,
} from "../../models/Product.js";
import {
  Order,
  type IOrder,
} from "../../models/Order.js";
import {
  AuditLog,
  type IAuditLog,
} from "../../models/AuditLog.js";
import { Settlement } from "../../models/Settlement.js";
import { OrderStatus, PaymentStatus } from "../../constants/orderStatus.js";
import { SellerStatus } from "../../constants/sellerStatus.js";
import { ProductStatus } from "../../constants/productStatus.js";
import { SettlementStatus } from "../../constants/settlementStatus.js";
import { roundMoney } from "../discounts/discount.pricing.js";
import type {
  AdminDashboardResponse,
  AdminDashboardStats,
  AdminNeedsAttention,
  AdminOrderStatusOverview,
  AdminRecentOrder,
  AdminRevenueSummary,
  AdminSellerActivity,
  AdminTopProduct,
  AdminTopSeller,
  GrowthPoint,
  SalesOverviewPoint,
} from "./admin.types.js";

export const listUsers = async (
  filter: Record<string, unknown>,
  page: number,
  limit: number,
): Promise<{
  items: UserDocument[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    User.countDocuments(filter).exec(),
  ]);

  return { items, total };
};

export const findUserById = async (
  id: string,
): Promise<UserDocument | null> => {
  return User.findById(id).exec();
};

/*
 * Batched lookup used to decorate audit-log entries with the actor's
 * human-readable name/email. One query per page (at most `limit`
 * actors) instead of one per row.
 */
export const findUsersByIds = async (
  ids: string[],
): Promise<UserDocument[]> => {
  if (ids.length === 0) return [];

  return User.find({ _id: { $in: ids } })
    .select("name email")
    .exec();
};

export const updateUserById = async (
  id: string,
  data: Record<string, unknown>,
): Promise<UserDocument | null> => {
  return User.findByIdAndUpdate(
    id,
    {
      $set: data,
    },
    {
      new: true,
    },
  ).exec();
};

export const listSellers = async (
  filter: Record<string, unknown>,
  page: number,
  limit: number,
): Promise<{
  items: ISeller[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    Seller.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Seller.countDocuments(filter).exec(),
  ]);

  return { items, total };
};

export const findSellerById = async (
  id: string,
): Promise<ISeller | null> => {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return Seller.findOne({
    $or: [{ _id: id }, { userId: id }],
  }).exec();
};

export const updateSellerById = async (
  id: string,
  data: Record<string, unknown>,
): Promise<ISeller | null> => {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return Seller.findOneAndUpdate(
    {
      $or: [{ _id: id }, { userId: id }],
    },
    {
      $set: data,
    },
    {
      new: true,
    },
  ).exec();
};

export const listAllProducts = async (
  filter: Record<string, unknown>,
  page: number,
  limit: number,
): Promise<{
  items: IProduct[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Product.countDocuments(filter).exec(),
  ]);

  return { items, total };
};

export const findProductById = async (
  id: string,
): Promise<IProduct | null> => {
  return Product.findById(id).exec();
};

export const updateProductStatusById = async (
  id: string,
  status: string,
): Promise<IProduct | null> => {
  return Product.findByIdAndUpdate(
    id,
    {
      $set: { status },
    },
    {
      new: true,
    },
  ).exec();
};

export const listAllOrders = async (
  filter: Record<string, unknown>,
  page: number,
  limit: number,
): Promise<{
  items: IOrder[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Order.countDocuments(filter).exec(),
  ]);

  return { items, total };
};

/*
 * Audit log listing for the Super Admin console. The ledger is
 * append-only, so this is a pure read: filter + sort + paginate.
 * Sorted reads are backed by the { actorId: 1, createdAt: -1 } and
 * single-field indexes declared on the AuditLog model.
 */
export const listAuditLogs = async (
  filter: Record<string, unknown>,
  sort: Record<string, 1 | -1>,
  page: number,
  limit: number,
): Promise<{
  items: IAuditLog[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    AuditLog.countDocuments(filter).exec(),
  ]);

  return { items, total };
};

export const aggregateSuperAdminDashboard = async (
  selectedRange: string = "30d",
  commissionRate: number = 10,
): Promise<AdminDashboardResponse> => {
  const now = new Date();

  // Start of current month
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // 1 year ago for sales series
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);
  oneYearAgo.setHours(0, 0, 0, 0);

  // 6 months ago for user/seller growth
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
    totalUsers,
    newUsersThisMonth,
    totalSellers,
    activeSellers,
    pendingSellers,
    suspendedSellers,
    newSellersThisMonth,
    totalProducts,
    lowStockProducts,
    pendingProducts,
    [orderAgg],
    [settlementAgg],
    salesAgg,
    topProductsAgg,
    topSellersAgg,
    recentOrdersAgg,
    userGrowthAgg,
    sellerGrowthAgg,
  ] = await Promise.all([
    // 1. Total users
    User.countDocuments({}).exec(),
    // 2. New users this month
    User.countDocuments({ createdAt: { $gte: startOfMonth } }).exec(),
    // 3. Total sellers
    Seller.countDocuments({}).exec(),
    // 4. Active sellers
    Seller.countDocuments({ status: SellerStatus.APPROVED }).exec(),
    // 5. Pending sellers
    Seller.countDocuments({ status: SellerStatus.PENDING }).exec(),
    // 6. Suspended / Paused sellers
    Seller.countDocuments({
      status: { $in: [SellerStatus.SUSPENDED, SellerStatus.PAUSED] },
    }).exec(),
    // 7. New sellers this month
    Seller.countDocuments({ createdAt: { $gte: startOfMonth } }).exec(),
    // 8. Total products
    Product.countDocuments({}).exec(),
    // 9. Low stock products (active with stock <= 5)
    Product.countDocuments({
      status: ProductStatus.ACTIVE,
      stock: { $lte: 5 },
    }).exec(),
    // 10. Pending products
    Product.countDocuments({ status: ProductStatus.PENDING }).exec(),
    // 11. Order stats
    Order.aggregate([
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalGmv: {
            $sum: {
              $cond: [
                { $ne: ["$status", OrderStatus.CANCELLED] },
                "$total",
                0,
              ],
            },
          },
          paidRevenue: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", PaymentStatus.PAID] },
                "$total",
                0,
              ],
            },
          },
          pendingOrders: {
            $sum: {
              $cond: [{ $eq: ["$status", OrderStatus.PENDING] }, 1, 0],
            },
          },
          confirmedOrders: {
            $sum: {
              $cond: [{ $eq: ["$status", OrderStatus.CONFIRMED] }, 1, 0],
            },
          },
          shippedOrders: {
            $sum: {
              $cond: [{ $eq: ["$status", OrderStatus.SHIPPED] }, 1, 0],
            },
          },
          deliveredOrders: {
            $sum: {
              $cond: [{ $eq: ["$status", OrderStatus.DELIVERED] }, 1, 0],
            },
          },
          cancelledOrders: {
            $sum: {
              $cond: [{ $eq: ["$status", OrderStatus.CANCELLED] }, 1, 0],
            },
          },
          returnedOrders: {
            $sum: {
              $cond: [{ $eq: ["$status", OrderStatus.RETURNED] }, 1, 0],
            },
          },
        },
      },
    ]).exec(),
    // 12. Settlement stats
    Settlement.aggregate([
      {
        $group: {
          _id: null,
          totalSettlements: { $sum: 1 },
          pendingSettlementsCount: {
            $sum: {
              $cond: [
                { $eq: ["$status", SettlementStatus.PENDING] },
                1,
                0,
              ],
            },
          },
          pendingSettlementAmount: {
            $sum: {
              $cond: [
                { $eq: ["$status", SettlementStatus.PENDING] },
                "$totalPayable",
                0,
              ],
            },
          },
          paidSettlementAmount: {
            $sum: {
              $cond: [
                { $eq: ["$status", SettlementStatus.PAID] },
                "$totalPayable",
                0,
              ],
            },
          },
          paidCommission: {
            $sum: {
              $cond: [
                { $eq: ["$status", SettlementStatus.PAID] },
                "$totalCommission",
                0,
              ],
            },
          },
        },
      },
    ]).exec(),
    // 13. Sales series for the past 365 days
    Order.aggregate([
      {
        $match: {
          createdAt: { $gte: oneYearAgo },
          status: { $ne: OrderStatus.CANCELLED },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          orders: { $sum: 1 },
          sales: { $sum: "$total" },
        },
      },
    ]).exec(),
    // 14. Top products
    Order.aggregate([
      { $match: { status: { $ne: OrderStatus.CANCELLED } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          name: { $first: "$items.name" },
          sellerId: { $first: "$sellerId" },
          unitsSold: { $sum: "$items.quantity" },
          revenue: {
            $sum: {
              $subtract: [
                "$items.subtotal",
                "$items.discountAmount",
              ],
            },
          },
        },
      },
      { $sort: { unitsSold: -1 } },
      { $limit: 6 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "productDoc",
        },
      },
      {
        $lookup: {
          from: "sellers",
          localField: "sellerId",
          foreignField: "userId",
          as: "sellerDoc",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "sellerId",
          foreignField: "_id",
          as: "userDoc",
        },
      },
      {
        $project: {
          id: "$_id",
          name: {
            $ifNull: [
              { $arrayElemAt: ["$productDoc.name", 0] },
              "$name",
            ],
          },
          unitsSold: 1,
          revenue: 1,
          sellerName: {
            $ifNull: [
              { $arrayElemAt: ["$sellerDoc.businessName", 0] },
              { $arrayElemAt: ["$userDoc.name", 0] },
              "Marketplace Seller",
            ],
          },
          image: {
            $arrayElemAt: [
              {
                $map: {
                  input: {
                    $ifNull: [
                      { $arrayElemAt: ["$productDoc.images", 0] },
                      [],
                    ],
                  },
                  as: "img",
                  in: "$$img.url",
                },
              },
              0,
            ],
          },
        },
      },
    ]).exec(),
    // 15. Top sellers
    Order.aggregate([
      { $match: { status: { $ne: OrderStatus.CANCELLED } } },
      {
        $group: {
          _id: "$sellerId",
          orders: { $sum: 1 },
          sales: { $sum: "$total" },
        },
      },
      { $sort: { sales: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "sellers",
          localField: "_id",
          foreignField: "userId",
          as: "sellerDoc",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userDoc",
        },
      },
      {
        $project: {
          sellerId: "$_id",
          sellerName: {
            $ifNull: [
              { $arrayElemAt: ["$sellerDoc.businessName", 0] },
              { $arrayElemAt: ["$userDoc.name", 0] },
              "Marketplace Seller",
            ],
          },
          status: {
            $ifNull: [
              { $arrayElemAt: ["$sellerDoc.status", 0] },
              "APPROVED",
            ],
          },
          orders: 1,
          sales: 1,
        },
      },
    ]).exec(),
    // 16. Recent orders
    Order.aggregate([
      { $sort: { createdAt: -1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "customerDoc",
        },
      },
      {
        $lookup: {
          from: "sellers",
          localField: "sellerId",
          foreignField: "userId",
          as: "sellerDoc",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "sellerId",
          foreignField: "_id",
          as: "sellerUserDoc",
        },
      },
      {
        $project: {
          id: "$_id",
          orderNumber: 1,
          customerName: {
            $ifNull: [
              { $arrayElemAt: ["$customerDoc.name", 0] },
              "Customer",
            ],
          },
          customerEmail: {
            $ifNull: [
              { $arrayElemAt: ["$customerDoc.email", 0] },
              "",
            ],
          },
          sellerName: {
            $ifNull: [
              { $arrayElemAt: ["$sellerDoc.businessName", 0] },
              { $arrayElemAt: ["$sellerUserDoc.name", 0] },
              "Seller",
            ],
          },
          amount: "$total",
          status: 1,
          createdAt: 1,
          itemCount: { $size: "$items" },
        },
      },
    ]).exec(),
    // 17. User growth
    User.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m",
              date: "$createdAt",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec(),
    // 18. Seller growth
    Seller.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m",
              date: "$createdAt",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec(),
  ]);

  const orderStats = orderAgg || {};
  const settlementStats = settlementAgg || {};

  const totalSales = roundMoney(orderStats.totalGmv || 0);
  const platformRevenue = roundMoney((totalSales * commissionRate) / 100);

  const stats: AdminDashboardStats = {
    totalUsers,
    totalSellers,
    totalProducts,
    totalOrders: orderStats.totalOrders || 0,
    totalSales,
    platformRevenue,
    pendingOrders: orderStats.pendingOrders || 0,
    pendingSettlements: settlementStats.pendingSettlementsCount || 0,
    cancelledOrders: orderStats.cancelledOrders || 0,
    lowStockProducts,
  };

  // Build continuous sales series for 7d, 30d, 3m, 1y
  const salesMap = new Map<string, { orders: number; sales: number }>();
  for (const item of salesAgg) {
    if (item._id) {
      salesMap.set(item._id, {
        orders: item.orders || 0,
        sales: item.sales || 0,
      });
    }
  }

  const buildDailySeries = (days: number): SalesOverviewPoint[] => {
    const list: SalesOverviewPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const dayData = salesMap.get(dateStr) || { orders: 0, sales: 0 };
      const daySales = roundMoney(dayData.sales);
      const dayCommission = roundMoney((daySales * commissionRate) / 100);
      list.push({
        date: dateStr,
        label,
        sales: daySales,
        commission: dayCommission,
        orders: dayData.orders,
      });
    }
    return list;
  };

  const series7d = buildDailySeries(7);
  const series30d = buildDailySeries(30);
  const series3m = buildDailySeries(90);

  const series1y: SalesOverviewPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });
    let mSales = 0;
    let mOrders = 0;
    for (const [dStr, val] of salesMap.entries()) {
      if (dStr.startsWith(yearMonth)) {
        mSales += val.sales;
        mOrders += val.orders;
      }
    }
    const monthSales = roundMoney(mSales);
    const monthCommission = roundMoney(
      (monthSales * commissionRate) / 100,
    );
    series1y.push({
      date: yearMonth,
      label,
      sales: monthSales,
      commission: monthCommission,
      orders: mOrders,
    });
  }

  const salesOverviewByRange: Record<string, SalesOverviewPoint[]> = {
    "7d": series7d,
    "30d": series30d,
    "3m": series3m,
    "1y": series1y,
  };

  const salesOverview =
    salesOverviewByRange[selectedRange] || series30d;

  const orderStatus: AdminOrderStatusOverview = {
    pending: orderStats.pendingOrders || 0,
    processing: orderStats.confirmedOrders || 0,
    confirmed: orderStats.confirmedOrders || 0,
    shipped: orderStats.shippedOrders || 0,
    delivered: orderStats.deliveredOrders || 0,
    cancelled: orderStats.cancelledOrders || 0,
    returned: orderStats.returnedOrders || 0,
    total: orderStats.totalOrders || 0,
  };

  const recentOrders: AdminRecentOrder[] = recentOrdersAgg.map(
    (o: any) => ({
      id: o._id ? o._id.toString() : o.id?.toString(),
      orderNumber: o.orderNumber,
      customerName: o.customerName || "Customer",
      customerEmail: o.customerEmail || "",
      sellerName: o.sellerName || "Seller",
      amount: roundMoney(o.amount || 0),
      status: o.status,
      createdAt: o.createdAt,
      itemCount: o.itemCount || 0,
    }),
  );

  const topProducts: AdminTopProduct[] = topProductsAgg.map(
    (p: any) => ({
      id: p._id ? p._id.toString() : p.id?.toString(),
      name: p.name || "Product",
      unitsSold: p.unitsSold || 0,
      revenue: roundMoney(p.revenue || 0),
      sellerName: p.sellerName || "Seller",
      image: p.image || undefined,
    }),
  );

  const topSellers: AdminTopSeller[] = topSellersAgg.map(
    (s: any) => {
      const sSales = roundMoney(s.sales || 0);
      return {
        sellerId: s.sellerId ? s.sellerId.toString() : s._id?.toString(),
        sellerName: s.sellerName || "Seller",
        orders: s.orders || 0,
        sales: sSales,
        commission: roundMoney((sSales * commissionRate) / 100),
        status: s.status || "APPROVED",
      };
    },
  );

  const needsAttention: AdminNeedsAttention = {
    lowStockProducts,
    pendingSellers,
    pendingOrders: orderStats.pendingOrders || 0,
    pendingSettlements: settlementStats.pendingSettlementsCount || 0,
    reportedProducts: pendingProducts,
  };

  // User growth trend
  const userGrowthMap = new Map<string, number>();
  for (const u of userGrowthAgg) {
    if (u._id) userGrowthMap.set(u._id, u.count || 0);
  }
  const userGrowth: GrowthPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const month = d.toLocaleDateString("en-US", { month: "short" });
    userGrowth.push({
      period,
      month,
      count: userGrowthMap.get(period) || 0,
    });
  }

  // Seller growth trend
  const sellerGrowthMap = new Map<string, number>();
  for (const s of sellerGrowthAgg) {
    if (s._id) sellerGrowthMap.set(s._id, s.count || 0);
  }
  const sellerGrowth: GrowthPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const month = d.toLocaleDateString("en-US", { month: "short" });
    sellerGrowth.push({
      period,
      month,
      count: sellerGrowthMap.get(period) || 0,
    });
  }

  const sellerActivity: AdminSellerActivity = {
    newSellersThisMonth,
    activeSellers,
    pendingApprovals: pendingSellers,
    suspendedSellers,
    growth: sellerGrowth,
  };

  const revenue: AdminRevenueSummary = {
    commissionRate,
    totalGmv: totalSales,
    commissionEarned: platformRevenue,
    pendingSettlement: roundMoney(
      settlementStats.pendingSettlementAmount || 0,
    ),
    pendingSettlementCount:
      settlementStats.pendingSettlementsCount || 0,
    paidSettlement: roundMoney(
      settlementStats.paidSettlementAmount || 0,
    ),
  };

  return {
    stats,
    salesOverview,
    salesOverviewByRange,
    orderStatus,
    recentOrders,
    topProducts,
    topSellers,
    needsAttention,
    sellerActivity,
    userGrowth,
    revenue,
  };
};
