import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { uploadProductImages as uploadProductImagesMulter } from "../../middlewares/upload.middleware.js";
import { authorize } from "../../middlewares/role.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { requireTwoFactorSetup } from "../../middlewares/twoFactor.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { UserRole } from "../../constants/roles.js";
import {
  browseProductsController,
  createProductController,
  deleteProductController,
  deleteProductImageController,
  getPublicProductController,
  getSellerProductController,
  listMyProductsController,
  updateProductController,
  uploadProductImagesController,
} from "./product.controller.js";
import {
  createProductSchema,
  listMyProductsQuerySchema,
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
  requireTwoFactorSetup,
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
 *     description: Returns the products owned by the authenticated seller, including drafts and inactive products. An optional free-text `search` term filters name/description server-side; results are always scoped to the authenticated seller.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: search
 *         in: query
 *         required: false
 *         description: Free text search on product name and description (seller-scoped)
 *         schema:
 *           type: string
 *           maxLength: 100
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
  validate(listMyProductsQuerySchema, "query"),
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
  requireTwoFactorSetup,
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

/**
 * @openapi
 * /api/v1/products/{id}/images:
 *   post:
 *     tags:
 *       - Products
 *     summary: Upload product images
 *     description: Uploads one or more images to a product owned by the authenticated seller. Appends to existing images (max 8 total).
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Product images (JPEG, PNG, WebP, GIF, max 5 MB each)
 *     responses:
 *       200:
 *         description: Images uploaded successfully
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
 *                     type: object
 *                     properties:
 *                       url:
 *                         type: string
 *                         format: uri
 *                       publicId:
 *                         type: string
 *       400:
 *         description: Invalid file type, size, or too many images
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *       404:
 *         description: Product not found or not owned by seller
 */
router.post(
  "/:id/images",
  authenticate,
  authorize(UserRole.SELLER),
  validate(productIdParamsSchema, "params"),
  uploadProductImagesMulter.array("images", 8),
  asyncHandler(uploadProductImagesController),
);

/**
 * @openapi
 * /api/v1/products/{id}/images/{imageId}:
 *   delete:
 *     tags:
 *       - Products
 *     summary: Delete product image
 *     description: Removes a single image from a product and deletes it from Cloudinary.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Product ObjectId
 *         schema:
 *           type: string
 *       - name: imageId
 *         in: path
 *         required: true
 *         description: Image publicId from Cloudinary
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Image deleted successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *       404:
 *         description: Product or image not found
 */
router.delete(
  "/:id/images/:imageId",
  authenticate,
  authorize(UserRole.SELLER),
  validate(productIdParamsSchema, "params"),
  asyncHandler(deleteProductImageController),
);

export default router;
