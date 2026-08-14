import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { authorize } from "../../middlewares/roel.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { UserRole } from "../../constants/roles.js";
import {
  listOrdersController,
  listProductsController,
  listSellersController,
  listUsersController,
  updateProductStatusController,
  updateSellerStatusController,
  updateUserStatusController,
} from "./admin.controller.js";
import {
  adminIdParamsSchema,
  listAdminOrdersQuerySchema,
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
 *           enum: [PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED]
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

export default router;
