import api from './api'
import type { ApiResponse, PaginatedResponse, Notification, NotificationPreferences, SellerNotificationInput } from '@/types/api'

export const notificationService = {
  list: (params?: { unread?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<Notification>>>('/notifications', { params }).then(r => r.data.data),

  getUnreadCount: () =>
    api.get<ApiResponse<{ unread: number }>>('/notifications/unread-count').then(r => r.data.data),

  markAsRead: (id: string) =>
    api.patch<ApiResponse<Notification>>(`/notifications/${id}/read`).then(r => r.data),

  markAllAsRead: () =>
    api.patch<ApiResponse<{ marked: number }>>('/notifications/read-all').then(r => r.data),

  getPreferences: () =>
    api.get<ApiResponse<NotificationPreferences>>('/notifications/preferences').then(r => r.data.data),

  updatePreferences: (data: Partial<NotificationPreferences>) =>
    api.patch<ApiResponse<NotificationPreferences>>('/notifications/preferences', data).then(r => r.data),

  /**
   * Seller-sent custom notification: to one specific buyer (buyerId) or
   * broadcast to all registered buyers (audience: 'ALL_BUYERS').
   * Delivered in-app and mirrored to the buyer's registered email.
   */
  sendAsSeller: (data: SellerNotificationInput) =>
    api.post<ApiResponse<{ deliveredTo: number }>>('/sellers/notifications', data).then(r => r.data),
}
