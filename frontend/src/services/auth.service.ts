import api from './api'
import type {
  ApiResponse,
  LoginResponse,
  UserSummary,
  TwoFactorSetupResponse,
  SellerProfile,
} from '@/types/api'

export interface SellerRegistrationPayload {
  name: string
  email: string
  password: string
  businessName: string
  phone?: string
  gstin: string
  pan: string
  bankAccountHolderName: string
  bankAccountNumber: string
  ifscCode: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  pincode: string
}

export interface SellerRegistrationResponse {
  user: { id: string; name: string; email: string; role: string }
  seller: { id: string; businessName: string; gstin: string; pan: string; status: string }
}

export const authApi = {
  register: (data: { name: string; email: string; password: string }) =>
    api.post<ApiResponse<LoginResponse>>('/auth/register', data).then(r => r.data),

  registerSeller: (data: SellerRegistrationPayload) =>
    api.post<ApiResponse<SellerRegistrationResponse>>('/sellers/register', data).then(r => r.data),

  login: (data: { email: string; password: string }) =>
    api.post<ApiResponse<LoginResponse>>('/auth/login', data).then(r => r.data),

  googleLogin: (idToken: string) =>
    api.post<ApiResponse<LoginResponse>>('/auth/google', { idToken }).then(r => r.data),

  logout: () =>
    api.post<ApiResponse<null>>('/auth/logout').then(r => r.data),

  refresh: () =>
    api.post<ApiResponse<{ accessToken: string }>>('/auth/refresh').then(r => r.data),

  forgotPassword: (email: string) =>
    api.post<ApiResponse<null>>('/auth/forgot-password', { email }).then(r => r.data),

  resetPassword: (data: { token: string; password: string; confirmPassword: string }) =>
    api.post<ApiResponse<null>>('/auth/reset-password', data).then(r => r.data),

  // 2FA
  setup2FA: () =>
    api.post<ApiResponse<TwoFactorSetupResponse>>('/auth/2fa/setup').then(r => r.data),

  enable2FA: (code: string) =>
    api.post<ApiResponse<null>>('/auth/2fa/enable', { code }).then(r => r.data),

  disable2FA: (code: string) =>
    api.post<ApiResponse<null>>('/auth/2fa/disable', { code }).then(r => r.data),

  verify2FA: (loginToken: string, code: string) =>
    api.post<ApiResponse<LoginResponse>>('/auth/2fa/verify', { loginToken, code }).then(r => r.data),

  regenerateRecoveryCodes: (code: string) =>
    api.post<ApiResponse<{ recoveryCodes: string[] }>>('/auth/2fa/recovery-codes', { code }).then(r => r.data),

  // Profile
  getMe: () =>
    api.get<ApiResponse<UserSummary>>('/users/me').then(r => r.data.data),

  getSellerProfile: () =>
    api.get<ApiResponse<SellerProfile>>('/sellers/me').then(r => r.data.data),
}
