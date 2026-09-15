import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { authorize } from "../../middlewares/role.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { UserRole } from "../../constants/roles.js";
import { broadcastAdminMessageController } from "../notifications/notification.controller.js";
import { adminBroadcastSchema } from "../notifications/notification.schema.js";
import {
  cancelSettlementController,
  failSettlementController,
  generateSettlementController,
  getCommissionSettingsController,
  getSettlementController,
  listAuditLogsController,
  listOrdersController,
  listProductsController,
  listSellersController,
  listSettlementsController,
  listUsersController,
  markSettlementPaidController,
  processSettlementController,
  remindSettlementController,
  updateCommissionSettingsController,
  updateProductStatusController,
  updateSellerStatusController,
  updateUserStatusController,
} from "./admin.controller.js";
import {
  commissionRateSchema,
  generateSettlementSchema,
  listSettlementsQuerySchema,
  settlementIdParamsSchema,
} from "../settlements/settlement.schema.js";
import {
  adminIdParamsSchema,
  listAdminOrdersQuerySchema,
  listAuditLogsQuerySchema,
  listAdminProductsQuerySchema,
  listSellersQuerySchema,
  listUsersQuerySchema,
  updateProductStatusSchema,
  updateSellerStatusSchema,
  updateUserStatusSchema,
} from "./admin.schema.js";

const router = Router();

router.use(
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
);

/**
 * @openapi
 * /api/v1/admin/users:
 *   get:
 *     tags:
 *       - Admin
 *     summary: List users
 *     description: Lists all users with optional role filter and pagination. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: role
 *         in: query
 *         description: Filter by role
 *         schema:
 *           type: string
 *           enum: [BUYER, SELLER, SUPER_ADMIN]
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Users fetched successfully
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
 *                   $ref: "#/components/schemas/AdminUserList"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 *
 * /api/v1/admin/users/{id}:
 *   patch:
 *     tags:
 *       - Admin
 *     summary: Activate or deactivate a user
 *     description: Toggles the isActive flag of a user account. Deactivated users cannot sign in. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: User ObjectId
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isActive]
 *             properties:
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User status updated
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
 *                   $ref: "#/components/schemas/AdminUser"
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 *       404:
 *         description: User not found
 */
router.get(
  "/users",
  validate(listUsersQuerySchema, "query"),
  asyncHandler(listUsersController),
);

router.patch(
  "/users/:id",
  validate(adminIdParamsSchema, "params"),
  validate(updateUserStatusSchema),
  asyncHandler(updateUserStatusController),
);

/**
 * @openapi
 * /api/v1/admin/sellers:
 *   get:
 *     tags:
 *       - Admin
 *     summary: List seller profiles
 *     description: Lists all seller profiles with optional status filter and pagination. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         description: Filter by seller status
 *         schema:
 *           type: string
 *           enum: [PENDING, APPROVED, REJECTED, PAUSED, SUSPENDED]
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Sellers fetched successfully
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
 *                   $ref: "#/components/schemas/AdminSellerList"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 *
 * /api/v1/admin/sellers/{id}/status:
 *   patch:
 *     tags:
 *       - Admin
 *     summary: Update seller status
 *     description: Approves, rejects, pauses or suspends a seller account with an optional reason. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Seller profile ObjectId
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, APPROVED, REJECTED, PAUSED, SUSPENDED]
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Seller status updated
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
 *                   $ref: "#/components/schemas/AdminSeller"
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 *       404:
 *         description: Seller not found
 */
router.get(
  "/sellers",
  validate(listSellersQuerySchema, "query"),
  asyncHandler(listSellersController),
);

router.patch(
  "/sellers/:id/status",
  validate(adminIdParamsSchema, "params"),
  validate(updateSellerStatusSchema),
  asyncHandler(updateSellerStatusController),
);

/**
 * @openapi
 * /api/v1/admin/products:
 *   get:
 *     tags:
 *       - Admin
 *     summary: List all products
 *     description: Lists every product regardless of status with optional status filter and pagination. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         description: Filter by product status
 *         schema:
 *           type: string
 *           enum: [DRAFT, ACTIVE, INACTIVE]
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Products fetched successfully
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
 *                   $ref: "#/components/schemas/AdminProductList"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 *
 * /api/v1/admin/products/{id}/status:
 *   patch:
 *     tags:
 *       - Admin
 *     summary: Moderate a product
 *     description: Sets the status of any product (e.g. deactivate a violating listing or reactivate it). Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Product ObjectId
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [DRAFT, ACTIVE, INACTIVE]
 *     responses:
 *       200:
 *         description: Product status updated
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
 *                   $ref: "#/components/schemas/AdminProduct"
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 *       404:
 *         description: Product not found
 */
