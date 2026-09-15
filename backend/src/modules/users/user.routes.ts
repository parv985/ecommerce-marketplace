import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { uploadImage } from "../../middlewares/upload.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  createMyAddressController,
  deleteAvatarController,
  deleteMyAddressController,
  getMyProfileController,
  listMyAddressesController,
  updateMyAddressController,
  updateMyProfileController,
  uploadAvatarController,
} from "./user.controller.js";
import {
  addressIdParamsSchema,
  createAddressSchema,
  updateAddressSchema,
  updateProfileSchema,
} from "./user.schema.js";

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/v1/users/me:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get current user profile
 *     description: Returns the profile of the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched successfully
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
 *                   $ref: "#/components/schemas/UserProfile"
 *       401:
 *         description: Not authenticated
 *
 *   patch:
 *     tags:
 *       - Users
 *     summary: Update current user profile
 *     description: Updates the name or avatar of the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/UserProfileUpdate"
 *     responses:
 *       200:
 *         description: Profile updated successfully
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
 *                   $ref: "#/components/schemas/UserProfile"
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 */
router.get(
  "/me",
  asyncHandler(getMyProfileController),
);

router.patch(
  "/me",
  validate(updateProfileSchema),
  asyncHandler(updateMyProfileController),
);

/**
 * @openapi
 * /api/v1/users/me/addresses:
 *   get:
 *     tags:
 *       - Users
 *     summary: List my addresses
 *     description: Returns all saved addresses of the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Addresses fetched successfully
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
 *                     $ref: "#/components/schemas/Address"
 *       401:
 *         description: Not authenticated
 *
 *   post:
 *     tags:
 *       - Users
 *     summary: Create an address
 *     description: Saves a new shipping address for the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/AddressInput"
 *     responses:
 *       201:
 *         description: Address created successfully
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
 *                   $ref: "#/components/schemas/Address"
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 */
router.get(
  "/me/addresses",
  asyncHandler(listMyAddressesController),
);

router.post(
  "/me/addresses",
  validate(createAddressSchema),
  asyncHandler(createMyAddressController),
);

/**
 * @openapi
 * /api/v1/users/me/addresses/{id}:
 *   patch:
 *     tags:
 *       - Users
 *     summary: Update an address
 *     description: Updates one of the authenticated user's addresses. Returns 404 if the address does not belong to the user.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Address ObjectId
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/AddressUpdate"
 *     responses:
 *       200:
 *         description: Address updated successfully
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
 *                   $ref: "#/components/schemas/Address"
 *       400:
 *         description: Validation error or invalid address id
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Address not found
 *
 *   delete:
 *     tags:
 *       - Users
 *     summary: Delete an address
 *     description: Deletes one of the authenticated user's addresses. Returns 404 if the address does not belong to the user.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Address ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Address deleted successfully
 *       400:
 *         description: Invalid address id
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Address not found
 */
router.patch(
  "/me/addresses/:id",
  validate(addressIdParamsSchema, "params"),
  validate(updateAddressSchema),
  asyncHandler(updateMyAddressController),
);

router.delete(
  "/me/addresses/:id",
  validate(addressIdParamsSchema, "params"),
  asyncHandler(deleteMyAddressController),
);

/**
 * @openapi
 * /api/v1/users/me/avatar:
 *   post:
 *     tags:
 *       - Users
 *     summary: Upload avatar
 *     description: Uploads or replaces the authenticated user's avatar image. Previous avatar is deleted from Cloudinary.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Avatar image (JPEG, PNG, WebP, GIF, max 5 MB)
 *     responses:
 *       200:
 *         description: Avatar uploaded successfully
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
 *                     avatarUrl:
 *                       type: string
 *                       format: uri
 *       400:
 *         description: Invalid file type or size
 *       401:
 *         description: Not authenticated
 *
 *   delete:
 *     tags:
 *       - Users
 *     summary: Delete avatar
 *     description: Removes the authenticated user's avatar from Cloudinary and the database.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Avatar deleted successfully
 *       400:
 *         description: No avatar to delete
 *       401:
 *         description: Not authenticated
 */
router.post(
  "/me/avatar",
  uploadImage.single("image"),
  asyncHandler(uploadAvatarController),
);

router.delete(
  "/me/avatar",
  asyncHandler(deleteAvatarController),
);

export default router;
