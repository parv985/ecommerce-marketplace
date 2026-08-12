import { Router } from "express";
import { sendSuccess } from "../utils/apiResponse.js";

const router = Router();

router.get("/health", (_req, res) => {
  return sendSuccess(
    res,
    "API is healthy",
    {
      status: "UP",
      timestamp: new Date().toISOString(),
    },
  );
});

export default router;