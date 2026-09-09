import api from './api'
import type { ApiResponse, Product } from '@/types/api'

interface WishlistData {
  id: string
  items: { productId: string; addedAt: string; product: Product | null }[]
  totalItems: number
}

export const wishlistService = {
  get: () =>
    api.get<ApiResponse<WishlistData>>('/wishlist').then(r => r.data.data),

  addItem: (productId: string) =>
    api.post<ApiResponse<null>>('/wishlist/items', { productId }).then(r => r.data),

  removeItem: (productId: string) =>
    api.delete<ApiResponse<null>>(`/wishlist/items/${productId}`).then(r => r.data),

  checkItem: (productId: string) =>
    api.get<ApiResponse<{ inWishlist: boolean }>>(`/wishlist/items/${productId}`).then(r => r.data.data),

  clear: () =>
    api.delete<ApiResponse<null>>('/wishlist').then(r => r.data),
}
