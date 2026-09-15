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

describe("Reviews", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  const deliverProduct = async () => {
    const seller = await createApprovedSeller();
    const buyerEmail = `rv${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(
      seller.token,
      { name: "Reviewable", status: "ACTIVE" },
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

    return { buyer, productId };
  };

  it("blocks reviews without a delivered purchase", async () => {
    const buyerEmail = `rv${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const { token } = await login(buyerEmail);

    const seller = await createApprovedSeller();
    const product = await createProduct(
      seller.token,
      { status: "ACTIVE" },
    );

    const res = await api
      .post("/api/v1/reviews")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productId: product.body.data.id,
        rating: 5,
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe(
      "NOT_ELIGIBLE_FOR_REVIEW",
    );
  });

  it("creates, lists and aggregates a review", async () => {
    const { buyer, productId } =
      await deliverProduct();

    const res = await api
      .post("/api/v1/reviews")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({
        productId,
        rating: 5,
        comment: "Excellent!",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.rating).toBe(5);

    const list = await api.get(
      `/api/v1/reviews/product/${productId}`,
    );

    expect(list.status).toBe(200);
    expect(list.body.data.averageRating).toBe(5);
    expect(list.body.data.reviewCount).toBe(1);
    expect(list.body.data.items[0].comment).toBe(
      "Excellent!",
    );
  });

  it("rejects duplicate reviews for the same product", async () => {
    const { buyer, productId } =
      await deliverProduct();

    await api
      .post("/api/v1/reviews")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ productId, rating: 4 });

    const res = await api
      .post("/api/v1/reviews")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ productId, rating: 2 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe(
      "REVIEW_ALREADY_EXISTS",
    );
  });

  it("rejects out-of-range ratings", async () => {
    const { buyer, productId } =
      await deliverProduct();

    const res = await api
      .post("/api/v1/reviews")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ productId, rating: 6 });

    expect(res.status).toBe(400);
  });

  it("enforces ownership on update and delete", async () => {
    const { buyer, productId } =
      await deliverProduct();

    const otherEmail = `rv${Date.now()}@test.com`;
    await registerUser(otherEmail);
    const other = await login(otherEmail);

    const created = await api
      .post("/api/v1/reviews")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ productId, rating: 4, comment: "Nice" });
    const reviewId = created.body.data.id;

    const otherPatch = await api
      .patch(`/api/v1/reviews/${reviewId}`)
      .set("Authorization", `Bearer ${other.token}`)
      .send({ rating: 1 });

    expect(otherPatch.status).toBe(403);

    const ownPatch = await api
      .patch(`/api/v1/reviews/${reviewId}`)
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ rating: 2 });

    expect(ownPatch.status).toBe(200);
    expect(ownPatch.body.data.rating).toBe(2);

    const otherDelete = await api
      .delete(`/api/v1/reviews/${reviewId}`)
      .set("Authorization", `Bearer ${other.token}`);

    expect(otherDelete.status).toBe(403);

    const ownDelete = await api
      .delete(`/api/v1/reviews/${reviewId}`)
      .set("Authorization", `Bearer ${buyer.token}`);

    expect(ownDelete.status).toBe(200);
  });
});
