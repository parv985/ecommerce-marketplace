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
  registerSeller,
  registerUser,
} from "./helpers.js";

describe("Orders", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  it("creates one order per seller and decrements stock atomically", async () => {
    const sellerA = await createApprovedSeller();
    const sellerB = await createApprovedSeller();
    const buyerEmail = `buyer${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const { token } = await login(buyerEmail);

    const productA = await createProduct(
      sellerA.token,
      {
        name: "Item A",
        price: 100,
        stock: 5,
        status: "ACTIVE",
      },
    );
    const productB = await createProduct(
      sellerB.token,
      {
        name: "Item B",
        price: 200,
        stock: 3,
        status: "ACTIVE",
      },
    );

    const aId = productA.body.data.id;
    const bId = productB.body.data.id;

    await api
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: aId, quantity: 2 });
    await api
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: bId, quantity: 1 });

    const addressId = await createAddress(token);

    const checkout = await api
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ shippingAddressId: addressId });

    expect(checkout.status).toBe(201);
    expect(checkout.body.data).toHaveLength(2);

    const totals = checkout.body.data.map(
      (order: { total: number }) => order.total,
    );

    expect(totals.sort()).toEqual([200, 200]);

    const cart = await api
      .get("/api/v1/cart")
      .set("Authorization", `Bearer ${token}`);

    expect(cart.body.data.totalItems).toBe(0);

    const stockA = await api.get(
      `/api/v1/products/${aId}`,
    );
    expect(stockA.body.data.stock).toBe(3);

    const stockB = await api.get(
      `/api/v1/products/${bId}`,
    );
    expect(stockB.body.data.stock).toBe(2);
  });

  it("rejects checkout with an empty cart", async () => {
    const buyerEmail = `buyer${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const { token } = await login(buyerEmail);
    const addressId = await createAddress(token);

    const res = await api
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ shippingAddressId: addressId });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("EMPTY_CART");
  });

  it("blocks access to another buyer's order", async () => {
    const seller = await createApprovedSeller();
    const buyer1 = `b1${Date.now()}@test.com`;
    const buyer2 = `b2${Date.now()}@test.com`;
    await registerUser(buyer1);
    await registerUser(buyer2);
    const t1 = await login(buyer1);
    const t2 = await login(buyer2);

    const product = await createProduct(
      seller.token,
      { status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    await api
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${t1.token}`)
      .send({ productId, quantity: 1 });
    const addressId = await createAddress(t1.token);
    const checkout = await api
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${t1.token}`)
      .send({ shippingAddressId: addressId });
    const orderId = checkout.body.data[0].id;

    const res = await api
      .get(`/api/v1/orders/${orderId}`)
      .set("Authorization", `Bearer ${t2.token}`);

    expect(res.status).toBe(403);
  });

  it("walks the order lifecycle and rejects invalid transitions", async () => {
    const seller = await createApprovedSeller();
    const buyerEmail = `buyer${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(
      seller.token,
      { status: "ACTIVE" },
    );
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

    const buyerPatch = await api
      .patch(`/api/v1/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ status: "CONFIRMED" });

    expect(buyerPatch.status).toBe(403);

    const skip = await api
      .patch(`/api/v1/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({ status: "DELIVERED" });

    expect(skip.status).toBe(400);

    for (const status of [
      "CONFIRMED",
      "SHIPPED",
      "DELIVERED",
    ]) {
      const res = await api
        .patch(`/api/v1/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${seller.token}`)
        .send({ status });

      expect(res.status).toBe(200);
    }

    const backward = await api
      .patch(`/api/v1/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({ status: "PENDING" });

    expect(backward.status).toBe(400);
  });

  it("marks COD payment as received only after delivery", async () => {
    const seller = await createApprovedSeller();
    const buyerEmail = `buyer${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(
      seller.token,
      { status: "ACTIVE" },
    );
    await api
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ productId: product.body.data.id, quantity: 1 });
    const addressId = await createAddress(buyer.token);
    const checkout = await api
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ shippingAddressId: addressId });
    const orderId = checkout.body.data[0].id;

    const early = await api
      .post(`/api/v1/orders/${orderId}/pay`)
      .set("Authorization", `Bearer ${seller.token}`);

    expect(early.status).toBe(400);
    expect(early.body.code).toBe(
      "INVALID_PAYMENT_STATE",
    );

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

    const paid = await api
      .post(`/api/v1/orders/${orderId}/pay`)
      .set("Authorization", `Bearer ${seller.token}`);

    expect(paid.status).toBe(200);
    expect(paid.body.data.paymentStatus).toBe("PAID");
  });

  it("restores stock when an order is cancelled", async () => {
    const seller = await createApprovedSeller();
    const buyerEmail = `buyer${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(
      seller.token,
      { name: "Cancel Me", stock: 4, status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    await api
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ productId, quantity: 3 });
    const addressId = await createAddress(buyer.token);
    const checkout = await api
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ shippingAddressId: addressId });
    const orderId = checkout.body.data[0].id;

    let stock = await api.get(
      `/api/v1/products/${productId}`,
    );
    expect(stock.body.data.stock).toBe(1);

    const cancel = await api
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${buyer.token}`);

    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe(
      "CANCELLED",
    );

    stock = await api.get(
      `/api/v1/products/${productId}`,
    );
    expect(stock.body.data.stock).toBe(4);

    // Cancelling again must not restore stock twice.
    await api
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${buyer.token}`);

    stock = await api.get(
      `/api/v1/products/${productId}`,
    );
    expect(stock.body.data.stock).toBe(4);
  });

  it("never oversells when stock runs out between checkouts", async () => {
    const seller = await createApprovedSeller();
    const buyer1 = `o1${Date.now()}@test.com`;
    const buyer2 = `o2${Date.now()}@test.com`;
    await registerUser(buyer1);
    await registerUser(buyer2);
    const t1 = await login(buyer1);
    const t2 = await login(buyer2);

    const product = await createProduct(
      seller.token,
      { name: "Last One", stock: 1, status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    for (const token of [t1.token, t2.token]) {
      await api
        .post("/api/v1/cart/items")
        .set("Authorization", `Bearer ${token}`)
        .send({ productId, quantity: 1 });
    }

    const a1 = await createAddress(t1.token);
    const a2 = await createAddress(t2.token);

    const first = await api
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${t1.token}`)
      .send({ shippingAddressId: a1 });

    expect(first.status).toBe(201);

    const second = await api
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${t2.token}`)
      .send({ shippingAddressId: a2 });

    expect(second.status).toBe(400);
    expect(second.body.code).toBe(
      "INSUFFICIENT_STOCK",
    );

    const stock = await api.get(
      `/api/v1/products/${productId}`,
    );
    expect(stock.body.data.stock).toBe(0);

    const cart = await api
      .get("/api/v1/cart")
      .set("Authorization", `Bearer ${t2.token}`);

    expect(cart.body.data.totalItems).toBe(1);
  });
});
