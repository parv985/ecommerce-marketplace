import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { AuditLog } from "../src/models/AuditLog.js";
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

const registerBuyer = async (): Promise<{
  token: string;
  id: string;
}> => {
  const email = `nbuyer${Date.now()}${Math.floor(
    Math.random() * 1000,
  )}@test.com`;
  await registerUser(email);
  const res = await api
    .post("/api/v1/auth/login")
    .send({ email, password: "Password123!" });

  return {
    token: res.body.data.accessToken as string,
    id: res.body.data.user.id as string,
  };
};

describe("Notifications", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  it("notifies the buyer on order lifecycle events and the seller on payment", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();

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

    const buyerNotifs = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${buyer.token}`);

    expect(buyerNotifs.body.data.total).toBe(3);
    const types = buyerNotifs.body.data.items.map(
      (n: { type: string }) => n.type,
    );
    expect(types).toContain("ORDER_CONFIRMED");
    expect(types).toContain("ORDER_SHIPPED");
    expect(types).toContain("ORDER_DELIVERED");

    const unread = await api
      .get("/api/v1/notifications/unread-count")
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(unread.body.data.unread).toBe(3);

    /*
     * The seller has 2 notifications: the SELLER_APPROVED from being
     * approved plus the PAYMENT_RECEIVED (most recent first).
     */
    const sellerNotifs = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${seller.token}`);
    expect(sellerNotifs.body.data.total).toBe(2);
    expect(sellerNotifs.body.data.items[0].type).toBe(
      "PAYMENT_RECEIVED",
    );
  });

  it("marks notifications read with ownership enforcement", async () => {
    const buyer1 = await registerBuyer();
    const buyer2 = await registerBuyer();

    // Create a notification for buyer1 directly through the model.
    const { Notification } = await import(
      "../src/models/Notification.js"
    );
    const { NotificationType } = await import(
      "../src/constants/notificationTypes.js"
    );
    const notification = await Notification.create({
      recipientId: buyer1.id,
      type: NotificationType.ADMIN_MESSAGE,
      title: "Hello",
      message: "Welcome to the marketplace",
      isRead: false,
    });
    const notificationId = notification._id.toString();

    // buyer2 cannot mark buyer1's notification.
    const other = await api
      .patch(
        `/api/v1/notifications/${notificationId}/read`,
      )
      .set("Authorization", `Bearer ${buyer2.token}`);
    expect(other.status).toBe(404);

    const mine = await api
      .patch(
        `/api/v1/notifications/${notificationId}/read`,
      )
      .set("Authorization", `Bearer ${buyer1.token}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.isRead).toBe(true);

    const unread = await api
      .get("/api/v1/notifications/unread-count")
      .set("Authorization", `Bearer ${buyer1.token}`);
    expect(unread.body.data.unread).toBe(0);
  });

  it("updates and respects notification preferences", async () => {
    const buyer = await registerBuyer();

    const defaults = await api
      .get("/api/v1/notifications/preferences")
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(defaults.body.data.inApp).toBe(true);

    const updated = await api
      .patch("/api/v1/notifications/preferences")
      .set("Authorization", `Bearer ${buyer.token}`)
      .send({
        inApp: false,
        emailPromotional: false,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.inApp).toBe(false);
    expect(updated.body.data.emailPromotional).toBe(
      false,
    );
  });

  it("lets the admin broadcast to sellers and writes an audit log", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();
    const admin = await adminLogin();

    const res = await api
      .post("/api/v1/admin/notifications")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        title: "Platform update",
        message: "New seller tools are available",
        audience: "SELLERS",
        channel: "IN_APP",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.deliveredTo).toBe(1);

    /* The seller also has the SELLER_APPROVED notification. */
    const sellerNotifs = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${seller.token}`);
    expect(sellerNotifs.body.data.total).toBe(2);
    expect(sellerNotifs.body.data.items[0].type).toBe(
      "ADMIN_MESSAGE",
    );

    // The buyer is not part of the SELLERS audience.
    const buyerNotifs = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(buyerNotifs.body.data.total).toBe(0);

    const audit = await AuditLog.countDocuments({
      action: "ADMIN_BROADCAST",
    }).exec();
    expect(audit).toBe(1);

    // Sellers cannot broadcast.
    const denied = await api
      .post("/api/v1/admin/notifications")
      .set("Authorization", `Bearer ${seller.token}`)
      .send({
        title: "Fake",
        message: "Trying to impersonate admin",
        audience: "SELLERS",
      });
    expect(denied.status).toBe(403);
  });

  it("notifies the seller when approved", async () => {
    // Register a seller (PENDING), then approve via admin.
    const email = `nseller${Date.now()}@test.com`;
    const { registerSeller } = await import(
      "./helpers.js"
    );
    await registerSeller(email);
    const { token } = await login(email);

    const admin = await adminLogin();
    const sellers = await api
      .get("/api/v1/admin/sellers?status=PENDING")
      .set("Authorization", `Bearer ${admin}`);
    const profileId = sellers.body.data.items[0].id;

    await api
      .patch(`/api/v1/admin/sellers/${profileId}/status`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ status: "APPROVED" });

    const notifs = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${token}`);
    expect(notifs.body.data.total).toBe(1);
    expect(notifs.body.data.items[0].type).toBe(
      "SELLER_APPROVED",
    );
  });
});
