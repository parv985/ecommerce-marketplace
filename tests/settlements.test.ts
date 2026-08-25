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
import { calculateCommission } from "../src/modules/settlements/commission.service.js";

const currentMonth = new Date()
  .toISOString()
  .slice(0, 7);

/*
 * Creates a delivered + paid (COD) order for the seller and returns
 * its id. Follows the existing order lifecycle.
 */
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

  return orderId;
};

describe("Commission and settlements", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  it("calculates commission correctly", () => {
    const result = calculateCommission(10000, 10);

    expect(result).toEqual({
      commissionRate: 10,
      commissionAmount: 1000,
      sellerPayable: 9000,
    });

    const noCommission = calculateCommission(500, 0);
    expect(noCommission.commissionAmount).toBe(0);
    expect(noCommission.sellerPayable).toBe(500);

    const full = calculateCommission(800, 100);
    expect(full.sellerPayable).toBe(0);
  });

  it("generates a settlement with the default 10% commission", async () => {
    const seller = await createApprovedSeller();
    const buyerEmail = `sbuyer${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(seller.token, {
      name: "Settle Me",
      price: 1000,
      stock: 5,
      status: "ACTIVE",
    });

    const { adminLogin } = await import("./helpers.js");
    const admin = await adminLogin();

    const orderId = await deliverAndPay(
      seller.token,
      buyer.token,
      product.body.data.id,
    );

    const generated = await api
      .post("/api/v1/admin/settlements/generate")
      .set("Authorization", `Bearer ${admin}`)
      .send({ month: currentMonth });

    expect(generated.status).toBe(201);
    expect(generated.body.data).toHaveLength(1);

    const settlement = generated.body.data[0];
    expect(settlement.status).toBe("PENDING");
    expect(settlement.periodKey).toBe(currentMonth);
    expect(settlement.totalSales).toBe(1000);
    expect(settlement.totalCommission).toBe(100);
    expect(settlement.totalPayable).toBe(900);
    expect(settlement.commissionRate).toBe(10);
    expect(settlement.orders).toHaveLength(1);
    expect(settlement.orders[0].orderId).toBe(
      orderId,
    );
    expect(settlement.orders[0].sellerPayable).toBe(
      900,
    );

    // Idempotent: regenerating the same month returns the same data.
    const again = await api
      .post("/api/v1/admin/settlements/generate")
      .set("Authorization", `Bearer ${admin}`)
      .send({ month: currentMonth });

    expect(again.status).toBe(201);
    expect(again.body.data).toHaveLength(1);
    expect(again.body.data[0].id).toBe(
      settlement.id,
    );

    // Seller sees their own settlement.
    const mine = await api
      .get(
        `/api/v1/sellers/settlement?month=${currentMonth}`,
      )
      .set("Authorization", `Bearer ${seller.token}`);

    expect(mine.status).toBe(200);
    expect(mine.body.data.id).toBe(settlement.id);

    // Another seller sees null.
    const otherSeller = await createApprovedSeller();
    const other = await api
      .get(
        `/api/v1/sellers/settlement?month=${currentMonth}`,
      )
      .set("Authorization", `Bearer ${otherSeller.token}`);

    expect(other.body.data).toBeNull();
  });

  it("snapshots the commission rate and preserves it after changes", async () => {
    const { adminLogin } = await import("./helpers.js");
    const admin = await adminLogin();
    const seller = await createApprovedSeller();
    const buyerEmail = `sb2${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(seller.token, {
      price: 2000,
      stock: 5,
      status: "ACTIVE",
    });
    await deliverAndPay(
      seller.token,
      buyer.token,
      product.body.data.id,
    );

    // Set a non-default rate BEFORE generating.
    const setRate = await api
      .patch("/api/v1/admin/settings/commission")
      .set("Authorization", `Bearer ${admin}`)
      .send({ rate: 15 });

    expect(setRate.status).toBe(200);

    const generated = await api
      .post("/api/v1/admin/settlements/generate")
      .set("Authorization", `Bearer ${admin}`)
      .send({ month: currentMonth });

    expect(generated.body.data[0].commissionRate).toBe(
      15,
    );
    expect(
      generated.body.data[0].totalCommission,
    ).toBe(300);
    expect(
      generated.body.data[0].totalPayable,
    ).toBe(1700);

    // Change the rate afterwards - the existing settlement is frozen.
    await api
      .patch("/api/v1/admin/settings/commission")
      .set("Authorization", `Bearer ${admin}`)
      .send({ rate: 5 });

    const fetched = await api
      .get(
        `/api/v1/admin/settlements/${generated.body.data[0].id}`,
      )
      .set("Authorization", `Bearer ${admin}`);

    expect(fetched.body.data.commissionRate).toBe(15);
    expect(fetched.body.data.totalCommission).toBe(
      300,
    );
  });

  it("walks the settlement status lifecycle and rejects invalid transitions", async () => {
    const { adminLogin } = await import("./helpers.js");
    const admin = await adminLogin();
    const seller = await createApprovedSeller();
    const buyerEmail = `sb3${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(seller.token, {
      price: 500,
      stock: 5,
      status: "ACTIVE",
    });
    await deliverAndPay(
      seller.token,
      buyer.token,
      product.body.data.id,
    );

    const generated = await api
      .post("/api/v1/admin/settlements/generate")
      .set("Authorization", `Bearer ${admin}`)
      .send({ month: currentMonth });

    const id = generated.body.data[0].id;

    // PENDING -> PROCESSING -> PAID
    const processing = await api
      .post(`/api/v1/admin/settlements/${id}/process`)
      .set("Authorization", `Bearer ${admin}`);
    expect(processing.body.data.status).toBe(
      "PROCESSING",
    );

    const paid = await api
      .post(`/api/v1/admin/settlements/${id}/mark-paid`)
      .set("Authorization", `Bearer ${admin}`);
    expect(paid.body.data.status).toBe("PAID");
    expect(paid.body.data.paidAt).toBeTruthy();

    // PAID is terminal.
    const invalid = await api
      .post(`/api/v1/admin/settlements/${id}/cancel`)
      .set("Authorization", `Bearer ${admin}`);
    expect(invalid.status).toBe(400);

    // Remind on a paid settlement is rejected.
    const remind = await api
      .post(`/api/v1/admin/settlements/${id}/remind`)
      .set("Authorization", `Bearer ${admin}`);
    expect(remind.status).toBe(400);
  });

  it("excludes cancelled and undelivered orders from settlements", async () => {
    const { adminLogin } = await import("./helpers.js");
    const admin = await adminLogin();
    const seller = await createApprovedSeller();
    const buyerEmail = `sb4${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const product = await createProduct(seller.token, {
      price: 300,
      stock: 10,
      status: "ACTIVE",
    });
    const productId = product.body.data.id;

    // One delivered + paid order.
    await deliverAndPay(
      seller.token,
      buyer.token,
      productId,
    );

    // One cancelled order (delivered never happens).
    await api
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ productId, quantity: 1 });
    const addressId = await createAddress(buyer.token);
    const checkout = await api
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ shippingAddressId: addressId });
    await api
      .post(
        `/api/v1/orders/${checkout.body.data[0].id}/cancel`,
      )
      .set("Authorization", `Bearer ${buyer.token}`);

    // One pending (undelivered) order.
    await api
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ productId, quantity: 1 });
    const checkout2 = await api
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ shippingAddressId: addressId });
    expect(checkout2.status).toBe(201);

    const generated = await api
      .post("/api/v1/admin/settlements/generate")
      .set("Authorization", `Bearer ${admin}`)
      .send({ month: currentMonth });

    const settlement = generated.body.data[0];
    expect(settlement.orders).toHaveLength(1);
    expect(settlement.totalSales).toBe(300);
  });

  it("enforces admin-only access on settlement endpoints", async () => {
    const seller = await createApprovedSeller();
    const buyerEmail = `sb5${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const buyer = await login(buyerEmail);

    const list = await api
      .get("/api/v1/admin/settlements")
      .set("Authorization", `Bearer ${seller.token}`);
    expect(list.status).toBe(403);

    const generate = await api
      .post("/api/v1/admin/settlements/generate")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ month: currentMonth });
    expect(generate.status).toBe(403);

    const settings = await api
      .get("/api/v1/admin/settings/commission")
      .set("Authorization", `Bearer ${seller.token}`);
    expect(settings.status).toBe(403);

    const unauth = await api.get(
      "/api/v1/admin/settlements",
    );
    expect(unauth.status).toBe(401);
  });
});
