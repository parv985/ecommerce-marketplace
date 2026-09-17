import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import crypto from "node:crypto";

import {
  api,
  clearDb,
  connect,
  createApprovedSeller,
  disconnect,
  login,
  registerUser,
} from "./helpers.js";
import { User } from "../src/models/User.js";
import {
  generateTotpCode,
  verifyTotpCode,
} from "../src/utils/totp.js";

/*
 * Builds a payload in the stored format but encrypted with key material
 * this process does not have - exactly what a row written before
 * JWT_ACCESS_SECRET was rotated (or by another environment sharing the
 * database) looks like.
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

describe("Two-factor authentication", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  it("round-trips TOTP codes and rejects wrong ones", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const code = generateTotpCode(secret);

    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpCode(secret, code)).toBe(
      true,
    );
    expect(verifyTotpCode(secret, "000000")).toBe(
      false,
    );
  });

  it("requires 2FA login for an enabled seller and completes it", async () => {
    const seller = await createApprovedSeller();

    const setup = await api
      .post("/api/v1/auth/2fa/setup")
      .set(
        "Authorization",
        `Bearer ${seller.token}`,
      );

    expect(setup.status).toBe(200);
    expect(setup.body.data.secret).toMatch(
      /^[A-Z2-7]{16,}$/,
    );
    expect(setup.body.data.otpauthUrl).toMatch(
      /^otpauth:\/\/totp\//,
    );
    expect(setup.body.data.recoveryCodes).toHaveLength(
      8,
    );

    const secret = setup.body.data.secret;
    const enable = await api
      .post("/api/v1/auth/2fa/enable")
      .set(
        "Authorization",
        `Bearer ${seller.token}`,
      )
      .send({
        code: generateTotpCode(secret),
      });

    expect(enable.status).toBe(200);
    expect(enable.body.data.enabled).toBe(true);

    // Login now requires the second step.
    const loginRes = await api
      .post("/api/v1/auth/login")
      .send({
        email: seller.email,
        password: "Password123!",
      });

    expect(loginRes.status).toBe(200);
    expect(
      loginRes.body.data.twoFactorRequired,
    ).toBe(true);
    expect(loginRes.body.data.accessToken).toBe(
      undefined,
    );
    expect(
      loginRes.body.data.loginToken,
    ).toBeTruthy();

    const loginToken =
      loginRes.body.data.loginToken;

    // Wrong code is rejected.
    const wrong = await api
      .post("/api/v1/auth/2fa/verify")
      .send({
        loginToken,
        code: "000000",
      });

    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe(
      "INVALID_TWO_FACTOR_CODE",
    );

    // Correct TOTP code completes the login.
    const verified = await api
      .post("/api/v1/auth/2fa/verify")
      .send({
        loginToken,
        code: generateTotpCode(secret),
      });

    expect(verified.status).toBe(200);
    expect(
      verified.body.data.accessToken,
    ).toBeTruthy();

    const me = await api
      .get("/api/v1/users/me")
      .set(
        "Authorization",
        `Bearer ${verified.body.data.accessToken}`,
      );

    expect(me.status).toBe(200);
  });

  it("lets recovery codes complete login exactly once", async () => {
    const seller = await createApprovedSeller();

    const setup = await api
      .post("/api/v1/auth/2fa/setup")
      .set(
        "Authorization",
        `Bearer ${seller.token}`,
      );
    const secret = setup.body.data.secret;
    const recoveryCode =
      setup.body.data.recoveryCodes[0];

    await api
      .post("/api/v1/auth/2fa/enable")
      .set(
        "Authorization",
        `Bearer ${seller.token}`,
      )
      .send({ code: generateTotpCode(secret) });

    const loginRes = await api
      .post("/api/v1/auth/login")
      .send({
        email: seller.email,
        password: "Password123!",
      });
    const loginToken =
      loginRes.body.data.loginToken;

    const first = await api
      .post("/api/v1/auth/2fa/verify")
      .send({ loginToken, code: recoveryCode });

    expect(first.status).toBe(200);
    expect(first.body.data.accessToken).toBeTruthy();

    // The same recovery code must not work again.
    const loginRes2 = await api
      .post("/api/v1/auth/login")
      .send({
        email: seller.email,
        password: "Password123!",
      });
    const second = await api
      .post("/api/v1/auth/2fa/verify")
      .send({
        loginToken: loginRes2.body.data.loginToken,
        code: recoveryCode,
      });

    expect(second.status).toBe(401);
  });

  it("disables 2FA only with a valid code, restoring direct login", async () => {
    const seller = await createApprovedSeller();

    const setup = await api
      .post("/api/v1/auth/2fa/setup")
      .set(
        "Authorization",
        `Bearer ${seller.token}`,
      );
    const secret = setup.body.data.secret;

    await api
      .post("/api/v1/auth/2fa/enable")
      .set(
        "Authorization",
        `Bearer ${seller.token}`,
      )
      .send({ code: generateTotpCode(secret) });

    const badDisable = await api
      .post("/api/v1/auth/2fa/disable")
      .set(
        "Authorization",
        `Bearer ${seller.token}`,
      )
      .send({ code: "123456" });

    expect(badDisable.status).toBe(400);

    const disable = await api
      .post("/api/v1/auth/2fa/disable")
      .set(
        "Authorization",
        `Bearer ${seller.token}`,
      )
      .send({ code: generateTotpCode(secret) });

    expect(disable.status).toBe(200);

    const loginRes = await api
      .post("/api/v1/auth/login")
      .send({
        email: seller.email,
        password: "Password123!",
      });

    expect(
      loginRes.body.data.twoFactorRequired,
    ).toBeUndefined();
    expect(loginRes.body.data.accessToken).toBeTruthy();
  });

  it("never exposes the secret or recovery codes through user APIs", async () => {
    const seller = await createApprovedSeller();

    await api
      .post("/api/v1/auth/2fa/setup")
      .set(
        "Authorization",
        `Bearer ${seller.token}`,
      );

    const me = await api
      .get("/api/v1/users/me")
      .set(
        "Authorization",
        `Bearer ${seller.token}`,
      );

    const body = JSON.stringify(me.body);

    expect(body).not.toContain(
      "twoFactorSecretEncrypted",
    );
    expect(body).not.toContain("recoveryCodes");
  });

  it("keeps buyers on the single-step login flow", async () => {
    const email = `buyer2fa${Date.now()}@test.com`;
    await registerUser(email);
    const { token } = await login(email);

    expect(token).toBeTruthy();

    const me = await api
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${token}`);

    expect(me.status).toBe(200);
  });

  it("requires authentication for 2FA management endpoints", async () => {
    const setup = await api.post(
      "/api/v1/auth/2fa/setup",
    );

    expect(setup.status).toBe(401);

    const enable = await api
      .post("/api/v1/auth/2fa/enable")
      .send({ code: "123456" });

    expect(enable.status).toBe(401);
  });

  it("answers 409 (not 500) when the stored secret was encrypted with another key", async () => {
    const seller = await createApprovedSeller();

    const setup = await api
      .post("/api/v1/auth/2fa/setup")
      .set(
        "Authorization",
        `Bearer ${seller.token}`,
      );
    const secret = setup.body.data.secret;

    await api
      .post("/api/v1/auth/2fa/enable")
      .set(
        "Authorization",
        `Bearer ${seller.token}`,
      )
      .send({ code: generateTotpCode(secret) });

    /*
     * Simulate key rotation: the stored ciphertext no longer authenticates
     * with the key this process derives.
     */
    const rotatedPayload = encryptWithForeignKey(
      secret,
      "a-key-this-process-does-not-know-about",
    );

    await User.updateOne(
      { email: seller.email },
      {
        $set: {
          twoFactorSecretEncrypted: rotatedPayload,
        },
      },
    );

    const loginRes = await api
      .post("/api/v1/auth/login")
      .send({
        email: seller.email,
        password: "Password123!",
      });

    const res = await api
      .post("/api/v1/auth/2fa/verify")
      .send({
        loginToken: loginRes.body.data.loginToken,
        code: generateTotpCode(secret),
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe(
      "TWO_FACTOR_SECRET_UNREADABLE",
    );
    expect(res.body.success).toBe(false);

    /* No crypto internals, no key material, no stored payload. */
    const body = JSON.stringify(res.body);

    expect(body).not.toContain(secret);
    expect(body).not.toContain("Unsupported state");
    expect(body).not.toContain(rotatedPayload);
    expect(body).not.toContain("a-key-this-process");

    /* Recovery codes are still the documented way in. */
    const recoveryCode =
      setup.body.data.recoveryCodes[1];

    const viaRecovery = await api
      .post("/api/v1/auth/2fa/verify")
      .send({
        loginToken: loginRes.body.data.loginToken,
        code: recoveryCode,
      });

    expect(viaRecovery.status).toBe(200);
  });

  it("answers 4xx for malformed or invalid two-factor verification requests", async () => {
    const seller = await createApprovedSeller();

    const setup = await api
      .post("/api/v1/auth/2fa/setup")
      .set(
        "Authorization",
        `Bearer ${seller.token}`,
      );
    const secret = setup.body.data.secret;

    await api
      .post("/api/v1/auth/2fa/enable")
      .set(
        "Authorization",
        `Bearer ${seller.token}`,
      )
      .send({ code: generateTotpCode(secret) });

    const loginRes = await api
      .post("/api/v1/auth/login")
      .send({
        email: seller.email,
        password: "Password123!",
      });
    const loginToken =
      loginRes.body.data.loginToken;

    /* Missing/blank code and missing loginToken are validation errors. */
    const missingCode = await api
      .post("/api/v1/auth/2fa/verify")
      .send({ loginToken });

    expect(missingCode.status).toBe(400);
    expect(missingCode.body.code).toBe(
      "VALIDATION_ERROR",
    );

    const blankCode = await api
      .post("/api/v1/auth/2fa/verify")
      .send({ loginToken, code: "   " });

    expect(blankCode.status).toBe(400);

    const missingToken = await api
      .post("/api/v1/auth/2fa/verify")
      .send({ code: "123456" });

    expect(missingToken.status).toBe(400);

    /* Forged, expired-looking or foreign tokens cannot complete a login. */
    const forgedToken = await api
      .post("/api/v1/auth/2fa/verify")
      .send({
        loginToken: `${loginToken}tampered`,
        code: generateTotpCode(secret),
      });

    expect(forgedToken.status).toBe(401);
    expect(forgedToken.body.code).toBe(
      "INVALID_LOGIN_TOKEN",
    );

    const otherUsersToken = await api
      .post("/api/v1/auth/login")
      .send({
        email: seller.email,
        password: "Password123!",
      });

    const wrongCode = await api
      .post("/api/v1/auth/2fa/verify")
      .send({
        loginToken: otherUsersToken.body.data.loginToken,
        code: "000000",
      });

    expect(wrongCode.status).toBe(401);
    expect(wrongCode.body.code).toBe(
      "INVALID_TWO_FACTOR_CODE",
    );

    /* Nothing from the crypto layer may show up in error bodies. */
    for (const response of [
      missingCode,
      blankCode,
      missingToken,
      forgedToken,
      wrongCode,
    ]) {
      const body = JSON.stringify(response.body);

      expect(body).not.toContain(secret);
      expect(body).not.toContain(
        "Unsupported state",
      );
      expect(body).not.toContain(
        "twoFactorSecretEncrypted",
      );
    }
  });

  it("answers 409 for a corrupted stored payload and never 500", async () => {
    const seller = await createApprovedSeller();

    const setup = await api
      .post("/api/v1/auth/2fa/setup")
      .set(
        "Authorization",
        `Bearer ${seller.token}`,
      );

    await api
      .post("/api/v1/auth/2fa/enable")
      .set(
        "Authorization",
        `Bearer ${seller.token}`,
      )
      .send({
        code: generateTotpCode(
          setup.body.data.secret,
        ),
      });

    await User.updateOne(
      { email: seller.email },
      {
        $set: {
          twoFactorSecretEncrypted:
            "truncated-ciphertext",
        },
      },
    );

    const loginRes = await api
      .post("/api/v1/auth/login")
      .send({
        email: seller.email,
        password: "Password123!",
      });

    const res = await api
      .post("/api/v1/auth/2fa/verify")
      .send({
        loginToken: loginRes.body.data.loginToken,
        code: "123456",
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe(
      "TWO_FACTOR_SECRET_UNREADABLE",
    );
    expect(
      JSON.stringify(res.body),
    ).not.toContain("truncated-ciphertext");
  });
});
