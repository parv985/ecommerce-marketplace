import crypto from "node:crypto";

import { env } from "../config/env.js";

/*
 * Encrypts small secrets (TOTP secrets) at rest with AES-256-GCM.
 *
 * The key is derived from JWT_ACCESS_SECRET, so no additional
 * environment variable is required. IMPORTANT: rotating
 * JWT_ACCESS_SECRET invalidates stored TOTP secrets - users would have
 * to re-enable 2FA. This trade-off is documented rather than adding a
 * second secret to manage.
 */

const deriveKey = (): Buffer =>
  crypto
    .createHash("sha256")
    .update(env.JWT_ACCESS_SECRET)
    .digest();

export const encryptSecret = (
  plaintext: string,
): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    deriveKey(),
    iv,
  );

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
};

export const decryptSecret = (
  payload: string,
): string => {
  const parts = payload.split(":");

  const ivB64 = parts[0];
  const tagB64 = parts[1];
  const dataB64 = parts[2];

  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error(
      "Invalid encrypted payload",
    );
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveKey(),
    Buffer.from(ivB64, "base64"),
  );

  decipher.setAuthTag(
    Buffer.from(tagB64, "base64"),
  );

  return Buffer.concat([
    decipher.update(
      Buffer.from(dataB64, "base64"),
    ),
    decipher.final(),
  ]).toString("utf8");
};