router.get(
  "/products",
  validate(listAdminProductsQuerySchema, "query"),
  asyncHandler(listProductsController),
);

router.patch(
  "/products/:id/status",
  validate(adminIdParamsSchema, "params"),
  validate(updateProductStatusSchema),
  asyncHandler(updateProductStatusController),
);

/**
 * @openapi
 * /api/v1/admin/orders:
 *   get:
 *     tags:
 *       - Admin
 *     summary: List all orders
 *     description: Lists every order across all sellers with optional status filter and pagination. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         description: Filter by order status
 *         schema:
 *           type: string
 *           enum: [PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED, RETURNED]
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Orders fetched successfully
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
 *                   $ref: "#/components/schemas/AdminOrderList"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 */
router.get(
  "/orders",
  validate(listAdminOrdersQuerySchema, "query"),
  asyncHandler(listOrdersController),
);

/**
 * @openapi
 * /api/v1/admin/audit-logs:
 *   get:
 *     tags:
 *       - Admin
 *     summary: List audit log entries
 *     description: >-
 *       Read-only, paginated view of the platform audit trail - every entry
 *       written by the audit logging service (logins, order, product, seller,
 *       payment, return, settlement, coupon, discount, notification and admin
 *       actions). All filters are optional and combined with AND; entries are
 *       returned newest first by default. SUPER_ADMIN only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: actorId
 *         in: query
 *         description: Exact actor that performed the action - a user ObjectId, or a system actor such as "system" / "webhook"
 *         schema:
 *           type: string
 *           maxLength: 100
 *       - name: actorRole
 *         in: query
 *         description: "Exact actor role. Values recorded by the app: BUYER, SELLER, SUPER_ADMIN, SYSTEM"
 *         schema:
 *           type: string
 *           maxLength: 50
 *         example: SUPER_ADMIN
 *       - name: action
 *         in: query
 *         description: "Exact action key. Values recorded by the app: ADMIN_BROADCAST, COMMISSION_RATE_CHANGED, COUPON_CREATED, COUPON_DEACTIVATED, COUPON_UPDATED, DISCOUNT_CREATED, DISCOUNT_DEACTIVATED, DISCOUNT_UPDATED, LOGIN, ORDER_CANCELLED, ORDER_CREATED, ORDER_STATUS_CHANGED, PAYMENT_CAPTURED, PAYMENT_INITIATED, PAYMENT_REFUNDED, PAYMENT_VERIFIED, PRODUCT_CREATED, PRODUCT_IMAGES_UPLOADED, PRODUCT_IMAGE_DELETED, PRODUCT_STATUS_CHANGED, PRODUCT_UPDATED, RETURN_REQUESTED, RETURN_STATUS_CHANGED, SELLER_DOCUMENT_DELETED, SELLER_DOCUMENT_UPLOADED, SELLER_PROFILE_UPDATED, SELLER_REGISTERED, SELLER_STATUS_UPDATE, SETTLEMENT_GENERATED, SETTLEMENT_REMINDER_SENT, SETTLEMENT_STATUS_CHANGED, USER_STATUS_UPDATE"
 *         schema:
 *           type: string
 *           maxLength: 100
 *         example: USER_STATUS_UPDATE
 *       - name: entityType
 *         in: query
 *         description: "Exact entity type the action targeted. Values recorded by the app: COUPON, DISCOUNT, NOTIFICATION, ORDER, PLATFORM_SETTING, PRODUCT, RETURN, SELLER, SETTLEMENT, USER"
 *         schema:
 *           type: string
 *           maxLength: 50
 *         example: USER
 *       - name: search
 *         in: query
 *         description: >-
 *           Free-text search across actorId, action and entityId. actorId/action match
 *           case-insensitively and partially; a full 24-char ObjectId also matches entityId
 *           exactly, and a hex fragment matches stored ObjectIds containing it. Combined with
 *           the other filters using AND.
 *         schema:
 *           type: string
 *           maxLength: 100
 *         example: USER_STATUS
 *       - name: entityId
 *         in: query
 *         description: ObjectId of the affected entity. Entries logged without an entity never match this filter
 *         schema:
 *           type: string
 *           pattern: "^[0-9a-fA-F]{24}$"
 *       - name: fromDate
 *         in: query
 *         description: "Inclusive lower bound on createdAt. Accepts a date (YYYY-MM-DD, read as UTC midnight) or a full ISO-8601 timestamp"
 *         schema:
 *           type: string
 *           format: date-time
 *         example: "2026-01-01"
 *       - name: toDate
 *         in: query
 *         description: "Inclusive upper bound on createdAt. A bare YYYY-MM-DD is widened to 23:59:59.999 UTC so a single-day range returns the whole day. Must be on or after fromDate"
 *         schema:
 *           type: string
 *           format: date-time
 *         example: "2026-01-31"
 *       - name: sortBy
 *         in: query
 *         description: Field to sort by
 *         schema:
 *           type: string
 *           enum: [createdAt, action, entityType, actorRole, actorId]
 *           default: createdAt
 *       - name: sortOrder
 *         in: query
 *         description: Sort direction - newest first by default
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *       - name: page
 *         in: query
 *         description: 1-based page number
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - name: limit
 *         in: query
 *         description: Page size (1-100)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Audit logs fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Audit logs fetched successfully
 *                 data:
 *                   $ref: "#/components/schemas/AuditLogList"
 *             example:
 *               success: true
 *               message: Audit logs fetched successfully
 *               data:
 *                 items:
 *                   - id: "65f1c2b0a1b2c3d4e5f60718"
 *                     actorId: "65f1c2b0a1b2c3d4e5f60717"
 *                     actorRole: SUPER_ADMIN
 *                     action: USER_STATUS_UPDATE
 *                     entityType: USER
 *                     entityId: "65f1c2b0a1b2c3d4e5f60716"
 *                     before:
 *                       isActive: true
 *                     after:
 *                       isActive: false
 *                     metadata: null
 *                     createdAt: "2026-02-14T09:12:44.221Z"
 *                 page: 1
 *                 limit: 20
 *                 total: 1
 *                 totalPages: 1
 *       400:
 *         description: "Validation error - unknown query parameter, malformed ObjectId or date, limit above 100, or fromDate after toDate"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             example:
 *               success: false
 *               message: Validation failed
 *               code: VALIDATION_ERROR
 *               errors: null
 *       401:
 *         description: Not authenticated - missing, malformed or expired access token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             example:
 *               success: false
 *               message: Authentication required
 *               code: AUTHENTICATION_REQUIRED
 *               errors: null
 *       403:
 *         description: Forbidden - BUYER and SELLER roles (and deactivated accounts) are rejected; SUPER_ADMIN only
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             example:
 *               success: false
 *               message: You do not have permission to perform this action
 *               code: FORBIDDEN
 *               errors: null
 */
