import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/apiResponse.js";
import {
  broadcastAdminMessage,
  getPreferencesForUser,
  getUnreadCount,
  listNotifications,
  markAllRead,
  markRead,
  sendSellerNotification,
  updatePreferencesForUser,
} from "./notification.service.js";
import { AppError } from "../../errors/AppError.js";
import {
  adminBroadcastSchema,
  sellerNotificationSchema,
} from "./notification.schema.js";

export const listNotificationsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const data = await listNotifications(
    req.user!.id,
    req.query,
  );

  sendSuccess(
    res,
    "Notifications fetched successfully",
    data,
  );
};

export const unreadCountController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const data = await getUnreadCount(req.user!.id);

  sendSuccess(
    res,
    "Unread count fetched successfully",
    data,
  );
};

export const markReadController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const data = await markRead(
    req.user!.id,
    req.params.id,
  );

  sendSuccess(
    res,
    "Notification marked as read",
    data,
  );
};

export const markAllReadController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const data = await markAllRead(req.user!.id);

  sendSuccess(
    res,
    "All notifications marked as read",
    data,
  );
};

export const getPreferencesController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const data = await getPreferencesForUser(
    req.user!.id,
  );

  sendSuccess(
    res,
    "Notification preferences fetched successfully",
    data,
  );
};

export const updatePreferencesController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const data = await updatePreferencesForUser(
    req.user!.id,
    req.body,
  );

  sendSuccess(
    res,
    "Notification preferences updated successfully",
    data,
  );
};

/*
 * Admin-only broadcast. The route lives under /admin (guarded by the
 * SUPER_ADMIN middleware); this controller validates the payload and
 * delegates to the shared notification service, which also writes the
 * audit log entry.
 */
export const broadcastAdminMessageController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (req.user?.role !== "SUPER_ADMIN") {
    throw new AppError(
      "You do not have permission to perform this action",
      403,
      "FORBIDDEN",
    );
  }

  const parsed = adminBroadcastSchema.parse(req.body);

  const data = await broadcastAdminMessage(req.user, {
    title: parsed.title,
    message: parsed.message,
    channel: parsed.channel,
    recipientIds: parsed.recipientIds,
    audience: parsed.audience,
  });

  sendSuccess(
    res,
    "Notification broadcast sent",
    data,
    201,
  );
};

/*
 * Seller-sent custom notification to one buyer or all buyers. The
 * route is guarded by the SELLER role middleware; the payload is
 * validated with the seller notification schema and delivery is
 * delegated to the shared notification service (in-app + email
 * mirror), which also writes the audit log entry.
 */
export const sendSellerNotificationController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    throw new AppError(
      "Authentication required",
      401,
      "AUTHENTICATION_REQUIRED",
    );
  }

  const parsed = sellerNotificationSchema.parse(req.body);

  const data = await sendSellerNotification(req.user, {
    title: parsed.title,
    message: parsed.message,
    channel: parsed.channel,
    buyerId: parsed.buyerId,
    audience: parsed.audience,
  });

  sendSuccess(
    res,
    "Notification sent successfully",
    data,
    201,
  );
};
