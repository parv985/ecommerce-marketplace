import api from './api'
import type { ApiResponse, UserProfile, Address, CreateAddressInput } from '@/types/api'

export const userService = {
  getProfile: () =>
    api.get<ApiResponse<UserProfile>>('/users/me').then(r => r.data.data),

  updateProfile: (data: { name?: string }) =>
    api.patch<ApiResponse<UserProfile>>('/users/me', data).then(r => r.data),

  getAddresses: () =>
    api.get<ApiResponse<Address[]>>('/users/me/addresses').then(r => r.data.data),

  createAddress: (data: CreateAddressInput) =>
    api.post<ApiResponse<Address>>('/users/me/addresses', data).then(r => r.data),

  updateAddress: (id: string, data: Partial<CreateAddressInput>) =>
    api.patch<ApiResponse<Address>>(`/users/me/addresses/${id}`, data).then(r => r.data),

  deleteAddress: (id: string) =>
    api.delete<ApiResponse<null>>(`/users/me/addresses/${id}`).then(r => r.data),

  uploadAvatar: (file: File) => {
    const formData = new FormData()
    formData.append('image', file)
    return api.post<ApiResponse<{ avatarUrl: string }>>('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data)
  },

  deleteAvatar: () =>
    api.delete<ApiResponse<null>>('/users/me/avatar').then(r => r.data),
}
