import api from './api'
import type { ApiResponse, PaginatedResponse, Coupon } from '@/types/api'

export const couponService = {
  list: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<Coupon>>>('/coupons', { params }).then(r => r.data.data),

  getById: (id: string) =>
    api.get<ApiResponse<Coupon>>(`/coupons/${id}`).then(r => r.data.data),

  create: (data: {
    code: string
    description?: string
    discountType: 'PERCENTAGE' | 'FIXED'
    discountValue: number
    minOrderAmount?: number
    maxDiscountAmount?: number
    totalUsageLimit: number
    perUserLimit: number
    productId?: string
    categoryId?: string
    startDate: string
    endDate: string
  }) => api.post<ApiResponse<Coupon>>('/coupons', data).then(r => r.data),

  update: (id: string, data: Partial<Coupon>) =>
    api.patch<ApiResponse<Coupon>>(`/coupons/${id}`, data).then(r => r.data),

  deactivate: (id: string) =>
    api.delete<ApiResponse<null>>(`/coupons/${id}`).then(r => r.data),
}
