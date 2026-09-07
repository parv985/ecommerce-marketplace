import api from './api'
import type { ApiResponse, PaginatedResponse, InventoryTransaction } from '@/types/api'

export const inventoryService = {
  list: (params?: { page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<InventoryTransaction>>>('/inventory', { params }).then(r => r.data.data),

  listByProduct: (productId: string, params?: { page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<InventoryTransaction>>>(`/inventory/product/${productId}`, { params }).then(r => r.data.data),

  adjustStock: (productId: string, data: { quantity: number; reason: string }) =>
    api.post<ApiResponse<null>>(`/inventory/product/${productId}/adjust`, data).then(r => r.data),
}
