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
  disconnect,
  login,
  registerUser,
} from "./helpers.js";

describe("Authentication", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  it("registers a buyer", async () => {
    const res = await registerUser("a1@test.com");

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role).toBe("BUYER");
    expect(res.body.data.email).toBe("a1@test.com");
    expect(res.body.data).not.toHaveProperty(
      "passwordHash",
    );
  });

  it("rejects a duplicate email", async () => {
    await registerUser("a2@test.com");
    const res = await registerUser("a2@test.com");

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");
  });

  it("rejects an invalid email", async () => {
    const res = await registerUser("not-an-email");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("logs in with valid credentials and sets the refresh cookie", async () => {
    await registerUser("a3@test.com");
    const res = await api
      .post("/api/v1/auth/login")
      .send({
        email: "a3@test.com",
        password: "Password123!",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    const setCookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(setCookie).toContain("refreshToken=");
    expect(setCookie).toContain("HttpOnly");
  });

  it("rejects wrong password", async () => {
    await registerUser("a4@test.com");
    const res = await api
      .post("/api/v1/auth/login")
      .send({
        email: "a4@test.com",
        password: "wrong-password",
      });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("protects authenticated routes", async () => {
    const res = await api.get("/api/v1/users/me");

    expect(res.status).toBe(401);
  });

  it("returns the profile for a valid token", async () => {
    await registerUser("a5@test.com");
    const { token } = await login("a5@test.com");

    const res = await api
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("a5@test.com");
  });

  it("rotates the refresh token on refresh", async () => {
    await registerUser("a6@test.com");
    const { cookie } = await login("a6@test.com");

    const res = await api
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.headers["set-cookie"]?.[0]).toContain(
      "refreshToken=",
    );
  });

  it("rejects a reused refresh token", async () => {
    await registerUser("a7@test.com");
    const { cookie } = await login("a7@test.com");

    await api
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie);

    const res = await api
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(
      "INVALID_REFRESH_TOKEN",
    );
  });

  it("logs out and revokes the refresh token", async () => {
    await registerUser("a8@test.com");
    const { cookie } = await login("a8@test.com");

    const res = await api
      .post("/api/v1/auth/logout")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);

    const refresh = await api
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie);

    expect(refresh.status).toBe(401);
  });
});
