import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/apiResponse.js";
import {
  broadcastAdminMessage,
  getPreferencesForUser,
  getUnreadCount,
  listNotifications,
  markAllRead,
  markRead,
  retryFailedNotificationEmails,
  sendSellerNotification,
  updatePreferencesForUser,
} from "./notification.service.js";
import { AppError } from "../../errors/AppError.js";
import {
  adminBroadcastSchema,
  retryFailedEmailsSchema,
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
 * Seller-sent custom notification to one buyer, a selection of buyers
 * (buyerIds - the Seller Customers broadcast multi-select) or every
 * registered buyer. The route is guarded by the SELLER role middleware;
 * the payload is validated with the seller notification schema and
 * delivery is delegated to the shared notification service (in-app +
 * email mirror), which also writes the audit log entry.
 *
 * The response reports what actually happened per recipient, so the UI
 * can distinguish "delivered to 12 buyers" from "2 of the 14 selected
 * buyers could not be reached" and "1 inbox rejected the email copy".
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
    buyerIds: parsed.buyerIds,
    audience: parsed.audience,
    requestId: parsed.requestId,
  });

  /*
   * A retried request (same requestId) creates nothing new - answer 200
   * in that case so a client can tell "already sent" from "just sent"
   * without parsing the message text.
   */
  sendSuccess(
    res,
    data.deliveredTo > 0
      ? `Notification sent to ${data.deliveredTo} ${data.deliveredTo === 1 ? "buyer" : "buyers"}`
      : "Notification was already sent to the selected buyers",
    data,
    data.deliveredTo > 0 ? 201 : 200,
  );
};

/*
 * Repair pass over email copies whose delivery failed. In-app
 * notifications are the source of truth and are never re-created here, so
 * a retry can resend an email without producing a second notification (or
 * a second unread badge). Super-admin only, like the broadcast endpoint.
 */
export const retryFailedEmailsController = async (
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

  const parsed = retryFailedEmailsSchema.parse(
    req.body ?? {},
  );

  const data = await retryFailedNotificationEmails(
    { limit: parsed.limit },
    { id: req.user.id, role: req.user.role },
  );

  sendSuccess(
    res,
    data.attempted === 0
      ? "No failed notification emails to retry"
      : `Retried ${data.attempted} email deliver${data.attempted === 1 ? "y" : "ies"}: ${data.sent} sent, ${data.failed} failed, ${data.skipped} skipped`,
    data,
  );
};
