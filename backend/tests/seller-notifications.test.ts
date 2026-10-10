import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AuditLog } from "../src/models/AuditLog.js";
import {
  adminLogin,
  api,
  clearDb,
  connect,
  createApprovedSeller,
  disconnect,
  login,
  registerUser,
} from "./helpers.js";

const registerBuyer = async (
  emailPrefix = "snbuyer",
): Promise<{
  token: string;
  id: string;
  email: string;
}> => {
  const email = `${emailPrefix}${Date.now()}${Math.floor(
    Math.random() * 1000,
  )}@test.com`;
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

const send = (token: string, body: Record<string, unknown>) =>
  api
    .post("/api/v1/sellers/notifications")
    .set("Authorization", `Bearer ${token}`)
    .send(body);

describe("Seller notifications", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  it("lets a seller notify one specific buyer (in-app only to that buyer)", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();
    const otherBuyer = await registerBuyer();

    const res = await send(seller.token, {
      title: "Back in stock",
      message: "The item you asked about is available again.",
      buyerId: buyer.id,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.deliveredTo).toBe(1);

    const buyerNotifs = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(buyerNotifs.body.data.total).toBe(1);
    expect(buyerNotifs.body.data.items[0].type).toBe("SELLER_MESSAGE");
    expect(buyerNotifs.body.data.items[0].title).toBe("Back in stock");
    expect(buyerNotifs.body.data.items[0].isRead).toBe(false);

    // No other buyer received it.
    const otherNotifs = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${otherBuyer.token}`);
    expect(otherNotifs.body.data.total).toBe(0);

    // The sender does not get a copy.
    const sellerNotifs = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${seller.token}`);
    const sellerMessages = sellerNotifs.body.data.items.filter(
      (n: { type: string }) => n.type === "SELLER_MESSAGE",
    );
    expect(sellerMessages).toHaveLength(0);

    const audit = await AuditLog.countDocuments({
      action: "SELLER_NOTIFICATION_SENT",
    }).exec();
    expect(audit).toBe(1);
  });

  it("broadcasts to every registered buyer and audit-logs it", async () => {
    const seller = await createApprovedSeller();
    const buyers = [
      await registerBuyer("bb1"),
      await registerBuyer("bb2"),
      await registerBuyer("bb3"),
    ];
    const nonBuyer = await createApprovedSeller();

    const res = await send(seller.token, {
      title: "Festive sale",
      message: "Everything in our store is 20% off this week.",
      audience: "ALL_BUYERS",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.deliveredTo).toBe(3);

    for (const buyer of buyers) {
      const notifs = await api
        .get("/api/v1/notifications")
        .set("Authorization", `Bearer ${buyer.token}`);
      expect(notifs.body.data.total).toBe(1);
      expect(notifs.body.data.items[0].type).toBe("SELLER_MESSAGE");
    }

    // Registered buyers only - the other seller got nothing.
    const otherSellerNotifs = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${nonBuyer.token}`);
    const messages = otherSellerNotifs.body.data.items.filter(
      (n: { type: string }) => n.type === "SELLER_MESSAGE",
    );
    expect(messages).toHaveLength(0);

    const audit = await AuditLog.countDocuments({
      action: "SELLER_NOTIFICATION_BROADCAST",
    }).exec();
    expect(audit).toBe(1);
  });

  it("is forbidden for buyers and unauthenticated users", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();

    const asBuyer = await send(buyer.token, {
      title: "Spoofed message",
      message: "Trying to impersonate a seller here.",
      audience: "ALL_BUYERS",
    });
    expect(asBuyer.status).toBe(403);

    const anonymous = await api.post("/api/v1/sellers/notifications").send({
      title: "Spoofed message",
      message: "Trying without any credentials.",
      audience: "ALL_BUYERS",
    });
    expect(anonymous.status).toBe(401);

    // Sellers cannot reach /admin/notifications either (and vice versa
    // the admin broadcast endpoint stays admin-only).
    const sellerOnAdmin = await api
      .post("/api/v1/admin/notifications")
      .set("Authorization", `Bearer ${seller.token}`)
      .send({
        title: "Spoofed message",
        message: "Trying to use the admin broadcast.",
        audience: "USERS",
      });
    expect(sellerOnAdmin.status).toBe(403);
  });

  it("rejects targets that are not registered buyers", async () => {
    const seller = await createApprovedSeller();
    const anotherSeller = await createApprovedSeller();
    const { User } = await import("../src/models/User.js");
    const otherSellerUser = await User.findOne({
      email: anotherSeller.email,
    });

    // Unknown ObjectId.
    const unknown = await send(seller.token, {
      title: "Hello there",
      message: "This buyer does not exist at all.",
      buyerId: "0123456789abcdef01234567",
    });
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe("BUYER_NOT_FOUND");

    // A seller account is not a valid buyer target.
    const notABuyer = await send(seller.token, {
      title: "Hello there",
      message: "Targeting another seller account.",
      buyerId: otherSellerUser!._id.toString(),
    });
    expect(notABuyer.status).toBe(404);
    expect(notABuyer.body.code).toBe("BUYER_NOT_FOUND");
  });

  it("validates the payload", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();

    const tooShort = await send(seller.token, {
      title: "Hi",
      message: "Too short a title above.",
      buyerId: buyer.id,
    });
    expect(tooShort.status).toBe(400);

    const emptyMessage = await send(seller.token, {
      title: "Valid title",
      message: "x",
      buyerId: buyer.id,
    });
    expect(emptyMessage.status).toBe(400);

    // Exactly one target is required.
    const both = await send(seller.token, {
      title: "Valid title",
      message: "Valid message body.",
      buyerId: buyer.id,
      audience: "ALL_BUYERS",
    });
    expect(both.status).toBe(400);

    const neither = await send(seller.token, {
      title: "Valid title",
      message: "Valid message body.",
    });
    expect(neither.status).toBe(400);

    const badAudience = await send(seller.token, {
      title: "Valid title",
      message: "Valid message body.",
      audience: "EVERYONE",
    });
    expect(badAudience.status).toBe(400);

    // Nothing was delivered by the rejected requests.
    const notifs = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(notifs.body.data.total).toBe(0);
  });

  it("notifies exactly the selected buyers from the broadcast multi-select", async () => {
    const seller = await createApprovedSeller();
    const picked = [await registerBuyer("pick1"), await registerBuyer("pick2")];
    const ignored = await registerBuyer("ignored");

    const res = await send(seller.token, {
      title: "Loyalty preview",
      message: "Tomorrow: 15% off for our best repeat buyers.",
      buyerIds: picked.map((buyer) => buyer.id),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.deliveredTo).toBe(2);
    expect(res.body.data.notFoundBuyerIds).toEqual([]);
    /* One email copy queued per selected buyer. */
    expect(res.body.data.emailsQueued).toBe(2);

    for (const buyer of picked) {
      const notifs = await api
        .get("/api/v1/notifications")
        .set("Authorization", `Bearer ${buyer.token}`);
      expect(notifs.body.data.total).toBe(1);
      expect(notifs.body.data.items[0].title).toBe("Loyalty preview");
      /* In-app and email are written together, so the copy is expected. */
      expect(notifs.body.data.items[0].emailStatus).not.toBe(
        "NOT_REQUIRED",
      );
    }

    const skipped = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${ignored.token}`);
    expect(skipped.body.data.total).toBe(0);

    const audit = await AuditLog.countDocuments({
      action: "SELLER_NOTIFICATION_BROADCAST",
    }).exec();
    expect(audit).toBe(1);
  });

  it("reports buyers the seller selected but cannot be reached", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer("mixed1");
    const otherSeller = await createApprovedSeller();
    const { User } = await import("../src/models/User.js");
    const sellerUserId = (
      await User.findOne({ email: otherSeller.email })
    )!._id.toString();

    const res = await send(seller.token, {
      title: "Clearance notice",
      message: "Clearance starts Friday for selected customers.",
      buyerIds: [buyer.id, sellerUserId, "0123456789abcdef01234567"],
    });

    /* The valid target still gets the message - one bad id is not fatal. */
    expect(res.status).toBe(201);
    expect(res.body.data.deliveredTo).toBe(1);
    expect(res.body.data.notFoundBuyerIds).toHaveLength(2);

    const notifs = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(notifs.body.data.total).toBe(1);

    /* The other seller received nothing from this seller. */
    const asSeller = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${otherSeller.token}`);
    expect(
      asSeller.body.data.items.filter(
        (n: { type: string }) => n.type === "SELLER_MESSAGE",
      ),
    ).toHaveLength(0);
  });

  it("de-duplicates ids and rejects a selection with no valid buyer", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer("dedupe1");

    const twice = await send(seller.token, {
      title: "Duplicate ids",
      message: "The same buyer ticked twice is notified once.",
      buyerIds: [buyer.id, buyer.id],
    });
    expect(twice.status).toBe(201);
    expect(twice.body.data.requested).toBe(1);

    const notifs = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(notifs.body.data.total).toBe(1);

    const unknownOnly = await send(seller.token, {
      title: "Nobody there",
      message: "This selection contains no real buyer at all.",
      buyerIds: ["0123456789abcdef01234567"],
    });
    expect(unknownOnly.status).toBe(404);
    expect(unknownOnly.body.code).toBe("BUYER_NOT_FOUND");
  });

  it("validates the buyer selection payload", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer("valid1");

    const emptySelection = await send(seller.token, {
      title: "Empty list",
      message: "No buyer was selected at all.",
      buyerIds: [],
    });
    expect(emptySelection.status).toBe(400);

    const malformedId = await send(seller.token, {
      title: "Bad id",
      message: "This is not an ObjectId at all.",
      buyerIds: ["12345"],
    });
    expect(malformedId.status).toBe(400);

    const twoTargets = await send(seller.token, {
      title: "Too many targets",
      message: "buyerIds and audience cannot be combined.",
      buyerIds: [buyer.id],
      audience: "ALL_BUYERS",
    });
    expect(twoTargets.status).toBe(400);

    const tooMany = await send(seller.token, {
      title: "Oversized",
      message: "More ids than one request may carry.",
      buyerIds: Array.from(
        { length: 501 },
        (_, index) => `64a00000000000000000${index.toString(16).padStart(4, "0")}`,
      ),
    });
    expect(tooMany.status).toBe(400);
  });

  it("treats a repeated requestId as the same send instead of notifying twice", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer("idempotent1");
    const requestId = `req-${Date.now()}`;

    const body = {
      title: "One-off reminder",
      message: "Your pre-order invoice is ready to pay.",
      buyerIds: [buyer.id],
      requestId,
    };

    const first = await send(seller.token, body);
    expect(first.status).toBe(201);
    expect(first.body.data.deliveredTo).toBe(1);

    /* The seller pressed "Try again" after a lost response. */
    const replay = await send(seller.token, body);
    expect(replay.status).toBe(200);
    expect(replay.body.data.deliveredTo).toBe(0);
    expect(replay.body.data.duplicates).toBe(1);

    const notifs = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(notifs.body.data.total).toBe(1);

    const unread = await api
      .get("/api/v1/notifications/unread-count")
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(unread.body.data.unread).toBe(1);

    /* A different requestId is a new, legitimate send. */
    const next = await send(seller.token, {
      ...body,
      requestId: `${requestId}-b`,
    });
    expect(next.status).toBe(201);

    const afterNext = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(afterNext.body.data.total).toBe(2);
  });

  it("marks read/unread for broadcast messages like any other notification", async () => {
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer("readstate1");

    await send(seller.token, {
      title: "Store relocation",
      message: "We ship from a new warehouse next week.",
      buyerIds: [buyer.id],
    });

    const before = await api
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${buyer.token}`);
    const id = before.body.data.items[0].id as string;
    expect(before.body.data.items[0].isRead).toBe(false);

    const read = await api
      .patch(`/api/v1/notifications/${id}/read`)
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(read.status).toBe(200);
    expect(read.body.data.isRead).toBe(true);

    const unread = await api
      .get("/api/v1/notifications/unread-count")
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(unread.body.data.unread).toBe(0);

    /* Only that buyer's own record could be marked - no cross-user writes. */
    const otherBuyer = await registerBuyer("readstate2");
    const foreign = await api
      .patch(`/api/v1/notifications/${id}/read`)
      .set("Authorization", `Bearer ${otherBuyer.token}`);
    expect(foreign.status).toBe(404);
  });

  it("keeps the seller notification admin-free and buyer-scoped on listing", async () => {
    /*
     * Regression guard for role separation: a seller message is a
     * normal notification in the buyer's feed - it can be listed,
     * counted and marked read exactly like system notifications.
     */
    const seller = await createApprovedSeller();
    const buyer = await registerBuyer();

    await send(seller.token, {
      title: "Order update note",
      message: "Your custom order is ready for dispatch.",
      buyerId: buyer.id,
    });

    const unread = await api
      .get("/api/v1/notifications/unread-count")
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(unread.body.data.unread).toBe(1);

    const list = await api
      .get("/api/v1/notifications?unread=true")
      .set("Authorization", `Bearer ${buyer.token}`);
    const id = list.body.data.items[0].id;

    const read = await api
      .patch(`/api/v1/notifications/${id}/read`)
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(read.status).toBe(200);
    expect(read.body.data.isRead).toBe(true);

    const after = await api
      .get("/api/v1/notifications/unread-count")
      .set("Authorization", `Bearer ${buyer.token}`);
    expect(after.body.data.unread).toBe(0);
  });
});
