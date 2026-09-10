import api from './api'
import type { ApiResponse, ProductReviews, Review } from '@/types/api'

export const reviewService = {
  getProductReviews: (productId: string, page?: number, limit?: number) =>
    api
      .get<ApiResponse<ProductReviews>>(`/reviews/product/${productId}`, {
        params: { page, limit },
      })
      .then((r) => r.data.data),

  create: (data: { productId: string; rating: number; comment?: string }) =>
    api.post<ApiResponse<Review>>('/reviews', data).then((r) => r.data),

  update: (id: string, data: { rating?: number; comment?: string | null }) =>
    api.patch<ApiResponse<Review>>(`/reviews/${id}`, data).then((r) => r.data),

  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/reviews/${id}`).then((r) => r.data),
}
