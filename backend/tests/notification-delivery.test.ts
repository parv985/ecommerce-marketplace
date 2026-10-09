/*
 * Notification -> email delivery guarantees:
 * - every in-app notification a buyer sees is also emailed to their
 *   registered address (real inboxes and YOPmail alike),
 * - email failures never lose the in-app notification,
 * - re-fired events can never produce a duplicate notification or a
 *   duplicate email (dedupeKey),
 * - category email opt-outs are honoured.
 *
 * The email service module is mocked so no SMTP/Ethereal transport is
 * ever touched; the mocks assert WHO received WHAT at the boundary.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import mongoose from "mongoose";

const { sendNotificationEmailMock, sendPasswordResetEmailMock } = vi.hoisted(
  () => ({
    sendNotificationEmailMock: vi.fn(
      async (_email: string, _subject: string, _text: string) => {},
    ),
    sendPasswordResetEmailMock: vi.fn(
      async (_email: string, _url: string) => {},
    ),
  }),
);

vi.mock("../src/services/email.service.js", () => ({
  sendNotificationEmail: sendNotificationEmailMock,
  sendPasswordResetEmail: sendPasswordResetEmailMock,
}));

import { Notification } from "../src/models/Notification.js";
import {
  NotificationChannel,
  NotificationType,
} from "../src/constants/notificationTypes.js";
import { OrderStatus } from "../src/constants/orderStatus.js";
import {
  notifyOrderStatusChange,
  notifyUser,
} from "../src/modules/notifications/notification.service.js";
import {
  api,
  clearDb,
  connect,
  createAddress,
  createApprovedSeller,
  createProduct,
  disconnect,
  registerUser,
} from "./helpers.js";
import type { IOrder } from "../src/models/Order.js";

const registerBuyerWithYopmail = async (): Promise<{
  token: string;
  id: string;
  email: string;
}> => {
  /* YOPmail inbox: readable at https://yopmail.com without signup. */
  const email = `nbuyer${Date.now()}${Math.floor(
    Math.random() * 1000,
  )}@yopmail.com`;
  await registerUser(email);
  const res = await api
    .post("/api/v1/auth/login")
    .send({ email, password: "Password123!" });

  return {
    token: res.body.data.accessToken as string,
    id: res.body.data.user.id as string,
    email,
  };
};

const fakeOrder = (
  userId: string,
  overrides: Record<string, unknown> = {},
): IOrder =>
  ({
    _id: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(userId),
    sellerId: new mongoose.Types.ObjectId(),
    orderNumber: `ORD-${Date.now()}`,
    total: 499,
    ...overrides,
  }) as unknown as IOrder;

