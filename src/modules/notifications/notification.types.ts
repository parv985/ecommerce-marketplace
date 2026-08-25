import type { NotificationType } from "../../constants/notificationTypes.js";

export interface NotificationResponse {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: Date;
}

export interface PaginatedNotifications {
  items: NotificationResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface NotificationPreferenceResponse {
  userId: string;
  emailOrderUpdates: boolean;
  emailPaymentUpdates: boolean;
  emailPromotional: boolean;
  inApp: boolean;
}
