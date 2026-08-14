import crypto from "node:crypto";

import type { Request, Response } from "express";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../errors/AppError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { clearRefreshTokenCookie, setRefreshTokenCookie } from "../../constants/cookies.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt.js";
import { hashToken } from "../../utils/tokenHash.js";
import {
  consumeRefreshToken,
  createRefreshToken,
  findUserById,
} from "./auth.repository.js";
import {
  forgotPassword,
  resetPassword,
} from "./auth.service.js";

import {
  loginUser,
  logoutUser,
  registerUser,
} from "./auth.service.js";
import { loginWithGoogle, handleGoogleCallback, getGoogleAuthUrl, getGoogleAuthorizationUrl } from "./google.service.js";
export { getGoogleAuthorizationUrl };

export const refresh = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    throw new AppError(
      "Refresh token is required",
      401,
      "INVALID_REFRESH_TOKEN",
    );
  }

  let payload;

  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    clearRefreshTokenCookie(res);

    throw new AppError(
      "Invalid or expired refresh token",
      401,
      "INVALID_REFRESH_TOKEN",
    );
  }

  /*
   * Refresh tokens are single-use: consuming the
   * stored token also revokes it (rotation).
   */
  const consumed = await consumeRefreshToken(
    hashToken(refreshToken),
  );

  if (!consumed) {
    clearRefreshTokenCookie(res);

    throw new AppError(
      "Invalid or expired refresh token",
      401,
      "INVALID_REFRESH_TOKEN",
    );
  }

  const user = await findUserById(
    payload.userId,
  );

  if (!user || !user.isActive) {
    clearRefreshTokenCookie(res);

    throw new AppError(
      "Invalid or expired refresh token",
      401,
      "INVALID_REFRESH_TOKEN",
    );
  }

  const tokenId = crypto.randomUUID();

  const accessToken = generateAccessToken({
    userId: user._id.toString(),
    role: user.role,
    type: "access",
  });

  const newRefreshToken = generateRefreshToken({
    userId: user._id.toString(),
    role: user.role,
    type: "refresh",
    tokenId,
  });

  await createRefreshToken({
    userId: user._id.toString(),
    tokenHash: hashToken(newRefreshToken),
    expiresAt: new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ),
  });

  setRefreshTokenCookie(res, newRefreshToken);

  sendSuccess(res, "Token refreshed successfully", {
    accessToken,
  });
};
export const register = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const user = await registerUser(req.body);

  sendSuccess(
    res,
    "User registered successfully",
    user,
    201,
  );
};

export const login = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const result = await loginUser(req.body);

  setRefreshTokenCookie(
    res,
    result.refreshToken,
  );

  sendSuccess(res, "Login successful", {
    accessToken: result.accessToken,
    user: result.user,
  });
};
export const logout = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const refreshToken = req.cookies.refreshToken;

  if (refreshToken) {
    await logoutUser(refreshToken);
  }

  clearRefreshTokenCookie(res);

  sendSuccess(
    res,
    "Logout successful",
    null,
  );
};
export const forgotPasswordController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    await forgotPassword(req.body);

    sendSuccess(
      res,
      "If an account exists with this email, a password reset email has been sent.",
      null,
    );
  };
export const resetPasswordController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    await resetPassword(req.body);

    sendSuccess(
      res,
      "Password reset successfully",
      null,
    );
  };

export const googleLogin = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const result = await loginWithGoogle(req.body.idToken);

  setRefreshTokenCookie(res, result.refreshToken);

  sendSuccess(res, "Google login successful", {
    accessToken: result.accessToken,
    user: result.user,
  });
};

export const googleRedirect = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const authUrl = getGoogleAuthUrl();
  res.redirect(authUrl);
};

const frontendUrl = env.CLIENT_URL;

const redirectToFrontend = (
  res: Response,
  path: string,
  params: Record<string, string> = {},
): void => {
  const url = new URL(path, frontendUrl);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  res.redirect(url.toString());
};

export const googleCallback = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { code } = req.query;

  if (typeof code !== "string" || code.trim() === "") {
    // No code in the URL (e.g. the callback was opened directly):
    // restart the flow by sending the user to Google's consent screen.
    res.redirect(getGoogleAuthUrl());

    return;
  }

  try {
    const result = await handleGoogleCallback(code);

    setRefreshTokenCookie(res, result.refreshToken);

    redirectToFrontend(res, "/auth/google/callback", {
      access_token: result.accessToken,
    });
  } catch (error) {
    if (error instanceof AppError) {
      redirectToFrontend(res, "/login", {
        error: error.code,
        message: error.message,
      });

      return;
    }

    logger.error("Google OAuth callback failed", error);

    redirectToFrontend(res, "/login", {
      error: "OAUTH_FAILED",
      message: "Google sign-in failed, please try again.",
    });
  }
};