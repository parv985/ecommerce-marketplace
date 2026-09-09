import api from './api'
import type { ApiResponse, Cart } from '@/types/api'

export const cartService = {
  get: () =>
    api.get<ApiResponse<Cart>>('/cart').then(r => r.data.data),

  addItem: (data: { productId: string; quantity: number }) =>
    api.post<ApiResponse<Cart>>('/cart/items', data).then(r => r.data),

  updateItem: (productId: string, quantity: number) =>
    api.patch<ApiResponse<Cart>>(`/cart/items/${productId}`, { quantity }).then(r => r.data),

  removeItem: (productId: string) =>
    api.delete<ApiResponse<Cart>>(`/cart/items/${productId}`).then(r => r.data),

  clear: () =>
    api.delete<ApiResponse<Cart>>('/cart').then(r => r.data.data),
}
