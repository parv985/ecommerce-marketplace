import api from './api'
import type { ApiResponse, Payment } from '@/types/api'

export const paymentService = {
  initiate: (orderId: string) =>
    api.post<ApiResponse<Payment>>(`/payments/orders/${orderId}/initiate`).then(r => r.data),

  verify: (orderId: string, data: { paymentId: string; signature: string }) =>
    api.post<ApiResponse<Payment>>(`/payments/orders/${orderId}/verify`, data).then(r => r.data),

  refund: (orderId: string) =>
    api.post<ApiResponse<Payment>>(`/payments/orders/${orderId}/refund`).then(r => r.data),
}
