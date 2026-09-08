import api from './api'
import type { ApiResponse, PaginatedResponse, Product } from '@/types/api'

export interface ProductQueryParams {
  search?: string
  category?: string
  minPrice?: number
  maxPrice?: number
  sort?: 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'name_asc'
  page?: number
  limit?: number
}

export const productService = {
  browse: (params?: ProductQueryParams) => {
    const clean: Record<string, string | number> = {};
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '' && v !== null && v !== 0) {
          clean[k] = v;
        }
      });
    }
    return api.get<ApiResponse<PaginatedResponse<Product>>>('/products', { params: clean }).then(r => r.data?.data ?? { items: [], total: 0, page: 1, limit: 10, totalPages: 0 });
  },

  getById: (id: string) =>
    api.get<ApiResponse<Product>>(`/products/${id}`).then(r => r.data.data),

  getMyProducts: () =>
    api.get<ApiResponse<Product[]>>('/products/my').then(r => r.data.data),

  getMyProduct: (id: string) =>
    api.get<ApiResponse<Product>>(`/products/my/${id}`).then(r => r.data.data),

  create: (data: {
    name: string
    description: string
    price: number
    compareAtPrice?: number
    sku: string
    stock: number
    lowStockThreshold?: number
    category?: string
    specifications?: { key: string; value: string }[]
  }) => api.post<ApiResponse<Product>>('/products', data).then(r => r.data),

  update: (id: string, data: Record<string, unknown>) =>
    api.patch<ApiResponse<Product>>(`/products/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/products/${id}`).then(r => r.data),

  uploadImages: (id: string, files: File[]) => {
    const formData = new FormData()
    files.forEach(f => formData.append('images', f))
    return api.post<ApiResponse<{ url: string; publicId: string }[]>>(
      `/products/${id}/images`, formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ).then(r => r.data);
  },

  deleteImage: (productId: string, imageId: string) =>
    api.delete(`/products/${productId}/images/${encodeURIComponent(imageId)}`).then(r => r.data),
}
