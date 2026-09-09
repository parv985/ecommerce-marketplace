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
  createProduct,
  disconnect,
  login,
  registerSeller,
  registerUser,
} from "./helpers.js";

describe("Admin", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  it("blocks non-admins from admin endpoints", async () => {
    const buyerEmail = `ad${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const { token } = await login(buyerEmail);

    const res = await api
      .get("/api/v1/admin/users")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("requires authentication on admin endpoints", async () => {
    const res = await api.get("/api/v1/admin/users");

    expect(res.status).toBe(401);
  });

  it("lists users and sellers", async () => {
    const token = await adminLogin();
    await registerUser("ad1@test.com");
    await registerSeller("ad2@test.com");

    const users = await api
      .get("/api/v1/admin/users")
      .set("Authorization", `Bearer ${token}`);

    expect(users.status).toBe(200);
    expect(users.body.data.total).toBeGreaterThanOrEqual(
      2,
    );

    const sellers = await api
      .get("/api/v1/admin/sellers")
      .set("Authorization", `Bearer ${token}`);

    expect(sellers.status).toBe(200);
    expect(sellers.body.data.total).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("approves a pending seller, unblocking product creation", async () => {
    const token = await adminLogin();
    const email = `ad${Date.now()}@test.com`;
    await registerSeller(email);

    const loginRes = await api
      .post("/api/v1/auth/login")
      .send({ email, password: "Password123!" });
    const sellerToken = loginRes.body.data.accessToken;

    const pending = await api
      .get("/api/v1/admin/sellers?status=PENDING")
      .set("Authorization", `Bearer ${token}`);

    const profileId = pending.body.data.items[0].id;

    const before = await createProduct(sellerToken);
    expect(before.status).toBe(403);

    const approve = await api
      .patch(`/api/v1/admin/sellers/${profileId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        status: "APPROVED",
        reason: "Docs verified",
      });

    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe("APPROVED");

    const after = await createProduct(sellerToken);
    expect(after.status).toBe(201);
  });

  it("deactivates a user and blocks their login", async () => {
    const token = await adminLogin();
    const email = `ad${Date.now()}@test.com`;
    await registerUser(email);

    const users = await api
      .get("/api/v1/admin/users?role=BUYER")
      .set("Authorization", `Bearer ${token}`);

    const user = users.body.data.items.find(
      (u: { email: string }) => u.email === email,
    );

    const deactivate = await api
      .patch(`/api/v1/admin/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: false });

    expect(deactivate.status).toBe(200);
    expect(deactivate.body.data.isActive).toBe(false);

    const loginRes = await api
      .post("/api/v1/auth/login")
      .send({ email, password: "Password123!" });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.code).toBe("ACCOUNT_INACTIVE");
  });

  it("moderates a product (deactivate + reactivate)", async () => {
    const seller = await createApprovedSeller();
    const adminToken = await adminLogin();

    const product = await createProduct(
      seller.token,
      { status: "ACTIVE" },
    );
    const productId = product.body.data.id;

    const deactivate = await api
      .patch(`/api/v1/admin/products/${productId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "INACTIVE" });

    expect(deactivate.status).toBe(200);

    const hidden = await api.get(
      `/api/v1/products/${productId}`,
    );
    expect(hidden.status).toBe(404);

    const reactivate = await api
      .patch(`/api/v1/admin/products/${productId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "ACTIVE" });

    expect(reactivate.status).toBe(200);

    const visible = await api.get(
      `/api/v1/products/${productId}`,
    );
    expect(visible.status).toBe(200);
  });

  it("lists all orders", async () => {
    const token = await adminLogin();

    const res = await api
      .get("/api/v1/admin/orders")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toBeDefined();
  });

  it("requires authentication for audit logs", async () => {
    const res = await api.get("/api/v1/admin/audit-logs");
    expect(res.status).toBe(401);
  });

  it("blocks non-admins from audit logs", async () => {
    const buyerEmail = `ad-audit${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    const { token } = await login(buyerEmail);

    const res = await api
      .get("/api/v1/admin/audit-logs")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("lists audit logs with pagination and filters", async () => {
    const token = await adminLogin();
    const buyerEmail = `ad-audit2${Date.now()}@test.com`;
    await registerUser(buyerEmail);
    await login(buyerEmail);

    const users = await api
      .get("/api/v1/admin/users?role=BUYER")
      .set("Authorization", `Bearer ${token}`);
    const user = users.body.data.items.find(
      (u: { email: string }) => u.email === buyerEmail,
    );

    await api
      .patch(`/api/v1/admin/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: false });

    const listed = await api
      .get("/api/v1/admin/audit-logs")
      .set("Authorization", `Bearer ${token}`);

    expect(listed.status).toBe(200);
    expect(listed.body.data.page).toBe(1);
    expect(listed.body.data.limit).toBe(20);
    expect(listed.body.data.items.length).toBeGreaterThan(0);
    expect(listed.body.data.items[0].createdAt).toBeDefined();
    expect(listed.body.data.items[0].action).toBeDefined();

    const page1 = await api
      .get("/api/v1/admin/audit-logs?page=1&limit=1")
      .set("Authorization", `Bearer ${token}`);
    expect(page1.status).toBe(200);
    expect(page1.body.data.limit).toBe(1);
    expect(page1.body.data.items).toHaveLength(1);
    expect(page1.body.data.totalPages).toBeGreaterThanOrEqual(1);

    const page2 = await api
      .get("/api/v1/admin/audit-logs?page=2&limit=1")
      .set("Authorization", `Bearer ${token}`);
    expect(page2.status).toBe(200);
    if (page2.body.data.total > 1) {
      expect(page2.body.data.items[0].id).not.toBe(
        page1.body.data.items[0].id,
      );
    }

    const byAction = await api
      .get("/api/v1/admin/audit-logs?action=USER_STATUS_UPDATE")
      .set("Authorization", `Bearer ${token}`);
    expect(byAction.status).toBe(200);
    expect(byAction.body.data.items.length).toBeGreaterThan(0);
    for (const log of byAction.body.data.items) {
      expect(log.action).toBe("USER_STATUS_UPDATE");
    }

    const byRole = await api
      .get("/api/v1/admin/audit-logs?actorRole=SUPER_ADMIN")
      .set("Authorization", `Bearer ${token}`);
    expect(byRole.status).toBe(200);
    for (const log of byRole.body.data.items) {
      expect(log.actorRole).toBe("SUPER_ADMIN");
    }

    const byEntityType = await api
      .get("/api/v1/admin/audit-logs?entityType=USER")
      .set("Authorization", `Bearer ${token}`);
    expect(byEntityType.status).toBe(200);
    for (const log of byEntityType.body.data.items) {
      expect(log.entityType).toBe("USER");
    }

    const byEntityId = await api
      .get(`/api/v1/admin/audit-logs?entityId=${user.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(byEntityId.status).toBe(200);
    expect(byEntityId.body.data.items.length).toBeGreaterThan(0);
    for (const log of byEntityId.body.data.items) {
      expect(log.entityId).toBe(user.id);
    }

    const byActor = await api
      .get(
        `/api/v1/admin/audit-logs?actorId=${byAction.body.data.items[0].actorId}`,
      )
      .set("Authorization", `Bearer ${token}`);
    expect(byActor.status).toBe(200);
    for (const log of byActor.body.data.items) {
      expect(log.actorId).toBe(byAction.body.data.items[0].actorId);
    }

    const from = new Date(Date.now() - 60_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    const byDate = await api
      .get(
        `/api/v1/admin/audit-logs?fromDate=${encodeURIComponent(from)}&toDate=${encodeURIComponent(to)}`,
      )
      .set("Authorization", `Bearer ${token}`);
    expect(byDate.status).toBe(200);

    const sortedAsc = await api
      .get("/api/v1/admin/audit-logs?sortBy=createdAt&sortOrder=asc")
      .set("Authorization", `Bearer ${token}`);
    expect(sortedAsc.status).toBe(200);
    const times = sortedAsc.body.data.items.map(
      (l: { createdAt: string }) => new Date(l.createdAt).getTime(),
    );
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);

    const tooBig = await api
      .get("/api/v1/admin/audit-logs?limit=101")
      .set("Authorization", `Bearer ${token}`);
    expect(tooBig.status).toBe(400);
  });
});
