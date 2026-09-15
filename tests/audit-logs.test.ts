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
  createApprovedSeller,
  disconnect,
  login,
  registerUser,
} from "./helpers.js";
import { AuditLog } from "../src/models/AuditLog.js";

/*
 * E2E coverage for GET /api/v1/admin/audit-logs: the Super Admin view of
 * the audit ledger written by the existing audit logging service.
 *
 * The endpoint must be a pure read of what `logAudit` already stores -
 * nothing about how entries are written changes here, so the tests both
 * seed entries directly AND assert that entries produced by real API
 * calls (login, seller registration, admin user-status change) show up.
 */

const ENDPOINT = "/api/v1/admin/audit-logs";

/* Unique per run: seeded entries are always filtered by this actor so
   audit entries written as a side effect of authenticating (LOGIN) can
   never make a count assertion flaky. */
const seededActorId = new mongoose.Types.ObjectId().toString();

/*
 * Entries are written straight to the collection so a test controls
 * `createdAt` exactly (the model would otherwise stamp "now" itself),
 * which is what the date-range and ordering assertions need.
 */
const seedAuditLog = async (overrides: {
  actorId?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  createdAt: Date;
}): Promise<string> => {
  const _id = new mongoose.Types.ObjectId();

  await AuditLog.collection.insertOne({
    _id,
    actorId: overrides.actorId ?? seededActorId,
    actorRole: overrides.actorRole ?? "SUPER_ADMIN",
    action: overrides.action,
    entityType: overrides.entityType,
    entityId: overrides.entityId
      ? new mongoose.Types.ObjectId(overrides.entityId)
      : null,
    before: overrides.before ?? null,
    after: overrides.after ?? null,
    metadata: overrides.metadata ?? null,
    createdAt: overrides.createdAt,
  });

  return _id.toString();
};

const daysAgo = (days: number, hours = 0): Date =>
  new Date(
    Date.UTC(2026, 0, 15, 12, 0, 0) -
      days * 86_400_000 -
      hours * 3_600_000,
  );

const getLogs = (
  token: string,
  query: Record<string, string | number> = {},
) => api.get(ENDPOINT).set("Authorization", `Bearer ${token}`).query(query);

