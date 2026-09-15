import mongoose from "mongoose";
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
  createAddress,
  createApprovedSeller,
  createProduct,
  disconnect,
  login,
  registerUser,
} from "./helpers.js";

const auditLogs = () =>
  mongoose.connection
    .collection("auditlogs")
    .find({})
    .sort({ createdAt: -1 })
    .toArray();

describe("Audit logging", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  it("records login, order and product actions", async () => {
    const seller = await createApprovedSeller();
    const buyerEmail = `audit${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(seller.token, {
      name: "Audited Widget",
      price: 100,
      stock: 5,
      status: "ACTIVE",
    });
    const productId = product.body.data.id;

    await api
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ productId, quantity: 1 });
    const addressId = await createAddress(buyer.token);
    const checkout = await api
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ shippingAddressId: addressId });
    const orderId = checkout.body.data[0].id;

    await api
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${buyer.token}`);

    const logs = await auditLogs();
    const actions = logs.map((log) => log.action);

    expect(actions).toContain("LOGIN");
    expect(actions).toContain("SELLER_REGISTERED");
    expect(actions).toContain("PRODUCT_CREATED");
    expect(actions).toContain("ORDER_CREATED");
    expect(actions).toContain("ORDER_CANCELLED");

    // LOGIN entries exist for both the buyer and the seller.
    const loginLogs = logs.filter(
      (log) => log.action === "LOGIN",
    );
    expect(loginLogs.length).toBeGreaterThanOrEqual(
      2,
    );

    const orderLog = logs.find(
      (log) =>
        log.action === "ORDER_CANCELLED",
    );

    expect(orderLog.before).toEqual({
      status: "PENDING",
    });
    expect(orderLog.after).toEqual({
      status: "CANCELLED",
    });
  });

  it("never stores passwords, tokens or secrets in audit entries", async () => {
    const seller = await createApprovedSeller();
    const buyerEmail = `audit2${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(seller.token, {
      name: "Secret Check",
      price: 100,
      stock: 5,
      status: "ACTIVE",
    });
    await api
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ productId: product.body.data.id, quantity: 1 });
    const addressId = await createAddress(buyer.token);
    await api
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ shippingAddressId: addressId });

    const logs = await auditLogs();
    const serialized = JSON.stringify(logs);

    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain("refreshToken");
    expect(serialized).not.toContain(
      "twoFactorSecretEncrypted",
    );
    expect(serialized).not.toContain("recoveryCodes");
  });
});
