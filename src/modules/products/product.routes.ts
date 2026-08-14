import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { authorize } from "../../middlewares/roel.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { UserRole } from "../../constants/roles.js";
import {
  browseProductsController,
  createProductController,
  deleteProductController,
  getPublicProductController,
  getSellerProductController,
  listMyProductsController,
  updateProductController,
} from "./product.controller.js";
import {
  createProductSchema,
  listProductsQuerySchema,
  productIdParamsSchema,
  updateProductSchema,
} from "./product.schema.js";

const router = Router();

/**
 * @openapi
 * /api/v1/products:
 *   post:
 *     tags:
 *       - Products
 *     summary: Create a product
 *     description: Creates a product owned by the authenticated seller. Requires an approved seller account.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/ProductInput"
 *     responses:
 *       201:
 *         description: Product created successfully
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
 *                   $ref: "#/components/schemas/Product"
 *       400:
 *         description: Validation error or invalid category
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *   get:
 *     tags:
 *       - Products
 *     summary: Browse active products
 *     description: Public catalog search with filtering, sorting and pagination. Only ACTIVE products are returned.
 *     parameters:
 *       - name: search
 *         in: query
 *         description: Free text search on name and description
 *         schema:
 *           type: string
 *       - name: category
 *         in: query
 *         description: Category ObjectId to filter by
 *         schema:
 *           type: string
 *       - name: minPrice
 *         in: query
 *         description: Minimum price
 *         schema:
 *           type: number
 *           minimum: 0
 *       - name: maxPrice
 *         in: query
 *         description: Maximum price
 *         schema:
 *           type: number
 *           minimum: 0
 *       - name: sort
 *         in: query
 *         description: Sort order
 *         schema:
 *           type: string
 *           enum: [newest, oldest, price_asc, price_desc, name_asc]
 *           default: newest
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
 *                   $ref: "#/components/schemas/PaginatedProducts"
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */
router.post(
  "/",
  authenticate,
  authorize(UserRole.SELLER),
  validate(createProductSchema),
  asyncHandler(createProductController),
);

router.get(
  "/",
  validate(listProductsQuerySchema, "query"),
  asyncHandler(browseProductsController),
);

/**
 * @openapi
 * /api/v1/products/my:
 *   get:
 *     tags:
 *       - Products
 *     summary: List my products
 *     description: Returns every product owned by the authenticated seller, including drafts and inactive products.
 *     security:
 *       - bearerAuth: []
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
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/Product"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *
 * /api/v1/products/my/{id}:
 *   get:
 *     tags:
 *       - Products
 *     summary: Get one of my products
 *     description: Returns a single product owned by the authenticated seller regardless of status. Returns 404 if the product does not belong to the seller.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Product ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product fetched successfully
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
 *                   $ref: "#/components/schemas/Product"
 *       400:
 *         description: Invalid product id
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *       404:
 *         description: Product not found
 */
router.get(
  "/my",
  authenticate,
  authorize(UserRole.SELLER),
  asyncHandler(listMyProductsController),
);

router.get(
  "/my/:id",
  authenticate,
  authorize(UserRole.SELLER),
  validate(productIdParamsSchema, "params"),
  asyncHandler(getSellerProductController),
);

/**
 * @openapi
 * /api/v1/products/{id}:
 *   get:
 *     tags:
 *       - Products
 *     summary: Get active product by id
 *     description: Public product details. Only ACTIVE products are visible.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Product ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product fetched successfully
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
 *                   $ref: "#/components/schemas/Product"
 *       400:
 *         description: Invalid product id
 *       404:
 *         description: Product not found or inactive
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *
 *   patch:
 *     tags:
 *       - Products
 *     summary: Update a product
 *     description: Updates a product owned by the authenticated seller. A seller can only modify their own products.
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
 *             $ref: "#/components/schemas/ProductUpdate"
 *     responses:
 *       200:
 *         description: Product updated successfully
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
 *                   $ref: "#/components/schemas/Product"
 *       400:
 *         description: Validation error or invalid category
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *       404:
 *         description: Product not found or not owned by seller
 *
 *   delete:
 *     tags:
 *       - Products
 *     summary: Deactivate a product
 *     description: Soft-deletes a product owned by the authenticated seller by setting its status to INACTIVE. It disappears from the public catalog while order history stays intact.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Product ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product deactivated successfully
 *       400:
 *         description: Invalid product id
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *       404:
 *         description: Product not found or not owned by seller
 */
router.get(
  "/:id",
  validate(productIdParamsSchema, "params"),
  asyncHandler(getPublicProductController),
);

router.patch(
  "/:id",
  authenticate,
  authorize(UserRole.SELLER),
  validate(productIdParamsSchema, "params"),
  validate(updateProductSchema),
  asyncHandler(updateProductController),
);

router.delete(
  "/:id",
  authenticate,
  authorize(UserRole.SELLER),
  validate(productIdParamsSchema, "params"),
  asyncHandler(deleteProductController),
);

export default router;
