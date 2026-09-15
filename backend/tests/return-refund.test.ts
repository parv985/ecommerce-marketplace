import crypto from "crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { OrderStatus } from "../src/constants/orderStatus.js";
import { Order } from "../src/models/Order.js";
import { Payment } from "../src/models/Payment.js";
import { Product } from "../src/models/Product.js";
import { Coupon } from "../src/models/Coupon.js";
import { CouponUsage } from "../src/models/CouponUsage.js";
import {
  InventoryTransaction,
  InventoryTransactionType,
} from "../src/models/InventoryTransaction.js";
import { ReturnRequest } from "../src/models/ReturnRequest.js";
import { Notification } from "../src/models/Notification.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Settlement } from "../src/models/Settlement.js";
import { OrderTimeline } from "../src/models/OrderTimeline.js";
import { RETURN_APPROVED_REFUND_MESSAGE } from "../src/constants/notificationTypes.js";

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

/*
 * End-to-end coverage of the return -> approval -> refund -> rollback
 * pipeline: the buyer gets the money back, the order/payment/return
 * records agree, and everything the purchase changed (stock, coupon,
 * seller earnings, platform commission, history) is rolled back exactly
 * once - even when the approval endpoint is called repeatedly.
 */

const DAY = 24 * 3600 * 1000;

/* Mock-gateway payment signature (see tests/payments.test.ts). */
const MOCK_SECRET = "mock-payment-signing-secret";

const clientSignature = (
  gatewayOrderId: string,
  paymentId: string,
): string =>
  crypto
    .createHmac("sha256", MOCK_SECRET)
    .update(`${gatewayOrderId}|${paymentId}`)
    .digest("hex");

const currentMonth = new Date()
  .toISOString()
  .slice(0, 7);

const registerBuyer = async (): Promise<string> => {
  const email = `refund${Date.now()}${Math.floor(
    Math.random() * 10000,
  )}@test.com`;
  await registerUser(email);
  const { token } = await login(email);
  return token;
};

interface Fixture {
  orderId: string;
  orderNumber: string;
  productId: string;
  seller: { token: string; email: string };
  buyer: string;
  admin: string;
}

/*
 * Delivered + paid order (COD by default) with a pending return, ready
 * for the seller to approve. Stock starts at `stock`, 1 unit is bought.
 */
const deliveredOrderWithReturn = async (
  options: {
    stock?: number;
    price?: number;
    paymentMethod?: "CASH_ON_DELIVERY" | "ONLINE";
    couponCode?: string;
    markPaid?: boolean;
    /* Reuse an existing seller/buyer (e.g. when a coupon must belong
     * to the seller the order is placed with). */
    seller?: { token: string; email: string };
    buyer?: string;
  } = {},
): Promise<Fixture & { returnId: string }> => {
  const seller =
    options.seller ?? (await createApprovedSeller());
  const buyer = options.buyer ?? (await registerBuyer());
  const admin = await adminLogin();

  const product = await createProduct(seller.token, {
    name: "Refundable Widget",
    price: options.price ?? 500,
    stock: options.stock ?? 3,
    status: "ACTIVE",
  });
  const productId = product.body.data.id;

  await api
    .post("/api/v1/cart/items")
    .set("Authorization", `Bearer ${buyer}`)
    .send({ productId, quantity: 1 });

  const addressId = await createAddress(buyer);

  const checkout = await api
    .post("/api/v1/orders")
    .set("Authorization", `Bearer ${buyer}`)
    .send({
      shippingAddressId: addressId,
      ...(options.paymentMethod && {
        paymentMethod: options.paymentMethod,
      }),
      ...(options.couponCode && {
        couponCode: options.couponCode,
      }),
    });

  const order = checkout.body.data[0];
  const orderId = order.id as string;

  /* Online orders are paid through the (mock) gateway. */
  if (options.paymentMethod === "ONLINE") {
    const initiated = await api
      .post(`/api/v1/payments/orders/${orderId}/initiate`)
      .set("Authorization", `Bearer ${buyer}`);

    const gatewayOrderId =
      initiated.body.data.gatewayOrderId;

    await api
      .post(`/api/v1/payments/orders/${orderId}/verify`)
      .set("Authorization", `Bearer ${buyer}`)
      .send({
        paymentId: "pay_return_test",
        signature: clientSignature(
          gatewayOrderId,
          "pay_return_test",
        ),
      });
  }

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

  /* COD money is recorded as received after delivery. */
  if (
    options.paymentMethod !== "ONLINE" &&
    options.markPaid !== false
  ) {
    await api
      .post(`/api/v1/orders/${orderId}/pay`)
      .set("Authorization", `Bearer ${seller.token}`);
  }

  const created = await api
    .post("/api/v1/returns")
    .set("Authorization", `Bearer ${buyer}`)
    .send({
      orderId,
      reason: "Item arrived damaged",
    });

  return {
    orderId,
    orderNumber: order.orderNumber,
    productId,
    seller,
    buyer,
    admin,
    returnId: created.body.data.id,
  };
};

