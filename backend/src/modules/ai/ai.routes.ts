import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import { asyncHandler } from "../../utils/asyncHandler.js";
import { authenticate } from "../auth/auth.middleware.js";
import { authorize } from "../../middlewares/role.middleware.js";
import { UserRole } from "../../constants/roles.js";
import {
  aiChatController,
  aiSearchProductsController,
} from "./ai.controller.js";

const router = Router();

const aiChatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many AI assistant requests. Please wait a few moments before trying again.",
    code: "RATE_LIMITED",
  },
});

/**
 * @openapi
 * /api/v1/ai/search:
 *   post:
 *     tags:
 *       - AI
 *     summary: Natural-language AI product search
 *     description: Uses AI (Groq / semantic parser) to understand natural language shopping queries (e.g. "running shoes under ₹3000", "black shirt below 1500") and searches MongoDB for matching catalog products.
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

/**
 * @openapi
 * /api/v1/ai/chat:
 *   post:
 *     tags:
 *       - AI
 *     summary: Conversational NexCart AI Assistant
 *     description: Multi-turn conversational AI shopping assistant for authenticated buyers, grounded in MongoDB products, orders, and verified store policies.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 example: "Where is my order?"
 *               history:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *     responses:
 *       200:
 *         description: AI response generated with grounded data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Forbidden - Buyer account required
 */
router.post(
  "/chat",
  authenticate,
  authorize(UserRole.BUYER),
  aiChatLimiter,
  asyncHandler(aiChatController),
);

export default router;

