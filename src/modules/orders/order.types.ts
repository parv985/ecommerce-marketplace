import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "../../constants/orderStatus.js";

export interface OrderItemResponse {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  discountAmount: number;
}

export interface OrderAddressResponse {
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
}

export interface OrderResponse {
  id: string;
  orderNumber: string;
  userId: string;
  sellerId: string;
  sellerBusinessName: string | null;
  items: OrderItemResponse[];
  shippingAddress: OrderAddressResponse;
  itemsTotal: number;
  discountTotal: number;
  couponId: string | null;
  couponCode: string | null;
  couponDiscount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentId: string | null;
  status: OrderStatus;
  /* When the order was delivered (anchor of the 7-day return window). */
  deliveredAt: Date | null;
  /* Set when a return was approved and the order became RETURNED. */
  returnedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedOrders {
  items: OrderResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/*
 * Mirrors the exact math `createOrderFromCart` performs when an order is
 * placed: one row per seller in the cart, sales discounts resolved from
 * live data, and (when supplied) a coupon applied to the seller order it
 * belongs to. No side effects - purely a checkout preview.
 */
export interface CheckoutPreviewOrder {
  sellerId: string;
  itemsTotal: number;
  discountTotal: number;
  couponDiscount: number;
  total: number;
}

export interface CheckoutPreviewResponse {
  itemsTotal: number;
  discountTotal: number;
  couponCode: string | null;
  couponDiscount: number;
  total: number;
  orders: CheckoutPreviewOrder[];
}
