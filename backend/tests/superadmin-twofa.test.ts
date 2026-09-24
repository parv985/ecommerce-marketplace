import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import bcrypt from "bcryptjs";

import {
  api,
  clearDb,
  connect,
  disconnect,
} from "./helpers.js";
import { User } from "../src/models/User.js";
import { UserRole } from "../src/constants/roles.js";
import {
  generateTotpCode,
} from "../src/utils/totp.js";
import { decryptSecret } from "../src/utils/secretCipher.js";

const ADMIN_EMAIL = "superadmin@marketplace.com";
const ADMIN_PASSWORD = "SuperAdminPassword123!";

const createSuperAdminUser = async (twoFactorEnabled = false) => {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  return User.create({
    name: "Platform Super Admin",
    email: ADMIN_EMAIL,
    passwordHash,
    role: UserRole.SUPER_ADMIN,
    isEmailVerified: true,
    isActive: true,
    twoFactorEnabled,
  });
};

describe("Super Admin 2FA Lifecycle", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  it("triggers 2FA setup on first-time login when 2FA is not configured", async () => {
    await createSuperAdminUser(false);

    const loginRes = await api.post("/api/v1/auth/login").send({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.twoFactorRequired).toBe(true);
    expect(loginRes.body.data.twoFactorSetupRequired).toBe(true);
    expect(loginRes.body.data.accessToken).toBeUndefined();
    expect(loginRes.body.data.loginToken).toBeTruthy();

    const setup = loginRes.body.data.twoFactorSetup;
    expect(setup).toBeTruthy();
    expect(setup.secret).toMatch(/^[A-Z2-7]{16,}$/);
    expect(setup.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(setup.otpauthUrl).toContain(encodeURIComponent(ADMIN_EMAIL));
    expect(setup.recoveryCodes).toHaveLength(8);

    // Verify secret is encrypted in database and twoFactorEnabled is false
    const dbUser = await User.findOne({ email: ADMIN_EMAIL }).select(
      "+twoFactorSecretEncrypted +recoveryCodes",
    );
    expect(dbUser).toBeTruthy();
    expect(dbUser!.twoFactorEnabled).toBe(false);
    expect(dbUser!.twoFactorSecretEncrypted).toBeTruthy();
    expect(dbUser!.twoFactorSecretEncrypted).not.toBe(setup.secret);
    expect(decryptSecret(dbUser!.twoFactorSecretEncrypted!)).toBe(setup.secret);
    expect(dbUser!.recoveryCodes).toHaveLength(8);
  });

  it("verifies TOTP code, enables 2FA, and completes first-time Super Admin login", async () => {
    await createSuperAdminUser(false);

    // Step 1: Initial login prompts 2FA setup
    const loginRes = await api.post("/api/v1/auth/login").send({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    const { loginToken, twoFactorSetup } = loginRes.body.data;
    const totpCode = generateTotpCode(twoFactorSetup.secret);

    // Step 2: Verify TOTP code to complete setup & login
    const verifyRes = await api.post("/api/v1/auth/2fa/verify").send({
      loginToken,
      code: totpCode,
    });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.accessToken).toBeTruthy();
    expect(verifyRes.body.data.user.role).toBe(UserRole.SUPER_ADMIN);
    expect(verifyRes.body.data.user.email).toBe(ADMIN_EMAIL);

    // Refresh token cookie must be set
    const cookies = verifyRes.headers["set-cookie"];
    expect(cookies).toBeDefined();
    expect(cookies.some((c: string) => c.includes("refreshToken="))).toBe(true);

    // Verify user in DB is now marked twoFactorEnabled: true
    const updatedUser = await User.findOne({ email: ADMIN_EMAIL });
    expect(updatedUser!.twoFactorEnabled).toBe(true);

    // Super Admin access token can access admin routes
    const adminCheck = await api
      .get("/api/v1/admin/users")
      .set("Authorization", `Bearer ${verifyRes.body.data.accessToken}`);
    expect(adminCheck.status).toBe(200);
  });

  it("requires Email + Password -> TOTP Code on every subsequent login without showing QR setup", async () => {
    await createSuperAdminUser(false);

    // First login and setup
    const firstLogin = await api.post("/api/v1/auth/login").send({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    const secret = firstLogin.body.data.twoFactorSetup.secret;
    await api.post("/api/v1/auth/2fa/verify").send({
      loginToken: firstLogin.body.data.loginToken,
      code: generateTotpCode(secret),
    });

    // Subsequent login: 2FA is already enabled
    const secondLogin = await api.post("/api/v1/auth/login").send({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    expect(secondLogin.status).toBe(200);
    expect(secondLogin.body.data.twoFactorRequired).toBe(true);
    expect(secondLogin.body.data.twoFactorSetupRequired).toBe(false);
    expect(secondLogin.body.data.twoFactorSetup).toBeUndefined(); // QR code & secret NOT shown
    expect(secondLogin.body.data.accessToken).toBeUndefined();
    expect(secondLogin.body.data.loginToken).toBeTruthy();

    // Verify TOTP on subsequent login
    const secondVerify = await api.post("/api/v1/auth/2fa/verify").send({
      loginToken: secondLogin.body.data.loginToken,
      code: generateTotpCode(secret),
    });

    expect(secondVerify.status).toBe(200);
    expect(secondVerify.body.data.accessToken).toBeTruthy();
    expect(secondVerify.body.data.user.email).toBe(ADMIN_EMAIL);
  });

  it("rejects login with invalid TOTP code", async () => {
    await createSuperAdminUser(false);

    const loginRes = await api.post("/api/v1/auth/login").send({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    const verifyRes = await api.post("/api/v1/auth/2fa/verify").send({
      loginToken: loginRes.body.data.loginToken,
      code: "000000",
    });

    expect(verifyRes.status).toBe(401);
    expect(verifyRes.body.success).toBe(false);
    expect(verifyRes.body.code).toBe("INVALID_TWO_FACTOR_CODE");
    expect(verifyRes.body.data?.accessToken).toBeUndefined();
  });

  it("rejects login with expired TOTP code", async () => {
    await createSuperAdminUser(false);

    const loginRes = await api.post("/api/v1/auth/login").send({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    const secret = loginRes.body.data.twoFactorSetup.secret;
    // Generate TOTP code from 10 minutes ago (well outside the +/- 30s window)
    const expiredDate = new Date(Date.now() - 10 * 60 * 1000);
    const expiredTotp = generateTotpCode(secret, expiredDate);

    const verifyRes = await api.post("/api/v1/auth/2fa/verify").send({
      loginToken: loginRes.body.data.loginToken,
      code: expiredTotp,
    });

    expect(verifyRes.status).toBe(401);
    expect(verifyRes.body.code).toBe("INVALID_TWO_FACTOR_CODE");
  });

  it("rejects verification with invalid or tampered loginToken", async () => {
    await createSuperAdminUser(false);

    const loginRes = await api.post("/api/v1/auth/login").send({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    const secret = loginRes.body.data.twoFactorSetup.secret;

    const verifyRes = await api.post("/api/v1/auth/2fa/verify").send({
      loginToken: `${loginRes.body.data.loginToken}tampered`,
      code: generateTotpCode(secret),
    });

    expect(verifyRes.status).toBe(401);
    expect(verifyRes.body.code).toBe("INVALID_LOGIN_TOKEN");
  });

  it("allows single-use recovery code to complete login exactly once", async () => {
    await createSuperAdminUser(false);

    const loginRes = await api.post("/api/v1/auth/login").send({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    const recoveryCode = loginRes.body.data.twoFactorSetup.recoveryCodes[0];

    // First login with recovery code
    const firstVerify = await api.post("/api/v1/auth/2fa/verify").send({
      loginToken: loginRes.body.data.loginToken,
      code: recoveryCode,
    });

    expect(firstVerify.status).toBe(200);
    expect(firstVerify.body.data.accessToken).toBeTruthy();

    // Subsequent login: try using the exact same recovery code again
    const secondLogin = await api.post("/api/v1/auth/login").send({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    const secondVerify = await api.post("/api/v1/auth/2fa/verify").send({
      loginToken: secondLogin.body.data.loginToken,
      code: recoveryCode,
    });

    expect(secondVerify.status).toBe(401);
    expect(secondVerify.body.code).toBe("INVALID_TWO_FACTOR_CODE");
  });

  it("handles logout, token revocation, and subsequent 2FA login", async () => {
    await createSuperAdminUser(false);

    // Setup and login
    const loginRes = await api.post("/api/v1/auth/login").send({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    const secret = loginRes.body.data.twoFactorSetup.secret;
    const verifyRes = await api.post("/api/v1/auth/2fa/verify").send({
      loginToken: loginRes.body.data.loginToken,
      code: generateTotpCode(secret),
    });

    const rawCookie = verifyRes.headers["set-cookie"]?.[0] ?? "";
    const refreshToken = rawCookie.split(";")[0]?.replace("refreshToken=", "") ?? "";

    // Logout
    const logoutRes = await api
      .post("/api/v1/auth/logout")
      .set("Cookie", rawCookie)
      .send({ refreshToken });

    expect(logoutRes.status).toBe(200);

    // Refresh token is now revoked
    const refreshRes = await api
      .post("/api/v1/auth/refresh")
      .set("Cookie", rawCookie);
    expect(refreshRes.status).toBe(401);

    // Super Admin can log in again with Email + Password -> TOTP
    const reLogin = await api.post("/api/v1/auth/login").send({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    expect(reLogin.status).toBe(200);
    expect(reLogin.body.data.twoFactorRequired).toBe(true);
    expect(reLogin.body.data.twoFactorSetupRequired).toBe(false);

    const reVerify = await api.post("/api/v1/auth/2fa/verify").send({
      loginToken: reLogin.body.data.loginToken,
      code: generateTotpCode(secret),
    });
    expect(reVerify.status).toBe(200);
    expect(reVerify.body.data.accessToken).toBeTruthy();
  });

  it("never exposes the 2FA secret in user APIs or subsequent login responses", async () => {
    await createSuperAdminUser(false);

    const loginRes = await api.post("/api/v1/auth/login").send({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    const secret = loginRes.body.data.twoFactorSetup.secret;

    const verifyRes = await api.post("/api/v1/auth/2fa/verify").send({
      loginToken: loginRes.body.data.loginToken,
      code: generateTotpCode(secret),
    });

    const token = verifyRes.body.data.accessToken;

    // Check GET /users/me
    const meRes = await api
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${token}`);
    expect(meRes.status).toBe(200);

    const meBody = JSON.stringify(meRes.body);
    expect(meBody).not.toContain(secret);
    expect(meBody).not.toContain("twoFactorSecret");
    expect(meBody).not.toContain("twoFactorSecretEncrypted");
    expect(meBody).not.toContain("recoveryCodes");

    // Check subsequent login response body
    const subsequentLogin = await api.post("/api/v1/auth/login").send({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    expect(subsequentLogin.body.data.twoFactorSetup).toBeUndefined();
    const subBody = JSON.stringify(subsequentLogin.body);
    expect(subBody).not.toContain(secret);
    expect(subBody).not.toContain("otpauthUrl");
  });
});
