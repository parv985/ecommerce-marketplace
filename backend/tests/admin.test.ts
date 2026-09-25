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
import { User } from "../src/models/User.js";
import { UserRole } from "../src/constants/roles.js";
import { generateAccessToken } from "../src/utils/jwt.js";

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

    const sellerUser = await User.findOne({ email });
    const sellerToken = generateAccessToken({
      userId: sellerUser!._id.toString(),
      role: UserRole.SELLER,
      type: "access",
    });

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

  it("fetches single-endpoint super admin dashboard data", async () => {
    const token = await adminLogin();
    await registerUser("buyer1@test.com");
    await registerSeller("seller1@test.com");

    const res = await api
      .get("/api/v1/admin/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.stats).toBeDefined();
    expect(data.stats.totalUsers).toBeGreaterThanOrEqual(2);
    expect(data.stats.totalSellers).toBeGreaterThanOrEqual(1);
    expect(data.stats.totalOrders).toBeDefined();
    expect(data.stats.totalSales).toBeDefined();
    expect(data.stats.platformRevenue).toBeDefined();
    expect(data.stats.lowStockProducts).toBeDefined();

    expect(Array.isArray(data.salesOverview)).toBe(true);
    expect(data.orderStatus).toBeDefined();
    expect(Array.isArray(data.recentOrders)).toBe(true);
    expect(Array.isArray(data.topProducts)).toBe(true);
    expect(Array.isArray(data.topSellers)).toBe(true);
    expect(data.needsAttention).toBeDefined();
    expect(data.sellerActivity).toBeDefined();
    expect(Array.isArray(data.sellerActivity.growth)).toBe(true);
    expect(Array.isArray(data.userGrowth)).toBe(true);
    expect(data.revenue).toBeDefined();
    expect(data.revenue.commissionRate).toBeDefined();
  });

  it("accepts range parameter on admin dashboard", async () => {
    const token = await adminLogin();

    const res = await api
      .get("/api/v1/admin/dashboard?range=7d")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.salesOverview.length).toBe(7);
  });
});