const approveReturn = (
  sellerToken: string,
  returnId: string,
) =>
  api
    .patch(`/api/v1/returns/${returnId}/status`)
    .set("Authorization", `Bearer ${sellerToken}`)
    .send({ status: "APPROVED" });

const productStock = async (
  productId: string,
): Promise<number> =>
  (
    await Product.findById(productId)
      .select("stock")
      .exec()
  )!.stock;

describe("Return approval: refund + rollbacks", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  it("refunds the buyer and rolls the purchase back when the seller approves", async () => {
    const fixture =
      await deliveredOrderWithReturn({ stock: 3 });

    expect(await productStock(fixture.productId)).toBe(
      2,
    );

    const res = await approveReturn(
      fixture.seller.token,
      fixture.returnId,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("APPROVED");
    expect(res.body.data.refund).toMatchObject({
      amount: 500,
      status: "PROCESSED",
      method: "OFFLINE",
    });
    expect(res.body.data.refund.completedAt).toBeTruthy();
    expect(res.body.data.approvedAt).toBeTruthy();
    expect(
      res.body.data.stockRestoredAt,
    ).toBeTruthy();

    /* Order: closed as RETURNED with the money marked refunded. */
    const order = (await Order.findById(
      fixture.orderId,
    ).exec())!;
    expect(order.status).toBe("RETURNED");
    expect(order.paymentStatus).toBe("REFUNDED");
    expect(order.returnedAt).toBeInstanceOf(Date);
    expect(
      order.returnRequestId?.toString(),
    ).toBe(fixture.returnId);

    /* Inventory back with the seller, with a transaction trail. */
    expect(await productStock(fixture.productId)).toBe(
      3,
    );

    const restock =
      await InventoryTransaction.findOne({
        productId: fixture.productId,
        type: InventoryTransactionType.RETURN_RESTOCK,
      }).exec();
    expect(restock).toBeTruthy();
    expect(restock!.quantity).toBe(1);
    expect(restock!.newStock).toBe(3);
    expect(
      restock!.referenceId?.toString(),
    ).toBe(fixture.returnId);

    /* History + audit. */
    const timeline = await OrderTimeline.findOne({
      orderId: fixture.orderId,
      status: OrderStatus.RETURNED,
    }).exec();
    expect(timeline).toBeTruthy();

    const audit = await AuditLog.findOne({
      action: "RETURN_APPROVED",
      entityId: fixture.returnId,
    }).exec();
    expect(audit).toBeTruthy();

    /* The buyer is told, in the notification centre. */
    const notifications = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${fixture.buyer}`);

    const refundNotice = (
      notifications.body.data.items as Array<{
        message: string;
        type: string;
      }>
    ).find(
      (item) =>
        item.type === "RETURN_STATUS" &&
        item.message ===
          RETURN_APPROVED_REFUND_MESSAGE,
    );

    expect(refundNotice).toBeTruthy();
    expect(RETURN_APPROVED_REFUND_MESSAGE).toBe(
      "Your return has been approved and your refund has been processed successfully.",
    );

    /* The seller is told what changed on their side. */
    const sellerNotice = await Notification.findOne({
      title: "Return approved and refunded",
      entityType: "RETURN",
      entityId: fixture.returnId,
    }).exec();
    expect(sellerNotice).toBeTruthy();
    expect(sellerNotice!.message).toContain(
      fixture.orderNumber,
    );
  });

  it("refunds an online payment through the gateway and marks the payment refunded", async () => {
    const fixture = await deliveredOrderWithReturn({
      paymentMethod: "ONLINE",
    });

    const res = await approveReturn(
      fixture.seller.token,
      fixture.returnId,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.refund).toMatchObject({
      amount: 500,
      status: "PROCESSED",
      method: "GATEWAY",
    });
    expect(
      res.body.data.refund.gatewayRefundId,
    ).toMatch(/^mock_refund_/);

    const payment = (await Payment.findOne({
      orderId: fixture.orderId,
    }).exec())!;
    expect(payment.status).toBe("REFUNDED");
    expect(payment.refund?.amount).toBe(500);
    expect(payment.refund?.gatewayRefundId).toMatch(
      /^mock_refund_/,
    );

    const order = (await Order.findById(
      fixture.orderId,
    ).exec())!;
    expect(order.status).toBe("RETURNED");
    expect(order.paymentStatus).toBe("REFUNDED");
  });

  it("never refunds twice when the approval endpoint is called again", async () => {
    const fixture =
      await deliveredOrderWithReturn({ stock: 5 });

    const first = await approveReturn(
      fixture.seller.token,
      fixture.returnId,
    );
    expect(first.status).toBe(200);

    /* Sequential repeat. */
    const again = await approveReturn(
      fixture.seller.token,
      fixture.returnId,
    );
    expect(again.status).toBe(200);
    expect(again.body.data.refund.amount).toBe(500);
    expect(
      again.body.data.refund.completedAt,
    ).toBe(first.body.data.refund.completedAt);

    /* Concurrent repeats (double click). */
    const raced = await Promise.all([
      approveReturn(fixture.seller.token, fixture.returnId),
      approveReturn(fixture.seller.token, fixture.returnId),
      approveReturn(fixture.seller.token, fixture.returnId),
    ]);

    expect(
      raced.every((response) => response.status === 200),
    ).toBe(true);

    /* One refund, one stock credit, one approval audit entry. */
    const returns = await ReturnRequest.findById(
      fixture.returnId,
    ).exec();
    expect(returns!.refund?.status).toBe("PROCESSED");
    expect(returns!.refund?.amount).toBe(500);

    expect(await productStock(fixture.productId)).toBe(
      5,
    );

    const restocks =
      await InventoryTransaction.countDocuments({
        productId: fixture.productId,
        type: InventoryTransactionType.RETURN_RESTOCK,
      });
    expect(restocks).toBe(1);

    const approvals = await AuditLog.countDocuments({
      action: "RETURN_APPROVED",
      entityId: fixture.returnId,
    });
    expect(approvals).toBe(1);

    const timelineEntries =
      await OrderTimeline.countDocuments({
        orderId: fixture.orderId,
        status: OrderStatus.RETURNED,
      });
    expect(timelineEntries).toBe(1);
  });

  it("refunds only once when two sellers approve at the same time", async () => {
    const fixture =
      await deliveredOrderWithReturn({ stock: 4 });

    const results = await Promise.all([
      approveReturn(fixture.seller.token, fixture.returnId),
      approveReturn(fixture.seller.token, fixture.returnId),
    ]);

    const successes = results.filter(
      (response) => response.status === 200,
    );
    expect(successes.length).toBeGreaterThan(0);

    const stored = await ReturnRequest.findById(
      fixture.returnId,
    ).exec();
    expect(stored!.refund?.status).toBe("PROCESSED");
    expect(stored!.refund?.amount).toBe(500);
    expect(await productStock(fixture.productId)).toBe(
      4,
    );
  });

  it("does not restore stock a second time when the return is completed", async () => {
    const fixture =
      await deliveredOrderWithReturn({ stock: 3 });

    await approveReturn(
      fixture.seller.token,
      fixture.returnId,
    );
    expect(await productStock(fixture.productId)).toBe(
      3,
    );

    const complete = await api
      .patch(`/api/v1/returns/${fixture.returnId}/status`)
      .set("Authorization", `Bearer ${fixture.seller.token}`)
      .send({ status: "COMPLETED" });

    expect(complete.status).toBe(200);
    expect(complete.body.data.status).toBe("COMPLETED");
    expect(await productStock(fixture.productId)).toBe(
      3,
    );

    /* Still one refund on the return, untouched by completion. */
    const stored = await ReturnRequest.findById(
      fixture.returnId,
    ).exec();
    expect(stored!.refund?.amount).toBe(500);
  });

  it("reverses the order out of the seller settlement and gives back the commission", async () => {
    const fixture =
      await deliveredOrderWithReturn({ price: 1000 });

    const generate = await api
      .post("/api/v1/admin/settlements/generate")
      .set("Authorization", `Bearer ${fixture.admin}`)
      .send({ month: currentMonth });

    expect(generate.status).toBe(200);

    const before = await Settlement.findOne({
      sellerId: (
        await Order.findById(fixture.orderId)
          .select("sellerId")
          .exec()
      )!.sellerId,
      periodKey: currentMonth,
    }).exec();

    expect(before).toBeTruthy();
    expect(before!.orders.length).toBe(1);
    expect(before!.totalSales).toBe(1000);
    /* Default platform commission is 10%. */
    expect(before!.totalCommission).toBe(100);
    expect(before!.totalPayable).toBe(900);

    const res = await approveReturn(
      fixture.seller.token,
      fixture.returnId,
    );
    expect(res.status).toBe(200);

    const after = await Settlement.findById(
      before!._id,
    ).exec();

    expect(after!.orders.length).toBe(0);
    expect(after!.totalSales).toBe(0);
    expect(after!.totalCommission).toBe(0);
    expect(after!.totalPayable).toBe(0);
    /* An empty pending settlement can never be paid out. */
    expect(after!.status).toBe("CANCELLED");
  });

  it("keeps the rest of a settlement intact when only one order is returned", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();
    const admin = await adminLogin();

    const cheap = await createProduct(seller.token, {
      name: "Cheap",
      price: 200,
      stock: 5,
      status: "ACTIVE",
    });
    const dear = await createProduct(seller.token, {
      name: "Dear",
      price: 800,
      stock: 5,
      status: "ACTIVE",
    });

    const deliverAndPay = async (
      productId: string,
    ): Promise<string> => {
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

      await api
        .post(`/api/v1/orders/${orderId}/pay`)
        .set("Authorization", `Bearer ${seller.token}`);

      return orderId;
    };

    const cheapOrder = await deliverAndPay(
      cheap.body.data.id,
    );
    const dearOrder = await deliverAndPay(
      dear.body.data.id,
    );

    const returned = await api
      .post("/api/v1/returns")
      .set("Authorization", `Bearer ${buyer}`)
      .send({
        orderId: dearOrder,
        reason: "Wrong item received",
      });

    await api
      .post("/api/v1/admin/settlements/generate")
      .set("Authorization", `Bearer ${admin}`)
      .send({ month: currentMonth });

    const before = (await Settlement.findOne({
      periodKey: currentMonth,
    }).exec())!;
    expect(before.orders.length).toBe(2);
    expect(before.totalSales).toBe(1000);
    expect(before.totalCommission).toBe(100);

    const res = await approveReturn(
      seller.token,
      returned.body.data.id,
    );
    expect(res.status).toBe(200);

    const after = (await Settlement.findById(
      before._id,
    ).exec())!;

    expect(after.orders.length).toBe(1);
    expect(after.orders[0]!.orderId.toString()).toBe(
      cheapOrder,
    );
    expect(after.totalSales).toBe(200);
    expect(after.totalCommission).toBe(20);
    expect(after.totalPayable).toBe(180);
    expect(after.status).toBe("PENDING");
  });

  it("releases the coupon so the buyer can use it again, and refunds only what was paid", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();

    const couponRes = await api
      .post("/api/v1/coupons")
      .set("Authorization", `Bearer ${seller.token}`)
      .send({
        code: `BACK${Date.now() % 100000}`,
        type: "PERCENTAGE",
        value: 20,
        minOrderValue: 0,
        startAt: new Date(
          Date.now() - DAY,
        ).toISOString(),
        endAt: new Date(
          Date.now() + 30 * DAY,
        ).toISOString(),
        usageLimit: 5,
        perUserLimit: 1,
      });

    expect(couponRes.status).toBe(201);
    const couponCode = couponRes.body.data.code;
    const couponId = couponRes.body.data.id;

    const fixture = await deliveredOrderWithReturn({
      price: 500,
      couponCode,
      seller,
      buyer,
    });

    /* 500 - 20% coupon = 400 actually paid. */
    const orderBefore = (await Order.findById(
      fixture.orderId,
    ).exec())!;
    expect(orderBefore.couponDiscount).toBe(100);
    expect(orderBefore.total).toBe(400);

    expect(
      await CouponUsage.countDocuments({
        orderId: fixture.orderId,
      }),
    ).toBe(1);

    const res = await approveReturn(
      fixture.seller.token,
      fixture.returnId,
    );
    expect(res.status).toBe(200);
    /* The refund is the paid amount, never the discounted list price. */
    expect(res.body.data.refund.amount).toBe(400);

    expect(
      await CouponUsage.countDocuments({
        orderId: fixture.orderId,
      }),
    ).toBe(0);
    expect(
      ((await Coupon.findById(couponId).exec())!)
        .usageCount,
    ).toBe(0);

    /* The coupon is usable by the same buyer again. */
    await api
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${fixture.buyer}`)
      .send({ productId: fixture.productId, quantity: 1 });
    const addressId = await createAddress(fixture.buyer);
    const reorder = await api
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${fixture.buyer}`)
      .send({
        shippingAddressId: addressId,
        couponCode,
      });

    expect(reorder.status).toBe(201);
    expect(reorder.body.data[0].couponDiscount).toBe(
      100,
    );
  });

  it("refuses to refund a return whose order was cancelled", async () => {
    const fixture = await deliveredOrderWithReturn();

    await Order.updateOne(
      { _id: fixture.orderId },
      { $set: { status: "CANCELLED" } },
    ).exec();

    const res = await approveReturn(
      fixture.seller.token,
      fixture.returnId,
    );

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("RETURN_ORDER_CANCELLED");

    /* Nothing moved. */
    const stored = await ReturnRequest.findById(
      fixture.returnId,
    ).exec();
    expect(stored!.status).toBe("PENDING");
    expect(stored!.refund).toBeFalsy();
    const order = (await Order.findById(
      fixture.orderId,
    ).exec())!;
    expect(order.paymentStatus).toBe("PAID");
  });

  it("rejects approval of rejected, cancelled and completed returns", async () => {
    const rejected =
      await deliveredOrderWithReturn();

    const reject = await api
      .patch(`/api/v1/returns/${rejected.returnId}/status`)
      .set("Authorization", `Bearer ${rejected.seller.token}`)
      .send({
        status: "REJECTED",
        reason: "Outside the return policy",
      });
    expect(reject.status).toBe(200);

    const approveRejected = await approveReturn(
      rejected.seller.token,
      rejected.returnId,
    );
    expect(approveRejected.status).toBe(400);
    expect(approveRejected.body.code).toBe(
      "INVALID_RETURN_TRANSITION",
    );

    const cancelled =
      await deliveredOrderWithReturn();

    const cancel = await api
      .post(`/api/v1/returns/${cancelled.returnId}/cancel`)
      .set("Authorization", `Bearer ${cancelled.buyer}`);
    expect(cancel.status).toBe(200);

    const approveCancelled = await approveReturn(
      cancelled.seller.token,
      cancelled.returnId,
    );
    expect(approveCancelled.status).toBe(400);

    const completed =
      await deliveredOrderWithReturn();
    await approveReturn(
      completed.seller.token,
      completed.returnId,
    );
    const complete = await api
      .patch(`/api/v1/returns/${completed.returnId}/status`)
      .set("Authorization", `Bearer ${completed.seller.token}`)
      .send({ status: "COMPLETED" });
    expect(complete.status).toBe(200);

    const approveCompleted = await approveReturn(
      completed.seller.token,
      completed.returnId,
    );
    expect(approveCompleted.status).toBe(400);
  });

  it("does not let the buyer cancel a return that was already refunded", async () => {
    const fixture =
      await deliveredOrderWithReturn();

    await approveReturn(
      fixture.seller.token,
      fixture.returnId,
    );

    const cancel = await api
      .post(`/api/v1/returns/${fixture.returnId}/cancel`)
      .set("Authorization", `Bearer ${fixture.buyer}`);

    expect(cancel.status).toBe(400);
    expect(cancel.body.code).toBe(
      "RETURN_ALREADY_REFUNDED",
    );

    const stored = await ReturnRequest.findById(
      fixture.returnId,
    ).exec();
    expect(stored!.status).toBe("APPROVED");
    expect(stored!.refund?.status).toBe("PROCESSED");
  });

  it("records nothing to refund when the buyer never paid", async () => {
    const fixture = await deliveredOrderWithReturn({
      markPaid: false,
    });

    const res = await approveReturn(
      fixture.seller.token,
      fixture.returnId,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.refund).toMatchObject({
      amount: 0,
      status: "PROCESSED",
      method: "NONE",
    });

    /* The purchase is still rolled back even though no money moved. */
    expect(await productStock(fixture.productId)).toBe(
      3,
    );
    const order = (await Order.findById(
      fixture.orderId,
    ).exec())!;
    expect(order.status).toBe("RETURNED");
    expect(order.paymentStatus).toBe("PENDING");

    /* ...and the buyer is not told a refund was processed. */
    const notice = await Notification.findOne({
      recipientId: (
        await Order.findById(fixture.orderId)
          .select("userId")
          .exec()
      )!.userId,
      entityType: "RETURN",
      entityId: fixture.returnId,
    }).exec();
    expect(notice).toBeTruthy();
    expect(notice!.message).not.toBe(
      RETURN_APPROVED_REFUND_MESSAGE,
    );
    expect(notice!.message).toContain(
      "nothing to refund",
    );
  });

  it("blocks a new return request for an order that was already returned", async () => {
    const fixture =
      await deliveredOrderWithReturn();

    await approveReturn(
      fixture.seller.token,
      fixture.returnId,
    );

    const again = await api
      .post("/api/v1/returns")
      .set("Authorization", `Bearer ${fixture.buyer}`)
      .send({
        orderId: fixture.orderId,
        reason: "Changed my mind about the item",
      });

    expect(again.status).toBe(409);
    expect(again.body.code).toBe(
      "RETURN_ALREADY_REQUESTED",
    );
  });

  it("stops the returned order from counting as seller revenue", async () => {
    const fixture =
      await deliveredOrderWithReturn({ price: 700 });

    const before = await api
      .get("/api/v1/sellers/dashboard")
      .set("Authorization", `Bearer ${fixture.seller.token}`);
    expect(before.body.data.totalRevenue).toBe(700);

    await approveReturn(
      fixture.seller.token,
      fixture.returnId,
    );

    const after = await api
      .get("/api/v1/sellers/dashboard")
      .set("Authorization", `Bearer ${fixture.seller.token}`);
    expect(after.body.data.totalRevenue).toBe(0);
  });
});
