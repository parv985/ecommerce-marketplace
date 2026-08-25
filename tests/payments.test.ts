import crypto from "crypto";
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

/*
 * The gateway runs in MOCK mode in tests (no Razorpay credentials).
 * Mock signatures use the same format Razorpay uses
 * ("<gatewayOrderId>|<paymentId>") but with the documented fixture
 * secret, so the full server-side verification path is exercised.
 */
const MOCK_SECRET = "mock-payment-signing-secret";

const clientSignature = (
  gatewayOrderId: string,
  paymentId: string,
): string =>
  crypto
    .createHmac("sha256", MOCK_SECRET)
    .update(`${gatewayOrderId}|${paymentId}`)
    .digest("hex");

const webhookSignature = (
  payload: unknown,
): string =>
  crypto
    .createHmac("sha256", MOCK_SECRET)
    .update(JSON.stringify(payload))
    .digest("hex");

const sendWebhook = (
  payload: unknown,
  signature?: string,
) =>
  api
    .post("/api/v1/payments/webhook/razorpay")
    .set("Content-Type", "application/json")
    .set(
      "X-Razorpay-Signature",
      signature ?? webhookSignature(payload),
    )
    .send(JSON.stringify(payload));

describe("Payments", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  /*
   * Creates a seller + product + buyer and checks out with the given
   * payment method, returning the order and the buyer token.
   */
  const setupOrder = async (
    paymentMethod: "CASH_ON_DELIVERY" | "ONLINE",
  ): Promise<{
    orderId: string;
    orderNumber: string;
    buyerToken: string;
    sellerToken: string;
    productId: string;
  }> => {
    const seller = await createApprovedSeller();
    const buyerEmail = `pay${Date.now()}${Math.random()
      .toString(36)
      .slice(2, 6)}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(seller.token, {
      name: "Pay Item",
      price: 500,
      stock: 10,
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
      .send({
        shippingAddressId: addressId,
        paymentMethod,
      });

    const order = checkout.body.data[0];
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      buyerToken: buyer.token,
      sellerToken: seller.token,
      productId,
    };
  };

  it("creates an online order with PENDING payment at checkout", async () => {
    const { orderId, buyerToken } =
      await setupOrder("ONLINE");

    const res = await api
      .get(`/api/v1/orders/${orderId}`)
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.body.data.paymentMethod).toBe(
      "ONLINE",
    );
    expect(res.body.data.paymentStatus).toBe(
      "PENDING",
    );
  });

  it("initiates a payment and is idempotent on repeat calls", async () => {
    const { orderId, buyerToken } =
      await setupOrder("ONLINE");

    const first = await api
      .post(`/api/v1/payments/orders/${orderId}/initiate`)
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(first.status).toBe(201);
    expect(
      first.body.data.gatewayOrderId,
    ).toMatch(/^mock_order_/);
    expect(first.body.data.status).toBe("PENDING");
    expect(first.body.data.amount).toBe(500);
    expect(first.body.data.keyId).toBeNull();

    const second = await api
      .post(`/api/v1/payments/orders/${orderId}/initiate`)
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(
      first.body.data.id,
    );
    expect(second.body.data.gatewayOrderId).toBe(
      first.body.data.gatewayOrderId,
    );
  });

  it("verifies payment server-side and rejects bad signatures", async () => {
    const { orderId, buyerToken } =
      await setupOrder("ONLINE");

    await api
      .post(`/api/v1/payments/orders/${orderId}/initiate`)
      .set("Authorization", `Bearer ${buyerToken}`);

    const payment = await api
      .post(`/api/v1/payments/orders/${orderId}/verify`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        paymentId: "pay_test123",
        signature: "forged-signature",
      });

    expect(payment.status).toBe(400);
    expect(payment.body.code).toBe(
      "INVALID_PAYMENT_SIGNATURE",
    );

    const gatewayOrderId = (
      await api
        .post(`/api/v1/payments/orders/${orderId}/initiate`)
        .set("Authorization", `Bearer ${buyerToken}`)
    ).body.data.gatewayOrderId;

    const verified = await api
      .post(`/api/v1/payments/orders/${orderId}/verify`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        paymentId: "pay_test123",
        signature: clientSignature(
          gatewayOrderId,
          "pay_test123",
        ),
      });

    expect(verified.status).toBe(200);
    expect(verified.body.data.status).toBe("PAID");

    const order = await api
      .get(`/api/v1/orders/${orderId}`)
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(order.body.data.paymentStatus).toBe(
      "PAID",
    );

    // Idempotent: verifying again returns the paid state.
    const again = await api
      .post(`/api/v1/payments/orders/${orderId}/verify`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        paymentId: "pay_test123",
        signature: clientSignature(
          gatewayOrderId,
          "pay_test123",
        ),
      });

    expect(again.status).toBe(200);
    expect(again.body.data.status).toBe("PAID");
  });

  it("rejects payment for orders the caller does not own", async () => {
    const { orderId } = await setupOrder("ONLINE");
    const stranger = `stranger${Date.now()}@test.com`;
    await registerUser(stranger);
    const { token } = await login(stranger);

    const res = await api
      .post(`/api/v1/payments/orders/${orderId}/initiate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("rejects gateway payment for COD orders", async () => {
    const { orderId, buyerToken } =
      await setupOrder("CASH_ON_DELIVERY");

    const res = await api
      .post(`/api/v1/payments/orders/${orderId}/initiate`)
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(
      "PAYMENT_METHOD_NOT_ONLINE",
    );
  });

  it("keeps the COD mark-paid flow working and blocks it for online orders", async () => {
    const cod = await setupOrder("CASH_ON_DELIVERY");
    for (const status of [
      "CONFIRMED",
      "SHIPPED",
      "DELIVERED",
    ]) {
      await api
        .patch(`/api/v1/orders/${cod.orderId}/status`)
        .set("Authorization", `Bearer ${cod.sellerToken}`)
        .send({ status });
    }

    const paid = await api
      .post(`/api/v1/orders/${cod.orderId}/pay`)
      .set("Authorization", `Bearer ${cod.sellerToken}`);
    expect(paid.status).toBe(200);

    const online = await setupOrder("ONLINE");
    const rejected = await api
      .post(`/api/v1/orders/${online.orderId}/pay`)
      .set("Authorization", `Bearer ${online.sellerToken}`);
    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe(
      "PAYMENT_METHOD_NOT_ONLINE",
    );
  });

  it("rejects webhooks with a bad signature", async () => {
    const res = await sendWebhook(
      { event: "payment.captured" },
      "bad-signature",
    );

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(
      "INVALID_WEBHOOK_SIGNATURE",
    );
  });

  it("processes a webhook exactly once and ignores duplicates", async () => {
    const { orderId, buyerToken } =
      await setupOrder("ONLINE");

    const initiated = await api
      .post(`/api/v1/payments/orders/${orderId}/initiate`)
      .set("Authorization", `Bearer ${buyerToken}`);
    const gatewayOrderId =
      initiated.body.data.gatewayOrderId;

    const payload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_webhook_1",
            order_id: gatewayOrderId,
            amount: 50000,
            status: "captured",
          },
        },
      },
    };

    const first = await sendWebhook(payload);
    expect(first.status).toBe(200);
    expect(first.body.data.processed).toBe(true);

    const order = await api
      .get(`/api/v1/orders/${orderId}`)
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(order.body.data.paymentStatus).toBe(
      "PAID",
    );

    const duplicate = await sendWebhook(payload);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.data.processed).toBe(false);
  });

  it("treats a replayed event id on a different payment as a safe no-op", async () => {
    const first = await setupOrder("ONLINE");
    const second = await setupOrder("ONLINE");

    const initiated = await api
      .post(
        `/api/v1/payments/orders/${first.orderId}/initiate`,
      )
      .set("Authorization", `Bearer ${first.buyerToken}`);
    const gatewayOrderId =
      initiated.body.data.gatewayOrderId;

    // Same event id is delivered to TWO different payments - the
    // second claim must be a safe no-op, never a 500.
    const payload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_replay_1",
            order_id: gatewayOrderId,
            amount: 50000,
            status: "captured",
          },
        },
      },
    };

    await sendWebhook(payload);

    await api
      .post(
        `/api/v1/payments/orders/${second.orderId}/initiate`,
      )
      .set("Authorization", `Bearer ${second.buyerToken}`);

    const replay = await sendWebhook({
      ...payload,
      payload: {
        payment: {
          entity: {
            id: "pay_replay_1",
            order_id: (
              await api
                .post(
                  `/api/v1/payments/orders/${second.orderId}/initiate`,
                )
                .set(
                  "Authorization",
                  `Bearer ${second.buyerToken}`,
                )
            ).body.data.gatewayOrderId,
            amount: 50000,
            status: "captured",
          },
        },
      },
    });

    expect(replay.status).toBe(200);
    expect(replay.body.data.processed).toBe(false);
  });

  it("ignores webhooks for unknown orders without fabricating payments", async () => {
    const res = await sendWebhook({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_unknown",
            order_id: "order_never_created",
            amount: 10000,
            status: "captured",
          },
        },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.processed).toBe(false);
  });

  it("refunds a paid online order in full and only once", async () => {
    const { orderId, buyerToken, sellerToken } =
      await setupOrder("ONLINE");

    const initiated = await api
      .post(`/api/v1/payments/orders/${orderId}/initiate`)
      .set("Authorization", `Bearer ${buyerToken}`);
    const gatewayOrderId =
      initiated.body.data.gatewayOrderId;

    await api
      .post(`/api/v1/payments/orders/${orderId}/verify`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        paymentId: "pay_refund_1",
        signature: clientSignature(
          gatewayOrderId,
          "pay_refund_1",
        ),
      });

    const forbidden = await api
      .post(`/api/v1/payments/orders/${orderId}/refund`)
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(forbidden.status).toBe(403);

    const refund = await api
      .post(`/api/v1/payments/orders/${orderId}/refund`)
      .set("Authorization", `Bearer ${sellerToken}`);

    expect(refund.status).toBe(200);
    expect(refund.body.data.status).toBe(
      "REFUNDED",
    );
    expect(refund.body.data.refund.amount).toBe(500);
    expect(
      refund.body.data.refund.gatewayRefundId,
    ).toMatch(/^mock_refund_/);

    const order = await api
      .get(`/api/v1/orders/${orderId}`)
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(order.body.data.paymentStatus).toBe(
      "REFUNDED",
    );

    const again = await api
      .post(`/api/v1/payments/orders/${orderId}/refund`)
      .set("Authorization", `Bearer ${sellerToken}`);
    expect(again.status).toBe(200);
    expect(again.body.data.status).toBe(
      "REFUNDED",
    );
    expect(again.body.data.refund.gatewayRefundId).toBe(
      refund.body.data.refund.gatewayRefundId,
    );
  });

  it("refunds automatically when a paid online order is cancelled", async () => {
    const {
      orderId,
      buyerToken,
      productId,
    } = await setupOrder("ONLINE");

    const initiated = await api
      .post(`/api/v1/payments/orders/${orderId}/initiate`)
      .set("Authorization", `Bearer ${buyerToken}`);
    const gatewayOrderId =
      initiated.body.data.gatewayOrderId;

    await api
      .post(`/api/v1/payments/orders/${orderId}/verify`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        paymentId: "pay_cancel_1",
        signature: clientSignature(
          gatewayOrderId,
          "pay_cancel_1",
        ),
      });

    const cancelled = await api
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe(
      "CANCELLED",
    );
    expect(cancelled.body.data.paymentStatus).toBe(
      "REFUNDED",
    );

    const payment = await api
      .get(`/api/v1/orders/${orderId}`)
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(payment.body.data.paymentStatus).toBe(
      "REFUNDED",
    );

    const stock = await api.get(
      `/api/v1/products/${productId}`,
    );
    expect(stock.body.data.stock).toBe(10);
  });

  it("rejects refunds for unpaid or non-online orders", async () => {
    const online = await setupOrder("ONLINE");
    const onlineRefund = await api
      .post(
        `/api/v1/payments/orders/${online.orderId}/refund`,
      )
      .set("Authorization", `Bearer ${online.sellerToken}`);
    expect(onlineRefund.status).toBe(400);

    const cod = await setupOrder("CASH_ON_DELIVERY");
    const codRefund = await api
      .post(`/api/v1/payments/orders/${cod.orderId}/refund`)
      .set("Authorization", `Bearer ${cod.sellerToken}`);
    expect(codRefund.status).toBe(400);
  });
});
