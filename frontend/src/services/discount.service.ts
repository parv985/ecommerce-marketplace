import api from './api'
import type { ApiResponse, PaginatedResponse, Discount } from '@/types/api'

export const discountService = {
  list: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<Discount>>>('/discounts', { params }).then(r => r.data.data),

  getById: (id: string) =>
    api.get<ApiResponse<Discount>>(`/discounts/${id}`).then(r => r.data.data),

  create: (data: {
    discountType?: string
    discountValue: number
    productId?: string
    categoryId?: string
    startAt: string
    endAt: string
  }) => api.post<ApiResponse<Discount>>('/discounts', data).then(r => r.data),

  update: (id: string, data: Partial<Discount>) =>
    api.patch<ApiResponse<Discount>>(`/discounts/${id}`, data).then(r => r.data),

  deactivate: (id: string) =>
    api.delete<ApiResponse<null>>(`/discounts/${id}`).then(r => r.data),
}
