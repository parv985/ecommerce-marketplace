import crypto from "node:crypto";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";

/*
 * POST /api/v1/auth/2fa/verify — the seller 2FA login step.
 *
 * These run without MongoDB (persistence is mocked, like the other unit
 * suites) and exercise the real Express app, so the contracts that used
 * to break with an unhandled 500 are pinned:
 *
 *   - a valid TOTP code completes the login and issues a session;
 *   - a stored secret encrypted with different key material (rotated
 *     JWT_ACCESS_SECRET, another environment sharing the database)
 *     answers 409 TWO_FACTOR_SECRET_UNREADABLE — never a 500, and never
 *     with crypto internals or key material in the body;
 *   - a stored secret that decrypts to garbage also fails closed (401),
 *     instead of crashing the request;
 *   - malformed requests, forged login tokens and wrong codes are 4xx.
 *
 * `tests/twofa.test.ts` covers the same paths against a real database.
 */

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI =
    "mongodb://localhost:27017/ecommerce_marketplace_unit";
  process.env.CLIENT_URL = "http://localhost:3000";
  process.env.JWT_ACCESS_SECRET =
    "unit-test-access-secret-unit-test-access-secret";
  process.env.JWT_REFRESH_SECRET =
    "unit-test-refresh-secret-unit-test-refresh-secret";
  process.env.CLOUDINARY_CLOUD_NAME = "unit-test";
  process.env.CLOUDINARY_API_KEY = "unit-test";
  process.env.CLOUDINARY_API_SECRET = "unit-test";
});

vi.mock("../../src/models/User.js", () => ({
  User: {
    findOne: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updateOne: vi.fn(async () => ({ modifiedCount: 0 })),
  },
}));

vi.mock("../../src/modules/auth/auth.repository.js", () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  findUserForAuth: vi.fn(),
  revokeAllRefreshTokensForUser: vi.fn(),
  findUserForTwoFactor: vi.fn(),
  createUser: vi.fn(),
  createRefreshToken: vi.fn(async () => ({})),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  createPasswordResetToken: vi.fn(),
  findPasswordResetToken: vi.fn(),
  markPasswordResetTokenUsed: vi.fn(),
}));

vi.mock("../../src/services/audit.service.js", () => ({
  logAudit: vi.fn(async () => {}),
}));

import app from "../../src/app.js";
import { encryptSecret } from "../../src/utils/secretCipher.js";
import { generateTotpCode } from "../../src/utils/totp.js";
import {
  generateTwoFactorToken,
} from "../../src/utils/jwt.js";
import { findUserForTwoFactor } from "../../src/modules/auth/auth.repository.js";

const USER_ID = "5f5b1b3b3b3b3b3b3b3b3b3b";
const SECRET = "JBSWY3DPEHPK3PXP";

/*
 * Same stored format, different key material: what a row written before
 * JWT_ACCESS_SECRET was rotated (or by another environment sharing the
 * database) contains.
 */
const encryptWithForeignKey = (
  plaintext: string,
  material: string,
): string => {
  const key = crypto
    .createHash("sha256")
    .update(material)
    .digest();

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    key,
    iv,
  );

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

const userWithPayload = (
  payload: string | null,
) => ({
  _id: { toString: () => USER_ID },
  name: "Test Seller",
  email: "seller@test.com",
  role: "SELLER",
  isActive: true,
  isEmailVerified: true,
  avatarUrl: null,
  twoFactorEnabled: true,
  twoFactorSecretEncrypted: payload,
  recoveryCodes: [],
});

const loginTokenFor = (): string =>
  generateTwoFactorToken({
    userId: USER_ID,
    role: "SELLER",
    type: "2fa_pending",
  });

const findUserForTwoFactorMock =
  findUserForTwoFactor as unknown as ReturnType<
    typeof vi.fn
  >;

const post = (body: unknown) =>
  request(app).post("/api/v1/auth/2fa/verify").send(body as object);

