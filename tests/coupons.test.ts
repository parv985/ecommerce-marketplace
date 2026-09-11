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
  registerUser,
} from "./helpers.js";

const DAY = 24 * 3600 * 1000;

const inPast = (days = 1): string =>
  new Date(Date.now() - days * DAY).toISOString();

const inFuture = (days = 30): string =>
  new Date(Date.now() + days * DAY).toISOString();

const createCoupon = (
  token: string,
  overrides: Record<string, unknown> = {},
) => {
  return api
    .post("/api/v1/coupons")
    .set("Authorization", `Bearer ${token}`)
    .send({
      code: `SAVE${Date.now() % 100000}`,
      type: "PERCENTAGE",
      value: 10,
      startAt: inPast(),
      endAt: inFuture(),
      ...overrides,
    });
};

const registerBuyer = async (): Promise<string> => {
  const email = `cbuyer${Date.now()}${Math.floor(
    Math.random() * 1000,
  )}@test.com`;
  await registerUser(email);
  const { token } = await login(email);
  return token;
};

const addToCartAndCheckout = async (
  token: string,
  productId: string,
  couponCode?: string,
): Promise<{ status: number; body: any }> => {
  await api
    .post("/api/v1/cart/items")
    .set("Authorization", `Bearer ${token}`)
    .send({ productId, quantity: 1 });

  const addressId = await createAddress(token);

  return api
    .post("/api/v1/orders")
    .set("Authorization", `Bearer ${token}`)
    .send({
      shippingAddressId: addressId,
      ...(couponCode !== undefined && {
        couponCode,
      }),
    });
};

