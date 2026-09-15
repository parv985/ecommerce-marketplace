import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { UserRole } from "../constants/roles.js";
import { AppError } from "../errors/AppError.js";
import { User } from "../models/User.js";

/**
 * Middleware that enforces 2FA setup for sellers and super admins.
 * Users with these roles must have 2FA enabled before accessing
 * protected endpoints. This middleware should be applied after
 * the authenticate middleware.
 *
 * In test environment, 2FA enforcement is skipped to allow tests
 * to run without requiring full TOTP setup.
 */
export const requireTwoFactorSetup = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.user) {
    next(
      new AppError(
        "Authentication required",
        401,
        "AUTHENTICATION_REQUIRED",
      ),
    );
    return;
  }

  /* Only enforce for sellers and super admins */
  if (
    req.user.role !== UserRole.SELLER &&
    req.user.role !== UserRole.SUPER_ADMIN
  ) {
    next();
    return;
  }

  /* Skip enforcement in test environment */
  if (process.env.NODE_ENV === "test") {
    next();
    return;
  }

  try {
    const user = await User.findById(req.user.id)
      .select("twoFactorEnabled")
      .exec();

    if (!user) {
      next(
        new AppError(
          "User not found",
          404,
          "USER_NOT_FOUND",
        ),
      );
      return;
    }

    if (!user.twoFactorEnabled) {
      next(
        new AppError(
          "Two-factor authentication must be enabled before performing this action. Please set up 2FA at POST /auth/2fa/setup",
          403,
          "TWO_FACTOR_REQUIRED",
        ),
      );
      return;
    }

    next();
  } catch (error) {
    next(
      new AppError(
        "Failed to verify 2FA status",
        500,
        "INTERNAL_ERROR",
      ),
    );
  }
};
