import type { UserRole } from "../../constants/roles.js";
import type {
  OrderStatus,
  PaymentStatus,
} from "../../constants/orderStatus.js";
import type { SellerStatus } from "../../constants/sellerStatus.js";
import type { ProductStatus } from "../../constants/productStatus.js";

export interface AdminUserResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  authProvider: string;
  isEmailVerified: boolean;
  isActive: boolean;
  createdAt: Date;
}

export interface AdminSellerResponse {
  id: string;
  userId: string;
  businessName: string;
  phone: string | null;
  gstin: string;
  pan: string;
  status: SellerStatus;
  statusReason: string | null;
  createdAt: Date;
}

export interface AdminProductResponse {
  id: string;
  sellerId: string;
  sellerName?: string;
  name: string;
  price: number;
  stock: number;
  status: ProductStatus;
  createdAt: Date;
}

export interface AdminOrderResponse {
  id: string;
  orderNumber: string;
  userId: string;
  sellerId: string;
  itemCount: number;
  total: number;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  createdAt: Date;
}

/*
 * One entry of the audit ledger as exposed to the Super Admin
 * console. `before`/`after`/`metadata` stay as free-form JSON: what
 * they contain depends on the action that wrote the entry.
 *
 * `actorName`/`actorEmail` are a read-time decoration resolved from
 * the Users collection (null for system actors such as "system" or
 * "webhook", and for users deleted since the entry was written) so
 * the console can show a human-readable actor alongside the id.
 */
export interface AdminAuditLogResponse {
  id: string;
  actorId: string;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: Date;
}

export interface AdminListResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminDashboardStats {
  totalUsers: number;
  totalSellers: number;
  totalProducts: number;
  totalOrders: number;
  totalSales: number;
  platformRevenue: number;
  pendingOrders: number;
  pendingSettlements: number;
  cancelledOrders: number;
  lowStockProducts: number;
}

export interface SalesOverviewPoint {
  date: string;
  label: string;
  sales: number;
  commission: number;
  orders: number;
}

export interface AdminOrderStatusOverview {
  pending: number;
  processing: number;
  confirmed: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  returned: number;
  total: number;
}

export interface AdminRecentOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  sellerName: string;
  amount: number;
  status: OrderStatus;
  createdAt: Date;
  itemCount: number;
}

export interface AdminTopProduct {
  id: string;
  name: string;
  unitsSold: number;
  revenue: number;
  sellerName: string;
  image?: string;
}

export interface AdminTopSeller {
  sellerId: string;
  sellerName: string;
  orders: number;
  sales: number;
  commission: number;
  status: string;
}

export interface AdminNeedsAttention {
  lowStockProducts: number;
  pendingSellers: number;
  pendingOrders: number;
  pendingSettlements: number;
  reportedProducts: number;
}

export interface GrowthPoint {
  period: string;
  month: string;
  count: number;
}

export interface AdminSellerActivity {
  newSellersThisMonth: number;
  activeSellers: number;
  pendingApprovals: number;
  suspendedSellers: number;
  growth: GrowthPoint[];
}

export interface AdminRevenueSummary {
  commissionRate: number;
  totalGmv: number;
  commissionEarned: number;
  pendingSettlement: number;
  pendingSettlementCount: number;
  paidSettlement: number;
}

export interface AdminDashboardResponse {
  stats: AdminDashboardStats;
  salesOverview: SalesOverviewPoint[];
  salesOverviewByRange?: Record<string, SalesOverviewPoint[]>;
  orderStatus: AdminOrderStatusOverview;
  recentOrders: AdminRecentOrder[];
  topProducts: AdminTopProduct[];
  topSellers: AdminTopSeller[];
  needsAttention: AdminNeedsAttention;
  sellerActivity: AdminSellerActivity;
  userGrowth: GrowthPoint[];
  revenue: AdminRevenueSummary;
}
