import { Router } from "express";

import { sendSuccess } from "../utils/apiResponse.js";
import authRoutes from "../modules/auth/auth.routes.js";

const router = Router();

router.get("/health", (_req, res) => {
  return sendSuccess(res, "API is healthy", {
    status: "UP",
    timestamp: new Date().toISOString(),
  });
});

router.use("/auth", authRoutes);

export default router;