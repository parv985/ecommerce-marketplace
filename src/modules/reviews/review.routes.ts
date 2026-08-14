import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  createReviewController,
  deleteReviewController,
  listReviewsController,
  updateReviewController,
} from "./review.controller.js";
import {
  createReviewSchema,
  listReviewsQuerySchema,
  productReviewsParamsSchema,
  reviewIdParamsSchema,
  updateReviewSchema,
} from "./review.schema.js";

const router = Router();

/**
 * @openapi
 * /api/v1/reviews:
 *   post:
 *     tags:
 *       - Reviews
 *     summary: Review a product
 *     description: Submits a rating (1-5) and optional comment for a product. Only allowed after an order containing the product has been delivered, and only once per user per product.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/ReviewInput"
 *     responses:
 *       201:
 *         description: Review submitted successfully
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
 *                   $ref: "#/components/schemas/Review"
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not eligible (order not delivered)
 *       409:
 *         description: Review already exists for this product
 *
 * /api/v1/reviews/product/{productId}:
 *   get:
 *     tags:
 *       - Reviews
 *     summary: List product reviews
 *     description: Public endpoint. Returns paginated reviews for a product along with the average rating and total review count.
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
 *         description: Reviews fetched successfully
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
 *                   $ref: "#/components/schemas/ProductReviews"
 *       400:
 *         description: Invalid product id
 */
router.post(
  "/",
  authenticate,
  validate(createReviewSchema),
  asyncHandler(createReviewController),
);

router.get(
  "/product/:productId",
  validate(productReviewsParamsSchema, "params"),
  validate(listReviewsQuerySchema, "query"),
  asyncHandler(listReviewsController),
);

/**
 * @openapi
 * /api/v1/reviews/{id}:
 *   patch:
 *     tags:
 *       - Reviews
 *     summary: Update a review
 *     description: Updates the rating or comment of the authenticated user's own review. Returns 403 for other users' reviews.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Review ObjectId
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/ReviewUpdate"
 *     responses:
 *       200:
 *         description: Review updated successfully
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
 *                   $ref: "#/components/schemas/Review"
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not your review
 *       404:
 *         description: Review not found
 *
 *   delete:
 *     tags:
 *       - Reviews
 *     summary: Delete a review
 *     description: Deletes the authenticated user's own review. Returns 403 for other users' reviews.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Review ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Review deleted successfully
 *       400:
 *         description: Invalid review id
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not your review
 *       404:
 *         description: Review not found
 */
router.patch(
  "/:id",
  authenticate,
  validate(reviewIdParamsSchema, "params"),
  validate(updateReviewSchema),
  asyncHandler(updateReviewController),
);

router.delete(
  "/:id",
  authenticate,
  validate(reviewIdParamsSchema, "params"),
  asyncHandler(deleteReviewController),
);

export default router;