router.get(
  "/audit-logs",
  validate(listAuditLogsQuerySchema, "query"),
  asyncHandler(listAuditLogsController),
);

/**
 * @openapi
 * /api/v1/admin/notifications:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Broadcast a custom notification
 *     description: Sends a custom notification/email to a set of recipients (explicit user ids or an audience of all sellers/users). Preferences are respected; the action is written to the audit log. Admin only.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, message]
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 200
 *               message:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 2000
 *               channel:
 *                 type: string
 *                 enum: [IN_APP, EMAIL, BOTH]
 *                 default: BOTH
 *               recipientIds:
 *                 type: array
 *                 maxItems: 500
 *                 items:
 *                   type: string
 *                 description: Explicit user ids (mutually exclusive with audience)
 *               audience:
 *                 type: string
 *                 enum: [SELLERS, USERS]
 *                 description: Broadcast to a whole role (mutually exclusive with recipientIds)
 *     responses:
 *       201:
 *         description: Notification broadcast sent
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
 *                     deliveredTo:
 *                       type: integer
 *       400:
 *         description: Validation error (recipientIds XOR audience required)
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 */
router.post(
  "/notifications",
  validate(adminBroadcastSchema),
  asyncHandler(broadcastAdminMessageController),
);

/**
 * @openapi
 * /api/v1/admin/settlements:
 *   get:
 *     tags:
 *       - Admin
 *     summary: List settlements
 *     description: Lists all seller settlements with optional status, seller, month filters and pagination. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         description: Filter by settlement status
 *         schema:
 *           type: string
 *           enum: [PENDING, PROCESSING, PAID, FAILED, CANCELLED]
 *       - name: sellerId
 *         in: query
 *         description: Filter by seller user id
 *         schema:
 *           type: string
 *       - name: month
 *         in: query
 *         description: Filter by month (YYYY-MM)
 *         schema:
 *           type: string
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Settlements fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: "#/components/schemas/PaginatedSettlements"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 *
 * /api/v1/admin/settlements/generate:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Generate settlements for a month
 *     description: Generates PENDING settlements for all sellers with delivered+paid orders in the given month. The commission rate in effect is snapshotted per settlement - later rate changes never alter historical payouts. Idempotent - regenerating a month returns existing settlements instead of duplicating them.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [month]
 *             properties:
 *               month:
 *                 type: string
 *                 description: Month in YYYY-MM format (e.g. 2026-07)
 *     responses:
 *       201:
 *         description: Settlements generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/Settlement"
 *       400:
 *         description: Invalid month format
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 *
 * /api/v1/admin/settlements/{id}:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get settlement details
 *     description: Returns a settlement with its order-by-order commission breakdown. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Settlement ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Settlement fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: "#/components/schemas/Settlement"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 *       404:
 *         description: Settlement not found
 *
 * /api/v1/admin/settlements/{id}/process:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Start processing a settlement
 *     description: Moves a PENDING settlement to PROCESSING (payout in progress). Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Settlement processing started
 *       400:
 *         description: Invalid transition
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 *       404:
 *         description: Settlement not found
 *
 * /api/v1/admin/settlements/{id}/mark-paid:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Mark a settlement as paid
 *     description: Moves a PROCESSING settlement to PAID, stamps paidAt and notifies the seller. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Settlement marked as paid
 *       400:
 *         description: Invalid transition
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 *       404:
 *         description: Settlement not found
 *
 * /api/v1/admin/settlements/{id}/cancel:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Cancel a settlement
 *     description: Cancels a PENDING or FAILED settlement. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Settlement cancelled
 *       400:
 *         description: Invalid transition
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 *       404:
 *         description: Settlement not found
 *
 * /api/v1/admin/settlements/{id}/remind:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Send a payout reminder
 *     description: Sends a settlement payment reminder notification/email to the seller and records reminderSentAt. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reminder sent
 *       400:
 *         description: Settlement already paid
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 *       404:
 *         description: Settlement not found
 */
