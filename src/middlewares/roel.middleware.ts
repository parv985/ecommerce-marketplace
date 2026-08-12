import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { UserRole } from "../constants/roles.js";
import { AppError } from "../errors/AppError.js";

export const authorize = (
  ...allowedRoles: UserRole[]
) => {
  return (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void => {
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

    if (!allowedRoles.includes(req.user.role)) {
      next(
        new AppError(
          "You do not have permission to perform this action",
          403,
          "FORBIDDEN",
        ),
      );

      return;
    }

    next();
  };
};