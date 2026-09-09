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
 */
export interface AdminAuditLogResponse {
  id: string;
  actorId: string;
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
