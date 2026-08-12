import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

import { AppError } from "../errors/AppError.js";

export const validate =
  (schema: ZodSchema) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(
        new AppError(
          "Validation failed",
          400,
          "VALIDATION_ERROR",
        ),
      );

      return;
    }

    req.body = result.data;
    next();
  };