router.get(
  "/settlements",
  validate(
    listSettlementsQuerySchema,
    "query",
  ),
  asyncHandler(listSettlementsController),
);

router.post(
  "/settlements/generate",
  validate(generateSettlementSchema),
  asyncHandler(generateSettlementController),
);

router.get(
  "/settlements/:id",
  validate(settlementIdParamsSchema, "params"),
  asyncHandler(getSettlementController),
);

router.post(
  "/settlements/:id/process",
  validate(settlementIdParamsSchema, "params"),
  asyncHandler(processSettlementController),
);

router.post(
  "/settlements/:id/mark-paid",
  validate(settlementIdParamsSchema, "params"),
  asyncHandler(markSettlementPaidController),
);

router.post(
  "/settlements/:id/cancel",
  validate(settlementIdParamsSchema, "params"),
  asyncHandler(cancelSettlementController),
);

router.post(
  "/settlements/:id/fail",
  validate(settlementIdParamsSchema, "params"),
  asyncHandler(failSettlementController),
);

router.post(
  "/settlements/:id/remind",
  validate(settlementIdParamsSchema, "params"),
  asyncHandler(remindSettlementController),
);

/**
 * @openapi
 * /api/v1/admin/settings/commission:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get the platform commission rate
 *     description: Returns the current commission percentage. Admin only.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Commission settings fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     rate:
 *                       type: number
 *                       description: Commission percentage (0-100)
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 *
 *   patch:
 *     tags:
 *       - Admin
 *     summary: Update the platform commission rate
 *     description: Sets the commission percentage used for FUTURE settlements. Existing settlements keep the rate they were generated with. The change is written to the audit log. Admin only.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rate]
 *             properties:
 *               rate:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Commission percentage (0-100)
 *     responses:
 *       200:
 *         description: Commission settings updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 */
router.get(
  "/settings/commission",
  asyncHandler(getCommissionSettingsController),
);

router.patch(
  "/settings/commission",
  validate(commissionRateSchema),
  asyncHandler(updateCommissionSettingsController),
);

export default router;