describe("Notification email delivery", () => {
  beforeAll(connect);
  beforeEach(async () => {
    await clearDb();
    sendNotificationEmailMock.mockReset();
    sendNotificationEmailMock.mockResolvedValue(undefined);
    sendPasswordResetEmailMock.mockReset();
  });
  afterAll(disconnect);

  it("emails every buyer in-app notification to the registered YOPmail address", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyerWithYopmail();

    const product = await createProduct(seller.token, {
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
      .send({ shippingAddressId: addressId });
    const orderId = checkout.body.data[0].id;

    for (const status of ["CONFIRMED", "SHIPPED", "DELIVERED"]) {
      await api
        .patch(`/api/v1/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${seller.token}`)
        .send({ status });
    }

    /* In-app list has the three order lifecycle notifications. */
    const notifs = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(notifs.body.data.total).toBe(3);

    /*
     * ...and each one is mirrored by email to the buyer's registered
     * address - fire-and-forget, so wait for the dispatches.
     */
    await vi.waitFor(() => {
      expect(
        sendNotificationEmailMock.mock.calls.length,
      ).toBeGreaterThanOrEqual(3);
    });

    const toBuyer = sendNotificationEmailMock.mock.calls.filter(
      ([to]) => to === buyer.email,
    );
    expect(toBuyer.length).toBe(3);
    for (const [, subject] of toBuyer) {
      expect(["Order confirmed", "Order shipped", "Order delivered"]).toContain(
        subject,
      );
    }
  });

  it("keeps the in-app notification when email delivery fails", async () => {
    sendNotificationEmailMock.mockRejectedValue(
      new Error("SMTP connection refused"),
    );

    const buyer = await registerBuyerWithYopmail();

    await notifyOrderStatusChange(fakeOrder(buyer.id), OrderStatus.CONFIRMED);

    /* The in-app notification is persisted before any email attempt. */
    const notif = await Notification.findOne({
      recipientId: buyer.id,
      type: NotificationType.ORDER_CONFIRMED,
    }).lean();
    expect(notif).not.toBeNull();
    expect(notif!.title).toBe("Order confirmed");

    /* The failed dispatch is recorded on the notification. */
    await vi.waitFor(() => {
      expect(sendNotificationEmailMock).toHaveBeenCalled();
    });
    await vi.waitFor(async () => {
      const stored = await Notification.findById(notif!._id).lean();
      expect(stored!.emailStatus).toBe("FAILED");
    });

    /* Still visible in the buyer's feed. */
    const list = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(list.body.data.total).toBe(1);
  });

  it("never sends duplicate emails for a re-fired event", async () => {
    const buyer = await registerBuyerWithYopmail();
    const order = fakeOrder(buyer.id);

    await notifyOrderStatusChange(order, OrderStatus.SHIPPED);
    await notifyOrderStatusChange(order, OrderStatus.SHIPPED);

    expect(
      await Notification.countDocuments({
        recipientId: buyer.id,
      }).exec(),
    ).toBe(1);

    await vi.waitFor(() => {
      expect(sendNotificationEmailMock).toHaveBeenCalledTimes(1);
    });
    /* Give any stray second dispatch a chance to appear, then re-check. */
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sendNotificationEmailMock).toHaveBeenCalledTimes(1);

    const stored = await Notification.findOne({
      recipientId: buyer.id,
    }).lean();
    expect(stored!.emailStatus).toBe("SENT");

    /* A different event for the same order is a new notification. */
    await notifyOrderStatusChange(order, OrderStatus.DELIVERED);
    await vi.waitFor(() => {
      expect(sendNotificationEmailMock).toHaveBeenCalledTimes(2);
    });
    expect(
      await Notification.countDocuments({
        recipientId: buyer.id,
      }).exec(),
    ).toBe(2);
  });

  it("honours the email category opt-out but still stores the in-app notification", async () => {
    const buyer = await registerBuyerWithYopmail();

    await api
      .patch("/api/v1/notifications/preferences")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({ emailOrderUpdates: false });

    await notifyOrderStatusChange(fakeOrder(buyer.id), OrderStatus.CONFIRMED);

    const notif = await Notification.findOne({
      recipientId: buyer.id,
    }).lean();
    expect(notif).not.toBeNull();
    expect(notif!.emailStatus).toBe("NOT_REQUIRED");

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sendNotificationEmailMock).not.toHaveBeenCalled();
  });

  it("mirrors seller custom messages to the buyer's email", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyerWithYopmail();

    const res = await api
      .post("/api/v1/sellers/notifications")
      .set("Authorization", `Bearer ${seller.token}`)
      .send({
        title: "Custom order ready",
        message: "Your handmade item is ready to ship!",
        buyerId: buyer.id,
      });
    expect(res.status).toBe(201);

    const notif = await Notification.findOne({
      recipientId: buyer.id,
      type: NotificationType.SELLER_MESSAGE,
    }).lean();
    expect(notif).not.toBeNull();

    await vi.waitFor(() => {
      expect(sendNotificationEmailMock).toHaveBeenCalledWith(
        buyer.email,
        "Custom order ready",
        expect.stringContaining("ready to ship"),
      );
    });
  });

  it("supports explicit email-only delivery without an in-app record", async () => {
    const buyer = await registerBuyerWithYopmail();

    await notifyUser({
      recipientId: buyer.id,
      type: NotificationType.ADMIN_MESSAGE,
      title: "Email only note",
      message: "This one goes straight to the inbox.",
      channel: NotificationChannel.EMAIL,
      emailCategory: "promotional",
    });

    await vi.waitFor(() => {
      expect(sendNotificationEmailMock).toHaveBeenCalledWith(
        buyer.email,
        "Email only note",
        expect.stringContaining("straight to the inbox"),
      );
    });

    expect(
      await Notification.countDocuments({
        recipientId: buyer.id,
      }).exec(),
    ).toBe(0);
  });
});
