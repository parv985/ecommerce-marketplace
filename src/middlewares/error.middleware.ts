import type {
  ErrorRequestHandler,
  Request,
  Response,
} from "express";

import { AppError } from "../errors/AppError.js";
import { sendError } from "../utils/apiResponse.js";

export const errorMiddleware: ErrorRequestHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next,
): void => {
  console.error(error);

  if (error instanceof AppError) {
    sendError(
      res,
      error.message,
      error.code,
      error.statusCode,
    );

    return;
  }

  sendError(
    res,
    "Something went wrong",
    "INTERNAL_SERVER_ERROR",
    500,
  );
};