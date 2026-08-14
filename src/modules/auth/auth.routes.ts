import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  googleLogin,
  googleCallback,
  googleRedirect,
  
} from "./auth.controller.js";

import {
  forgotPasswordController,
  resetPasswordController,
  login,
  logout,
  refresh,
  register,
} from "./auth.controller.js";

import {
  forgotPasswordSchema,
  resetPasswordSchema,
  loginSchema,
  registerSchema,
  googleLoginSchema,
} from "./auth.schema.js";

const router = Router();
  /**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Register a new user
 *     description: Creates a new user account.
 *
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
 *             properties:
 *               name:
 *                 type: string
 *               example: Parv Kaneriya
 *
 *               email:
 *                 type: string
 *                 format: email
 *                 example: parv@example.com
 *
 *               password:
 *                 type: string
 *                 format: password
 *                 example: StrongPassword123!
 *
 *     responses:
 *       201:
 *         description: User registered successfully
 *
 *       400:
 *         description: Validation error
 *
 *       409:
 *         description: User already exists
 */
router.post(
  "/register",
  validate(registerSchema),
  asyncHandler(register),
);

  /**
   * @openapi
   * /api/v1/auth/login:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Log in a user
   *     description: Authenticates with email and password and returns access and refresh tokens. The refresh token is also set as an httpOnly cookie.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - password
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: parv@example.com
   *               password:
   *                 type: string
   *                 format: password
   *                 example: StrongPassword123!
   *     responses:
   *       200:
   *         description: Login successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     accessToken:
   *                       type: string
   *                     user:
   *                       $ref: "#/components/schemas/UserSummary"
   *       400:
   *         description: Validation error
   *       401:
   *         description: Invalid credentials
   */
router.post(
  "/login",
  validate(loginSchema),
  asyncHandler(login),
);

  /**
   * @openapi
   * /api/v1/auth/refresh:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Refresh access token
   *     description: Rotates the refresh token (single-use) from the httpOnly cookie and returns a new access token.
   *     responses:
   *       200:
   *         description: Token refreshed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     accessToken:
   *                       type: string
   *       401:
   *         description: Missing, invalid or expired refresh token
   */
router.post(
  "/refresh",
  asyncHandler(refresh),
);

  /**
   * @openapi
   * /api/v1/auth/logout:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Log out
   *     description: Revokes the refresh token and clears the refresh token cookie.
   *     responses:
   *       200:
   *         description: Logout successful
   *       401:
   *         description: Not authenticated
   */
router.post(
  "/logout",
  asyncHandler(logout),
);

  /**
   * @openapi
   * /api/v1/auth/forgot-password:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Request password reset
   *     description: Sends a password reset email if an account with the email exists. Always returns success to avoid account enumeration.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: parv@example.com
   *     responses:
   *       200:
   *         description: Reset email sent (if the account exists)
   *       400:
   *         description: Validation error
   */
router.post(
  "/forgot-password",
  validate(forgotPasswordSchema),
  asyncHandler(forgotPasswordController),
);

  /**
   * @openapi
   * /api/v1/auth/reset-password:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Reset password
   *     description: Resets the password using a valid reset token.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - token
   *               - password
   *               - confirmPassword
   *             properties:
   *               token:
   *                 type: string
   *                 description: Reset token from the email link
   *               password:
   *                 type: string
   *                 format: password
   *                 minLength: 8
   *                 example: NewStrongPassword123!
   *               confirmPassword:
   *                 type: string
   *                 format: password
   *                 example: NewStrongPassword123!
   *     responses:
   *       200:
   *         description: Password reset successfully
   *       400:
   *         description: Validation error or invalid/expired token
   */
router.post(
  "/reset-password",
  validate(resetPasswordSchema),
  asyncHandler(resetPasswordController),
);

  /**
   * @openapi
   * /api/v1/auth/google:
   *   get:
   *     tags:
   *       - Authentication
   *     summary: Start Google OAuth flow
   *     description: Redirects the browser to Google's consent screen.
   *     responses:
   *       302:
   *         description: Redirect to Google consent screen
   */
router.get(
  "/google",
  asyncHandler(googleRedirect),
);

  /**
   * @openapi
   * /api/v1/auth/google:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Sign in with a Google ID token
   *     description: Verifies a Google ID token obtained from a frontend sign-in flow, upserts the user and returns tokens.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - idToken
   *             properties:
   *               idToken:
   *                 type: string
   *                 description: Google ID token (JWT) from the OAuth client
   *     responses:
   *       200:
   *         description: Google login successful
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
   *                     accessToken:
   *                       type: string
   *                     user:
   *                       $ref: "#/components/schemas/UserSummary"
   *       400:
   *         description: Missing or invalid ID token
   *       401:
   *         description: Invalid Google token
   */
router.post(
  "/google",
  validate(googleLoginSchema),
  asyncHandler(googleLogin),
);

  /**
   * @openapi
   * /api/v1/auth/google/callback:
   *   get:
   *     tags:
   *       - Authentication
   *     summary: Google OAuth callback
   *     description: Exchanges the authorization code for tokens, upserts the user and redirects to the frontend with an access token. If the code is missing the user is redirected back to Google's consent screen.
   *     parameters:
   *       - name: code
   *         in: query
   *         required: false
   *         schema:
   *           type: string
   *         description: Authorization code from Google
   *       - name: error
   *         in: query
   *         required: false
   *         schema:
   *           type: string
   *         description: Error returned by Google (e.g. access_denied)
   *     responses:
   *       302:
   *         description: Redirect to the frontend (success or error)
   */
router.get(
  "/google/callback",
  asyncHandler(googleCallback),
);

export default router;