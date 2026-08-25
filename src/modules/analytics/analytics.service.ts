import { ReturnRequest } from "../../models/ReturnRequest.js";
import { ReturnStatus } from "../../constants/returnStatus.js";
import { findCategoryNames } from "../products/product.repository.js";
import {
  aggregateCategoryPerformance,
  aggregateCustomers,
  aggregateDashboard,
  aggregateRevenue,
  aggregateSalesSeries,
  aggregateTopProducts,
} from "./analytics.repository.js";
import {
  customersQuerySchema,
  revenueQuerySchema,
  salesSeriesQuerySchema,
  topProductsQuerySchema,
  type CustomersQuery,
  type RevenueQuery,
  type SalesSeriesQuery,
  type TopProductsQuery,
} from "./analytics.schema.js";
import type {
  CategoryPerformance,
  CustomerSummary,
  DashboardResponse,
  PaginatedCustomers,
  RevenueResponse,
  SalesPoint,
  TopProduct,
} from "./analytics.types.js";

const round2 = (value: unknown): number =>
  Math.round(Number(value ?? 0) * 100) / 100;

export const getSellerDashboard = async (
  sellerId: string,
): Promise<DashboardResponse> => {
  const aggregate = await aggregateDashboard(
    sellerId,
  );

  return {
    orders: {
      total: aggregate?.total ?? 0,
      pending: aggregate?.pending ?? 0,
      confirmed: aggregate?.confirmed ?? 0,
      shipped: aggregate?.shipped ?? 0,
      delivered: aggregate?.delivered ?? 0,
      cancelled: aggregate?.cancelled ?? 0,
    },
    revenue: {
      total: round2(aggregate?.totalRevenue),
      currentMonth: round2(
        aggregate?.currentMonthRevenue,
      ),
    },
    products: {
      total: aggregate?.totalProducts ?? 0,
      active: aggregate?.activeProducts ?? 0,
      lowStock: aggregate?.lowStockProducts ?? 0,
    },
    returns: {
      pending: aggregate?.pendingReturns ?? 0,
    },
    marketing: {
      coupons: aggregate?.coupons ?? 0,
      discounts: aggregate?.discounts ?? 0,
    },
  };
};

export const getSalesSeries = async (
  sellerId: string,
  query: unknown,
): Promise<SalesPoint[]> => {
  const parsed: SalesSeriesQuery =
    salesSeriesQuerySchema.parse(query);

  const rows = await aggregateSalesSeries(
    sellerId,
    parsed.from,
    parsed.to,
    parsed.groupBy,
  );

  return rows.map((row) => ({
    period: row._id as string,
    orders: Number(row.orders ?? 0),
    revenue: round2(row.revenue),
  }));
};

export const getTopProducts = async (
  sellerId: string,
  query: unknown,
): Promise<TopProduct[]> => {
  const parsed: TopProductsQuery =
    topProductsQuerySchema.parse(query);

  const rows = await aggregateTopProducts(
    sellerId,
    parsed.limit,
  );

  return rows.map((row) => ({
    productId: row._id?.toString() ?? "",
    name: (row.name as string) ?? "",
    quantity: Number(row.quantity ?? 0),
    revenue: round2(row.revenue),
    orders: Number(row.orders ?? 0),
  }));
};

export const getCategoryPerformance = async (
  sellerId: string,
): Promise<CategoryPerformance[]> => {
  const rows = await aggregateCategoryPerformance(
    sellerId,
  );

  const categoryIds = rows
    .map((row) => row._id?.toString())
    .filter((id): id is string => Boolean(id));

  const names = await findCategoryNames(categoryIds);

  return rows.map((row) => {
    const id = row._id?.toString() ?? "";

    return {
      categoryId: id,
      categoryName: names.get(id) ?? null,
      quantity: Number(row.quantity ?? 0),
      revenue: round2(row.revenue),
    };
  });
};

export const getSellerCustomers = async (
  sellerId: string,
  query: unknown,
): Promise<PaginatedCustomers> => {
  const parsed: CustomersQuery =
    customersQuerySchema.parse(query);

  const { items, total } = await aggregateCustomers(
    sellerId,
    parsed.search,
    parsed.page,
    parsed.limit,
  );

  return {
    items: items.map(
      (item): CustomerSummary => ({
        customerId:
          (item.customerId as { toString(): string })
            ?.toString() ?? "",
        name: (item.name as string) ?? "",
        email: (item.email as string) ?? "",
        orderCount: Number(item.orderCount ?? 0),
        totalSpent: round2(item.totalSpent),
      }),
    ),
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) || 0,
  };
};

export const getSellerRevenue = async (
  sellerId: string,
  query: unknown,
): Promise<RevenueResponse> => {
  const parsed: RevenueQuery =
    revenueQuerySchema.parse(query);

  const [aggregate, series] = await Promise.all([
    aggregateRevenue(
      sellerId,
      parsed.from,
      parsed.to,
    ),
    aggregateSalesSeries(
      sellerId,
      parsed.from,
      parsed.to,
      parsed.groupBy,
    ),
  ]);

  const dateFilter: Record<string, Date> = {};

  if (parsed.from) {
    dateFilter.$gte = parsed.from;
  }

  if (parsed.to) {
    dateFilter.$lte = parsed.to;
  }

  const returnedOrders = await ReturnRequest.countDocuments(
    {
      sellerId,
      status: ReturnStatus.COMPLETED,
      ...(Object.keys(dateFilter).length > 0 && {
        createdAt: dateFilter,
      }),
    },
  ).exec();

  return {
    totalRevenue: round2(aggregate?.totalRevenue),
    totalOrders: Number(
      aggregate?.totalOrders ?? 0,
    ),
    deliveredOrders: Number(
      aggregate?.deliveredOrders ?? 0,
    ),
    cancelledOrders: Number(
      aggregate?.cancelledOrders ?? 0,
    ),
    returnedOrders,
    series: series.map((row) => ({
      period: row._id as string,
      orders: Number(row.orders ?? 0),
      revenue: round2(row.revenue),
    })),
  };
};
