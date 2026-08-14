import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { authorize } from "../../middlewares/roel.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { UserRole } from "../../constants/roles.js";
import {
  getSellerProfileController,
  registerSellerController,
  updateSellerProfileController,
} from "./seller.controller.js";
import {
  sellerRegistrationSchema,
  updateSellerProfileSchema,
} from "./seller.schema.js";

const router = Router();

/**
 * @openapi
 * /api/v1/sellers/register:
 *   post:
 *     tags:
 *       - Sellers
 *     summary: Register a seller
 *     description: Public registration. Creates a User with the SELLER role and a Seller profile in PENDING status.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *               - businessName
 *               - gstin
 *               - pan
 *               - bankAccountHolderName
 *               - bankAccountNumber
 *               - ifscCode
 *               - addressLine1
 *               - city
 *               - state
 *               - pincode
 *             properties:
 *               name:
 *                 type: string
 *                 example: Parv Kaneriya
 *               email:
 *                 type: string
 *                 format: email
 *                 example: seller@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: StrongPassword123!
 *               businessName:
 *                 type: string
 *                 example: Kaneriya Traders
 *               phone:
 *                 type: string
 *                 pattern: "^[0-9]{10}$"
 *                 description: 10 digit Indian mobile number
 *               gstin:
 *                 type: string
 *                 description: Valid Indian GSTIN
 *                 example: 27AAPFU0939F1ZV
 *               pan:
 *                 type: string
 *                 description: Valid Indian PAN
 *                 example: AAPFU0939F
 *               bankAccountHolderName:
 *                 type: string
 *                 example: Parv Kaneriya
 *               bankAccountNumber:
 *                 type: string
 *                 example: "123456789012"
 *               ifscCode:
 *                 type: string
 *                 example: HDFC0001234
 *               addressLine1:
 *                 type: string
 *               addressLine2:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               pincode:
 *                 type: string
 *                 pattern: "^[1-9][0-9]{5}$"
 *               documents:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                     url:
 *                       type: string
 *                       format: uri
 *     responses:
 *       201:
 *         description: Seller registration submitted successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email, GSTIN or PAN already exists
 */
router.post(
  "/register",
  validate(sellerRegistrationSchema),
  asyncHandler(registerSellerController),
);

/**
 * @openapi
 * /api/v1/sellers/me:
 *   get:
 *     tags:
 *       - Sellers
 *     summary: Get current seller profile
 *     description: Returns the seller profile belonging to the authenticated seller.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Seller profile fetched successfully
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
 *                   $ref: "#/components/schemas/SellerProfile"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *       404:
 *         description: Seller profile not found
 *
 *   patch:
 *     tags:
 *       - Sellers
 *     summary: Update current seller profile
 *     description: Updates business, contact, bank or address information of the authenticated seller's profile. GSTIN and PAN are immutable.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/SellerProfileUpdate"
 *     responses:
 *       200:
 *         description: Seller profile updated successfully
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
 *                   $ref: "#/components/schemas/SellerProfile"
 *       400:
 *         description: Validation error (unknown fields such as gstin/pan are rejected)
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Requires SELLER role
 *       404:
 *         description: Seller profile not found
 */
router.get(
  "/me",
  authenticate,
  authorize(UserRole.SELLER),
  asyncHandler(getSellerProfileController),
);

router.patch(
  "/me",
  authenticate,
  authorize(UserRole.SELLER),
  validate(updateSellerProfileSchema),
  asyncHandler(updateSellerProfileController),
);

export default router;
