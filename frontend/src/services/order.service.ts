import api from './api'
import type { ApiResponse, PaginatedResponse, Order, Invoice, CheckoutPreview } from '@/types/api'

export const orderService = {
  create: (data: { shippingAddressId: string; paymentMethod: 'COD' | 'ONLINE'; couponCode?: string }) =>
    api.post<ApiResponse<Order[]>>('/orders', data).then(r => r.data),

  /**
   * Validates the cart (and an optional coupon code) server-side and
   * returns the exact checkout totals — no order is placed. Coupon
   * errors surface here before the buyer submits the order.
   */
  preview: (data?: { couponCode?: string }) =>
    api.post<ApiResponse<CheckoutPreview>>('/orders/preview', data ?? {}).then(r => r.data.data),

  list: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<Order>>>('/orders', { params }).then(r => r.data.data),

  getById: (id: string) =>
    api.get<ApiResponse<Order>>(`/orders/${id}`).then(r => r.data.data),

  updateStatus: (id: string, status: string) =>
    api.patch<ApiResponse<Order>>(`/orders/${id}/status`, { status }).then(r => r.data),

  cancel: (id: string) =>
    api.post<ApiResponse<Order>>(`/orders/${id}/cancel`).then(r => r.data),

  markPaid: (id: string) =>
    api.post<ApiResponse<Order>>(`/orders/${id}/pay`).then(r => r.data),

  getInvoice: (id: string) =>
    api.get<ApiResponse<Invoice>>(`/orders/${id}/invoice`).then(r => r.data.data),

  getTracking: (id: string) =>
    api.get<ApiResponse<{ orderNumber: string; status: string; timeline: { status: string; actorId: string; actorRole: string; reason?: string; createdAt: string }[]; createdAt: string; deliveredAt?: string }>>(`/orders/${id}/tracking`).then(r => r.data.data),
}
