import crypto from "node:crypto";

import { env } from "../config/env.js";

/*
 * Encrypts small secrets (TOTP secrets) at rest with AES-256-GCM.
 *
 * ---------------------------------------------------------------------
 * Payload format
 * ---------------------------------------------------------------------
 *   v1:<iv base64>:<auth tag base64>:<ciphertext base64>
 *
 *   - algorithm    : aes-256-gcm (authenticated encryption)
 *   - IV           : 12 random bytes per encryption (GCM-recommended size)
 *   - auth tag     : 16 bytes, produced by the cipher
 *   - version      : "v1" marker; rows written before the marker existed
 *                    are the same layout without it and keep working.
 *
 * ---------------------------------------------------------------------
 * Key material
 * ---------------------------------------------------------------------
 *   - TOTP_ENCRYPTION_KEY (preferred): dedicated key material, so rotating
 *     the JWT signing secrets no longer invalidates stored TOTP secrets.
 *   - JWT_ACCESS_SECRET (legacy fallback): the derivation used before
 *     TOTP_ENCRYPTION_KEY existed, sha256(JWT_ACCESS_SECRET).
 *
 * New payloads are encrypted with the dedicated key when it is configured.
 * Decryption tries the dedicated key and then the legacy derivation - the
 * GCM auth tag decides which one is right - so enabling the dedicated key
 * never locks out accounts whose secret was encrypted with the old one.
 * Both keys are always read from the same validated env object, so encrypt
 * and decrypt can never disagree within a process.
 */

const ALGORITHM = "aes-256-gcm";

const KEY_BYTES = 32;
const IV_BYTES = 12;

const PAYLOAD_VERSION = "v1";

export type SecretCipherFailureReason =
  "INVALID_PAYLOAD" | "KEY_UNAVAILABLE" | "AUTHENTICATION_FAILED";

/*
 * Non-sensitive description of a stored payload, safe to log. It never
 * contains the plaintext, the ciphertext bytes or any key material.
 */
export interface SecretPayloadMetadata {
  version: string | null;
  ivBytes: number;
  authTagBytes: number;
  ciphertextBytes: number;
}

/*
 * Raised when a stored secret cannot be read. Callers use `reason` to
 * distinguish "the row is malformed" from "the encryption key changed"
 * without ever seeing key material or plaintext.
 */
export class SecretCipherError extends Error {
  public readonly reason: SecretCipherFailureReason;
  public readonly metadata: SecretPayloadMetadata | null;

  constructor(
    reason: SecretCipherFailureReason,
    message: string,
    metadata: SecretPayloadMetadata | null = null,
  ) {
    super(message);

    this.name = "SecretCipherError";
    this.reason = reason;
    this.metadata = metadata;

    Error.captureStackTrace(this, this.constructor);
  }
}

interface SecretKey {
  /* Environment variable the key was derived from - a name, never a value. */
  readonly source: "TOTP_ENCRYPTION_KEY" | "JWT_ACCESS_SECRET";
  readonly bytes: Buffer;
}

/*
 * SHA-256 gives 32 bytes regardless of the length of the configured
 * secret, which is what aes-256 needs.
 */
const deriveKey = (material: string): Buffer =>
  crypto.createHash("sha256").update(material, "utf8").digest();

const candidateKeys = (): SecretKey[] => {
  const keys: SecretKey[] = [];

  if (env.TOTP_ENCRYPTION_KEY) {
    keys.push({
      source: "TOTP_ENCRYPTION_KEY",
      bytes: deriveKey(env.TOTP_ENCRYPTION_KEY),
    });
  }

  /*
   * Legacy derivation. Kept last so it is only ever reached when the
   * dedicated key does not authenticate the payload.
   */
  keys.push({
    source: "JWT_ACCESS_SECRET",
    bytes: deriveKey(env.JWT_ACCESS_SECRET),
  });

  return keys;
};

const primaryKey = (): SecretKey => {
  const [key] = candidateKeys();

  if (!key || key.bytes.length !== KEY_BYTES) {
    throw new SecretCipherError(
      "KEY_UNAVAILABLE",
      "No usable encryption key is configured for TOTP secrets",
    );
  }

  return key;
};

interface ParsedPayload {
  version: string | null;
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
  metadata: SecretPayloadMetadata;
}

const parsePayload = (payload: string): ParsedPayload => {
  const parts = payload.split(":");

  const hasVersion = parts[0] === PAYLOAD_VERSION;
  const segments = hasVersion ? parts.slice(1) : parts;

  const ivB64 = segments[0];
  const tagB64 = segments[1];
  const dataB64 = segments[2];

  if (segments.length !== 3 || !ivB64 || !tagB64 || dataB64 === undefined) {
    throw new SecretCipherError("INVALID_PAYLOAD", "Invalid encrypted payload");
  }

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(dataB64, "base64");

  const metadata: SecretPayloadMetadata = {
    version: hasVersion ? PAYLOAD_VERSION : null,
    ivBytes: iv.length,
    authTagBytes: authTag.length,
    ciphertextBytes: ciphertext.length,
  };

  if (iv.length === 0 || authTag.length === 0) {
    throw new SecretCipherError(
      "INVALID_PAYLOAD",
      "Invalid encrypted payload",
      metadata,
    );
  }

  return {
    version: metadata.version,
    iv,
    authTag,
    ciphertext,
    metadata,
  };
};

const openWithKey = (key: Buffer, payload: ParsedPayload): string => {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, payload.iv);

  decipher.setAuthTag(payload.authTag);

  return Buffer.concat([
    decipher.update(payload.ciphertext),
    decipher.final(),
  ]).toString("utf8");
};

export const encryptSecret = (plaintext: string): string => {
  const key = primaryKey();

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key.bytes, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    PAYLOAD_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
};

export const decryptSecret = (payload: string): string => {
  const parsed = parsePayload(payload);
  const keys = candidateKeys();

  for (const key of keys) {
    try {
      return openWithKey(key.bytes, parsed);
    } catch {
      /*
       * The GCM auth tag rejects a wrong key (or a tampered payload) at
       * decipher.final(); try the next candidate key.
       */
    }
  }

  throw new SecretCipherError(
    "AUTHENTICATION_FAILED",
    "Stored secret could not be authenticated with the configured encryption key",
    parsed.metadata,
  );
};

/*
 * Identifies a derived key without revealing it: the variable it comes
 * from plus 8 hex characters of a SHA-256 of the derived key. Safe to log,
 * and enough to tell from a log whether the key changed between the run
 * that encrypted a secret and the run that fails to decrypt it.
 */
const keyIdOf = (derivedKey: Buffer): string =>
  crypto
    .createHash("sha256")
    .update(derivedKey)
    .digest("hex")
    .slice(0, 8);

/*
 * Lists the configured keys in decryption order (the first one encrypts
 * new secrets). Contains variable names and key ids, never key values.
 */
export const describeEncryptionKeys = (): string => {
  const keys = candidateKeys();

  if (keys.length === 0) {
    return "none";
  }

  return keys
    .map((key) => `${key.source}[keyId=${keyIdOf(key.bytes)}]`)
    .join(" -> ");
};

/*
 * Safe, log-only description of a stored payload. Used by diagnostics so a
 * failure can be reported with lengths and the format version instead of
 * the secret itself.
 */
export const describeSecretPayload = (
  payload: string,
): SecretPayloadMetadata | null => {
  try {
    return parsePayload(payload).metadata;
  } catch {
    return null;
  }
};
