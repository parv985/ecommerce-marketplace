import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { authorize } from "../../middlewares/roel.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { UserRole } from "../../constants/roles.js";
import {
  createCategoryController,
  deleteCategoryController,
  listAllCategoriesController,
  listCategoriesController,
  updateCategoryController,
} from "./category.controller.js";
import {
  categoryIdParamsSchema,
  createCategorySchema,
  updateCategorySchema,
} from "./category.schema.js";

const router = Router();

/**
 * @openapi
 * /api/v1/categories:
 *   get:
 *     tags:
 *       - Categories
 *     summary: List active categories
 *     description: Public endpoint. Returns all active categories sorted by name.
 *     responses:
 *       200:
 *         description: Categories fetched successfully
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
 *                     $ref: "#/components/schemas/Category"
 *
 *   post:
 *     tags:
 *       - Categories
 *     summary: Create a category
 *     description: Creates a new active category. Admin only.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/CategoryInput"
 *     responses:
 *       201:
 *         description: Category created successfully
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
 *                   $ref: "#/components/schemas/Category"
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 *       409:
 *         description: Category name already exists
 */
router.get(
  "/",
  asyncHandler(listCategoriesController),
);

router.post(
  "/",
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  validate(createCategorySchema),
  asyncHandler(createCategoryController),
);

/**
 * @openapi
 * /api/v1/categories/all:
 *   get:
 *     tags:
 *       - Categories
 *     summary: List all categories
 *     description: Returns every category including inactive ones. Admin only.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Categories fetched successfully
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
 *                     $ref: "#/components/schemas/Category"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 */
router.get(
  "/all",
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(listAllCategoriesController),
);

/**
 * @openapi
 * /api/v1/categories/{id}:
 *   patch:
 *     tags:
 *       - Categories
 *     summary: Update a category
 *     description: Updates name, description or activation status of a category. Admin only. Setting isActive back to true re-activates a category.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Category ObjectId
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/CategoryUpdate"
 *     responses:
 *       200:
 *         description: Category updated successfully
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
 *                   $ref: "#/components/schemas/Category"
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 *       404:
 *         description: Category not found
 *       409:
 *         description: Category name already exists
 *
 *   delete:
 *     tags:
 *       - Categories
 *     summary: Deactivate a category
 *     description: Soft-deletes a category by setting isActive to false. Existing products keep their category reference. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Category ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category deactivated successfully
 *       400:
 *         description: Invalid category id
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SUPER_ADMIN role
 *       404:
 *         description: Category not found
 */
router.patch(
  "/:id",
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  validate(categoryIdParamsSchema, "params"),
  validate(updateCategorySchema),
  asyncHandler(updateCategoryController),
);

router.delete(
  "/:id",
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  validate(categoryIdParamsSchema, "params"),
  asyncHandler(deleteCategoryController),
);

export default router;
