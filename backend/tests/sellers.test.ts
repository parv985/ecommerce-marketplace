import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
import { Seller } from "../src/models/Seller.js";

/* Full, valid registration payload — override per test. */
const sellerPayload = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  name: "Location Seller",
  email: "location@test.com",
  password: "Password123!",
  businessName: "Location Traders",
  gstin: "27ABCDE1234F1ZV",
  pan: "ABCDE1234F",
  bankAccountHolderName: "Location Seller",
  bankAccountNumber: "123456789012",
  ifscCode: "HDFC0001234",
  addressLine1: "1 Main Road",
  city: "Pune",
  state: "MH",
  pincode: "411001",
  ...overrides,
});

describe("Sellers", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  it("registers a seller in PENDING status", async () => {
    const res = await registerSeller("s1@test.com");

    expect(res.status).toBe(201);
    expect(res.body.data.seller.status).toBe("PENDING");
  });

  it("rejects a duplicate GSTIN", async () => {
    await registerSeller("s2@test.com", "AAAAA", "1234");
    const res = await registerSeller("s3@test.com", "AAAAA", "1234");

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("GSTIN_ALREADY_EXISTS");
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
    expect(res.body.data.businessName).toBe("Test Traders");
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
    expect(res.body.data.businessName).toBe("Updated Traders");
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

  /* ── State/City pair validation (shared dataset) ─────────────── */

  it("accepts an ISO-code state on registration", async () => {
    const res = await api
      .post("/api/v1/sellers/register")
      .send(sellerPayload());

    expect(res.status).toBe(201);
  });

  it("rejects a registration whose city does not belong to the state", async () => {
    const res = await api
      .post("/api/v1/sellers/register")
      .send(sellerPayload({ city: "Patna", state: "Maharashtra" }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a registration with an unknown state", async () => {
    const res = await api
      .post("/api/v1/sellers/register")
      .send(sellerPayload({ state: "Atlantis" }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a state-only patch that leaves the stored city incompatible", async () => {
    const { token } = await createApprovedSeller(); // stored: Pune / MH

    const res = await api
      .patch("/api/v1/sellers/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ state: "Gujarat" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_CITY_STATE");
  });

  it("rejects a mismatched city/state pair patch", async () => {
    const { token } = await createApprovedSeller();

    const res = await api
      .patch("/api/v1/sellers/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ state: "Gujarat", city: "Pune" });

    // Both sides arrive together, so updateSellerProfileSchema's
    // superRefine rejects the pair before the service runs.
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a lone city patch that no longer fits the stored state", async () => {
    const { token } = await createApprovedSeller(); // stored: Pune / MH

    const res = await api
      .patch("/api/v1/sellers/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ city: "Patna" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_CITY_STATE");
  });

  it("persists a valid city/state pair chosen together", async () => {
    const { token } = await createApprovedSeller();

    const res = await api
      .patch("/api/v1/sellers/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ state: "Gujarat", city: "Ahmedabad" });

    expect(res.status).toBe(200);
    expect(res.body.data.address.state).toBe("Gujarat");
    expect(res.body.data.address.city).toBe("Ahmedabad");
  });

  it("keeps legacy off-dataset rows editable for unrelated fields", async () => {
    const { token, profileId } = await createApprovedSeller();

    // Simulate a row stored before the state/city rule existed.
    await Seller.findByIdAndUpdate(profileId, {
      state: "Orissa",
      city: "Cuttack",
    }).exec();

    // Unrelated edit (valid legacy pair) still goes through…
    const ok = await api
      .patch("/api/v1/sellers/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ pincode: "753001" });

    expect(ok.status).toBe(200);
    expect(ok.body.data.address.pincode).toBe("753001");

    // …but touching the location re-validates the effective pair.
    const bad = await api
      .patch("/api/v1/sellers/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ city: "Bhubaneswar" });

    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("INVALID_CITY_STATE");
  });
});
