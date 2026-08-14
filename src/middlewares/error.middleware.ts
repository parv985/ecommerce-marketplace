import { ZodError } from "zod";
import type {
  ErrorRequestHandler,
  Request,
  Response,
} from "express";

import { AppError } from "../errors/AppError.js";
import { logger } from "../config/logger.js";
import { sendError } from "../utils/apiResponse.js";

export const errorMiddleware: ErrorRequestHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next,
): void => {
  /*
   * Zod validation errors that escape a service layer are client
   * errors (400), never internal errors.
   */
  if (error instanceof ZodError) {
    sendError(
      res,
      "Validation failed",
      "VALIDATION_ERROR",
      400,
    );

    return;
  }

  if (error instanceof AppError) {
    sendError(
      res,
      error.message,
      error.code,
      error.statusCode,
    );

    return;
  }

  logger.error(
    "Unhandled error",
    error,
  );

  sendError(
    res,
    "Something went wrong",
    "INTERNAL_SERVER_ERROR",
    500,
  );
};