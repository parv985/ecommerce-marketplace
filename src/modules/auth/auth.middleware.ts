import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { AppError } from "../../errors/AppError.js";
import { verifyAccessToken } from "../../utils/jwt.js";

export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
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

  try {
    const payload = verifyAccessToken(token);

    req.user = {
      id: payload.userId,
      role: payload.role,
    };

    next();
  } catch {
    next(
      new AppError(
        "Invalid or expired access token",
        401,
        "INVALID_ACCESS_TOKEN",
      ),
    );
  }
};