import api from './api'
import type { ApiResponse, SellerProfile, PaginatedResponse, DashboardData, SalesPoint, TopProduct, CategoryPerformance, CustomerInfo, RevenueData, Settlement } from '@/types/api'

export const sellerService = {
  register: (data: {
    name: string
    email: string
    password: string
    businessName: string
    gstin: string
    pan: string
    bankAccountHolderName: string
    bankAccountNumber: string
    ifscCode: string
    addressLine1: string
    city: string
    state: string
    pincode: string
    phone?: string
  }) => api.post<ApiResponse<null>>('/sellers/register', data).then(r => r.data),

  getProfile: () =>
    api.get<ApiResponse<SellerProfile>>('/sellers/me').then(r => r.data.data),

  updateProfile: (data: Record<string, unknown>) =>
    api.patch<ApiResponse<SellerProfile>>('/sellers/me', data).then(r => r.data),

  uploadDocument: (file: File, documentType: string) => {
    const formData = new FormData()
    formData.append('document', file)
    formData.append('documentType', documentType)
    return api.post<ApiResponse<{ type: string; url: string; publicId: string }>>(
      '/sellers/me/documents', formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ).then(r => r.data)
  },

  deleteDocument: (documentId: string) =>
    api.delete<ApiResponse<null>>(`/sellers/me/documents/${documentId}`).then(r => r.data),

  // Dashboard & Analytics
  getDashboard: () =>
    api.get<ApiResponse<DashboardData>>('/sellers/dashboard').then(r => r.data.data),

  getSales: (params?: { from?: string; to?: string; groupBy?: 'day' | 'month' }) =>
    api.get<ApiResponse<SalesPoint[]>>('/sellers/analytics/sales', { params }).then(r => r.data.data),

  getTopProducts: (limit?: number) =>
    api.get<ApiResponse<TopProduct[]>>('/sellers/analytics/top-products', { params: { limit } }).then(r => r.data.data),

  getCategoryPerformance: () =>
    api.get<ApiResponse<CategoryPerformance[]>>('/sellers/analytics/categories').then(r => r.data.data),

  getCustomers: (params?: { search?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<CustomerInfo>>>('/sellers/customers', { params }).then(r => r.data.data),

  getRevenue: (params?: { from?: string; to?: string; groupBy?: 'day' | 'month' }) =>
    api.get<ApiResponse<RevenueData>>('/sellers/revenue', { params }).then(r => r.data.data),

  /* Returns the authenticated seller's settlement for a month, or null when no
     settlement exists for the selected period (backend: GET /sellers/settlement). */
  getSettlement: (month?: string) =>
    api.get<ApiResponse<Settlement | null>>('/sellers/settlement', { params: month ? { month } : {} }).then(r => r.data.data),
}
