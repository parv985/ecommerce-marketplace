export interface DashboardResponse {
  orders: {
    total: number;
    pending: number;
    confirmed: number;
    shipped: number;
    delivered: number;
    cancelled: number;
  };
  revenue: {
    total: number;
    currentMonth: number;
  };
  products: {
    total: number;
    active: number;
    lowStock: number;
  };
  returns: {
    pending: number;
  };
  marketing: {
    coupons: number;
    discounts: number;
  };
}

export interface SalesPoint {
  period: string;
  orders: number;
  revenue: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
  orders: number;
}

export interface CategoryPerformance {
  categoryId: string;
  categoryName: string | null;
  quantity: number;
  revenue: number;
}

export interface CustomerSummary {
  customerId: string;
  name: string;
  email: string;
  orderCount: number;
  totalSpent: number;
}

export interface RevenueResponse {
  totalRevenue: number;
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  returnedOrders: number;
  series: SalesPoint[];
}

export interface PaginatedCustomers {
  items: CustomerSummary[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
