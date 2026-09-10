import api from './api'
import type {
  ApiResponse,
  PaginatedResponse,
  ReturnRequest,
  CreateReturnInput,
  UpdateReturnStatusInput,
  ReturnStatus,
} from '@/types/api'

export const returnService = {
  /**
   * Request a return for a DELIVERED order within the 7-day window.
   * Body: { orderId, reason } (reason 5–500 chars).
   */
  request: (data: CreateReturnInput) =>
    api.post<ApiResponse<ReturnRequest>>('/returns', data).then(r => r.data),

  /**
   * List return requests for the current user.
   * Buyers see their own; sellers see requests for their orders.
   */
  list: (params?: { status?: ReturnStatus | string; page?: number; limit?: number }) =>
    api
      .get<ApiResponse<PaginatedResponse<ReturnRequest>>>('/returns', { params })
      .then(r => r.data.data),

  getById: (id: string) =>
    api.get<ApiResponse<ReturnRequest>>(`/returns/${id}`).then(r => r.data.data),

  /**
   * Seller/admin only. Advances PENDING → APPROVED | REJECTED,
   * or APPROVED → COMPLETED. Rejection requires `reason`.
   */
  updateStatus: (id: string, data: UpdateReturnStatusInput) =>
    api
      .patch<ApiResponse<ReturnRequest>>(`/returns/${id}/status`, data)
      .then(r => r.data),

  /** Buyer only. Cancels own return while still PENDING. */
  cancel: (id: string) =>
    api.post<ApiResponse<ReturnRequest>>(`/returns/${id}/cancel`).then(r => r.data),
}
