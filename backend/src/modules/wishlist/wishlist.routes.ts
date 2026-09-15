import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  addItemToWishlistController,
  checkWishlistItemController,
  clearWishlistController,
  getWishlistController,
  removeItemFromWishlistController,
} from "./wishlist.controller.js";
import {
  addWishlistItemSchema,
  wishlistItemParamsSchema,
} from "./wishlist.schema.js";

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/v1/wishlist:
 *   get:
 *     tags:
 *       - Wishlist
 *     summary: Get my wishlist
 *     description: Returns the authenticated user's wishlist with live product prices and stock resolved from the database.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wishlist fetched successfully
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
 *                     id:
 *                       type: string
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productId:
 *                             type: string
 *                           addedAt:
 *                             type: string
 *                             format: date-time
 *                           product:
 *                             type: object
 *                     totalItems:
 *                       type: integer
 *       401:
 *         description: Not authenticated
 *
 *   delete:
 *     tags:
 *       - Wishlist
 *     summary: Clear my wishlist
 *     description: Removes every item from the authenticated user's wishlist.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wishlist cleared
 *       401:
 *         description: Not authenticated
 */
router.get(
  "/",
  asyncHandler(getWishlistController),
);

router.delete(
  "/",
  asyncHandler(clearWishlistController),
);

/**
 * @openapi
 * /api/v1/wishlist/items:
 *   post:
 *     tags:
 *       - Wishlist
 *     summary: Add item to wishlist
 *     description: Adds a product to the authenticated user's wishlist. The product must be active.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId]
 *             properties:
 *               productId:
 *                 type: string
 *                 description: Product ObjectId
 *     responses:
 *       201:
 *         description: Item added to wishlist
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Product not found or inactive
 *       409:
 *         description: Product already in wishlist
 */
router.post(
  "/items",
  validate(addWishlistItemSchema),
  asyncHandler(addItemToWishlistController),
);

/**
 * @openapi
 * /api/v1/wishlist/items/{productId}:
 *   get:
 *     tags:
 *       - Wishlist
 *     summary: Check if product is in wishlist
 *     description: Returns whether a specific product is in the authenticated user's wishlist.
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
 *         description: Wishlist check completed
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
 *                     inWishlist:
 *                       type: boolean
 *       401:
 *         description: Not authenticated
 *
 *   delete:
 *     tags:
 *       - Wishlist
 *     summary: Remove item from wishlist
 *     description: Removes a single product from the authenticated user's wishlist.
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
 *         description: Item removed from wishlist
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Item not in wishlist
 */
router.get(
  "/items/:productId",
  validate(wishlistItemParamsSchema, "params"),
  asyncHandler(checkWishlistItemController),
);

router.delete(
  "/items/:productId",
  validate(wishlistItemParamsSchema, "params"),
  asyncHandler(removeItemFromWishlistController),
);

export default router;
