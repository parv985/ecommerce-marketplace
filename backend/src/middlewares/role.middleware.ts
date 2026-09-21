import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { UserRole } from "../constants/roles.js";
import { AppError } from "../errors/AppError.js";

export const authorize = (
  ...allowedRoles: (UserRole | string)[]
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

    const userRole = String(req.user.role || "").toUpperCase();
    const isSuperAdmin =
      userRole === UserRole.SUPER_ADMIN ||
      userRole === "ADMIN" ||
      userRole === "SUPERADMIN";

    const isAllowed =
      allowedRoles.length === 0 ||
      allowedRoles.some((role) => {
        const normalizedAllowed = String(role).toUpperCase();
        if (
          normalizedAllowed === UserRole.SUPER_ADMIN ||
          normalizedAllowed === "ADMIN" ||
          normalizedAllowed === "SUPERADMIN"
        ) {
          return isSuperAdmin;
        }
        return normalizedAllowed === userRole;
      });

    if (!isAllowed) {
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