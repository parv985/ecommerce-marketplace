import type { Response } from "express";

import { env } from "../config/env.js";

export const REFRESH_TOKEN_COOKIE = "refreshToken";

export const setRefreshTokenCookie = (
  res: Response,
  refreshToken: string,
): void => {
  res.cookie(
    REFRESH_TOKEN_COOKIE,
    refreshToken,
    {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite:
        env.NODE_ENV === "production"
          ? "strict"
          : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/v1/auth",
    },
  );
};

export const clearRefreshTokenCookie = (
  res: Response,
): void => {
  res.clearCookie(
    REFRESH_TOKEN_COOKIE,
    {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite:
        env.NODE_ENV === "production"
          ? "strict"
          : "lax",
      path: "/api/v1/auth",
    },
  );
};
