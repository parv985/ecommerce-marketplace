import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  addItemController,
  clearCartController,
  getCartController,
  removeItemController,
  updateItemController,
} from "./cart.controller.js";
import {
  addCartItemSchema,
  cartItemParamsSchema,
  updateCartItemSchema,
} from "./cart.schema.js";

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/v1/cart:
 *   get:
 *     tags:
 *       - Cart
 *     summary: Get my cart
 *     description: Returns the authenticated user's cart with live product prices and stock resolved from the database. Items whose product is missing or inactive have a null product and are excluded from the totals.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart fetched successfully
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
 *                   $ref: "#/components/schemas/Cart"
 *       401:
 *         description: Not authenticated
 *
 *   delete:
 *     tags:
 *       - Cart
 *     summary: Clear my cart
 *     description: Removes every item from the authenticated user's cart.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart cleared
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
 *                   $ref: "#/components/schemas/Cart"
 *       401:
 *         description: Not authenticated
 */
router.get(
  "/",
  asyncHandler(getCartController),
);

router.delete(
  "/",
  asyncHandler(clearCartController),
);

/**
 * @openapi
 * /api/v1/cart/items:
 *   post:
 *     tags:
 *       - Cart
 *     summary: Add item to cart
 *     description: Adds a product to the authenticated user's cart, incrementing the quantity if the item already exists. The product must be active and the resulting quantity must not exceed its stock.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/CartItemInput"
 *     responses:
 *       201:
 *         description: Item added to cart
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
 *                   $ref: "#/components/schemas/Cart"
 *       400:
 *         description: Validation error or insufficient stock
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Product not found or inactive
 *
 * /api/v1/cart/items/{productId}:
 *   patch:
 *     tags:
 *       - Cart
 *     summary: Update item quantity
 *     description: Sets the quantity of a cart item. The quantity must not exceed the product's current stock.
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
 *             $ref: "#/components/schemas/CartItemUpdate"
 *     responses:
 *       200:
 *         description: Cart item updated
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
 *                   $ref: "#/components/schemas/Cart"
 *       400:
 *         description: Validation error or insufficient stock
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Product not found or item not in cart
 *
 *   delete:
 *     tags:
 *       - Cart
 *     summary: Remove item from cart
 *     description: Removes a single item from the authenticated user's cart.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: productId
 *         in: path
 *         required: true
 *         description: Product ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Item removed from cart
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
 *                   $ref: "#/components/schemas/Cart"
 *       400:
 *         description: Invalid product id
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Item not in cart
 */
router.post(
  "/items",
  validate(addCartItemSchema),
  asyncHandler(addItemController),
);

router.patch(
  "/items/:productId",
  validate(cartItemParamsSchema, "params"),
  validate(updateCartItemSchema),
  asyncHandler(updateItemController),
);

router.delete(
  "/items/:productId",
  validate(cartItemParamsSchema, "params"),
  asyncHandler(removeItemController),
);

export default router;
