import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { Order } from "../src/models/Order.js";
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

const DAY = 24 * 3600 * 1000;

const registerBuyer = async (): Promise<string> => {
  const email = `rbuyer${Date.now()}${Math.floor(
    Math.random() * 1000,
  )}@test.com`;
  await registerUser(email);
  const { token } = await login(email);
  return token;
};

/*
 * Creates an order and delivers it end-to-end (checkout then the
 * seller advances it to DELIVERED). Returns { orderId, seller, buyer }.
 */
const createDeliveredOrder = async (
  stock = 5,
): Promise<{
  orderId: string;
  seller: { token: string };
  buyer: string;
}> => {
  const seller = await createApprovedSeller();
  const buyer = await registerBuyer();

  const product = await createProduct(
    seller.token,
    { price: 500, stock, status: "ACTIVE" },
  );
  const productId = product.body.data.id;

  await api
    .post("/api/v1/cart/items")
    .set("Authorization", `Bearer ${buyer}`)
    .send({ productId, quantity: 1 });
  const addressId = await createAddress(buyer);
  const checkout = await api
    .post("/api/v1/orders")
    .set("Authorization", `Bearer ${buyer}`)
    .send({ shippingAddressId: addressId });
  const orderId = checkout.body.data[0].id;

  for (const status of [
    "CONFIRMED",
    "SHIPPED",
    "DELIVERED",
  ]) {
    await api
      .patch(`/api/v1/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({ status });
  }

  return { orderId, seller, buyer };
};

const requestReturn = (
  token: string,
  orderId: string,
  reason = "Item arrived damaged",
) => {
  return api
    .post("/api/v1/returns")
    .set("Authorization", `Bearer ${token}`)
    .send({ orderId, reason });
};

describe("Returns", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  it("requests a return on a delivered order", async () => {
    const { orderId, buyer } =
      await createDeliveredOrder();

    const res = await requestReturn(buyer, orderId);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("PENDING");
    expect(res.body.data.orderId).toBe(orderId);
  });

  it("rejects a return before delivery", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();

    const product = await createProduct(
      seller.token,
      { status: "ACTIVE" },
    );
    await api
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${buyer}`)
      .send({ productId: product.body.data.id, quantity: 1 });
    const addressId = await createAddress(buyer);
    const checkout = await api
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${buyer}`)
      .send({ shippingAddressId: addressId });
    const orderId = checkout.body.data[0].id;

    const res = await requestReturn(buyer, orderId);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("RETURN_NOT_ELIGIBLE");
  });

  it("rejects a return on another buyer's order", async () => {
    const { orderId } = await createDeliveredOrder();
    const stranger = await registerBuyer();

    const res = await requestReturn(
      stranger,
      orderId,
    );

    expect(res.status).toBe(403);
  });

  it("rejects a duplicate return request", async () => {
    const { orderId, buyer } =
      await createDeliveredOrder();

    await requestReturn(buyer, orderId);
    const res = await requestReturn(buyer, orderId);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe(
      "RETURN_ALREADY_REQUESTED",
    );
  });

  it("rejects a return after the window has expired", async () => {
    const { orderId, buyer } =
      await createDeliveredOrder();

    // Backdate the delivery beyond the 7-day window.
    await Order.updateOne(
      { _id: orderId },
      {
        $set: {
          deliveredAt: new Date(
            Date.now() - 8 * DAY,
          ),
        },
      },
    ).exec();

    const res = await requestReturn(buyer, orderId);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(
      "RETURN_WINDOW_EXPIRED",
    );
  });

  it("walks the full lifecycle and restores stock on completion", async () => {
    const { orderId, seller, buyer } =
      await createDeliveredOrder(3);

    const productId = (
      await api
        .get(`/api/v1/orders/${orderId}`)
        .set("Authorization", `Bearer ${buyer}`)
    ).body.data.items[0].productId;

    // Stock went 3 -> 2 at checkout.
    let stock = await api.get(
      `/api/v1/products/${productId}`,
    );
    expect(stock.body.data.stock).toBe(2);

    const created = await requestReturn(
      buyer,
      orderId,
    );
    const returnId = created.body.data.id;

    // Buyer cannot approve their own return.
    const buyerApprove = await api
      .patch(`/api/v1/returns/${returnId}/status`)
      .set("Authorization", `Bearer ${buyer}`)
      .send({ status: "APPROVED" });
    expect(buyerApprove.status).toBe(403);

    // Seller approves, then completes.
    const approve = await api
      .patch(`/api/v1/returns/${returnId}/status`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({ status: "APPROVED" });
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe("APPROVED");

    // APPROVED -> REJECTED is an invalid transition.
    const backwards = await api
      .patch(`/api/v1/returns/${returnId}/status`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({ status: "REJECTED" });
    expect(backwards.status).toBe(400);

    const complete = await api
      .patch(`/api/v1/returns/${returnId}/status`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({ status: "COMPLETED" });
    expect(complete.status).toBe(200);
    expect(complete.body.data.status).toBe(
      "COMPLETED",
    );

    // Stock restored when the return is completed.
    stock = await api.get(
      `/api/v1/products/${productId}`,
    );
    expect(stock.body.data.stock).toBe(3);
  });

  it("rejects without a reason and allows buyer cancellation while pending", async () => {
    const { orderId, seller, buyer } =
      await createDeliveredOrder();

    const created = await requestReturn(
      buyer,
      orderId,
    );
    const returnId = created.body.data.id;

    const noReason = await api
      .patch(`/api/v1/returns/${returnId}/status`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({ status: "REJECTED" });
    expect(noReason.status).toBe(400);

    const reject = await api
      .patch(`/api/v1/returns/${returnId}/status`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({
        status: "REJECTED",
        reason: "Not eligible for return",
      });
    expect(reject.status).toBe(200);
    expect(reject.body.data.statusReason).toBe(
      "Not eligible for return",
    );

    // A rejected return cannot be cancelled anymore.
    const cancel = await api
      .post(`/api/v1/returns/${returnId}/cancel`)
      .set("Authorization", `Bearer ${buyer}`);
    expect(cancel.status).toBe(400);

    // New request after rejection is allowed (within the window).
    const again = await requestReturn(
      buyer,
      orderId,
    );
    expect(again.status).toBe(201);

    const cancelPending = await api
      .post(
        `/api/v1/returns/${again.body.data.id}/cancel`,
      )
      .set("Authorization", `Bearer ${buyer}`);
    expect(cancelPending.status).toBe(200);
    expect(cancelPending.body.data.status).toBe(
      "CANCELLED",
    );
  });

  it("scopes listings and details to buyer and seller", async () => {
    const sellerA = await createApprovedSeller();
    const sellerB = await createApprovedSeller();
    const buyer = await registerBuyer();

    const product = await createProduct(
      sellerA.token,
      { status: "ACTIVE" },
    );
    await api
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${buyer}`)
      .send({ productId: product.body.data.id, quantity: 1 });
    const addressId = await createAddress(buyer);
    const checkout = await api
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${buyer}`)
      .send({ shippingAddressId: addressId });
    const orderId = checkout.body.data[0].id;

    for (const status of [
      "CONFIRMED",
      "SHIPPED",
      "DELIVERED",
    ]) {
      await api
        .patch(`/api/v1/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${sellerA.token}`)
        .send({ status });
    }

    const created = await requestReturn(
      buyer,
      orderId,
    );
    const returnId = created.body.data.id;

    // Another seller cannot view or update it.
    const otherView = await api
      .get(`/api/v1/returns/${returnId}`)
      .set("Authorization", `Bearer ${sellerB.token}`);
    expect(otherView.status).toBe(403);

    const otherUpdate = await api
      .patch(`/api/v1/returns/${returnId}/status`)
      .set("Authorization", `Bearer ${sellerB.token}`)
      .send({ status: "APPROVED" });
    expect(otherUpdate.status).toBe(403);

    // Seller A sees it in their list; seller B sees nothing.
    const listA = await api
      .get("/api/v1/returns")
      .set("Authorization", `Bearer ${sellerA.token}`);
    expect(listA.body.data.total).toBe(1);

    const listB = await api
      .get("/api/v1/returns")
      .set("Authorization", `Bearer ${sellerB.token}`);
    expect(listB.body.data.total).toBe(0);

    // Buyer sees it in their list.
    const listBuyer = await api
      .get("/api/v1/returns")
      .set("Authorization", `Bearer ${buyer}`);
    expect(listBuyer.body.data.total).toBe(1);
  });
});
