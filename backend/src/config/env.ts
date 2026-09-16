import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/*
 * Resolve the backend's .env from this module's location instead of relying
 * on process.cwd(). dotenv/config only checks the current working directory,
 * which means starting the backend from another directory can leave every
 * file-based variable undefined. config() is synchronous, so envSchema.parse
 * below always runs after the file has been loaded.
 */
const envFilePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../.env",
);
config({ path: envFilePath, quiet: true });

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(5000),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  // Comma-separated list is allowed (production + preview origins).
  CORS_ORIGIN: z.string().min(1).default("https://ecommerce-marketplace-coqps6dxb-parvkaneriya47-9168s-projects.vercel.app, http://localhost:5173"),

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
  COOKIE_SAME_SITE: z
    .enum(["strict", "lax", "none"])
    .optional(),

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
export const env = envSchema.parse(process.env);

/**
 * CORS_ORIGIN accepts a comma-separated list so a deployment can allow
 * both its production frontend and a preview/staging origin without
 * code changes (Render preview URLs, a Netlify preview, etc.).
 */
export const corsOrigins: string[] = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);
