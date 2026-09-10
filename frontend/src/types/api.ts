export interface ApiResponse<T = unknown> {
  success: boolean
  message: string
  data: T
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// Auth
export interface UserSummary {
  id: string
  name: string
  email: string
  role: 'BUYER' | 'SELLER' | 'SUPER_ADMIN'
  avatar?: string
  /** Avatar URL (Cloudinary) as returned by GET /users/me — null when no avatar is set. */
  avatarUrl?: string | null
  /**
   * Account status as returned by the backend (login response and
   * GET /users/me). False when a Super Admin deactivated the account.
   * Undefined only for sessions stored before this field existed.
   */
  isActive?: boolean
}

export interface LoginResponse {
  accessToken: string
  user: UserSummary
  twoFactorRequired?: boolean
  loginToken?: string
}

export interface TwoFactorSetupResponse {
  secret: string
  otpauthUrl: string
  recoveryCodes: string[]
}

// User
// Mirrors the backend `UserProfileResponse` (src/modules/users/user.types.ts).
export interface UserProfile extends UserSummary {
  avatarUrl: string | null
  isEmailVerified: boolean
  createdAt: string
}

export interface Address {
  id: string
  label: string
  recipientName: string
  phone: string
  addressLine1: string
  addressLine2?: string | null
  city: string
  state: string
  pincode: string
  createdAt?: string
}

// Mirrors the backend `createAddressSchema` (strict): the fields accepted
// when creating an address. `id`/`createdAt` are server-assigned.
export type CreateAddressInput = Omit<Address, 'id' | 'createdAt'>

// Seller
// Mirrors the backend `SellerProfileResponse` (src/modules/sellers/seller.types.ts):
// GET /sellers/me nests the address under `address` and reports the
// rejection/decision reason as `statusReason`.
export interface SellerProfile {
  id: string
  userId?: string
  user?: UserSummary | string
  businessName: string
  gstin: string
  pan: string
  phone?: string | null
  bankAccountHolderName?: string
  bankAccountNumber?: string
  ifscCode?: string
  /** Nested address as returned by GET /sellers/me. */
  address?: {
    addressLine1: string
    addressLine2?: string | null
    city: string
    state: string
    pincode: string
  }
  // Flat aliases kept for backward compatibility with older payloads.
  addressLine1?: string
  addressLine2?: string | null
  city?: string
  state?: string
  pincode?: string
  documents?: SellerDocument[]
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'SUSPENDED'
  statusReason?: string | null
  /** Legacy alias — the backend sends `statusReason`. */
  rejectionReason?: string | null
  createdAt: string
  updatedAt?: string
}

export interface SellerDocument {
  type: string
  url: string
  publicId: string
}

// Products
export interface ProductImage {
  url: string
  publicId: string
}

export interface ProductSpecification {
  key: string
  value: string
}

export interface Product {
  id: string
  name: string
  description: string | null
  price: number
  compareAtPrice?: number
  sku: string | null
  stock: number
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE'
  category: {
    id: string
    name: string | null
  } | null
  sellerId: string
  images: ProductImage[]
  specifications: ProductSpecification[]
  averageRating?: number
  totalReviews?: number
  createdAt: string
  updatedAt: string
  /**
   * Live sales discount created by the seller for this product or its
   * category (resolved server-side with checkout rules). Absent/null
   * when nothing is live. `discountedPrice` is the per-unit price a
   * buyer actually pays.
   */
  activeDiscount?: {
    id: string
    discountValue: number
    discountAmount: number
    discountedPrice: number
  } | null
}

// Categories
// Mirrors the backend `CategoryResponse` (src/modules/categories/category.types.ts)
export interface Category {
  id: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// Mirrors `createCategorySchema` (strict: no other keys are accepted)
export interface CreateCategoryInput {
  name: string
  description?: string
}

// Mirrors `updateCategorySchema` (strict). `description: null` clears the field,
// `isActive: true` re-activates a deactivated category.
export interface UpdateCategoryInput {
  name?: string
  description?: string | null
  isActive?: boolean
}

// Cart
// Mirrors the backend `CartProductSummary` (src/modules/cart/cart.types.ts):
// live product snapshot resolved for each cart line.
export interface CartProductSummary {
  id: string
  sellerId: string
  name: string
  price: number
  stock: number
  images: ProductImage[]
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE'
}

export interface CartItem {
  productId: string
  quantity: number
  product: CartProductSummary | null
  subtotal: number
}

export interface Cart {
  id: string
  items: CartItem[]
  totalItems: number
  totalQuantity: number
  totalPrice: number
}

// Orders
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'
export type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED'
export type PaymentMethod = 'COD' | 'ONLINE';

// Mirrors the backend `OrderItemResponse` (src/modules/orders/order.types.ts):
// `subtotal` = price * quantity, `discountAmount` = sale discount for the line.
export interface OrderItem {
  productId: string
  name: string
  price: number
  quantity: number
  subtotal: number
  discountAmount: number
  image?: string
}

// Mirrors the backend `OrderAddressResponse` (address snapshot stored on the order).
export interface OrderShippingAddress {
  recipientName: string
  phone: string
  addressLine1: string
  addressLine2: string | null
  city: string
  state: string
  pincode: string
}

// Mirrors the backend `OrderResponse` (src/modules/orders/order.types.ts).
// Note: there is no order-level `subtotal`/`discountAmount`/`taxAmount` in the
// API — the fields are `itemsTotal`, `discountTotal`, `couponDiscount`, `total`.
export interface Order {
  id: string
  orderNumber: string
  userId: string
  sellerId: string
  sellerBusinessName: string | null
  items: OrderItem[]
  shippingAddress: OrderShippingAddress
  itemsTotal: number
  discountTotal: number
  couponId: string | null
  couponCode: string | null
  couponDiscount: number
  total: number
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  paymentId: string | null
  status: OrderStatus
  createdAt: string
  updatedAt: string
}

// Checkout preview (POST /orders/preview) — mirrors the backend
// `CheckoutPreviewResponse`. No side effects; used by the checkout page to
// display server-computed sales discounts and coupon discounts before an
// order is placed.
export interface CheckoutPreviewOrder {
  sellerId: string
  itemsTotal: number
  discountTotal: number
  couponDiscount: number
  total: number
}

export interface CheckoutPreview {
  itemsTotal: number
  discountTotal: number
  couponCode: string | null
  couponDiscount: number
  total: number
  orders: CheckoutPreviewOrder[]
}

// Mirrors the backend `AdminOrderResponse` (src/modules/admin/admin.types.ts).
export interface AdminOrder {
  id: string
  orderNumber: string
  userId: string
  sellerId: string
  itemCount: number
  total: number
  paymentStatus: PaymentStatus
  status: OrderStatus
  createdAt: string
}

export interface OrderTrackingEntry {
  status: OrderStatus
  actorId: string
  actorRole: string
  reason?: string
  createdAt: string
}

// Mirrors the backend `InvoiceData` (src/modules/orders/order.service.ts).
// The invoice adds display-only GST (`taxRate`, `taxAmount`) on top of the
// stored order amounts; `total` already includes the tax.
export interface Invoice {
  invoiceNumber: string
  orderNumber: string
  orderId: string
  orderDate: string
  buyer: { name: string; email: string }
  seller: {
    businessName: string
    gstin: string
    pan: string
    address: {
      addressLine1: string
      addressLine2: string | null
      city: string
      state: string
      pincode: string
    }
  }
  items: OrderItem[]
  shippingAddress: OrderShippingAddress
  itemsTotal: number
  discountTotal: number
  couponDiscount: number
  taxRate: number
  taxAmount: number
  total: number
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  status: OrderStatus
  deliveredAt: string | null
  createdAt: string
}

// Payments
export interface Payment {
  id: string
  orderId: string
  gatewayOrderId: string
  gatewayPaymentId?: string
  amount: number
  currency: string
  status: 'PENDING' | 'CAPTURED' | 'FAILED' | 'REFUNDED'
  paymentMethod: PaymentMethod
  keyId: string | null
}

// Discounts
export interface Discount {
  id: string
  sellerId: string
  discountType: 'PERCENTAGE' | 'FIXED'
  discountValue: number
  productId?: string | null
  categoryId?: string | null
  startAt: string
  endAt: string
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: string
}

// Coupons
export interface Coupon {
  id: string
  sellerId: string
  code: string
  type: 'PERCENTAGE' | 'FIXED'
  value: number
  minOrderValue: number
  maxDiscount?: number | null
  productIds: string[]
  categoryIds: string[]
  startAt: string
  endAt: string
  usageLimit?: number | null
  perUserLimit?: number | null
  usageCount: number
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: string
  updatedAt: string
}

// Reviews
// Mirrors the backend `ReviewResponse` (src/modules/reviews/review.types.ts)
export interface Review {
  id: string
  userId: string
  userName: string
  userAvatar?: string | null
  productId: string
  rating: number
  comment?: string | null
  createdAt: string
  updatedAt: string
  /** Legacy aliases for backwards compatibility */
  user?: UserSummary | string
  product?: string
}

export interface ProductReviews {
  productId: string
  averageRating: number
  reviewCount: number
  items: Review[]
  page: number
  limit: number
  total: number
  totalPages: number
  /** Legacy aliases for backwards compatibility */
  reviews?: Review[]
  totalReviews?: number
}

// Returns
export type ReturnStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED'

export interface ReturnRequest {
  id: string
  order: Order | string
  buyer: UserSummary | string
  seller: SellerProfile | string
  reason: string
  status: ReturnStatus
  rejectionReason?: string
  createdAt: string
  updatedAt: string
}

// Notifications
export interface Notification {
  id: string
  title: string
  message: string
  type: string
  isRead: boolean
  createdAt: string
}

export interface NotificationPreferences {
  emailOrderUpdates: boolean
  emailPaymentUpdates: boolean
  emailPromotional: boolean
  inApp: boolean
}

// Analytics
// Mirrors the backend `DashboardResponse` (src/modules/analytics/analytics.types.ts)
// returned by GET /sellers/dashboard. The API nests counts under `orders`,
// `revenue`, `products`, `returns` and `marketing` — NOT flat fields.
export interface DashboardData {
  orders: {
    total: number
    pending: number
    confirmed: number
    shipped: number
    delivered: number
    cancelled: number
  }
  revenue: {
    total: number
    currentMonth: number
  }
  products: {
    total: number
    active: number
    lowStock: number
  }
  returns: {
    pending: number
  }
  marketing: {
    coupons: number
    discounts: number
  }
}

// Mirrors the backend `SalesPoint` (src/modules/analytics/analytics.types.ts)
// returned by GET /sellers/analytics/sales. The bucket key is `period`
// (`YYYY-MM-DD` for groupBy=day, `YYYY-MM` for groupBy=month).
export interface SalesPoint {
  period: string
  orders: number
  revenue: number
}

// Mirrors the backend `TopProduct` (src/modules/analytics/analytics.types.ts)
// returned by GET /sellers/analytics/top-products. `name` is the product name
// snapshot stored on the order items; `quantity` is units sold.
export interface TopProduct {
  productId: string
  name: string
  quantity: number
  revenue: number
  orders: number
}

// Mirrors the backend `CategoryPerformance` (src/modules/analytics/analytics.types.ts)
// returned by GET /sellers/analytics/categories. `categoryName` is null when the
// category was deleted after the order was placed.
export interface CategoryPerformance {
  categoryId: string
  categoryName: string | null
  quantity: number
  revenue: number
}

// Mirrors the backend `CustomerSummary` (src/modules/analytics/analytics.types.ts)
// returned by GET /sellers/customers. Distinct buyers who ordered from this
// seller; `totalSpent` counts PAID orders only.
export interface CustomerInfo {
  customerId: string
  name: string
  email: string
  orderCount: number
  totalSpent: number
}

// Mirrors the backend `RevenueResponse` (src/modules/analytics/analytics.types.ts)
// returned by GET /sellers/revenue.
export interface RevenueData {
  totalRevenue: number
  totalOrders: number
  deliveredOrders: number
  cancelledOrders: number
  returnedOrders: number
  series: SalesPoint[]
}

// Admin
export interface AdminUser extends UserSummary {
  isActive: boolean
  createdAt: string
}

// Mirrors the backend `AdminAuditLogResponse` (src/modules/admin/admin.types.ts)
// returned by GET /admin/audit-logs. `before`/`after`/`metadata` are free-form
// JSON whose shape depends on the action that wrote the entry.
export interface AuditLog {
  id: string
  actorId: string
  actorRole: string
  action: string
  entityType: string
  entityId: string | null
  before: unknown
  after: unknown
  metadata: unknown
  createdAt: string
}

// Query parameters accepted by GET /admin/audit-logs
// (src/modules/admin/admin.schema.ts — listAuditLogsQuerySchema).
export type AuditLogSortField = 'createdAt' | 'action' | 'entityType' | 'actorRole' | 'actorId'

export interface AuditLogQuery {
  actorId?: string
  actorRole?: string
  action?: string
  entityType?: string
  entityId?: string
  /** Inclusive lower bound on createdAt (YYYY-MM-DD or ISO timestamp). */
  fromDate?: string
  /** Inclusive upper bound on createdAt (a bare date covers the whole UTC day). */
  toDate?: string
  sortBy?: AuditLogSortField
  sortOrder?: 'asc' | 'desc'
  page?: number
  limit?: number
}

// Mirrors the backend `SettlementResponse` / `SettlementOrderResponse`
// (src/modules/settlements/settlement.types.ts) returned by
// GET /sellers/settlement, GET /admin/settlements and GET /admin/settlements/:id.
export type SettlementStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | 'CANCELLED'

export interface SettlementOrder {
  orderId: string
  orderNumber: string
  total: number
  commissionRate: number
  commissionAmount: number
  sellerPayable: number
  deliveredAt: string
}

export interface Settlement {
  id: string
  sellerId: string
  periodKey: string
  periodStart: string
  periodEnd: string
  status: SettlementStatus
  orders: SettlementOrder[]
  totalSales: number
  totalCommission: number
  totalPayable: number
  commissionRate: number
  paidAt: string | null
  reminderSentAt: string | null
  createdAt: string
  updatedAt: string
}

// Inventory
// Mirrors the backend `IInventoryTransaction` document (src/models/InventoryTransaction.ts)
// as returned by GET /inventory and GET /inventory/product/:productId. The API does not
// populate the product, so each record carries a `productId` reference that the frontend
// resolves to a product name via the seller's own products (GET /products/my).
export interface InventoryTransaction {
  id: string
  productId: string
  type: string
  quantity: number
  previousStock: number
  newStock: number
  reason: string
  referenceId?: string | null
  referenceType?: string | null
  createdAt: string
}
