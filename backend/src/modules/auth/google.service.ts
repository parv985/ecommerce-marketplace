import crypto from "node:crypto";

import type { Request } from "express";
import { google } from "googleapis";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { UserRole } from "../../constants/roles.js";
import { AppError } from "../../errors/AppError.js";
import { User } from "../../models/User.js";
import { generateAccessToken, generateRefreshToken } from "../../utils/jwt.js";
import { hashToken } from "../../utils/tokenHash.js";
import { createRefreshToken } from "./auth.repository.js";

/*
 * ---------------------------------------------------------------------------
 * Google OAuth wiring
 * ---------------------------------------------------------------------------
 * The backend owns the whole server-side flow:
 *
 *   GET  /api/v1/auth/google            -> 302 to accounts.google.com
 *   Google                              -> 302 back to GOOGLE_REDIRECT_URI
 *   GET  /api/v1/auth/google/callback   -> code exchange, user upsert,
 *                                          302 to CLIENT_URL with a session
 *
 * The callback route is mounted exactly once
 * (`app.use("/api/v1", routes)` -> `router.use("/auth", authRoutes)` ->
 * `router.get("/google/callback")`), so the path the backend serves is
 * always `/api/v1/auth/google/callback`. GOOGLE_REDIRECT_URI must be that
 * same absolute URL and must be listed verbatim under "Authorized redirect
 * URIs" in the Google Cloud console - Google compares scheme, host, port
 * and path character by character.
 */

/** The single callback path this backend registers. */
export const GOOGLE_CALLBACK_PATH = "/api/v1/auth/google/callback";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export const isGoogleOAuthConfigured = (): boolean =>
  Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());

const missingConfigError = (): AppError =>
  new AppError(
    "Google sign-in is not configured on this server. Set GOOGLE_CLIENT_ID, " +
      "GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI in the backend environment " +
      "(never in the frontend).",
    503,
    "GOOGLE_OAUTH_NOT_CONFIGURED",
  );

/*
 * The OAuth2 client is created lazily so a deployment without Google
 * credentials still boots and keeps serving email/password auth. The
 * client is also created *without* a redirect URI: the redirect URI is
 * passed per call (`generateAuthUrl({ redirect_uri })`,
 * `getToken({ code, redirect_uri })`) so one shared client - and its
 * cached Google certificate bundle - is safe to reuse across requests.
 */
type GoogleOAuth2Client = InstanceType<typeof google.auth.OAuth2>;

let cachedClient: GoogleOAuth2Client | null = null;

const getGoogleClient = (): GoogleOAuth2Client => {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw missingConfigError();
  }

  if (!cachedClient) {
    cachedClient = new google.auth.OAuth2(clientId, clientSecret);
  }

  return cachedClient;
};

const parseConfiguredRedirectUri = (): URL | null => {
  const raw = env.GOOGLE_REDIRECT_URI?.trim();

  if (!raw) return null;

  try {
    const url = new URL(raw);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url;
  } catch {
    return null;
  }
};

/* One warning per distinct misconfigured value, not one per request. */
const warnedRedirectUris = new Set<string>();

const warnOnce = (key: string, message: string): void => {
  if (warnedRedirectUris.has(key)) return;

  warnedRedirectUris.add(key);
  logger.warn(message);
};

const requestOrigin = (req: Request): string | null => {
  const forwardedHost = req.get("x-forwarded-host");
  const host =
    (forwardedHost ? forwardedHost.split(",")[0]?.trim() : "") ||
    req.get("host");

  if (!host) return null;

  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();

  const protocol = forwardedProto || req.protocol || "http";

  return `${protocol}://${host}`;
};

/**
 * The redirect URI used for both halves of the flow (the value sent to
 * Google and the value sent back during the code exchange - they must be
 * identical).
 *
 * 1. GOOGLE_REDIRECT_URI wins when it is an absolute http(s) URL, because
 *    only a value that matches the Google Cloud console entry can work.
 * 2. When it is unset - or was set to a relative path, which Google cannot
 *    accept - the URI is derived from the incoming request, which is what
 *    makes the same build work on Render, a preview URL and localhost.
 */
export const resolveGoogleRedirectUri = (req?: Request): string => {
  const configured = parseConfiguredRedirectUri();

  if (configured) {
    const uri = configured.toString().replace(/\/$/, "");

    if (configured.pathname !== GOOGLE_CALLBACK_PATH) {
      warnOnce(
        uri,
        `GOOGLE_REDIRECT_URI is "${uri}" but this backend serves the callback at ` +
          `"${GOOGLE_CALLBACK_PATH}". Google will send the authorization code somewhere ` +
          `the API never receives (the usual symptom is a 404 on the frontend). ` +
          `Set GOOGLE_REDIRECT_URI to "<backend origin>${GOOGLE_CALLBACK_PATH}" and add ` +
          `that exact URL to the Google Cloud console.`,
      );
    }

    return uri;
  }

  if (env.GOOGLE_REDIRECT_URI?.trim()) {
    warnOnce(
      "invalid",
      `GOOGLE_REDIRECT_URI="${env.GOOGLE_REDIRECT_URI}" is not an absolute http(s) URL; ` +
        `deriving the callback URL from the request instead.`,
    );
  }

  const origin = req ? requestOrigin(req) : null;

  if (!origin) {
    throw new AppError(
      "Google sign-in is not configured: set GOOGLE_REDIRECT_URI to " +
        `"<backend origin>${GOOGLE_CALLBACK_PATH}".`,
      503,
      "GOOGLE_OAUTH_NOT_CONFIGURED",
    );
  }

  return `${origin}${GOOGLE_CALLBACK_PATH}`;
};

