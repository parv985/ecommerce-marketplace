import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/apiResponse.js";
import { aiSearchSchema } from "./ai.schema.js";
import { searchProductsWithAI } from "./ai.service.js";

/**
 * Handles natural-language AI product search.
 * Supports both POST /api/v1/ai/search (JSON body { query }) and GET /api/v1/ai/search?q=...
 */
export const aiSearchProductsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const rawQuery = req.method === "POST" ? req.body.query : req.query.q || req.query.query;
  const rawLimit = req.method === "POST" ? req.body.limit : req.query.limit;

  const validated = aiSearchSchema.parse({
    query: rawQuery,
    limit: rawLimit,
  });

  const result = await searchProductsWithAI(validated.query, {
    limit: validated.limit,
  });

  sendSuccess(res, "AI search completed successfully", result);
};
