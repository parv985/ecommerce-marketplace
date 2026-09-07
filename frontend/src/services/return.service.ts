import api from './api'
import type { ApiResponse, PaginatedResponse, ReturnRequest } from '@/types/api'

export const returnService = {
  request: (data: { orderId: string; reason: string }) =>
    api.post<ApiResponse<ReturnRequest>>('/returns', data).then(r => r.data),

  list: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<ReturnRequest>>>('/returns', { params }).then(r => r.data.data),

  getById: (id: string) =>
    api.get<ApiResponse<ReturnRequest>>(`/returns/${id}`).then(r => r.data.data),

  updateStatus: (id: string, status: string, reason?: string) =>
    api.patch<ApiResponse<ReturnRequest>>(`/returns/${id}/status`, { status, reason }).then(r => r.data),

  cancel: (id: string) =>
    api.post<ApiResponse<ReturnRequest>>(`/returns/${id}/cancel`).then(r => r.data),
}
