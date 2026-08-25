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
  adminLogin,
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

const DAY = 24 * 3600 * 1000;

const inPast = (days = 1): string =>
  new Date(Date.now() - days * DAY).toISOString();

const inFuture = (days = 30): string =>
  new Date(Date.now() + days * DAY).toISOString();

const createDiscount = (
  token: string,
  overrides: Record<string, unknown> = {},
) => {
  return api
    .post("/api/v1/discounts")
    .set("Authorization", `Bearer ${token}`)
    .send({
      discountValue: 10,
      startAt: inPast(),
      endAt: inFuture(),
      ...overrides,
    });
};

const addToCartAndCheckout = async (
  token: string,
  productId: string,
): Promise<{
  status: number;
  body: any;
}> => {
  await api
    .post("/api/v1/cart/items")
    .set("Authorization", `Bearer ${token}`)
    .send({ productId, quantity: 1 });

  const addressId = await createAddress(token);

  return api
    .post("/api/v1/orders")
    .set("Authorization", `Bearer ${token}`)
    .send({ shippingAddressId: addressId });
};

describe("Discounts", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  it("creates a product discount", async () => {
    const seller = await createApprovedSeller();
    const product = await createProduct(
      seller.token,
      { status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    const res = await createDiscount(seller.token, {
      productId,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.productId).toBe(productId);
    expect(res.body.data.discountValue).toBe(10);
    expect(res.body.data.discountType).toBe(
      "PERCENTAGE",
    );
  });

  it("rejects a discount without a target", async () => {
    const seller = await createApprovedSeller();

    const res = await createDiscount(seller.token);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a discount with both product and category", async () => {
    const seller = await createApprovedSeller();
    const admin = await adminLogin();
    const category = await api
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Both-Target" });

    const product = await createProduct(
      seller.token,
      { status: "ACTIVE" },
    );

    const res = await createDiscount(seller.token, {
      productId: product.body.data.id,
      categoryId: category.body.data.id,
    });

    expect(res.status).toBe(400);
  });

  it("rejects an end date before the start date", async () => {
    const seller = await createApprovedSeller();
    const product = await createProduct(
      seller.token,
      { status: "ACTIVE" },
    );

    const res = await createDiscount(seller.token, {
      productId: product.body.data.id,
      startAt: inFuture(10),
      endAt: inFuture(5),
    });

    expect(res.status).toBe(400);
  });

  it("rejects a discount percentage outside 1-100", async () => {
    const seller = await createApprovedSeller();
    const product = await createProduct(
      seller.token,
      { status: "ACTIVE" },
    );

    const zero = await createDiscount(seller.token, {
      productId: product.body.data.id,
      discountValue: 0,
    });
    expect(zero.status).toBe(400);

    const over = await createDiscount(seller.token, {
      productId: product.body.data.id,
      discountValue: 101,
    });
    expect(over.status).toBe(400);
  });

  it("rejects a discount targeting another seller's product", async () => {
    const sellerA = await createApprovedSeller();
    const sellerB = await createApprovedSeller();
    const product = await createProduct(
      sellerA.token,
      { status: "ACTIVE" },
    );

    const res = await createDiscount(sellerB.token, {
      productId: product.body.data.id,
    });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("rejects a buyer creating a discount", async () => {
    const buyerEmail = `buyer${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const res = await createDiscount(buyer.token, {
      productId: new mongoose.Types.ObjectId().toString(),
    });

    expect(res.status).toBe(403);
  });

  it("only lets the owning seller read, update and deactivate", async () => {
    const sellerA = await createApprovedSeller();
    const sellerB = await createApprovedSeller();
    const product = await createProduct(
      sellerA.token,
      { status: "ACTIVE" },
    );

    const created = await createDiscount(sellerA.token, {
      productId: product.body.data.id,
    });
    const discountId = created.body.data.id;

    const otherRead = await api
      .get(`/api/v1/discounts/${discountId}`)
      .set("Authorization", `Bearer ${sellerB.token}`);
    expect(otherRead.status).toBe(404);

    const otherUpdate = await api
      .patch(`/api/v1/discounts/${discountId}`)
      .set("Authorization", `Bearer ${sellerB.token}`)
      .send({ discountValue: 20 });
    expect(otherUpdate.status).toBe(404);

    const otherDelete = await api
      .delete(`/api/v1/discounts/${discountId}`)
      .set("Authorization", `Bearer ${sellerB.token}`);
    expect(otherDelete.status).toBe(404);

    const ownUpdate = await api
      .patch(`/api/v1/discounts/${discountId}`)
      .set("Authorization", `Bearer ${sellerA.token}`)
      .send({ discountValue: 20 });
    expect(ownUpdate.status).toBe(200);
    expect(ownUpdate.body.data.discountValue).toBe(20);

    const ownDelete = await api
      .delete(`/api/v1/discounts/${discountId}`)
      .set("Authorization", `Bearer ${sellerA.token}`);
    expect(ownDelete.status).toBe(200);

    const after = await api
      .get(`/api/v1/discounts/${discountId}`)
      .set("Authorization", `Bearer ${sellerA.token}`);
    expect(after.body.data.status).toBe("INACTIVE");
  });

  it("lists only the seller's own discounts with pagination", async () => {
    const sellerA = await createApprovedSeller();
    const sellerB = await createApprovedSeller();
    const productA = await createProduct(
      sellerA.token,
      { status: "ACTIVE" },
    );
    const productB = await createProduct(
      sellerB.token,
      { status: "ACTIVE" },
    );

    await createDiscount(sellerA.token, {
      productId: productA.body.data.id,
    });
    await createDiscount(sellerA.token, {
      productId: productA.body.data.id,
      discountValue: 5,
    });
    await createDiscount(sellerB.token, {
      productId: productB.body.data.id,
    });

    const res = await api
      .get("/api/v1/discounts")
      .set("Authorization", `Bearer ${sellerA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items).toHaveLength(2);

    const statusFiltered = await api
      .get("/api/v1/discounts?status=INACTIVE")
      .set("Authorization", `Bearer ${sellerA.token}`);
    expect(statusFiltered.body.data.total).toBe(0);
  });

  it("applies an active product discount at checkout", async () => {
    const seller = await createApprovedSeller();
    const buyerEmail = `buyer${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(
      seller.token,
      { name: "Priced", price: 1000, stock: 5, status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    await createDiscount(seller.token, { productId });

    const checkout = await addToCartAndCheckout(
      buyer.token,
      productId,
    );

    expect(checkout.status).toBe(201);
    const order = checkout.body.data[0];
    expect(order.itemsTotal).toBe(1000);
    expect(order.discountTotal).toBe(100);
    expect(order.total).toBe(900);
    expect(order.items[0].discountAmount).toBe(100);
    expect(order.items[0].price).toBe(1000);
  });

  it("ignores inactive, expired and future discounts at checkout", async () => {
    const seller = await createApprovedSeller();
    const buyerEmail = `buyer${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(
      seller.token,
      { price: 500, stock: 5, status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    await createDiscount(seller.token, {
      productId,
      discountValue: 50,
      status: "INACTIVE",
    });
    await createDiscount(seller.token, {
      productId,
      discountValue: 50,
      startAt: inPast(10),
      endAt: inPast(2),
    });
    await createDiscount(seller.token, {
      productId,
      discountValue: 50,
      startAt: inFuture(2),
      endAt: inFuture(10),
    });

    const checkout = await addToCartAndCheckout(
      buyer.token,
      productId,
    );

    const order = checkout.body.data[0];
    expect(order.itemsTotal).toBe(500);
    expect(order.discountTotal).toBe(0);
    expect(order.total).toBe(500);
  });

  it("applies a category discount at checkout", async () => {
    const admin = await adminLogin();
    const category = await api
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Discounted Category" });
    const categoryId = category.body.data.id;

    const seller = await createApprovedSeller();
    const buyerEmail = `buyer${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(
      seller.token,
      {
        name: "Categorized",
        price: 2000,
        stock: 5,
        status: "ACTIVE",
        category: categoryId,
      },
    );
    const productId = product.body.data.id;

    await createDiscount(seller.token, {
      categoryId,
      discountValue: 10,
    });

    const checkout = await addToCartAndCheckout(
      buyer.token,
      productId,
    );

    const order = checkout.body.data[0];
    expect(order.discountTotal).toBe(200);
    expect(order.total).toBe(1800);
  });

  it("product discount beats category discount at checkout", async () => {
    const admin = await adminLogin();
    const category = await api
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Mixed Category" });
    const categoryId = category.body.data.id;

    const seller = await createApprovedSeller();
    const buyerEmail = `buyer${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(
      seller.token,
      {
        price: 1000,
        stock: 5,
        status: "ACTIVE",
        category: categoryId,
      },
    );
    const productId = product.body.data.id;

    // Category discount is bigger, but the product discount wins.
    await createDiscount(seller.token, {
      categoryId,
      discountValue: 50,
    });
    await createDiscount(seller.token, {
      productId,
      discountValue: 10,
    });

    const checkout = await addToCartAndCheckout(
      buyer.token,
      productId,
    );

    const order = checkout.body.data[0];
    expect(order.discountTotal).toBe(100);
    expect(order.total).toBe(900);
  });
});
