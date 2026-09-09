import api from './api'
import type {
  ApiResponse,
  PaginatedResponse,
  AdminUser,
  SellerProfile,
  Product,
  AdminOrder,
  Settlement,
  AuditLog,
  AuditLogQuery,
} from '@/types/api'

export const adminService = {
  // Users
  getUsers: (params?: { role?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<AdminUser>>>('/admin/users', { params }).then(r => r.data.data),

  updateUserStatus: (id: string, isActive: boolean) =>
    api.patch<ApiResponse<AdminUser>>(`/admin/users/${id}`, { isActive }).then(r => r.data),

  // Sellers
  getSellers: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<SellerProfile>>>('/admin/sellers', { params }).then(r => r.data.data),

  updateSellerStatus: (id: string, status: string, reason?: string) =>
    api.patch<ApiResponse<SellerProfile>>(`/admin/sellers/${id}/status`, { status, reason }).then(r => r.data),

  // Products
  getProducts: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<Product>>>('/admin/products', { params }).then(r => r.data.data),

  updateProductStatus: (id: string, status: string) =>
    api.patch<ApiResponse<Product>>(`/admin/products/${id}/status`, { status }).then(r => r.data),

  // Orders
  getOrders: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<AdminOrder>>>('/admin/orders', { params }).then(r => r.data.data),

  // Audit logs (SUPER_ADMIN only)
  // Empty values are dropped: the backend query schema is strict and rejects
  // empty strings, and every filter is optional.
  getAuditLogs: (params?: AuditLogQuery) => {
    const clean: Record<string, string | number> = {}
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') clean[key] = value
      })
    }
    return api
      .get<ApiResponse<PaginatedResponse<AuditLog>>>('/admin/audit-logs', { params: clean })
      .then(r => r.data.data)
  },

  // Settlements
  getSettlements: (params?: { status?: string; sellerId?: string; month?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<Settlement>>>('/admin/settlements', { params }).then(r => r.data.data),

  getSettlement: (id: string) =>
    api.get<ApiResponse<Settlement>>(`/admin/settlements/${id}`).then(r => r.data.data),

  generateSettlement: (month: string) =>
    api.post<ApiResponse<Settlement[]>>('/admin/settlements/generate', { month }).then(r => r.data),

  processSettlement: (id: string) =>
    api.post<ApiResponse<null>>(`/admin/settlements/${id}/process`).then(r => r.data),

  markSettlementPaid: (id: string) =>
    api.post<ApiResponse<null>>(`/admin/settlements/${id}/mark-paid`).then(r => r.data),

  cancelSettlement: (id: string) =>
    api.post<ApiResponse<null>>(`/admin/settlements/${id}/cancel`).then(r => r.data),

  failSettlement: (id: string) =>
    api.post<ApiResponse<null>>(`/admin/settlements/${id}/fail`).then(r => r.data),

  remindSettlement: (id: string) =>
    api.post<ApiResponse<null>>(`/admin/settlements/${id}/remind`).then(r => r.data),

  // Commission
  getCommission: () =>
    api.get<ApiResponse<{ rate: number }>>('/admin/settings/commission').then(r => r.data.data),

  updateCommission: (rate: number) =>
    api.patch<ApiResponse<{ rate: number }>>('/admin/settings/commission', { rate }).then(r => r.data.data),

  // Notifications
  broadcast: (data: {
    title: string
    message: string
    channel?: string
    recipientIds?: string[]
    audience?: 'SELLERS' | 'USERS'
  }) => api.post<ApiResponse<{ deliveredTo: number }>>('/admin/notifications', data).then(r => r.data),
}
