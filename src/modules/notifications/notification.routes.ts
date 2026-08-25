import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  getPreferencesController,
  listNotificationsController,
  markAllReadController,
  markReadController,
  unreadCountController,
  updatePreferencesController,
} from "./notification.controller.js";
import {
  listNotificationsQuerySchema,
  notificationIdParamsSchema,
  updatePreferencesSchema,
} from "./notification.schema.js";

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/v1/notifications:
 *   get:
 *     tags:
 *       - Notifications
 *     summary: List my notifications
 *     description: Returns the authenticated user's in-app notifications with optional unread filter and pagination.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: unread
 *         in: query
 *         description: Filter to unread notifications only
 *         schema:
 *           type: string
 *           enum: [true, false]
 *       - name: page
 *         in: query
 *         description: Page number
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - name: limit
 *         in: query
 *         description: Items per page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Notifications fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: "#/components/schemas/PaginatedNotifications"
 *       401:
 *         description: Not authenticated
 *
 * /api/v1/notifications/unread-count:
 *   get:
 *     tags:
 *       - Notifications
 *     summary: Unread notification count
 *     description: Returns how many unread notifications the authenticated user has.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     unread:
 *                       type: integer
 *       401:
 *         description: Not authenticated
 *
 * /api/v1/notifications/read-all:
 *   patch:
 *     tags:
 *       - Notifications
 *     summary: Mark all notifications as read
 *     description: Marks every unread notification of the authenticated user as read.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     marked:
 *                       type: integer
 *       401:
 *         description: Not authenticated
 *
 * /api/v1/notifications/preferences:
 *   get:
 *     tags:
 *       - Notifications
 *     summary: Get notification preferences
 *     description: Returns the authenticated user's notification preferences (defaults created on first access).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Preferences fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: "#/components/schemas/NotificationPreferences"
 *       401:
 *         description: Not authenticated
 *
 *   patch:
 *     tags:
 *       - Notifications
 *     summary: Update notification preferences
 *     description: Updates the authenticated user's notification preferences. Disabled channels skip that delivery medium for non-critical notifications.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               emailOrderUpdates:
 *                 type: boolean
 *               emailPaymentUpdates:
 *                 type: boolean
 *               emailPromotional:
 *                 type: boolean
 *               inApp:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: "#/components/schemas/NotificationPreferences"
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *
 * /api/v1/notifications/{id}/read:
 *   patch:
 *     tags:
 *       - Notifications
 *     summary: Mark a notification as read
 *     description: Marks one of the authenticated user's notifications as read.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Notification ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: "#/components/schemas/Notification"
 *       400:
 *         description: Invalid notification id
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Notification not found or not yours
 */
router.get(
  "/",
  validate(listNotificationsQuerySchema, "query"),
  asyncHandler(listNotificationsController),
);

router.get(
  "/unread-count",
  asyncHandler(unreadCountController),
);

router.patch(
  "/read-all",
  asyncHandler(markAllReadController),
);

router.get(
  "/preferences",
  asyncHandler(getPreferencesController),
);

router.patch(
  "/preferences",
  validate(updatePreferencesSchema),
  asyncHandler(updatePreferencesController),
);

router.patch(
  "/:id/read",
  validate(notificationIdParamsSchema, "params"),
  asyncHandler(markReadController),
);

export default router;
