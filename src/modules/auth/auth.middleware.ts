import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { AppError } from "../../errors/AppError.js";
import { verifyAccessToken } from "../../utils/jwt.js";
import { findUserForAuth } from "./auth.repository.js";

/*
 * Verifies the Bearer access token and re-loads the user from the
 * database on every request.
 *
 * Reloading the user (instead of trusting the JWT payload alone) is
 * what makes Super Admin deactivations take effect IMMEDIATELY:
 * a still-valid access token belonging to a deactivated account is
 * rejected with 403 ACCOUNT_INACTIVE on its very next request, with
 * no wait for token expiry and no page refresh required.
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const authorization =
    req.headers.authorization;

  if (!authorization) {
    next(
      new AppError(
        "Authentication required",
        401,
        "AUTHENTICATION_REQUIRED",
      ),
    );

    return;
  }

  const [scheme, token] =
    authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    next(
      new AppError(
        "Invalid authorization header",
        401,
        "INVALID_AUTHORIZATION_HEADER",
      ),
    );

    return;
  }

  let userId: string;

  try {
    const payload = verifyAccessToken(token);

    userId = payload.userId;
  } catch {
    next(
      new AppError(
        "Invalid or expired access token",
        401,
        "INVALID_ACCESS_TOKEN",
      ),
    );

    return;
  }

  try {
    const user = await findUserForAuth(
      userId,
    );

    if (!user) {
      next(
        new AppError(
          "Invalid or expired access token",
          401,
          "INVALID_ACCESS_TOKEN",
        ),
      );

      return;
    }

    /*
     * Inactive accounts (deactivated by a Super Admin) are blocked
     * from every authenticated action — selling, buying, cart,
     * wishlist, reviews, everything — until they are reactivated.
     */
    if (!user.isActive) {
      next(
        new AppError(
          "Your account is inactive",
          403,
          "ACCOUNT_INACTIVE",
        ),
      );

      return;
    }

    req.user = {
      id: userId,
      role: user.role,
      isActive: user.isActive,
    };

    next();
  } catch (error) {
    next(
      error instanceof AppError
        ? error
        : new AppError(
            "Failed to authenticate request",
            500,
            "INTERNAL_ERROR",
          ),
    );
  }
};
