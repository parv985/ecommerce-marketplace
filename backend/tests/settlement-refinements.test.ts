import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import crypto from "crypto";

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
import { Settlement } from "../src/models/Settlement.js";

const currentMonth = new Date().toISOString().slice(0, 7);

const deliverAndPay = async (
  sellerToken: string,
  buyerToken: string,
  productId: string,
): Promise<string> => {
  await api
    .post("/api/v1/cart/items")
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ productId, quantity: 1 });

  const addressId = await createAddress(buyerToken);

  const checkout = await api
    .post("/api/v1/orders")
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ shippingAddressId: addressId });

  const orderId = checkout.body.data[0].id;

  for (const status of ["CONFIRMED", "SHIPPED", "DELIVERED"]) {
    await api
      .patch(`/api/v1/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ status });
  }

  await api
    .post(`/api/v1/orders/${orderId}/pay`)
    .set("Authorization", `Bearer ${sellerToken}`);

  return orderId;
};

describe("Settlement Refinements (Phase 6 & Phase 7)", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  it("handles duplicate settlement generation with appropriate messages", async () => {
    const { adminLogin } = await import("./helpers.js");
    const admin = await adminLogin();
    const seller = await createApprovedSeller();
    const buyerEmail = `buyer_${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(seller.token, {
      price: 1000,
      stock: 10,
      status: "ACTIVE",
    });

    await deliverAndPay(seller.token, buyer.token, product.body.data.id);

    // 1. First generation: creates new settlement
    const res1 = await api
      .post("/api/v1/admin/settlements/generate")
      .set("Authorization", `Bearer ${admin}`)
      .send({ month: currentMonth });

    expect(res1.status).toBe(201);
    expect(res1.body.message).toBe("Generated 1 settlement(s)");
    expect(res1.body.data).toHaveLength(1);
    expect(res1.body.data[0].status).toBe("PENDING");
    expect(res1.body.data[0].paymentStatus).toBe("PENDING");
    expect(res1.body.data[0].paymentDeadline).toBeTruthy();

    // 2. Duplicate generation: all eligible settlements already exist without new orders
    const res2 = await api
      .post("/api/v1/admin/settlements/generate")
      .set("Authorization", `Bearer ${admin}`)
      .send({ month: currentMonth });

    expect(res2.status).toBe(201);
    expect(res2.body.message).toBe("No settlements found");
  });

  it("detects newly eligible orders in the current month and appends them to the existing settlement", async () => {
    const { adminLogin } = await import("./helpers.js");
    const admin = await adminLogin();
    const seller = await createApprovedSeller();
    const buyerEmail = `buyer_${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(seller.token, {
      price: 1000,
      stock: 10,
      status: "ACTIVE",
    });

    // 1. Deliver and pay first order
    await deliverAndPay(seller.token, buyer.token, product.body.data.id);

    // Initial settlement generation
    const res1 = await api
      .post("/api/v1/admin/settlements/generate")
      .set("Authorization", `Bearer ${admin}`)
      .send({ month: currentMonth });

    expect(res1.status).toBe(201);
    expect(res1.body.message).toBe("Generated 1 settlement(s)");
    expect(res1.body.data[0].orders).toHaveLength(1);
    expect(res1.body.data[0].totalSales).toBe(1000);
    expect(res1.body.data[0].totalCommission).toBe(100);
    const settlementId = res1.body.data[0].id;

    // 2. Deliver and pay a SECOND order for the same seller in the same month
    const product2 = await createProduct(seller.token, {
      price: 1500,
      stock: 10,
      status: "ACTIVE",
    });
    await deliverAndPay(seller.token, buyer.token, product2.body.data.id);

    // Re-generate settlements: must detect newly eligible orders and append to existing settlement
    const res2 = await api
      .post("/api/v1/admin/settlements/generate")
      .set("Authorization", `Bearer ${admin}`)
      .send({ month: currentMonth });

    expect(res2.status).toBe(201);
    expect(res2.body.message).toBe("Generated 1 settlement(s)");
    expect(res2.body.data).toHaveLength(1);
    expect(res2.body.data[0].id).toBe(settlementId); // Same settlement ID
    expect(res2.body.data[0].orders).toHaveLength(2); // Order count updated to 2
    expect(res2.body.data[0].totalSales).toBe(2500); // 1000 + 1500 = 2500
    expect(res2.body.data[0].totalCommission).toBe(250); // 100 + 150 = 250
    expect(res2.body.data[0].totalPayable).toBe(2250); // 900 + 1350 = 2250

    // 3. Re-generate again with NO new orders: must show "No settlements found" and not duplicate
    const res3 = await api
      .post("/api/v1/admin/settlements/generate")
      .set("Authorization", `Bearer ${admin}`)
      .send({ month: currentMonth });

    expect(res3.status).toBe(201);
    expect(res3.body.message).toBe("No settlements found");
    expect(res3.body.data[0].orders).toHaveLength(2);
    expect(res3.body.data[0].totalSales).toBe(2500);
  });

  it("enforces 7-day payment window on payment order and verification", async () => {
    const { adminLogin } = await import("./helpers.js");
    const admin = await adminLogin();
    const seller = await createApprovedSeller();
    const buyerEmail = `buyer_${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(seller.token, {
      price: 1000,
      stock: 10,
      status: "ACTIVE",
    });

    await deliverAndPay(seller.token, buyer.token, product.body.data.id);

    const genRes = await api
      .post("/api/v1/admin/settlements/generate")
      .set("Authorization", `Bearer ${admin}`)
      .send({ month: currentMonth });

    const settlementId = genRes.body.data[0].id;

    // Fast-forward payment deadline to the past
    await Settlement.findByIdAndUpdate(settlementId, {
      $set: {
        paymentDeadline: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
      },
    });

    // Payment order attempt when expired
    const payOrderRes = await api
      .post(`/api/v1/settlements/${settlementId}/payment-order`)
      .set("Authorization", `Bearer ${seller.token}`);

    expect(payOrderRes.status).toBe(400);
    expect(payOrderRes.body.message).toBe("Payment window expired");

    // Payment verify attempt when expired
    const verifyRes = await api
      .post(`/api/v1/settlements/${settlementId}/verify-payment`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({
        paymentId: "pay_test",
        signature: "sig_test",
      });

    expect(verifyRes.status).toBe(400);
    expect(verifyRes.body.message).toBe("Payment window expired");
  });

  it("leaves settlement PENDING on failed payment signature", async () => {
    const { adminLogin } = await import("./helpers.js");
    const admin = await adminLogin();
    const seller = await createApprovedSeller();
    const buyerEmail = `buyer_${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(seller.token, {
      price: 1000,
      stock: 10,
      status: "ACTIVE",
    });

    await deliverAndPay(seller.token, buyer.token, product.body.data.id);

    const genRes = await api
      .post("/api/v1/admin/settlements/generate")
      .set("Authorization", `Bearer ${admin}`)
      .send({ month: currentMonth });

    const settlementId = genRes.body.data[0].id;

    // Create payment order
    const orderRes = await api
      .post(`/api/v1/settlements/${settlementId}/payment-order`)
      .set("Authorization", `Bearer ${seller.token}`);

    expect(orderRes.status).toBe(200);

    // Verify with invalid signature
    const verifyFail = await api
      .post(`/api/v1/settlements/${settlementId}/verify-payment`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({
        paymentId: "pay_invalid",
        signature: "invalid_sig",
      });

    expect(verifyFail.status).toBe(400);
    expect(verifyFail.body.message).toBe("Invalid payment signature");

    // Settlement must remain PENDING (not FAILED) so seller can retry
    const checkDoc = await Settlement.findById(settlementId);
    expect(checkDoc?.status).toBe("PENDING");
    expect(checkDoc?.paymentStatus).toBe("PENDING");
  });

  it("marks settlement PAID on valid signature and admin sees it as PAID with date", async () => {
    const { adminLogin } = await import("./helpers.js");
    const admin = await adminLogin();
    const seller = await createApprovedSeller();
    const buyerEmail = `buyer_${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(seller.token, {
      price: 1000,
      stock: 10,
      status: "ACTIVE",
    });

    await deliverAndPay(seller.token, buyer.token, product.body.data.id);

    const genRes = await api
      .post("/api/v1/admin/settlements/generate")
      .set("Authorization", `Bearer ${admin}`)
      .send({ month: currentMonth });

    const settlementId = genRes.body.data[0].id;

    // 1. Seller creates payment order
    const orderRes = await api
      .post(`/api/v1/settlements/${settlementId}/payment-order`)
      .set("Authorization", `Bearer ${seller.token}`);

    const gatewayOrderId = orderRes.body.data.razorpayOrderId;
    const paymentId = "mock_pay_12345";

    // Compute mock signature (in MOCK mode, MOCK_SIGNING_SECRET is "mock-payment-signing-secret" or env key secret)
    const secret = process.env.RAZORPAY_KEY_SECRET || "mock-payment-signing-secret";
    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${gatewayOrderId}|${paymentId}`)
      .digest("hex");

    // 2. Seller verifies payment
    const verifyRes = await api
      .post(`/api/v1/settlements/${settlementId}/verify-payment`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({
        paymentId,
        signature,
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.status).toBe("PAID");
    expect(verifyRes.body.data.paymentStatus).toBe("PAID");
    expect(verifyRes.body.data.paidAt).toBeTruthy();

    // 3. Admin sees the settlement as PAID with payment date
    const adminDetailRes = await api
      .get(`/api/v1/admin/settlements/${settlementId}`)
      .set("Authorization", `Bearer ${admin}`);

    expect(adminDetailRes.status).toBe(200);
    expect(adminDetailRes.body.data.status).toBe("PAID");
    expect(adminDetailRes.body.data.paymentStatus).toBe("PAID");
    expect(adminDetailRes.body.data.paidAt).toBeTruthy();
  });
});
