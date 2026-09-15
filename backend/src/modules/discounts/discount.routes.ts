import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { authorize } from "../../middlewares/role.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { requireTwoFactorSetup } from "../../middlewares/twoFactor.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { UserRole } from "../../constants/roles.js";
import {
  createDiscountController,
  deactivateDiscountController,
  getDiscountController,
  listDiscountsController,
  updateDiscountController,
} from "./discount.controller.js";
import {
  createDiscountSchema,
  discountIdParamsSchema,
  listDiscountsQuerySchema,
  updateDiscountSchema,
} from "./discount.schema.js";

const router = Router();

/**
 * @openapi
 * /api/v1/discounts:
 *   post:
 *     tags:
 *       - Discounts
 *     summary: Create a sales discount
 *     description: Creates a percentage sales discount targeting one product or one category, owned by the authenticated seller. Requires an approved seller account. A product discount always beats a category discount at checkout; discounts are never stacked.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/DiscountInput"
 *     responses:
 *       201:
 *         description: Discount created successfully
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
 *                   $ref: "#/components/schemas/Discount"
 *       400:
 *         description: Validation error or invalid category
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role or an approved seller account
 *       404:
 *         description: Product not found or does not belong to the seller
 *   get:
 *     tags:
 *       - Discounts
 *     summary: List my discounts
 *     description: Returns the discounts owned by the authenticated seller with optional status filter and pagination.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         description: Filter by discount status
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
 *         description: Discounts fetched successfully
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
 *                   $ref: "#/components/schemas/PaginatedDiscounts"
 *       400:
 *         description: Invalid query parameters
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
  validate(createDiscountSchema),
  asyncHandler(createDiscountController),
);

router.get(
  "/",
  authenticate,
  authorize(UserRole.SELLER),
  validate(listDiscountsQuerySchema, "query"),
  asyncHandler(listDiscountsController),
);

/**
 * @openapi
 * /api/v1/discounts/{id}:
 *   get:
 *     tags:
 *       - Discounts
 *     summary: Get one of my discounts
 *     description: Returns a single discount owned by the authenticated seller. Returns 404 if the discount does not belong to the seller.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Discount ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Discount fetched successfully
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
 *                   $ref: "#/components/schemas/Discount"
 *       400:
 *         description: Invalid discount id
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *       404:
 *         description: Discount not found or not owned by seller
 *
 *   patch:
 *     tags:
 *       - Discounts
 *     summary: Update a discount
 *     description: Updates a discount owned by the authenticated seller. The target stays mutually exclusive — switching target type replaces the previous target. A seller can only modify their own discounts.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Discount ObjectId
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/DiscountUpdate"
 *     responses:
 *       200:
 *         description: Discount updated successfully
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
 *                   $ref: "#/components/schemas/Discount"
 *       400:
 *         description: Validation error or invalid target
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *       404:
 *         description: Discount not found or not owned by seller
 *
 *   delete:
 *     tags:
 *       - Discounts
 *     summary: Deactivate a discount
 *     description: Soft-deletes a discount owned by the authenticated seller by setting its status to INACTIVE. Checkout stops applying it immediately.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Discount ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Discount deactivated successfully
 *       400:
 *         description: Invalid discount id
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *       404:
 *         description: Discount not found or not owned by seller
 */
router.get(
  "/:id",
  authenticate,
  authorize(UserRole.SELLER),
  validate(discountIdParamsSchema, "params"),
  asyncHandler(getDiscountController),
);

router.patch(
  "/:id",
  authenticate,
  authorize(UserRole.SELLER),
  requireTwoFactorSetup,
  validate(discountIdParamsSchema, "params"),
  validate(updateDiscountSchema),
  asyncHandler(updateDiscountController),
);

router.delete(
  "/:id",
  authenticate,
  authorize(UserRole.SELLER),
  validate(discountIdParamsSchema, "params"),
  asyncHandler(deactivateDiscountController),
);

export default router;