describe("Coupons", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  it("creates a coupon and normalizes the code to uppercase", async () => {
    const seller = await createApprovedSeller();

    const res = await createCoupon(seller.token, {
      code: " welcome10 ",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe("WELCOME10");
  });

  it("rejects a duplicate coupon code", async () => {
    const seller = await createApprovedSeller();

    await createCoupon(seller.token, {
      code: "DUPCODE",
    });

    const res = await createCoupon(seller.token, {
      code: "DUPCODE",
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("COUPON_CODE_EXISTS");
  });

  it("rejects a buyer creating a coupon", async () => {
    const buyer = await registerBuyer();

    const res = await createCoupon(buyer, {
      code: "BUYERBAD",
    });

    expect(res.status).toBe(403);
  });

  it("rejects a percentage coupon over 100", async () => {
    const seller = await createApprovedSeller();

    const res = await createCoupon(seller.token, {
      code: "TOOBIG",
      type: "PERCENTAGE",
      value: 150,
    });

    expect(res.status).toBe(400);
  });

  it("only lets the owning seller read, update and deactivate", async () => {
    const sellerA = await createApprovedSeller();
    const sellerB = await createApprovedSeller();

    const created = await createCoupon(sellerA.token, {
      code: "OWNONLY",
    });
    const couponId = created.body.data.id;

    const otherRead = await api
      .get(`/api/v1/coupons/${couponId}`)
      .set("Authorization", `Bearer ${sellerB.token}`);
    expect(otherRead.status).toBe(404);

    const otherUpdate = await api
      .patch(`/api/v1/coupons/${couponId}`)
      .set("Authorization", `Bearer ${sellerB.token}`)
      .send({ value: 20 });
    expect(otherUpdate.status).toBe(404);

    const ownUpdate = await api
      .patch(`/api/v1/coupons/${couponId}`)
      .set("Authorization", `Bearer ${sellerA.token}`)
      .send({ value: 20 });
    expect(ownUpdate.status).toBe(200);
    expect(ownUpdate.body.data.value).toBe(20);

    const ownDelete = await api
      .delete(`/api/v1/coupons/${couponId}`)
      .set("Authorization", `Bearer ${sellerA.token}`);
    expect(ownDelete.status).toBe(200);

    const after = await api
      .get(`/api/v1/coupons/${couponId}`)
      .set("Authorization", `Bearer ${sellerA.token}`);
    expect(after.body.data.status).toBe("INACTIVE");
  });

  it("rejects a product restriction from another seller", async () => {
    const sellerA = await createApprovedSeller();
    const sellerB = await createApprovedSeller();
    const product = await createProduct(
      sellerA.token,
      { status: "ACTIVE" },
    );

    const res = await createCoupon(sellerB.token, {
      code: "BADREST",
      productIds: [product.body.data.id],
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(
      "INVALID_COUPON_RESTRICTION",
    );
  });

  it("applies a percentage coupon at checkout", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();

    const product = await createProduct(
      seller.token,
      { price: 1000, stock: 5, status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    const coupon = await createCoupon(seller.token, {
      code: "PCT10",
      value: 10,
    });

    const checkout = await addToCartAndCheckout(
      buyer,
      productId,
      "PCT10",
    );

    expect(checkout.status).toBe(201);
    const order = checkout.body.data[0];
    expect(order.itemsTotal).toBe(1000);
    expect(order.couponDiscount).toBe(100);
    expect(order.total).toBe(900);
    expect(order.couponCode).toBe("PCT10");
    expect(order.couponId).toBe(coupon.body.data.id);
  });

  it("applies coupon after the sales discount (single documented rule)", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();

    const product = await createProduct(
      seller.token,
      { price: 1000, stock: 5, status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    // 10% sales discount on the product, then 10% coupon on the rest.
    await api
      .post("/api/v1/discounts")
      .set("Authorization", `Bearer ${seller.token}`)
      .send({
        productId,
        discountValue: 10,
        startAt: inPast(),
        endAt: inFuture(),
      });

    await createCoupon(seller.token, {
      code: "AFTERDISC",
      value: 10,
    });

    const checkout = await addToCartAndCheckout(
      buyer,
      productId,
      "AFTERDISC",
    );

    const order = checkout.body.data[0];
    expect(order.discountTotal).toBe(100);
    expect(order.couponDiscount).toBe(90);
    expect(order.total).toBe(810);
  });

  it("applies a fixed coupon", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();

    const product = await createProduct(
      seller.token,
      { price: 1000, stock: 5, status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    await createCoupon(seller.token, {
      code: "FIX500",
      type: "FIXED",
      value: 500,
    });

    const checkout = await addToCartAndCheckout(
      buyer,
      productId,
      "FIX500",
    );

    const order = checkout.body.data[0];
    expect(order.couponDiscount).toBe(500);
    expect(order.total).toBe(500);
  });

  it("rejects a coupon below the minimum order value", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();

    const product = await createProduct(
      seller.token,
      { price: 500, stock: 5, status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    await createCoupon(seller.token, {
      code: "MIN1000",
      value: 10,
      minOrderValue: 1000,
    });

    const checkout = await addToCartAndCheckout(
      buyer,
      productId,
      "MIN1000",
    );

    expect(checkout.status).toBe(400);
    expect(checkout.body.code).toBe(
      "COUPON_MIN_ORDER_NOT_MET",
    );
  });

  it("rejects an inactive coupon", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();

    const product = await createProduct(
      seller.token,
      { price: 500, stock: 5, status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    await createCoupon(seller.token, {
      code: "DISABLED",
      value: 10,
      status: "INACTIVE",
    });

    const checkout = await addToCartAndCheckout(
      buyer,
      productId,
      "DISABLED",
    );

    expect(checkout.status).toBe(400);
    expect(checkout.body.code).toBe("COUPON_INACTIVE");
  });

  it("rejects a coupon that does not belong to any seller in the cart", async () => {
    const sellerA = await createApprovedSeller();
    const sellerB = await createApprovedSeller();
    const buyer = await registerBuyer();

    const product = await createProduct(
      sellerA.token,
      { price: 500, stock: 5, status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    // Coupon belongs to sellerB, but the cart only has sellerA's item.
    await createCoupon(sellerB.token, {
      code: "WRONGSELLER",
      value: 10,
    });

    const checkout = await addToCartAndCheckout(
      buyer,
      productId,
      "WRONGSELLER",
    );

    expect(checkout.status).toBe(400);
    expect(checkout.body.code).toBe(
      "COUPON_NOT_APPLICABLE",
    );
  });

  it("rejects a coupon when a restricted product does not qualify", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();

    const productA = await createProduct(
      seller.token,
      { name: "Eligible", price: 500, stock: 5, status: "ACTIVE" },
    );
    const productB = await createProduct(
      seller.token,
      { name: "Excluded", price: 500, stock: 5, status: "ACTIVE" },
    );

    await createCoupon(seller.token, {
      code: "ONLYA",
      value: 10,
      productIds: [productA.body.data.id],
    });

    // productB is in the cart -> restriction fails
    const checkout = await addToCartAndCheckout(
      buyer,
      productB.body.data.id,
      "ONLYA",
    );

    expect(checkout.status).toBe(400);
    expect(checkout.body.code).toBe(
      "COUPON_RESTRICTION_FAILED",
    );

    // productA qualifies
    const buyer2 = await registerBuyer();
    const ok = await addToCartAndCheckout(
      buyer2,
      productA.body.data.id,
      "ONLYA",
    );
    expect(ok.status).toBe(201);
  });

  it("enforces the per-user limit", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();

    const product = await createProduct(
      seller.token,
      { price: 500, stock: 20, status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    await createCoupon(seller.token, {
      code: "ONCEPER",
      value: 10,
      perUserLimit: 1,
      usageLimit: 10,
    });

    const first = await addToCartAndCheckout(
      buyer,
      productId,
      "ONCEPER",
    );
    expect(first.status).toBe(201);

    // New cart + new address for the second attempt.
    await api
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${buyer}`)
      .send({ productId, quantity: 1 });
    const addressId2 = await createAddress(buyer);
    const second = await api
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${buyer}`)
      .send({
        shippingAddressId: addressId2,
        couponCode: "ONCEPER",
      });

    expect(second.status).toBe(400);
    expect(second.body.code).toBe(
      "COUPON_PER_USER_LIMIT_REACHED",
    );
  });

  it("never lets the total usage limit be exceeded", async () => {
    const seller = await createApprovedSeller();
    const buyerA = await registerBuyer();
    const buyerB = await registerBuyer();

    const product = await createProduct(
      seller.token,
      { price: 500, stock: 20, status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    await createCoupon(seller.token, {
      code: "ONLYONE",
      value: 10,
      usageLimit: 1,
      perUserLimit: 10,
    });

    const first = await addToCartAndCheckout(
      buyerA,
      productId,
      "ONLYONE",
    );
    expect(first.status).toBe(201);

    const second = await addToCartAndCheckout(
      buyerB,
      productId,
      "ONLYONE",
    );
    expect(second.status).toBe(400);
    expect(second.body.code).toBe(
      "COUPON_USAGE_LIMIT_REACHED",
    );
  });

  it("releases the coupon when the order is cancelled", async () => {
    const seller = await createApprovedSeller();
    const buyerA = await registerBuyer();
    const buyerB = await registerBuyer();

    const product = await createProduct(
      seller.token,
      { price: 500, stock: 20, status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    await createCoupon(seller.token, {
      code: "RELEASE",
      value: 10,
      usageLimit: 1,
      perUserLimit: 10,
    });

    const first = await addToCartAndCheckout(
      buyerA,
      productId,
      "RELEASE",
    );
    const orderId = first.body.data[0].id;

    // Buyer A cancels -> usage must be released.
    const cancel = await api
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${buyerA}`);
    expect(cancel.status).toBe(200);

    // Buyer B can now use the same single-use coupon.
    const second = await addToCartAndCheckout(
      buyerB,
      productId,
      "RELEASE",
    );
    expect(second.status).toBe(201);
  });

  it("rejects an expired coupon as expired, never as invalid", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();

    const product = await createProduct(
      seller.token,
      { price: 500, stock: 5, status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    // Valid when created (endAt is after startAt) but already over.
    await createCoupon(seller.token, {
      code: "EXPIRED1",
      startAt: inPast(10),
      endAt: inPast(1),
    });

    const checkout = await addToCartAndCheckout(
      buyer,
      productId,
      "EXPIRED1",
    );

    expect(checkout.status).toBe(400);
    expect(checkout.body.code).toBe("COUPON_EXPIRED");
    expect(checkout.body.message).toBe(
      "Coupon code expired",
    );
  });

  it("derives the seller status: an expired coupon is INACTIVE", async () => {
    const seller = await createApprovedSeller();

    const created = await createCoupon(seller.token, {
      code: "EXPIRED2",
      startAt: inPast(10),
      endAt: inPast(1),
    });

    // Stored status stays ACTIVE (the manual switch), the API
    // reports the derived one.
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe("INACTIVE");

    const one = await api
      .get(`/api/v1/coupons/${created.body.data.id}`)
      .set("Authorization", `Bearer ${seller.token}`);
    expect(one.status).toBe(200);
    expect(one.body.data.status).toBe("INACTIVE");

    const all = await api
      .get("/api/v1/coupons")
      .set("Authorization", `Bearer ${seller.token}`);
    expect(all.body.data.items[0].status).toBe("INACTIVE");

    // The status filter follows the derived status too.
    const inactive = await api
      .get("/api/v1/coupons?status=INACTIVE")
      .set("Authorization", `Bearer ${seller.token}`);
    expect(
      inactive.body.data.items.map(
        (coupon: { code: string }) => coupon.code,
      ),
    ).toContain("EXPIRED2");

    const active = await api
      .get("/api/v1/coupons?status=ACTIVE")
      .set("Authorization", `Bearer ${seller.token}`);
    expect(active.body.data.items).toHaveLength(0);
  });

  it("marks a fully-used coupon INACTIVE even before it expires", async () => {
    const seller = await createApprovedSeller();
    const buyerA = await registerBuyer();
    const buyerB = await registerBuyer();

    const product = await createProduct(
      seller.token,
      { price: 500, stock: 20, status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    const created = await createCoupon(seller.token, {
      code: "USEDUP",
      value: 10,
      usageLimit: 1,
      perUserLimit: 10,
    });
    const couponId = created.body.data.id;

    const first = await addToCartAndCheckout(
      buyerA,
      productId,
      "USEDUP",
    );
    expect(first.status).toBe(201);

    const one = await api
      .get(`/api/v1/coupons/${couponId}`)
      .set("Authorization", `Bearer ${seller.token}`);

    // Still inside the date window, but out of uses.
    expect(
      new Date(one.body.data.endAt).getTime(),
    ).toBeGreaterThan(Date.now());
    expect(one.body.data.status).toBe("INACTIVE");

    const second = await addToCartAndCheckout(
      buyerB,
      productId,
      "USEDUP",
    );
    expect(second.status).toBe(400);
    expect(second.body.code).toBe(
      "COUPON_USAGE_LIMIT_REACHED",
    );
    expect(second.body.message).toBe(
      "Coupon code expired",
    );

    /*
     * Cancelling releases the slot again, so the derived status must
     * flip back to ACTIVE without any manual seller action.
     */
    await api
      .post(`/api/v1/orders/${first.body.data[0].id}/cancel`)
      .set("Authorization", `Bearer ${buyerA}`);

    const afterRelease = await api
      .get(`/api/v1/coupons/${couponId}`)
      .set("Authorization", `Bearer ${seller.token}`);
    expect(afterRelease.body.data.status).toBe("ACTIVE");
  });

  it("reports a coupon that has not started yet as inactive", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();

    const product = await createProduct(
      seller.token,
      { price: 500, stock: 5, status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    const created = await createCoupon(seller.token, {
      code: "SOON",
      startAt: inFuture(1),
      endAt: inFuture(10),
    });

    expect(created.body.data.status).toBe("INACTIVE");

    const checkout = await addToCartAndCheckout(
      buyer,
      productId,
      "SOON",
    );
    expect(checkout.status).toBe(400);
    expect(checkout.body.code).toBe("COUPON_INACTIVE");
  });

  it("scopes coupons to a category restriction", async () => {
    const admin = await adminLogin();
    const category = await api
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Coupon Category" });
    const categoryId = category.body.data.id;

    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();

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

    await createCoupon(seller.token, {
      code: "CATONLY",
      value: 25,
      categoryIds: [categoryId],
    });

    const checkout = await addToCartAndCheckout(
      buyer,
      productId,
      "CATONLY",
    );

    expect(checkout.status).toBe(201);
    expect(checkout.body.data[0].couponDiscount).toBe(
      250,
    );
  });
});
