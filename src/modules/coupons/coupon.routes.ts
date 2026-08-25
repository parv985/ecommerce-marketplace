import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { authorize } from "../../middlewares/role.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { requireTwoFactorSetup } from "../../middlewares/twoFactor.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { UserRole } from "../../constants/roles.js";
import {
  createCouponController,
  deactivateCouponController,
  getCouponController,
  listCouponsController,
  updateCouponController,
} from "./coupon.controller.js";
import {
  couponIdParamsSchema,
  createCouponSchema,
  listCouponsQuerySchema,
  updateCouponSchema,
} from "./coupon.schema.js";

const router = Router();

/**
 * @openapi
 * /api/v1/coupons:
 *   post:
 *     tags:
 *       - Coupons
 *     summary: Create a coupon
 *     description: Creates a coupon owned by the authenticated seller. Codes are normalized to uppercase and must be unique. Requires an approved seller account.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/CouponInput"
 *     responses:
 *       201:
 *         description: Coupon created successfully
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
 *                   $ref: "#/components/schemas/Coupon"
 *       400:
 *         description: Validation error or invalid restriction
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role or an approved seller account
 *       409:
 *         description: Coupon code already exists
 *   get:
 *     tags:
 *       - Coupons
 *     summary: List my coupons
 *     description: Returns the coupons owned by the authenticated seller with optional status filter and pagination.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         description: Filter by coupon status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE]
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
 *         description: Coupons fetched successfully
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
 *                   $ref: "#/components/schemas/PaginatedCoupons"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 */
router.post(
  "/",
  authenticate,
  authorize(UserRole.SELLER),
  requireTwoFactorSetup,
  validate(createCouponSchema),
  asyncHandler(createCouponController),
);

router.get(
  "/",
  authenticate,
  authorize(UserRole.SELLER),
  validate(listCouponsQuerySchema, "query"),
  asyncHandler(listCouponsController),
);

/**
 * @openapi
 * /api/v1/coupons/{id}:
 *   get:
 *     tags:
 *       - Coupons
 *     summary: Get one of my coupons
 *     description: Returns a single coupon owned by the authenticated seller. Returns 404 if the coupon does not belong to the seller.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Coupon ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Coupon fetched successfully
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
 *                   $ref: "#/components/schemas/Coupon"
 *       400:
 *         description: Invalid coupon id
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *       404:
 *         description: Coupon not found or not owned by seller
 *
 *   patch:
 *     tags:
 *       - Coupons
 *     summary: Update a coupon
 *     description: Updates a coupon owned by the authenticated seller. The code itself is immutable (customers type it in). A seller can only modify their own coupons.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Coupon ObjectId
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/CouponUpdate"
 *     responses:
 *       200:
 *         description: Coupon updated successfully
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
 *                   $ref: "#/components/schemas/Coupon"
 *       400:
 *         description: Validation error or invalid restriction
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *       404:
 *         description: Coupon not found or not owned by seller
 *
 *   delete:
 *     tags:
 *       - Coupons
 *     summary: Deactivate a coupon
 *     description: Soft-deletes a coupon owned by the authenticated seller by setting its status to INACTIVE. Checkout stops accepting the code immediately.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Coupon ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Coupon deactivated successfully
 *       400:
 *         description: Invalid coupon id
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *       404:
 *         description: Coupon not found or not owned by seller
 */
router.get(
  "/:id",
  authenticate,
  authorize(UserRole.SELLER),
  validate(couponIdParamsSchema, "params"),
  asyncHandler(getCouponController),
);

router.patch(
  "/:id",
  authenticate,
  authorize(UserRole.SELLER),
  requireTwoFactorSetup,
  validate(couponIdParamsSchema, "params"),
  validate(updateCouponSchema),
  asyncHandler(updateCouponController),
);

router.delete(
  "/:id",
  authenticate,
  authorize(UserRole.SELLER),
  validate(couponIdParamsSchema, "params"),
  asyncHandler(deactivateCouponController),
);

export default router;
