import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { authorize } from "../../middlewares/role.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { UserRole } from "../../constants/roles.js";
import {
  getPreferencesController,
  listNotificationsController,
  markAllReadController,
  markReadController,
  sendSellerNotificationController,
  unreadCountController,
  updatePreferencesController,
} from "./notification.controller.js";
import {
  listNotificationsQuerySchema,
  notificationIdParamsSchema,
  sellerNotificationSchema,
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

/*
 * ---------------------------------------------------------------------
 * Seller-sent custom notifications
 * ---------------------------------------------------------------------
 *
 * Mounted under /api/v1/sellers (see routes/index.ts) so the URL
 * mirrors the admin broadcast endpoint: POST /api/v1/admin/notifications
 * for super admins, POST /api/v1/sellers/notifications for sellers.
 * Guarded by authentication + the SELLER role; buyers and admins get
 * a 403.
 */
export const sellerNotificationRouter = Router();

sellerNotificationRouter.use(
  authenticate,
  authorize(UserRole.SELLER),
);

/**
 * @openapi
 * /api/v1/sellers/notifications:
 *   post:
 *     tags:
 *       - Notifications
 *     summary: Send a custom notification to selected buyers (seller)
 *     description: |
 *       Lets an authenticated seller send a custom notification to the buyers they picked in the Seller Customers broadcast dialog. Exactly one target must be provided:
 *
 *       - `buyerIds` - one, several, or every buyer in the seller's selection (1-500 ids, de-duplicated server-side).
 *       - `buyerId` - a single buyer (kept for the legacy point-to-point call).
 *       - `audience: "ALL_BUYERS"` - every registered buyer in the marketplace.
 *
 *       Every target is re-checked against the database: only active accounts with the BUYER role are notified, so a seller can never reach another seller, an admin, or a deactivated profile. Ids that resolve to none of those are reported back in `notFoundBuyerIds` (and, when *no* id resolves, the request fails with 404 `BUYER_NOT_FOUND`).
 *
 *       Each message is delivered like any other notification: persisted in the buyer's in-app Notifications section (with read/unread tracking) and mirrored to their registered email address through the configured provider (real SMTP such as Gmail, or a test inbox such as YOPmail), so buyers receive it even when offline. Email failures never drop the in-app notification; they are recorded on it (`emailStatus: FAILED`) and can be replayed with the admin retry endpoint. Pass a per-submission `requestId` to make the send idempotent: repeating the same request then creates no second notification and sends no second email, it only heals an email whose previous round failed. Every send is written to the audit log.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/SellerNotificationInput"
 *     responses:
 *       201:
 *         description: Notification delivered to at least one buyer
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
 *                   $ref: "#/components/schemas/SellerNotificationResult"
 *       200:
 *         description: Nothing new was created (this requestId was already delivered to the selected buyers)
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
 *                   $ref: "#/components/schemas/SellerNotificationResult"
 *       400:
 *         description: Validation error (exactly one target required; title 3-200 chars; message 5-2000 chars; 1-500 buyer ids)
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *       404:
 *         description: No selected buyer could be notified (unknown, non-buyer, or deactivated account)
 */
sellerNotificationRouter.post(
  "/notifications",
  validate(sellerNotificationSchema),
  asyncHandler(sendSellerNotificationController),
);

export default router;
