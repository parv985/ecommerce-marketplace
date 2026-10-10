import api from './api'
import type { ApiResponse, PaginatedResponse, Notification, NotificationPreferences, SellerNotificationInput, SellerNotificationResult } from '@/types/api'

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
   * Seller-sent custom notification. Targets the buyers ticked in the
   * Seller Customers broadcast multi-select (`buyerIds` — one, several or
   * all of them), a single buyer (`buyerId`), or every registered buyer
   * (`audience: 'ALL_BUYERS'`). Each delivery is persisted in-app and
   * mirrored to the buyer's registered email address by the backend, which
   * owns the SMTP configuration entirely — no credentials live here.
   *
   * `requestId` makes the send idempotent, so retrying after a failure can
   * never notify (or email) a buyer twice. The resolved object carries the
   * HTTP `status` too: 200 means the message had already been delivered to
   * every selected buyer, 201 means new notifications were created.
   */
  sendAsSeller: (data: SellerNotificationInput) =>
    api
      .post<ApiResponse<SellerNotificationResult>>('/sellers/notifications', data)
      .then(r => ({ status: r.status, ...r.data })),
}
