import type { Request, Response } from "express";
import { sendError } from "../utils/apiResponse.js";

export const notFoundMiddleware = (
  req: Request,
  res: Response,
): Response => {
  return sendError(
    res,
    `Route ${req.method} ${req.originalUrl} not found`,
    "ROUTE_NOT_FOUND",
    404,
  );
};