describe("GET /api/v1/admin/audit-logs", () => {
  let adminToken: string;

  beforeAll(connect);
  beforeEach(async () => {
    await clearDb();
    adminToken = await adminLogin();
  });
  afterAll(disconnect);

  describe("authentication", () => {
    it("rejects a request with no access token", async () => {
      const res = await api.get(ENDPOINT);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("AUTHENTICATION_REQUIRED");
    });

    it("rejects a malformed authorization header", async () => {
      const res = await api
        .get(ENDPOINT)
        .set("Authorization", adminToken);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(
        "INVALID_AUTHORIZATION_HEADER",
      );
    });

    it("rejects an invalid access token", async () => {
      const res = await getLogs("not-a-real-token");

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("INVALID_ACCESS_TOKEN");
    });
  });

  describe("authorization", () => {
    it("allows SUPER_ADMIN", async () => {
      const res = await getLogs(adminToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe(
        "Audit logs fetched successfully",
      );
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it("forbids a BUYER", async () => {
      const email = `auditbuyer${Date.now()}@test.com`;
      await registerUser(email);
      const buyer = await login(email);

      const res = await getLogs(buyer.token);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
      expect(res.body.data).toBeUndefined();
    });

    it("forbids a SELLER", async () => {
      const seller = await createApprovedSeller();

      const res = await getLogs(seller.token);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    });
  });

  describe("exposing existing audit records", () => {
    it("returns entries written by the audit logging service", async () => {
      const buyerEmail = `auditlist${Date.now()}@test.com`;
      await registerUser(buyerEmail);
      const buyer = await login(buyerEmail);

      /* A real admin action: deactivating a user is audited. */
      const users = await api
        .get("/api/v1/admin/users?role=BUYER")
        .set("Authorization", `Bearer ${adminToken}`);
      const buyerId = users.body.data.items[0].id;

      await api
        .patch(`/api/v1/admin/users/${buyerId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: false });

      const res = await getLogs(adminToken, { limit: 100 });

      expect(res.status).toBe(200);

      const items = res.body.data.items as Array<{
        actorId: string;
        actorRole: string;
        action: string;
        entityType: string;
        entityId: string | null;
        before: unknown;
        after: unknown;
        createdAt: string;
      }>;
      const actions = items.map((item) => item.action);

      /* Buyer LOGIN + SELLER-free flow: login and the admin change. */
      expect(actions).toContain("LOGIN");
      expect(actions).toContain("USER_STATUS_UPDATE");

      const statusChange = items.find(
        (item) => item.action === "USER_STATUS_UPDATE",
      )!;

      expect(statusChange.actorRole).toBe("SUPER_ADMIN");
      expect(statusChange.entityType).toBe("USER");
      expect(statusChange.entityId).toBe(buyerId);
      expect(statusChange.before).toEqual({ isActive: true });
      expect(statusChange.after).toEqual({ isActive: false });
      expect(new Date(statusChange.createdAt).toString()).not.toBe(
        "Invalid Date",
      );

      const buyerLogin = items.find(
        (item) =>
          item.action === "LOGIN" && item.actorId === buyerId,
      )!;

      expect(buyerLogin.actorRole).toBe("BUYER");
      expect(buyerLogin.entityType).toBe("USER");
    });

    it("records a seller registration entry", async () => {
      await createApprovedSeller();

      const res = await getLogs(adminToken, {
        action: "SELLER_REGISTERED",
      });

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].actorRole).toBe("SELLER");
      expect(res.body.data.items[0].entityType).toBe("SELLER");
    });

    it("does not write an audit entry when the log is read", async () => {
      const before = await AuditLog.countDocuments({});

      await getLogs(adminToken);
      await getLogs(adminToken, { limit: 5 });

      const after = await AuditLog.countDocuments({});

      expect(after).toBe(before);
    });
  });

  describe("pagination", () => {
    beforeEach(async () => {
      for (let index = 0; index < 25; index += 1) {
        await seedAuditLog({
          action: `TEST_ACTION_${index}`,
          entityType: "TEST_ENTITY",
          createdAt: daysAgo(index),
        });
      }
    });

    it("defaults to page 1 with 20 entries per page", async () => {
      const res = await getLogs(adminToken, {
        actorId: seededActorId,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(20);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.limit).toBe(20);
      expect(res.body.data.total).toBe(25);
      expect(res.body.data.totalPages).toBe(2);
    });

    it("returns the remainder on the last page", async () => {
      const res = await getLogs(adminToken, {
        actorId: seededActorId,
        page: 2,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(5);
      expect(res.body.data.page).toBe(2);
      expect(res.body.data.total).toBe(25);
    });

    it("honours a custom limit", async () => {
      const res = await getLogs(adminToken, {
        actorId: seededActorId,
        limit: 10,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(10);
      expect(res.body.data.limit).toBe(10);
      expect(res.body.data.totalPages).toBe(3);
    });

    it("never returns overlapping entries across pages", async () => {
      const page1 = await getLogs(adminToken, {
        actorId: seededActorId,
        limit: 10,
        page: 1,
      });
      const page2 = await getLogs(adminToken, {
        actorId: seededActorId,
        limit: 10,
        page: 2,
      });

      const ids1 = page1.body.data.items.map(
        (item: { id: string }) => item.id,
      );
      const ids2 = page2.body.data.items.map(
        (item: { id: string }) => item.id,
      );

      expect(ids1).toHaveLength(10);
      expect(ids2).toHaveLength(10);
      expect(ids1.filter((id: string) => ids2.includes(id))).toEqual(
        [],
      );
    });

    it("returns an empty page beyond the last one", async () => {
      const res = await getLogs(adminToken, {
        actorId: seededActorId,
        page: 99,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.total).toBe(25);
      expect(res.body.data.totalPages).toBe(2);
    });

    it("rejects an out-of-range limit", async () => {
      const tooLarge = await getLogs(adminToken, { limit: 101 });
      const zero = await getLogs(adminToken, { limit: 0 });

      expect(tooLarge.status).toBe(400);
      expect(tooLarge.body.code).toBe("VALIDATION_ERROR");
      expect(zero.status).toBe(400);
    });

    it("rejects a page below 1", async () => {
      const res = await getLogs(adminToken, { page: 0 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("rejects unknown query parameters", async () => {
      const res = await getLogs(adminToken, {
        notAFilter: "x",
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("filters", () => {
    const orderId = new mongoose.Types.ObjectId().toString();
    const otherEntityId = new mongoose.Types.ObjectId().toString();

    beforeEach(async () => {
      await seedAuditLog({
        actorId: seededActorId,
        actorRole: "SUPER_ADMIN",
        action: "USER_STATUS_UPDATE",
        entityType: "USER",
        entityId: otherEntityId,
        createdAt: daysAgo(4),
      });
      await seedAuditLog({
        actorId: seededActorId,
        actorRole: "SELLER",
        action: "PRODUCT_CREATED",
        entityType: "PRODUCT",
        entityId: orderId,
        createdAt: daysAgo(3),
      });
      await seedAuditLog({
        actorId: "64b000000000000000000aaa",
        actorRole: "BUYER",
        action: "ORDER_CREATED",
        entityType: "ORDER",
        entityId: orderId,
        createdAt: daysAgo(2),
      });
      await seedAuditLog({
        actorId: "system",
        actorRole: "SYSTEM",
        action: "PAYMENT_CAPTURED",
        entityType: "ORDER",
        entityId: orderId,
        createdAt: daysAgo(1),
      });
    });

    it("filters by actorId", async () => {
      const res = await getLogs(adminToken, {
        actorId: "system",
      });

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0].action).toBe(
        "PAYMENT_CAPTURED",
      );
    });

    it("filters by actorRole", async () => {
      const res = await getLogs(adminToken, {
        actorId: seededActorId,
        actorRole: "SELLER",
      });

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0].action).toBe(
        "PRODUCT_CREATED",
      );
    });

    it("filters by action", async () => {
      const res = await getLogs(adminToken, {
        action: "ORDER_CREATED",
      });

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0].entityType).toBe("ORDER");
      expect(res.body.data.items[0].actorRole).toBe("BUYER");
    });

    it("filters by entityType", async () => {
      const res = await getLogs(adminToken, {
        actorId: seededActorId,
        entityType: "USER",
      });

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0].action).toBe(
        "USER_STATUS_UPDATE",
      );
    });

    it("filters by entityId", async () => {
      const res = await getLogs(adminToken, { entityId: orderId });

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(3);
      expect(
        res.body.data.items.every(
          (item: { entityId: string }) =>
            item.entityId === orderId,
        ),
      ).toBe(true);
    });

    it("combines filters with AND", async () => {
      const res = await getLogs(adminToken, {
        entityType: "ORDER",
        actorRole: "SYSTEM",
        action: "PAYMENT_CAPTURED",
      });

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0].actorId).toBe("system");
    });

    it("returns nothing when no entry matches", async () => {
      const res = await getLogs(adminToken, {
        action: "NOT_A_RECORDED_ACTION",
      });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.total).toBe(0);
      expect(res.body.data.totalPages).toBe(0);
    });

    it("rejects a malformed entityId", async () => {
      const res = await getLogs(adminToken, {
        entityId: "not-an-objectid",
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("sorting", () => {
    beforeEach(async () => {
      await seedAuditLog({
        action: "ALPHA_ACTION",
        entityType: "ZEBRA_ENTITY",
        createdAt: daysAgo(3),
      });
      await seedAuditLog({
        action: "MIKE_ACTION",
        entityType: "APPLE_ENTITY",
        createdAt: daysAgo(2),
      });
      await seedAuditLog({
        action: "CHARLIE_ACTION",
        entityType: "MANGO_ENTITY",
        createdAt: daysAgo(1),
      });
    });

    const actionsOf = (res: {
      body: { data: { items: Array<{ action: string }> } };
    }): string[] => res.body.data.items.map((item) => item.action);

    it("sorts by createdAt descending by default", async () => {
      const res = await getLogs(adminToken, {
        actorId: seededActorId,
      });

      expect(actionsOf(res)).toEqual([
        "CHARLIE_ACTION",
        "MIKE_ACTION",
        "ALPHA_ACTION",
      ]);

      const timestamps = res.body.data.items.map(
        (item: { createdAt: string }) =>
          new Date(item.createdAt).getTime(),
      );
      expect(timestamps).toEqual(
        [...timestamps].sort((a: number, b: number) => b - a),
      );
    });

    it("sorts by createdAt ascending when asked", async () => {
      const res = await getLogs(adminToken, {
        actorId: seededActorId,
        sortBy: "createdAt",
        sortOrder: "asc",
      });

      expect(actionsOf(res)).toEqual([
        "ALPHA_ACTION",
        "MIKE_ACTION",
        "CHARLIE_ACTION",
      ]);
    });

    it("sorts by action", async () => {
      const asc = await getLogs(adminToken, {
        actorId: seededActorId,
        sortBy: "action",
        sortOrder: "asc",
      });
      const desc = await getLogs(adminToken, {
        actorId: seededActorId,
        sortBy: "action",
        sortOrder: "desc",
      });

      expect(actionsOf(asc)).toEqual([
        "ALPHA_ACTION",
        "CHARLIE_ACTION",
        "MIKE_ACTION",
      ]);
      expect(actionsOf(desc)).toEqual([
        "MIKE_ACTION",
        "CHARLIE_ACTION",
        "ALPHA_ACTION",
      ]);
    });

    it("sorts by entityType", async () => {
      const res = await getLogs(adminToken, {
        actorId: seededActorId,
        sortBy: "entityType",
        sortOrder: "asc",
      });

      expect(
        res.body.data.items.map(
          (item: { entityType: string }) => item.entityType,
        ),
      ).toEqual([
        "APPLE_ENTITY",
        "MANGO_ENTITY",
        "ZEBRA_ENTITY",
      ]);
    });

    it("rejects an unsupported sort field or order", async () => {
      const badField = await getLogs(adminToken, {
        sortBy: "before",
      });
      const badOrder = await getLogs(adminToken, {
        sortOrder: "sideways",
      });

      expect(badField.status).toBe(400);
      expect(badField.body.code).toBe("VALIDATION_ERROR");
      expect(badOrder.status).toBe(400);
      expect(badOrder.body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("date-range filtering", () => {
    beforeEach(async () => {
      await seedAuditLog({
        action: "DAY_ONE",
        entityType: "TEST_ENTITY",
        createdAt: new Date("2026-01-10T09:00:00.000Z"),
      });
      await seedAuditLog({
        action: "DAY_TWO_MORNING",
        entityType: "TEST_ENTITY",
        createdAt: new Date("2026-01-11T08:30:00.000Z"),
      });
      await seedAuditLog({
        action: "DAY_TWO_EVENING",
        entityType: "TEST_ENTITY",
        createdAt: new Date("2026-01-11T21:45:00.000Z"),
      });
      await seedAuditLog({
        action: "DAY_THREE",
        entityType: "TEST_ENTITY",
        createdAt: new Date("2026-01-12T02:00:00.000Z"),
      });
    });

    const actionsOf = (res: {
      body: { data: { items: Array<{ action: string }> } };
    }): string[] => res.body.data.items.map((item) => item.action);

    it("filters inclusively by fromDate and toDate", async () => {
      const res = await getLogs(adminToken, {
        actorId: seededActorId,
        fromDate: "2026-01-11T00:00:00.000Z",
        toDate: "2026-01-11T23:59:59.999Z",
      });

      expect(res.status).toBe(200);
      expect(actionsOf(res).sort()).toEqual([
        "DAY_TWO_EVENING",
        "DAY_TWO_MORNING",
      ]);
    });

    it("treats a bare toDate as the end of that UTC day", async () => {
      const res = await getLogs(adminToken, {
        actorId: seededActorId,
        fromDate: "2026-01-11",
        toDate: "2026-01-11",
      });

      expect(res.status).toBe(200);
      expect(actionsOf(res).sort()).toEqual([
        "DAY_TWO_EVENING",
        "DAY_TWO_MORNING",
      ]);
    });

    it("applies fromDate on its own", async () => {
      const res = await getLogs(adminToken, {
        actorId: seededActorId,
        fromDate: "2026-01-12",
      });

      expect(res.status).toBe(200);
      expect(actionsOf(res)).toEqual(["DAY_THREE"]);
    });

    it("applies toDate on its own", async () => {
      const res = await getLogs(adminToken, {
        actorId: seededActorId,
        toDate: "2026-01-10",
        sortOrder: "asc",
      });

      expect(res.status).toBe(200);
      expect(actionsOf(res)).toEqual(["DAY_ONE"]);
    });

    it("combines the date range with other filters", async () => {
      const res = await getLogs(adminToken, {
        actorId: seededActorId,
        entityType: "TEST_ENTITY",
        fromDate: "2026-01-11",
        toDate: "2026-01-12",
      });

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(3);
    });

    it("rejects a fromDate after the toDate", async () => {
      const res = await getLogs(adminToken, {
        fromDate: "2026-02-01",
        toDate: "2026-01-01",
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("rejects an unparsable date", async () => {
      const res = await getLogs(adminToken, {
        fromDate: "not-a-date",
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("free-text search", () => {
    const entityObjectId = new mongoose.Types.ObjectId().toString();

    beforeEach(async () => {
      await seedAuditLog({
        actorId: seededActorId,
        actorRole: "SUPER_ADMIN",
        action: "USER_STATUS_UPDATE",
        entityType: "USER",
        entityId: entityObjectId,
        createdAt: daysAgo(4),
      });
      await seedAuditLog({
        actorId: "64b000000000000000000aaa",
        actorRole: "BUYER",
        action: "ORDER_CREATED",
        entityType: "ORDER",
        entityId: entityObjectId,
        createdAt: daysAgo(3),
      });
      await seedAuditLog({
        actorId: "system",
        actorRole: "SYSTEM",
        action: "PAYMENT_CAPTURED",
        entityType: "ORDER",
        entityId: null,
        createdAt: daysAgo(2),
      });
    });

    it("matches an action case-insensitively and partially", async () => {
      const res = await getLogs(adminToken, { search: "status_update" });

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0].action).toBe("USER_STATUS_UPDATE");
    });

    it("matches a partial actorId", async () => {
      const res = await getLogs(adminToken, {
        search: seededActorId.slice(0, 10),
      });

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0].actorId).toBe(seededActorId);
    });

    it("matches a full entityId", async () => {
      const res = await getLogs(adminToken, { search: entityObjectId });

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(2);
      expect(
        res.body.data.items.every(
          (item: { entityId: string | null }) =>
            item.entityId === entityObjectId,
        ),
      ).toBe(true);
    });

    it("matches a hex fragment of an entityId", async () => {
      const fragment = entityObjectId.slice(8, 16);
      const res = await getLogs(adminToken, { search: fragment });

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(2);
      expect(
        res.body.data.items.every(
          (item: { entityId: string | null }) =>
            item.entityId === entityObjectId,
        ),
      ).toBe(true);
    });

    it("searches across fields with OR", async () => {
      // "system" is an actorId, "captured" is part of an action —
      // each term matches a different entry on its own.
      const byActor = await getLogs(adminToken, { search: "system" });
      const byAction = await getLogs(adminToken, { search: "captured" });

      expect(byActor.status).toBe(200);
      expect(byActor.body.data.total).toBe(1);
      expect(byActor.body.data.items[0].actorId).toBe("system");
      expect(byAction.status).toBe(200);
      expect(byAction.body.data.total).toBe(1);
      expect(byAction.body.data.items[0].action).toBe("PAYMENT_CAPTURED");
    });

    it("does not treat ordinary words as ObjectId fragments", async () => {
      // "zzzz" is not hex and matches nothing — the important part is
      // that the query still succeeds.
      const res = await getLogs(adminToken, { search: "zzzz" });

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(0);
    });

    it("combines search with the other filters using AND", async () => {
      const res = await getLogs(adminToken, {
        search: entityObjectId,
        actorRole: "BUYER",
      });

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0].action).toBe("ORDER_CREATED");
    });

    it("rejects an empty search term", async () => {
      const res = await getLogs(adminToken, { search: "   " });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("actor identity decoration", () => {
    it("resolves name and email for real user actors only", async () => {
      const email = `actor-${Date.now()}@example.test`;
      const registered = await registerUser(email, "Riya Sharma");
      const userId = registered.body.data.user.id as string;

      await seedAuditLog({
        actorId: userId,
        actorRole: "BUYER",
        action: "LOGIN",
        entityType: "USER",
        entityId: null,
        createdAt: daysAgo(1),
      });
      await seedAuditLog({
        actorId: "webhook",
        actorRole: "SYSTEM",
        action: "PAYMENT_CAPTURED",
        entityType: "ORDER",
        entityId: null,
        createdAt: daysAgo(1),
      });

      const res = await getLogs(adminToken, {
        action: "LOGIN",
      });
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0].actorName).toBe("Riya Sharma");
      expect(res.body.data.items[0].actorEmail).toBe(email);

      const systemRes = await getLogs(adminToken, {
        search: "webhook",
      });
      expect(systemRes.status).toBe(200);
      expect(systemRes.body.data.total).toBe(1);
      expect(systemRes.body.data.items[0].actorName).toBeNull();
      expect(systemRes.body.data.items[0].actorEmail).toBeNull();
    });
  });
});
