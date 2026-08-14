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
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
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
