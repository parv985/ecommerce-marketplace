import crypto from "node:crypto";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/*
 * AES-256-GCM at-rest encryption for TOTP secrets.
 *
 * The important contracts:
 *  - encrypt/decrypt round-trip (key + IV + auth tag + ciphertext);
 *  - payloads written by the previous implementation (no `v1:` marker,
 *    key = sha256(JWT_ACCESS_SECRET)) still decrypt;
 *  - a payload encrypted with different key material fails with a typed
 *    SecretCipherError that carries safe metadata only - never the
 *    plaintext and never key material.
 */

vi.hoisted(() => {
  process.env.MONGODB_URI =
    "mongodb://localhost:27017/ecommerce_marketplace_unit";
  process.env.JWT_ACCESS_SECRET =
    "unit-test-access-secret-unit-test-access-secret";
  process.env.JWT_REFRESH_SECRET =
    "unit-test-refresh-secret-unit-test-refresh-secret";
  process.env.CLOUDINARY_CLOUD_NAME = "unit-test";
  process.env.CLOUDINARY_API_KEY = "unit-test";
  process.env.CLOUDINARY_API_SECRET = "unit-test";
});

const SECRET = "JBSWY3DPEHPK3PXP";

/* env.ts validates process.env at import time, so re-import per case. */
const loadCipher = async (
  overrides: Record<string, string | undefined> = {},
) => {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  vi.resetModules();

  return await import("../../src/utils/secretCipher.js");
};

const legacyPayload = (
  plaintext: string,
  material: string,
): string => {
  const key = crypto
    .createHash("sha256")
    .update(material)
    .digest();

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
};

