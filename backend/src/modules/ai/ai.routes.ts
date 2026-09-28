import { Router } from "express";

import { asyncHandler } from "../../utils/asyncHandler.js";
import { aiSearchProductsController } from "./ai.controller.js";

const router = Router();

/**
 * @openapi
 * /api/v1/ai/search:
 *   post:
 *     tags:
 *       - AI
 *     summary: Natural-language AI product search
 *     description: Uses Google Gemini to understand natural language shopping queries (e.g. "running shoes under ₹3000", "black shirt below 1500") and searches MongoDB for matching catalog products.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 example: "Show me comfortable running shoes under ₹3,000"
 *               limit:
 *                 type: integer
 *                 default: 20
 *     responses:
 *       200:
 *         description: Search completed with matching products
 *   get:
 *     tags:
 *       - AI
 *     summary: Natural-language AI product search (GET)
 *     description: Query via query parameter `q` (e.g. /api/v1/ai/search?q=running+shoes+under+3000)
 *     parameters:
 *       - name: q
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Search completed with matching products
 */
router.post("/search", asyncHandler(aiSearchProductsController));
router.get("/search", asyncHandler(aiSearchProductsController));

export default router;
