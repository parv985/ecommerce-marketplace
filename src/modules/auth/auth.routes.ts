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
  verifyTwoFactor,
  setupTwoFactorController,
  enableTwoFactorController,
  disableTwoFactorController,
  regenerateRecoveryCodesController,
} from "./auth.controller.js";
import { authenticate } from "./auth.middleware.js";

import {
  forgotPasswordSchema,
  resetPasswordSchema,
  loginSchema,
  registerSchema,
  googleLoginSchema,
  twoFactorVerifySchema,
  twoFactorCodeSchema,
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

  /**
   * @openapi
   * /api/v1/auth/2fa/verify:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Complete login with 2FA
   *     description: Completes a two-step login for a seller/admin with 2FA enabled. The loginToken comes from /auth/login when twoFactorRequired is true; the code is a TOTP code from the authenticator app or a single-use recovery code. Issues access and refresh tokens only after successful verification.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [loginToken, code]
   *             properties:
   *               loginToken:
   *                 type: string
   *                 description: Short-lived token from /auth/login when twoFactorRequired is true
   *               code:
   *                 type: string
   *                 description: TOTP code (6 digits) or recovery code (e.g. ABCD-EFGH-JKLM-NPQR)
   *     responses:
   *       200:
   *         description: Two-factor verification successful
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
   *         description: Validation error or 2FA not enabled
   *       401:
   *         description: Invalid login token or verification code
   */
router.post(
  "/2fa/verify",
  validate(twoFactorVerifySchema),
  asyncHandler(verifyTwoFactor),
);

  /**
   * @openapi
   * /api/v1/auth/2fa/setup:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Start 2FA setup
   *     description: Generates a new TOTP secret and single-use recovery codes for the authenticated user. The secret and recovery codes are returned exactly once; 2FA activates only after /auth/2fa/enable confirms a code. Sellers and admins only.
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Setup started
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
   *                     secret:
   *                       type: string
   *                       description: TOTP secret (base32) shown once, for manual entry
   *                     otpauthUrl:
   *                       type: string
   *                       description: otpauth:// URL to render as a QR code
   *                     recoveryCodes:
   *                       type: array
   *                       items:
   *                         type: string
   *       401:
   *         description: Not authenticated
   *       409:
   *         description: 2FA already enabled
   */
router.post(
  "/2fa/setup",
  authenticate,
  asyncHandler(setupTwoFactorController),
);

  /**
   * @openapi
   * /api/v1/auth/2fa/enable:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Enable 2FA
   *     description: Activates 2FA after the user confirms they can generate codes (setup must have been called). Verifies the TOTP code server-side before enabling.
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [code]
   *             properties:
   *               code:
   *                 type: string
   *                 description: Current TOTP code from the authenticator app
   *     responses:
   *       200:
   *         description: 2FA enabled
   *       400:
   *         description: Invalid code or setup not run
   *       401:
   *         description: Not authenticated
   *
   * /api/v1/auth/2fa/disable:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Disable 2FA
   *     description: Disables 2FA for the authenticated user. Requires a valid TOTP code or recovery code so a stolen session cannot strip protection. Clears the stored secret and all recovery codes.
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [code]
   *             properties:
   *               code:
   *                 type: string
   *                 description: TOTP code or recovery code
   *     responses:
   *       200:
   *         description: 2FA disabled
   *       400:
   *         description: Invalid code or 2FA not enabled
   *       401:
   *         description: Not authenticated
   *
   * /api/v1/auth/2fa/recovery-codes:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Regenerate recovery codes
   *     description: Rotates the single-use recovery codes. Requires a TOTP code (never a recovery code) so a lost authenticator cannot mint new codes. Old codes are invalidated immediately.
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [code]
   *             properties:
   *               code:
   *                 type: string
   *                 description: Current TOTP code from the authenticator app
   *     responses:
   *       200:
   *         description: Recovery codes regenerated
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
   *                     recoveryCodes:
   *                       type: array
   *                       items:
   *                         type: string
   *       400:
   *         description: Invalid code or 2FA not enabled
   *       401:
   *         description: Not authenticated
   */
router.post(
  "/2fa/enable",
  authenticate,
  validate(twoFactorCodeSchema),
  asyncHandler(enableTwoFactorController),
);

router.post(
  "/2fa/disable",
  authenticate,
  validate(twoFactorCodeSchema),
  asyncHandler(disableTwoFactorController),
);

router.post(
  "/2fa/recovery-codes",
  authenticate,
  validate(twoFactorCodeSchema),
  asyncHandler(regenerateRecoveryCodesController),
);

export default router;