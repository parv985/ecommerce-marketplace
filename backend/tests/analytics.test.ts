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

const registerBuyer = async (): Promise<string> => {
  const email = `abuyer${Date.now()}${Math.floor(
    Math.random() * 1000,
  )}@test.com`;
  await registerUser(email);
  const { token } = await login(email);
  return token;
};

/*
 * Buyer checks out one unit of productId and returns the order id.
 */
const checkoutOne = async (
  buyer: string,
  productId: string,
): Promise<string> => {
  await api
    .post("/api/v1/cart/items")
    .set("Authorization", `Bearer ${buyer}`)
    .send({ productId, quantity: 1 });
  const addressId = await createAddress(buyer);
  const res = await api
    .post("/api/v1/orders")
    .set("Authorization", `Bearer ${buyer}`)
    .send({ shippingAddressId: addressId });
  return res.body.data[0].id;
};

const deliverAndPay = async (
  sellerToken: string,
  orderId: string,
): Promise<void> => {
  for (const status of [
    "CONFIRMED",
    "SHIPPED",
    "DELIVERED",
  ]) {
    await api
      .patch(`/api/v1/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ status });
  }

  await api
    .post(`/api/v1/orders/${orderId}/pay`)
    .set("Authorization", `Bearer ${sellerToken}`);
};

describe("Seller analytics", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  it("reports dashboard and revenue from delivered + paid orders only", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();

    const product = await createProduct(
      seller.token,
      { price: 1000, stock: 10, status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    const order1 = await checkoutOne(buyer, productId);
    const order2 = await checkoutOne(buyer, productId);

    // order1: delivered + paid. order2: cancelled.
    await deliverAndPay(seller.token, order1);
    await api
      .post(`/api/v1/orders/${order2}/cancel`)
      .set("Authorization", `Bearer ${buyer}`);

    const dashboard = await api
      .get("/api/v1/sellers/dashboard")
      .set("Authorization", `Bearer ${seller.token}`);

    expect(dashboard.status).toBe(200);
    const data = dashboard.body.data;
    expect(data.orders.total).toBe(2);
    expect(data.orders.delivered).toBe(1);
    expect(data.orders.cancelled).toBe(1);
    expect(data.orders.pending).toBe(0);
    expect(data.revenue.total).toBe(1000);
    expect(data.products.total).toBe(1);
    expect(data.products.active).toBe(1);
    expect(data.marketing.discounts).toBe(0);

    const revenue = await api
      .get("/api/v1/sellers/revenue")
      .set("Authorization", `Bearer ${seller.token}`);

    expect(revenue.body.data.totalRevenue).toBe(1000);
    expect(revenue.body.data.totalOrders).toBe(2);
    expect(revenue.body.data.deliveredOrders).toBe(1);
    expect(revenue.body.data.cancelledOrders).toBe(1);
    expect(revenue.body.data.returnedOrders).toBe(0);
    expect(revenue.body.data.series.length).toBeGreaterThan(0);
    expect(
      revenue.body.data.series.reduce(
        (sum: number, p: { revenue: number }) =>
          sum + p.revenue,
        0,
      ),
    ).toBe(1000);

    const series = await api
      .get("/api/v1/sellers/analytics/sales?groupBy=day")
      .set("Authorization", `Bearer ${seller.token}`);
    expect(series.body.data.length).toBeGreaterThan(0);

    const top = await api
      .get("/api/v1/sellers/analytics/top-products")
      .set("Authorization", `Bearer ${seller.token}`);
    expect(top.body.data[0].name).toBe("Test Product");
    expect(top.body.data[0].quantity).toBe(2);
    expect(top.body.data[0].revenue).toBe(1000);
  });

  it("lists only customers who ordered from this seller", async () => {
    const sellerA = await createApprovedSeller();
    const sellerB = await createApprovedSeller();
    const buyer1 = await registerBuyer();
    const buyer2 = await registerBuyer();

    const productA = await createProduct(
      sellerA.token,
      { price: 500, stock: 10, status: "ACTIVE" },
    );
    const productB = await createProduct(
      sellerB.token,
      { price: 900, stock: 10, status: "ACTIVE" },
    );

    // buyer1 orders from both sellers; buyer2 only from sellerB.
    const o1 = await checkoutOne(buyer1, productA.body.data.id);
    await deliverAndPay(sellerA.token, o1);
    await checkoutOne(buyer1, productB.body.data.id);
    await checkoutOne(buyer2, productB.body.data.id);

    const customersA = await api
      .get("/api/v1/sellers/customers")
      .set("Authorization", `Bearer ${sellerA.token}`);

    expect(customersA.body.data.total).toBe(1);
    expect(customersA.body.data.items[0].orderCount).toBe(1);
    expect(customersA.body.data.items[0].totalSpent).toBe(500);

    const customersB = await api
      .get("/api/v1/sellers/customers")
      .set("Authorization", `Bearer ${sellerB.token}`);

    expect(customersB.body.data.total).toBe(2);

    // Search narrows the result.
    const search = await api
      .get("/api/v1/sellers/customers?search=abuyer")
      .set("Authorization", `Bearer ${sellerB.token}`);
    expect(search.body.data.total).toBe(2);
  });

  it("reports category performance", async () => {
    const admin = await adminLogin();
    const category = await api
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Analytics Category" });
    const categoryId = category.body.data.id;

    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();

    const product = await createProduct(
      seller.token,
      {
        price: 800,
        stock: 10,
        status: "ACTIVE",
        category: categoryId,
      },
    );
    const productId = product.body.data.id;

    const orderId = await checkoutOne(buyer, productId);
    await deliverAndPay(seller.token, orderId);

    const cats = await api
      .get("/api/v1/sellers/analytics/categories")
      .set("Authorization", `Bearer ${seller.token}`);

    expect(cats.status).toBe(200);
    expect(cats.body.data[0].categoryId).toBe(categoryId);
    expect(cats.body.data[0].quantity).toBe(1);
    expect(cats.body.data[0].revenue).toBe(800);
  });

  it("blocks buyers from seller analytics", async () => {
    const buyer = await registerBuyer();

    const dashboard = await api
      .get("/api/v1/sellers/dashboard")
      .set("Authorization", `Bearer ${buyer}`);
    expect(dashboard.status).toBe(403);

    const customers = await api
      .get("/api/v1/sellers/customers")
      .set("Authorization", `Bearer ${buyer}`);
    expect(customers.status).toBe(403);
  });
});
