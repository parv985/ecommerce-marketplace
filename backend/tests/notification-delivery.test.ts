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
  adminLogin,
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

  it("emails the selected buyers of a broadcast and nobody else", async () => {
    const seller = await createApprovedSeller();
    const picked = [
      await registerBuyerWithYopmail(),
      await registerBuyerWithYopmail(),
    ];
    const notPicked = await registerBuyerWithYopmail();

    const res = await api
      .post("/api/v1/sellers/notifications")
      .set("Authorization", `Bearer ${seller.token}`)
      .send({
        title: "Selected buyers only",
        message: "Private sale for the customers on our list.",
        buyerIds: picked.map((buyer) => buyer.id),
      });
    expect(res.status).toBe(201);
    expect(res.body.data.deliveredTo).toBe(2);

    for (const buyer of picked) {
      await vi.waitFor(() => {
        expect(sendNotificationEmailMock).toHaveBeenCalledWith(
          buyer.email,
          "Selected buyers only",
          expect.stringContaining("Private sale"),
        );
      });
    }

    expect(
      await Notification.countDocuments({
        recipientId: notPicked.id,
      }).exec(),
    ).toBe(0);
    expect(
      sendNotificationEmailMock.mock.calls.some(
        ([to]) => to === notPicked.email,
      ),
    ).toBe(false);
  });

  it("skips the email copy for a buyer with an unusable address, keeping the in-app one", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyerWithYopmail();

    /* Simulate a profile whose stored address is not deliverable. */
    const { User } = await import("../src/models/User.js");
    await User.updateOne(
      { _id: buyer.id },
      { $set: { email: "not-an-address" } },
    );

    const res = await api
      .post("/api/v1/sellers/notifications")
      .set("Authorization", `Bearer ${seller.token}`)
      .send({
        title: "Broken profile",
        message: "This buyer cannot receive mail right now.",
        buyerIds: [buyer.id],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.deliveredTo).toBe(1);
    expect(res.body.data.emailsQueued).toBe(0);
    expect(res.body.data.emailsInvalidAddress).toBe(1);

    /* Still in the bell, exactly once. */
    const list = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(list.body.data.total).toBe(1);
    expect(list.body.data.items[0].emailStatus).toBe(
      "INVALID_ADDRESS",
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sendNotificationEmailMock).not.toHaveBeenCalledWith(
      "not-an-address",
      expect.anything(),
      expect.anything(),
    );
  });

  it("resends a failed email copy without duplicating the notification", async () => {
    const admin = await adminLogin();
    const buyer = await registerBuyerWithYopmail();

    /* The relay is down while the order event fires. */
    sendNotificationEmailMock.mockRejectedValueOnce(
      new Error("SMTP connection refused"),
    );

    await notifyOrderStatusChange(
      fakeOrder(buyer.id),
      OrderStatus.SHIPPED,
    );

    await vi.waitFor(async () => {
      const stored = await Notification.findOne({
        recipientId: buyer.id,
      }).lean();
      expect(stored!.emailStatus).toBe("FAILED");
    });

    sendNotificationEmailMock.mockReset();
    sendNotificationEmailMock.mockResolvedValue(undefined);

    /* Buyers cannot trigger the retry pass - it is an operator action. */
    const denied = await api
      .post("/api/v1/admin/notifications/retry-emails")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({});
    expect(denied.status).toBe(403);

    const retry = await api
      .post("/api/v1/admin/notifications/retry-emails")
      .set("Authorization", `Bearer ${admin}`)
      .send({ limit: 10 });

    expect(retry.status).toBe(200);
    expect(retry.body.data.attempted).toBe(1);
    expect(retry.body.data.sent).toBe(1);
    expect(retry.body.data.pending).toBe(0);

    expect(sendNotificationEmailMock).toHaveBeenCalledWith(
      buyer.email,
      "Order shipped",
      expect.stringContaining("has been shipped"),
    );

    /* The in-app notification was repaired in place, never duplicated. */
    expect(
      await Notification.countDocuments({
        recipientId: buyer.id,
      }).exec(),
    ).toBe(1);

    const stored = await Notification.findOne({
      recipientId: buyer.id,
    }).lean();
    expect(stored!.emailStatus).toBe("SENT");
    expect(stored!.emailAttempts).toBe(2);
    expect(stored!.emailSentAt).toBeInstanceOf(Date);

    /* Nothing is left to retry, so a second pass is a no-op. */
    const second = await api
      .post("/api/v1/admin/notifications/retry-emails")
      .set("Authorization", `Bearer ${admin}`)
      .send({});
    expect(second.status).toBe(200);
    expect(second.body.data.attempted).toBe(0);
    expect(sendNotificationEmailMock).toHaveBeenCalledTimes(1);

    const audit = await (
      await import("../src/models/AuditLog.js")
    ).AuditLog.countDocuments({
      action: "NOTIFICATION_EMAIL_RETRY",
    }).exec();
    expect(audit).toBe(2);
  });

  it("replays only the failed email when the same broadcast is retried", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyerWithYopmail();
    const requestId = `retry-${Date.now()}`;

    const body = {
      title: "Delivery window",
      message: "Your order ships tomorrow morning.",
      buyerIds: [buyer.id],
      requestId,
    };

    sendNotificationEmailMock.mockRejectedValueOnce(
      new Error("SMTP timeout"),
    );

    const first = await api
      .post("/api/v1/sellers/notifications")
      .set("Authorization", `Bearer ${seller.token}`)
      .send(body);
    expect(first.status).toBe(201);

    await vi.waitFor(async () => {
      const stored = await Notification.findOne({
        recipientId: buyer.id,
      }).lean();
      expect(stored!.emailStatus).toBe("FAILED");
    });

    sendNotificationEmailMock.mockReset();
    sendNotificationEmailMock.mockResolvedValue(undefined);

    /* The seller retries the compose: the buyer must not be notified twice,
       but the email that never arrived has to go out. */
    const replay = await api
      .post("/api/v1/sellers/notifications")
      .set("Authorization", `Bearer ${seller.token}`)
      .send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.data.deliveredTo).toBe(0);
    expect(replay.body.data.duplicates).toBe(1);

    expect(
      await Notification.countDocuments({
        recipientId: buyer.id,
      }).exec(),
    ).toBe(1);

    await vi.waitFor(() => {
      expect(sendNotificationEmailMock).toHaveBeenCalledWith(
        buyer.email,
        "Delivery window",
        expect.stringContaining("ships tomorrow morning"),
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sendNotificationEmailMock).toHaveBeenCalledTimes(1);

    const list = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(list.body.data.total).toBe(1);
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