describe("POST /api/v1/auth/2fa/verify", () => {
  beforeEach(() => {
    findUserForTwoFactorMock.mockReset();
  });

  it("completes the login with a valid TOTP code", async () => {
    findUserForTwoFactorMock.mockResolvedValue(
      userWithPayload(encryptSecret(SECRET)),
    );

    const res = await post({
      loginToken: loginTokenFor(),
      code: generateTotpCode(SECRET),
    });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.role).toBe("SELLER");
  });

  it("answers 409 (not 500) when the stored secret cannot be decrypted", async () => {
    findUserForTwoFactorMock.mockResolvedValue(
      userWithPayload(
        encryptWithForeignKey(
          SECRET,
          "key-material-this-process-does-not-have",
        ),
      ),
    );

    const res = await post({
      loginToken: loginTokenFor(),
      code: generateTotpCode(SECRET),
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe(
      "TWO_FACTOR_SECRET_UNREADABLE",
    );

    const body = JSON.stringify(res.body);

    expect(body).not.toContain(SECRET);
    expect(body).not.toContain("Unsupported state");
    expect(body).not.toContain("key-material-this-process");
    expect(body).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);
  });

  it("fails closed when the decrypted secret is not a valid base32 secret", async () => {
    findUserForTwoFactorMock.mockResolvedValue(
      userWithPayload(
        encryptSecret("not-a-base32-secret!!!"),
      ),
    );

    const res = await post({
      loginToken: loginTokenFor(),
      code: "123456",
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(
      "INVALID_TWO_FACTOR_CODE",
    );
  });

  it("rejects a wrong code with 401", async () => {
    findUserForTwoFactorMock.mockResolvedValue(
      userWithPayload(encryptSecret(SECRET)),
    );

    const res = await post({
      loginToken: loginTokenFor(),
      code: "000000",
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(
      "INVALID_TWO_FACTOR_CODE",
    );
  });

  it("rejects a forged or foreign login token with 401", async () => {
    findUserForTwoFactorMock.mockResolvedValue(
      userWithPayload(encryptSecret(SECRET)),
    );

    const garbage = await post({
      loginToken: "not-a-jwt",
      code: generateTotpCode(SECRET),
    });

    expect(garbage.status).toBe(401);
    expect(garbage.body.code).toBe(
      "INVALID_LOGIN_TOKEN",
    );

    const accessTokenUsedAsLoginToken = await post({
      loginToken: `${loginTokenFor()}tampered`,
      code: generateTotpCode(SECRET),
    });

    expect(accessTokenUsedAsLoginToken.status).toBe(401);
    expect(
      accessTokenUsedAsLoginToken.body.code,
    ).toBe("INVALID_LOGIN_TOKEN");
  });

  it("rejects malformed bodies with 400 before touching any secret", async () => {
    const missingCode = await post({
      loginToken: loginTokenFor(),
    });

    expect(missingCode.status).toBe(400);
    expect(missingCode.body.code).toBe(
      "VALIDATION_ERROR",
    );

    const blankCode = await post({
      loginToken: loginTokenFor(),
      code: "   ",
    });

    expect(blankCode.status).toBe(400);

    const missingToken = await post({
      code: "123456",
    });

    expect(missingToken.status).toBe(400);

    const extraField = await post({
      loginToken: loginTokenFor(),
      code: "123456",
      userId: USER_ID,
    });

    expect(extraField.status).toBe(400);

    expect(
      findUserForTwoFactorMock,
    ).not.toHaveBeenCalled();
  });

  it("rejects a valid token for a user with 2FA switched off", async () => {
    findUserForTwoFactorMock.mockResolvedValue({
      ...userWithPayload(null),
      twoFactorEnabled: false,
    });

    const res = await post({
      loginToken: loginTokenFor(),
      code: "123456",
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(
      "TWO_FACTOR_NOT_ENABLED",
    );
  });
});