/** Human-readable summary logged at boot so misconfigurations are visible. */
export const describeGoogleOAuthConfig = (): string[] => {
  if (!isGoogleOAuthConfigured()) {
    return [
      "Google OAuth: DISABLED (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set). " +
        "Email/password authentication is unaffected.",
    ];
  }

  const configured = parseConfiguredRedirectUri();
  const lines = [
    `Google OAuth: ENABLED (client ${env.GOOGLE_CLIENT_ID})`,
    configured
      ? `Google OAuth redirect URI: ${configured.toString().replace(/\/$/, "")}`
      : "Google OAuth redirect URI: not configured - derived per request as " +
        `<request origin>${GOOGLE_CALLBACK_PATH}`,
    `Register this exact URL in Google Cloud > Credentials > Authorized redirect URIs: ` +
      `<backend origin>${GOOGLE_CALLBACK_PATH}`,
  ];

  if (configured && configured.pathname !== GOOGLE_CALLBACK_PATH) {
    lines.push(
      `WARNING: GOOGLE_REDIRECT_URI path "${configured.pathname}" does not match the ` +
        `route this backend registers ("${GOOGLE_CALLBACK_PATH}").`,
    );
  }

  return lines;
};

export const loginWithGoogle = async (idToken: string) => {
  if (!idToken) {
    throw new AppError("Google ID token is required", 400, "MISSING_TOKEN");
  }

  const clientId = env.GOOGLE_CLIENT_ID?.trim();

  if (!clientId) {
    throw missingConfigError();
  }

  let payload;
  try {
    const ticket = await getGoogleClient().verifyIdToken({
      idToken,
      audience: clientId,
    });
    payload = ticket.getPayload();
  } catch (error) {
    throw new AppError("Invalid Google ID token", 401, "INVALID_GOOGLE_TOKEN");
  }

  if (!payload || !payload.email) {
    throw new AppError(
      "Google token payload missing email",
      400,
      "INVALID_GOOGLE_PAYLOAD",
    );
  }

  const { email, sub: googleId, name, picture: avatar } = payload;

  let user = await User.findOne({
    $or: [{ googleId }, { email }],
  });

  const displayName: string = name || (email ? email.split("@")[0]! : "User");

  if (user) {
    if (!user.googleId) {
      user.googleId = googleId;
      user.authProvider = "GOOGLE";
    }
    if (avatar && !user.avatarUrl) {
      user.avatarUrl = avatar;
    }
    user.isEmailVerified = true;
    user.lastLoginAt = new Date();
    await user.save();
  } else {
    user = await User.create({
      name: displayName,
      email,
      googleId,
      authProvider: "GOOGLE",
      ...(avatar ? { avatarUrl: avatar } : {}),
      isEmailVerified: true,
      role: UserRole.BUYER,
      lastLoginAt: new Date(),
    });
  }

  if (!user.isActive) {
    throw new AppError("Your account is inactive", 403, "ACCOUNT_INACTIVE");
  }

  const tokenId = crypto.randomUUID();

  const accessToken = generateAccessToken({
    userId: user._id.toString(),
    role: user.role,
    type: "access",
  });

  const refreshToken = generateRefreshToken({
    userId: user._id.toString(),
    role: user.role,
    type: "refresh",
    tokenId,
  });

  const refreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await createRefreshToken({
    userId: user._id.toString(),
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshTokenExpiresAt,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      avatarUrl: user.avatarUrl ?? null,
      isActive: user.isActive,
    },
  };
};

export const handleGoogleCallback = async (
  code: string,
  redirectUri: string,
) => {
  if (!code) {
    throw new AppError("Authorization code is required", 400, "MISSING_CODE");
  }

  let tokens;
  try {
    const { tokens: googleTokens } = await getGoogleClient().getToken({
      code,
      /*
       * Must be byte-identical to the redirect_uri sent to Google in
       * the authorization request, otherwise Google rejects the
       * exchange with invalid_grant.
       */
      redirect_uri: redirectUri,
    });
    tokens = googleTokens;
  } catch (error) {
    throw new AppError(
      "Failed to exchange authorization code for tokens",
      401,
      "INVALID_AUTH_CODE",
    );
  }

  if (!tokens.id_token) {
    throw new AppError(
      "No ID token received from Google",
      400,
      "MISSING_ID_TOKEN",
    );
  }

  return loginWithGoogle(tokens.id_token);
};

export const getGoogleAuthUrl = (options: {
  redirectUri: string;
  state?: string;
}): string => {
  return getGoogleClient().generateAuthUrl({
    access_type: "offline",
    scope: GOOGLE_SCOPES,
    prompt: "consent",
    redirect_uri: options.redirectUri,
    ...(options.state ? { state: options.state } : {}),
  });
};

/*
 * Kept for backwards compatibility with anything that imported the
 * previous no-argument helper (e.g. tests or docs snippets).
 */
export const getGoogleAuthorizationUrl = (redirectUri?: string): string =>
  getGoogleAuthUrl({
    redirectUri: redirectUri ?? env.GOOGLE_REDIRECT_URI ?? "",
  });
