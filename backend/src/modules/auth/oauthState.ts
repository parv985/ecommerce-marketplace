import crypto from "node:crypto";

import { env } from "../../config/env.js";
import { OAUTH_STATE_TTL_MS } from "../../constants/cookies.js";

/*
 * OAuth 2.0 `state` handling.
 *
 * The value is an HMAC-signed, expiring payload so the callback can
 * (a) prove the response belongs to a request this server issued,
 * (b) prove it belongs to the same browser (compared against the
 *     httpOnly `oauth_state` cookie set when the flow started), and
 * (c) carry the frontend path the user should land on after sign-in.
 *
 * Signing with JWT_ACCESS_SECRET means a third party cannot forge a
 * state value, and the cookie comparison blocks login-CSRF (an attacker
 * cannot make a victim finish a flow the attacker started).
 */

interface OAuthStatePayload {
  nonce: string;
  to?: string;
  exp: number;
}

const encoder = new TextEncoder();

const encode = (value: string): string =>
  Buffer.from(value, "utf8").toString("base64url");

const sign = (body: string): string =>
  crypto
    .createHmac("sha256", encoder.encode(env.JWT_ACCESS_SECRET))
    .update(body)
    .digest("base64url");

/**
 * Keeps only safe, same-origin frontend paths: `/products`, `/orders/1`.
 * Anything absolute (`https://evil.tld`), protocol-relative (`//evil.tld`)
 * or scheme-like is dropped so `state` can never become an open redirect.
 */
const sanitizeReturnPath = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;

  const path = value.trim();

  if (!path.startsWith("/")) return undefined;
  if (path.startsWith("//")) return undefined;
  if (path.includes("\\")) return undefined;
  if (path.length > 300) return undefined;

  return path;
};

export const createOAuthState = (to?: unknown): string => {
  const returnTo = sanitizeReturnPath(to);

  const payload: OAuthStatePayload = {
    nonce: crypto.randomBytes(16).toString("base64url"),
    exp: Date.now() + OAUTH_STATE_TTL_MS,
  };

  if (returnTo) {
    payload.to = returnTo;
  }

  const body = encode(JSON.stringify(payload));

  return `${body}.${sign(body)}`;
};

export type OAuthStateResult =
  { ok: true; to?: string } | { ok: false; reason: string };

const safeEqual = (a: string, b: string): boolean => {
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  if (bufA.length !== bufB.length) return false;

  return crypto.timingSafeEqual(bufA, bufB);
};

export const verifyOAuthState = (
  token: unknown,
  cookie: unknown,
): OAuthStateResult => {
  if (typeof token !== "string" || token === "") {
    return { ok: false, reason: "MISSING_STATE" };
  }

  if (typeof cookie !== "string" || cookie === "") {
    return { ok: false, reason: "MISSING_STATE_COOKIE" };
  }

  if (!safeEqual(token, cookie)) {
    return { ok: false, reason: "STATE_MISMATCH" };
  }

  const [body, signature] = token.split(".");

  if (!body || !signature) {
    return { ok: false, reason: "INVALID_STATE" };
  }

  if (!safeEqual(signature, sign(body))) {
    return { ok: false, reason: "INVALID_STATE" };
  }

  let payload: OAuthStatePayload;

  try {
    payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as OAuthStatePayload;
  } catch {
    return { ok: false, reason: "INVALID_STATE" };
  }

  if (typeof payload.exp !== "number" || payload.exp < Date.now()) {
    return { ok: false, reason: "STATE_EXPIRED" };
  }

  const to = sanitizeReturnPath(payload.to);

  return to ? { ok: true, to } : { ok: true };
};
