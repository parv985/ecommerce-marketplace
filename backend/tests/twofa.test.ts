import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  api,
  clearDb,
  connect,
  createApprovedSeller,
  disconnect,
  login,
  registerUser,
} from "./helpers.js";
import {
  generateTotpCode,
  verifyTotpCode,
} from "../src/utils/totp.js";

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
});
