import crypto from "node:crypto";

/*
 * Minimal RFC 6238 TOTP implementation (Google Authenticator
 * compatible): HMAC-SHA1, 30-second step, 6 digits. Implemented with
 * node:crypto so no external dependency is required.
 */

const BASE32_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const base32Decode = (
  input: string,
): Buffer => {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-=]/g, "");

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);

    if (index === -1) {
      throw new Error(
        "Invalid base32 character",
      );
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push(
        (value >> (bits - 8)) & 0xff,
      );
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
};

const base32Encode = (
  input: Buffer,
): string => {
  let output = "";
  let bits = 0;
  let value = 0;

  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output +=
        BASE32_ALPHABET[
          (value >> (bits - 5)) & 0x1f
        ];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output +=
      BASE32_ALPHABET[
        (value << (5 - bits)) & 0x1f
      ];
  }

  return output;
};

/*
 * Generates a new TOTP secret (20 random bytes, base32-encoded - the
 * format Google Authenticator expects for manual entry).
 */
export const generateTotpSecret = (): string =>
  base32Encode(crypto.randomBytes(20));

const hotp = (
  key: Buffer,
  counter: number,
): string => {
  const counterBuffer = Buffer.alloc(8);

  counterBuffer.writeBigUInt64BE(
    BigInt(counter),
  );

  const hmac = crypto.createHmac(
    "sha1",
    key,
  );

  hmac.update(counterBuffer);

  const digest = hmac.digest();

  const offset =
    (digest[digest.length - 1] ?? 0) & 0x0f;

  const b0 = digest[offset] ?? 0;
  const b1 = digest[offset + 1] ?? 0;
  const b2 = digest[offset + 2] ?? 0;
  const b3 = digest[offset + 3] ?? 0;

  const binary =
    ((b0 & 0x7f) << 24) |
    ((b1 & 0xff) << 16) |
    ((b2 & 0xff) << 8) |
    (b3 & 0xff);

  return String(binary % 1_000_000).padStart(
    6,
    "0",
  );
};

export const generateTotpCode = (
  secret: string,
  at: Date = new Date(),
): string => {
  const counter = Math.floor(
    at.getTime() / 1000 / 30,
  );

  return hotp(base32Decode(secret), counter);
};

/*
 * Verifies a 6-digit code allowing a window of +/-1 step (90 seconds)
 * to tolerate clock drift between the server and the authenticator
 * app.
 */
export const verifyTotpCode = (
  secret: string,
  code: string,
  window = 1,
): boolean => {
  const normalized = code.replace(/[\s-]/g, "");

  if (!/^\d{6}$/.test(normalized)) {
    return false;
  }

  const current = Math.floor(
    Date.now() / 1000 / 30,
  );

  for (let step = -window; step <= window; step += 1) {
    const candidate = hotp(
      base32Decode(secret),
      current + step,
    );

    if (
      crypto.timingSafeEqual(
        Buffer.from(candidate),
        Buffer.from(normalized),
      )
    ) {
      return true;
    }
  }

  return false;
};

export const buildOtpauthUrl = (
  secret: string,
  email: string,
  issuer = "E-Commerce Marketplace",
): string =>
  `otpauth://totp/${encodeURIComponent(
    issuer,
  )}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(
    issuer,
  )}&algorithm=SHA1&digits=6&period=30`;
