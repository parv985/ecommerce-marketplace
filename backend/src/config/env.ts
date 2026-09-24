import { existsSync } from "node:fs";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/*
 * Resolve the backend's .env from this module's location instead of relying
 * on process.cwd(). Check both the backend folder (../../.env) and the repo
 * root (../../../.env) so starting from any directory or running tools loads
 * the environment variables correctly.
 */
const backendEnvPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../.env",
);
const rootEnvPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.env",
);

if (existsSync(rootEnvPath)) {
  config({ path: rootEnvPath, quiet: true });
}
if (existsSync(backendEnvPath)) {
  config({ path: backendEnvPath, quiet: true, override: true });
}

/*
 * An empty value — a blank row in a deployment dashboard, a stale
 * local .env entry, or an exported-but-empty shell variable — means
 * "unset": drop it before validation so optional fields fall back to
 * their defaults (e.g. PORT -> 5000) and required fields fail with
 * their own clear message instead of a cryptic coercion error
 * ("PORT: Too small: expected number to be >0"). dotenv cannot help
 * here because a set-but-empty process.env variable is still *set*.
 */
const normalizeEmptyEnv = (source: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const normalized: NodeJS.ProcessEnv = { ...source };

  for (const [key, value] of Object.entries(normalized)) {
    if (value !== undefined && value.trim() === "") {
      delete normalized[key];
    }
  }

  return normalized;
};

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(5000),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  // Comma-separated list is allowed (production + preview origins).
  CORS_ORIGIN: z
    .string()
    .min(1)
    .default(
      "https://ecommerce-marketplace-coqps6dxb-parvkaneriya47-9168s-projects.vercel.app, http://localhost:5173, http://localhost:3000, http://127.0.0.1:3000",
    ),

  CLIENT_URL: z.string().min(1).default("http://localhost:3000"),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),

  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),

  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  /*
   * Dedicated key material for encrypting TOTP secrets at rest (see
   * src/utils/secretCipher.ts). Optional: when it is unset the legacy
   * derivation sha256(JWT_ACCESS_SECRET) is used, which is what every
   * stored secret predates. Set it to decouple 2FA secrets from JWT
   * rotation; secrets stored with the legacy key stay readable either
   * way (decryption tries both), so enabling it is a zero-downtime,
   * zero-lockout change. Generate with:
   *   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   */
  TOTP_ENCRYPTION_KEY: z
    .string()
    .optional()
    .transform((value) =>
      value && value.trim().length > 0 ? value : undefined,
    )
    .pipe(
      /*
       * An empty value in .env means "not configured", exactly like the
       * other optional variables; anything else must be a real key, so a
       * half-filled .env fails at boot instead of silently protecting
       * secrets with a weak key.
       */
      z
        .string()
        .min(32, "TOTP_ENCRYPTION_KEY must be at least 32 characters")
        .optional(),
    ),

  /*
   * Google OAuth 2.0. Optional at the schema level so the API still
   * boots (and email/password auth keeps working) when Google sign-in
   * is not configured - the auth routes answer with a clear
   * GOOGLE_OAUTH_NOT_CONFIGURED error instead of crashing at import
   * time. GOOGLE_REDIRECT_URI must be an absolute URL that ends in
   * /api/v1/auth/google/callback and must be listed verbatim in the
   * Google Cloud console ("Authorized redirect URIs").
   */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),

  /*
   * SameSite policy for the refresh-token cookie. Defaults to "lax"
   * outside production and "none" in production, because the deployed
   * frontend and backend live on different origins (Render static site
   * + Render web service) and a Strict/Lax cookie would never be sent
   * with the cross-origin POST /auth/refresh call, silently logging
   * users out when the access token expires. "none" requires https,
   * which production already enforces via `secure`.
   */
  COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).optional(),

  /*
   * Razorpay. When the key id/secret are unset the payment gateway
   * runs in deterministic MOCK mode (no real money, dev/test only).
   */
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  /* Cloudinary */
  CLOUDINARY_CLOUD_NAME: z.string().min(1, "CLOUDINARY_CLOUD_NAME is required"),
  CLOUDINARY_API_KEY: z.string().min(1, "CLOUDINARY_API_KEY is required"),
  CLOUDINARY_API_SECRET: z.string().min(1, "CLOUDINARY_API_SECRET is required"),

  /* SMTP Email Configuration */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_SECURE: z.string().optional().default("false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  /* Redis (optional) */
  REDIS_URL: z.string().optional(),
});
export const env = envSchema.parse(normalizeEmptyEnv(process.env));

/**
 * CORS_ORIGIN accepts a comma-separated list so a deployment can allow
 * both its production frontend and a preview/staging origin without
 * code changes (Render preview URLs, a Netlify preview, etc.).
 */
export const corsOrigins: string[] = Array.from(
  new Set([
    ...env.CORS_ORIGIN.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    env.CLIENT_URL.trim(),
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]),
);
