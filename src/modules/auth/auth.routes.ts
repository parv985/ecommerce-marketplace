import { Router } from "express";

import { validate } from "../../middlewares/validation.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";


import {
  forgotPasswordController,
  resetPasswordController,
  login,
  logout,
  refresh,
  register,
} from "./auth.controller.js";

import {
  forgotPasswordSchema,
  resetPasswordSchema,
  loginSchema,
  registerSchema,
} from "./auth.schema.js";

const router = Router();

router.post(
  "/register",
  validate(registerSchema),
  asyncHandler(register),
);

router.post(
  "/login",
  validate(loginSchema),
  asyncHandler(login),
);

router.post(
  "/refresh",
  asyncHandler(refresh),
);
router.post(
  "/logout",
  asyncHandler(logout),
);
router.post(
  "/forgot-password",
  validate(forgotPasswordSchema),
  asyncHandler(forgotPasswordController),
);

router.post(
  "/reset-password",
  validate(resetPasswordSchema),
  asyncHandler(resetPasswordController),
);

export default router;