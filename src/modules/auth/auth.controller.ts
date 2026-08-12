import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/apiResponse.js";
import { clearRefreshTokenCookie, setRefreshTokenCookie } from "../../constants/cookies.js";
import {
  forgotPassword,
  resetPassword,
} from "./auth.service.js";

import {
  loginUser,
  logoutUser,
  registerUser,
} from "./auth.service.js";
export const refresh = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const refreshToken = req.cookies?.refreshToken;
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
    console.log("[CONTROLLER] forgotPasswordController called");
    try {
      await forgotPassword(req.body);
      console.log("[CONTROLLER] forgotPassword completed successfully");
    } catch (error) {
      console.error("[CONTROLLER] forgotPassword error:", error);
      throw error;
    }

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