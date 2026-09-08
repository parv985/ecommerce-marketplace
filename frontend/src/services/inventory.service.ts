import api from './api'
import type { ApiResponse, PaginatedResponse, InventoryTransaction } from '@/types/api'

/**
 * Raw shape of an inventory transaction as stored by the backend
 * (src/modules/inventory — mirrors the IInventoryTransaction document).
 * The list endpoints return plain documents (e.g. `_id`, `productId`,
 * `previousStock`, `newStock`) rather than the camel-cased/populated shape
 * the UI table consumes, so we normalize here.
 */
export interface RawInventoryTransaction {
  _id: string
  productId: string
  type: string
  quantity: number
  previousStock: number
  newStock: number
  reason: string
  referenceId?: string | null
  referenceType?: string | null
  createdAt: string
}

const normalizeTransaction = (t: RawInventoryTransaction): InventoryTransaction => ({
  id: t._id,
  productId: t.productId,
  type: t.type,
  quantity: t.quantity,
  previousStock: t.previousStock,
  newStock: t.newStock,
  reason: t.reason,
  referenceId: t.referenceId ?? null,
  referenceType: t.referenceType ?? null,
  createdAt: t.createdAt,
})

const toPaginated = (
  data: { items?: RawInventoryTransaction[]; total?: number } | undefined,
  page: number,
  limit: number,
): PaginatedResponse<InventoryTransaction> => {
  const items = data?.items ?? []
  const total = data?.total ?? 0
  return {
    items: items.map(normalizeTransaction),
    total,
    page,
    limit,
    totalPages: total > 0 ? Math.ceil(total / limit) : 0,
  }
}

export const inventoryService = {
  list: async (params?: { page?: number; limit?: number }) => {
    const page = params?.page ?? 1
    const limit = params?.limit ?? 20
    const res = await api.get<ApiResponse<{ items?: RawInventoryTransaction[]; total?: number }>>(
      '/inventory', { params: { ...params, page, limit } },
    )
    return toPaginated(res.data.data, page, limit)
  },

  listByProduct: async (productId: string, params?: { page?: number; limit?: number }) => {
    const page = params?.page ?? 1
    const limit = params?.limit ?? 20
    const res = await api.get<ApiResponse<{ items?: RawInventoryTransaction[]; total?: number }>>(
      `/inventory/product/${productId}`, { params: { ...params, page, limit } },
    )
    return toPaginated(res.data.data, page, limit)
  },

  adjustStock: (productId: string, data: { quantity: number; reason: string }) =>
    api.post<ApiResponse<null>>(`/inventory/product/${productId}/adjust`, data).then(r => r.data),
}
