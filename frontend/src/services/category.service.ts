import api from './api'
import type { ApiResponse, Category } from '@/types/api'

export const categoryService = {
  list: () =>
    api.get<ApiResponse<Category[]>>('/categories').then(r => r.data.data),

  listAll: () =>
    api.get<ApiResponse<Category[]>>('/categories/all').then(r => r.data.data),

  create: (data: { name: string; description?: string; parentCategory?: string }) =>
    api.post<ApiResponse<Category>>('/categories', data).then(r => r.data),

  update: (id: string, data: Partial<Category>) =>
    api.patch<ApiResponse<Category>>(`/categories/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/categories/${id}`).then(r => r.data),
}
