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
export interface UserProfile extends UserSummary {
  phone?: string
  avatar?: string
  isActive: boolean
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

// Seller
export interface SellerProfile {
  id: string
  userId?: string
  user: UserSummary | string
  businessName: string
  gstin: string
  pan: string
  phone?: string
  bankAccountHolderName?: string
  bankAccountNumber?: string
  ifscCode?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  pincode?: string
  documents?: SellerDocument[]
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'SUSPENDED'
  statusReason?: string | null
  rejectionReason?: string
  createdAt: string
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
}

// Categories
export interface Category {
  id: string
  name: string
  slug?: string
  description?: string
  isActive: boolean
  parentCategory?: string
  createdAt: string
}

// Cart
export interface CartItem {
  productId: string
  quantity: number
  product: Product | null
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

export interface OrderItem {
  product: Product | string
  name: string
  price: number
  quantity: number
  image?: string
}

export interface Order {
  _id: string
  orderNumber: string
  buyer: UserSummary | string
  seller: SellerProfile | string
  items: OrderItem[]
  shippingAddress: Address
  subtotal: number
  discountAmount: number
  couponDiscount: number
  taxAmount: number
  total: number
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  status: OrderStatus
  notes?: string
  tracking: OrderTrackingEntry[]
  createdAt: string
  deliveredAt?: string
  paidAt?: string
}

export interface OrderTrackingEntry {
  status: OrderStatus
  actorId: string
  actorRole: string
  reason?: string
  createdAt: string
}

export interface Invoice {
  invoiceNumber: string
  orderNumber: string
  orderDate: string
  buyer: { name: string; email: string; address?: Address }
  seller: { businessName: string; gstin: string }
  items: { name: string; quantity: number; price: number }[]
  itemsTotal: number
  discountTotal: number
  taxAmount: number
  total: number
}

// Payments
export interface Payment {
  _id: string
  order: string
  gatewayOrderId: string
  gatewayPaymentId?: string
  amount: number
  currency: string
  status: 'PENDING' | 'CAPTURED' | 'FAILED' | 'REFUNDED'
  paymentMethod: PaymentMethod
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
  _id: string
  seller: string
  code: string
  description?: string
  discountType: 'PERCENTAGE' | 'FIXED'
  discountValue: number
  minOrderAmount: number
  maxDiscountAmount?: number
  totalUsageLimit: number
  perUserLimit: number
  usedCount: number
  productId?: string
  categoryId?: string
  startDate: string
  endDate: string
  isActive: boolean
}

// Reviews
export interface Review {
  _id: string
  user: UserSummary | string
  product: string
  rating: number
  comment?: string
  createdAt: string
  updatedAt: string
}

export interface ProductReviews {
  reviews: Review[]
  averageRating: number
  totalReviews: number
  page: number
  totalPages: number
}

// Returns
export type ReturnStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED'

export interface ReturnRequest {
  _id: string
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
  _id: string
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
export interface DashboardData {
  totalOrders: number
  pendingOrders: number
  confirmedOrders: number
  shippedOrders: number
  deliveredOrders: number
  cancelledOrders: number
  totalRevenue: number
  activeProducts: number
  lowStockProducts: number
  pendingReturns: number
}

export interface SalesPoint {
  date: string
  orders: number
  revenue: number
}

export interface TopProduct {
  product: Product | string
  totalSold: number
  orderCount: number
  revenue: number
}

export interface CategoryPerformance {
  category: Category | string
  totalSold: number
  revenue: number
}

export interface CustomerInfo {
  customer: UserSummary
  orderCount: number
  totalSpent: number
  lastOrderDate?: string
}

export interface RevenueData {
  totalRevenue: number
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

export interface Settlement {
  id: string
  sellerId: string
  periodKey: string
  periodStart: string
  periodEnd: string
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | 'CANCELLED'
  orders: { orderId: string; orderNumber: string; total: number; commissionRate: number; commissionAmount: number; sellerPayable: number }[]
  totalSales: number
  totalCommission: number
  totalPayable: number
  commissionRate: number
  paidAt: string | null
  reminderSentAt: string | null
  createdAt: string
}

// Inventory
export interface InventoryTransaction {
  _id: string
  product: Product | string
  type: string
  quantity: number
  reason: string
  orderId?: string
  createdAt: string
}
