import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

import { AppError } from "../errors/AppError.js";

export type ValidationSource =
  | "body"
  | "query"
  | "params";

export const validate =
  (
    schema: ZodSchema,
    source: ValidationSource = "body",
  ) =>
  (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void => {
    const result = schema.safeParse(
      req[source],
    );

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

    /*
     * Only req.body is reassigned with parsed data. Express 5 exposes
     * req.query as a getter-only accessor (assignment throws) and
     * req.params is already populated by the router with raw strings.
     * Query/params consumers re-parse through the zod schema in the
     * service layer to obtain typed values.
     */
    if (source === "body") {
      req.body = result.data;
    }

    next();
  };