describe("secretCipher", () => {
  beforeEach(async () => {
    delete process.env.TOTP_ENCRYPTION_KEY;

    await loadCipher();
  });

  it("round-trips a secret through the versioned payload", async () => {
    const { encryptSecret, decryptSecret } =
      await loadCipher();

    const payload = encryptSecret(SECRET);
    const [version, ivB64, tagB64, dataB64] =
      payload.split(":");

    expect(version).toBe("v1");
    expect(
      Buffer.from(ivB64!, "base64"),
    ).toHaveLength(12);
    expect(
      Buffer.from(tagB64!, "base64"),
    ).toHaveLength(16);
    expect(
      Buffer.from(dataB64!, "base64").toString("utf8"),
    ).not.toContain(SECRET);
    expect(decryptSecret(payload)).toBe(SECRET);
  });

  it("still decrypts payloads written before the version marker existed", async () => {
    const { decryptSecret } = await loadCipher();

    const payload = legacyPayload(
      SECRET,
      process.env.JWT_ACCESS_SECRET!,
    );

    expect(payload.startsWith("v1:")).toBe(false);
    expect(decryptSecret(payload)).toBe(SECRET);
  });

  it("uses TOTP_ENCRYPTION_KEY for new payloads and still reads legacy rows", async () => {
    const dedicated =
      "dedicated-totp-encryption-key-0123456789-abcdef";

    const { encryptSecret, decryptSecret } =
      await loadCipher({
        TOTP_ENCRYPTION_KEY: dedicated,
      });

    const fresh = encryptSecret(SECRET);

    /* Encrypted with the dedicated key, not the legacy derivation. */
    expect(() =>
      decryptSecret(legacyPayload(SECRET, dedicated)),
    ).not.toThrow();
    expect(decryptSecret(fresh)).toBe(SECRET);

    /* A row encrypted with the legacy key keeps working. */
    expect(
      decryptSecret(
        legacyPayload(
          SECRET,
          process.env.JWT_ACCESS_SECRET!,
        ),
      ),
    ).toBe(SECRET);

    /* …and is not readable with the legacy key alone. */
    const { decryptSecret: legacyOnly } =
      await loadCipher({
        TOTP_ENCRYPTION_KEY: undefined,
      });

    expect(() => legacyOnly(fresh)).toThrow(
      expect.objectContaining({
        name: "SecretCipherError",
      }),
    );
  });

  it("reports a rotated key as an authentication failure with safe metadata only", async () => {
    const encryptedByTheOldKey = (
      await loadCipher()
    ).encryptSecret(SECRET);

    const { decryptSecret, SecretCipherError } =
      await loadCipher({
        JWT_ACCESS_SECRET:
          "rotated-access-secret-rotated-access-secret-rotated",
      });

    try {
      decryptSecret(encryptedByTheOldKey);
      expect.unreachable("decryption should have failed");
    } catch (error) {
      expect(error).toBeInstanceOf(SecretCipherError);

      const cipherError =
        error as InstanceType<typeof SecretCipherError>;

      expect(cipherError.reason).toBe(
        "AUTHENTICATION_FAILED",
      );
      expect(cipherError.metadata).toEqual({
        version: "v1",
        ivBytes: 12,
        authTagBytes: 16,
        ciphertextBytes: SECRET.length,
      });
      expect(cipherError.message).not.toContain(SECRET);
      expect(cipherError.message).not.toContain(
        "rotated-access-secret",
      );
    }
  });

  it("rejects a tampered ciphertext or auth tag", async () => {
    const { encryptSecret, decryptSecret } =
      await loadCipher();

    const payload = encryptSecret(SECRET);
    const [version, iv, tag, data] = payload.split(":");

    const flipped = Buffer.from(data!, "base64");
    flipped[0] = (flipped[0]! ^ 0x01) & 0xff;

    expect(() =>
      decryptSecret(
        [version, iv, tag, flipped.toString("base64")].join(
          ":",
        ),
      ),
    ).toThrow(/authenticated/i);

    const tamperedTag = Buffer.from(tag!, "base64");
    tamperedTag[0] = (tamperedTag[0]! ^ 0x01) & 0xff;

    expect(() =>
      decryptSecret(
        [version, iv, tamperedTag.toString("base64"), data].join(
          ":",
        ),
      ),
    ).toThrow(/authenticated/i);
  });

  it("rejects malformed payloads without leaking anything", async () => {
    const { decryptSecret } = await loadCipher();

    for (const bad of ["", "not-a-payload", "a:b", "v1:a:b:c:d"]) {
      try {
        decryptSecret(bad);
        expect.unreachable("malformed payload should throw");
      } catch (error) {
        expect(
          (error as Error).name,
        ).toBe("SecretCipherError");
      }
    }
  });

  it("treats an empty TOTP_ENCRYPTION_KEY as not configured", async () => {
    for (const blank of ["", "   "]) {
      const { encryptSecret, decryptSecret, describeEncryptionKeys } =
        await loadCipher({ TOTP_ENCRYPTION_KEY: blank });

      const payload = encryptSecret(SECRET);

      /* Still readable with the legacy derivation, no key id for a blank value. */
      expect(decryptSecret(payload)).toBe(SECRET);
      expect(describeEncryptionKeys()).toMatch(
        /^JWT_ACCESS_SECRET\[keyId=[0-9a-f]{8}\]$/,
      );
    }
  });

  it("refuses to boot with a too-short TOTP_ENCRYPTION_KEY", async () => {
    await expect(
      loadCipher({ TOTP_ENCRYPTION_KEY: "too-short" }),
    ).rejects.toThrow(/TOTP_ENCRYPTION_KEY/);
  });

  it("describes the payload and key source without values", async () => {
    const {
      encryptSecret,
      describeSecretPayload,
      describeEncryptionKeys,
    } = await loadCipher();

    const payload = encryptSecret(SECRET);
    const description = describeSecretPayload(payload);

    expect(description).toEqual({
      version: "v1",
      ivBytes: 12,
      authTagBytes: 16,
      ciphertextBytes: SECRET.length,
    });
    expect(
      JSON.stringify(description),
    ).not.toContain(SECRET);
    expect(describeSecretPayload("junk")).toBeNull();

    expect(describeEncryptionKeys()).toMatch(
      /^JWT_ACCESS_SECRET\[keyId=[0-9a-f]{8}\]$/,
    );

    const { describeEncryptionKeys: withDedicated } =
      await loadCipher({
        TOTP_ENCRYPTION_KEY:
          "dedicated-totp-encryption-key-0123456789-abcdef",
      });

    expect(withDedicated()).toMatch(
      /^TOTP_ENCRYPTION_KEY\[keyId=[0-9a-f]{8}\] -> JWT_ACCESS_SECRET\[keyId=[0-9a-f]{8}\]$/,
    );
  });
});
