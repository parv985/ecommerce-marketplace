import type { Response } from "express";

import { env } from "../config/env.js";

export const REFRESH_TOKEN_COOKIE = "refreshToken";

/**
 * Short-lived cookie that binds a Google OAuth attempt to the browser
 * that started it (CSRF / login-CSRF protection). It is always
 * SameSite=Lax: Google redirects back with a top-level GET navigation,
 * which is exactly the case where Lax cookies are still sent.
 */
export const OAUTH_STATE_COOKIE = "oauth_state";

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const isSecureCookie = (): boolean => env.NODE_ENV === "production";

/*
 * The refresh cookie has to survive cross-origin calls from the
 * deployed frontend to the deployed backend, so production defaults to
 * SameSite=None. Browsers refuse SameSite=None without Secure, so fall
 * back to Lax rather than emitting a cookie that is silently dropped.
 */
const resolveSameSite = (): "strict" | "lax" | "none" => {
  const configured =
    env.COOKIE_SAME_SITE ?? (env.NODE_ENV === "production" ? "none" : "lax");

  if (configured === "none" && !isSecureCookie()) {
    return "lax";
  }

  return configured;
};

const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: isSecureCookie(),
  sameSite: resolveSameSite(),
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/api/v1/auth",
});

export const setRefreshTokenCookie = (
  res: Response,
  refreshToken: string,
): void => {
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, refreshCookieOptions());
};

export const clearRefreshTokenCookie = (res: Response): void => {
  const { maxAge: _maxAge, ...options } = refreshCookieOptions();

  res.clearCookie(REFRESH_TOKEN_COOKIE, options);
};

export const setOAuthStateCookie = (res: Response, state: string): void => {
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    maxAge: OAUTH_STATE_TTL_MS,
    path: "/api/v1/auth",
  });
};

export const clearOAuthStateCookie = (res: Response): void => {
  res.clearCookie(OAUTH_STATE_COOKIE, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/api/v1/auth",
  });
};
