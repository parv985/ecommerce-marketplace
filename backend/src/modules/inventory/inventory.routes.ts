import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { authorize } from "../../middlewares/role.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { UserRole } from "../../constants/roles.js";
import {
  adjustStockController,
  listProductInventoryController,
  listSellerInventoryController,
} from "./inventory.controller.js";
import {
  adjustStockSchema,
  inventoryQuerySchema,
} from "./inventory.schema.js";

const router = Router();

router.use(authenticate);
router.use(authorize(UserRole.SELLER));

/**
 * @openapi
 * /api/v1/inventory:
 *   get:
 *     tags:
 *       - Inventory
 *     summary: List my inventory transactions
 *     description: Returns a paginated list of inventory transactions for the authenticated seller's products.
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: Inventory transactions fetched successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 */
router.get(
  "/",
  validate(inventoryQuerySchema, "query"),
  asyncHandler(listSellerInventoryController),
);

/**
 * @openapi
 * /api/v1/inventory/product/{productId}:
 *   get:
 *     tags:
 *       - Inventory
 *     summary: List inventory transactions for a product
 *     description: Returns a paginated list of inventory transactions for a specific product.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: productId
 *         in: path
 *         required: true
 *         description: Product ObjectId
 *         schema:
 *           type: string
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
 *         description: Inventory transactions fetched successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 */
router.get(
  "/product/:productId",
  validate(inventoryQuerySchema, "query"),
  asyncHandler(listProductInventoryController),
);

/**
 * @openapi
 * /api/v1/inventory/product/{productId}/adjust:
 *   post:
 *     tags:
 *       - Inventory
 *     summary: Adjust product stock
 *     description: Manually adjusts the stock level of a product. Positive quantity increases stock, negative quantity decreases stock.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: productId
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
 *             required: [quantity, reason]
 *             properties:
 *               quantity:
 *                 type: integer
 *                 description: Quantity to adjust (positive to add, negative to subtract)
 *               reason:
 *                 type: string
 *                 description: Reason for the adjustment
 *     responses:
 *       200:
 *         description: Stock adjusted successfully
 *       400:
 *         description: Validation error or insufficient stock
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *       404:
 *         description: Product not found
 */
router.post(
  "/product/:productId/adjust",
  validate(adjustStockSchema),
  asyncHandler(adjustStockController),
);

export default router;
