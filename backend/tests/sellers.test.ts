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
  createProduct,
  disconnect,
  login,
  registerSeller,
  registerUser,
} from "./helpers.js";

describe("Sellers", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  it("registers a seller in PENDING status", async () => {
    const res = await registerSeller("s1@test.com");

    expect(res.status).toBe(201);
    expect(res.body.data.seller.status).toBe(
      "PENDING",
    );
  });

  it("rejects a duplicate GSTIN", async () => {
    await registerSeller(
      "s2@test.com",
      "AAAAA",
      "1234",
    );
    const res = await registerSeller(
      "s3@test.com",
      "AAAAA",
      "1234",
    );

    expect(res.status).toBe(409);
    expect(res.body.code).toBe(
      "GSTIN_ALREADY_EXISTS",
    );
  });

  it("blocks a pending seller from logging in with 'Waiting for admin approval.'", async () => {
    await registerSeller("pending@test.com");
    const res = await api
      .post("/api/v1/auth/login")
      .send({ email: "pending@test.com", password: "Password123!" });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Waiting for admin approval.");
    expect(res.body.code).toBe("SELLER_PENDING_APPROVAL");
  });

  it("returns the seller profile for the authenticated seller", async () => {
    const { token } = await createApprovedSeller();

    const res = await api
      .get("/api/v1/sellers/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.businessName).toBe(
      "Test Traders",
    );
    expect(res.body.data.status).toBe("APPROVED");
  });

  it("updates the seller profile", async () => {
    const { token } = await createApprovedSeller();

    const res = await api
      .patch("/api/v1/sellers/me")
      .set("Authorization", `Bearer ${token}`)
      .send({
        businessName: "Updated Traders",
        phone: "9876543210",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.businessName).toBe(
      "Updated Traders",
    );
    expect(res.body.data.phone).toBe("9876543210");
  });

  it("rejects changes to GSTIN and PAN (immutable)", async () => {
    const { token } = await createApprovedSeller();

    const res = await api
      .patch("/api/v1/sellers/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ gstin: "27ZZZZZ1234Z1ZV" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("blocks buyers from seller endpoints", async () => {
    await registerUser("s7@test.com");
    const { token } = await login("s7@test.com");

    const res = await api
      .get("/api/v1/sellers/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("blocks unauthenticated access to seller endpoints", async () => {
    const res = await api.get("/api/v1/sellers/me");

    expect(res.status).toBe(401);
  });
});
