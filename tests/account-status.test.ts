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
  registerUser,
} from "./helpers.js";
import { User } from "../src/models/User.js";

/*
 * Account-status enforcement:
 *
 *  - a Super Admin deactivation must take effect IMMEDIATELY, even for
 *    access tokens that are still valid (no waiting for expiry),
 *  - deactivated buyers must not be able to buy / use the cart,
 *  - deactivated sellers must not be able to create (sell) products,
 *  - refresh tokens are revoked on deactivation so no new access token
 *    can be minted,
 *  - the login/session payloads keep `avatarUrl` so a saved profile
 *    photo survives logout + login.
 */
describe("Account status enforcement", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  const findUserIdByEmail = async (
    adminToken: string,
    email: string,
    role: "BUYER" | "SELLER",
  ): Promise<string> => {
    const users = await api
      .get(`/api/v1/admin/users?role=${role}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const target = (
      users.body.data.items as Array<{
        id: string;
        email: string;
      }>
    ).find((u) => u.email === email);

    if (!target) {
      throw new Error(`user ${email} not found`);
    }

    return target.id;
  };

  const deactivateUser = async (
    adminToken: string,
    email: string,
    role: "BUYER" | "SELLER",
  ): Promise<void> => {
    const userId = await findUserIdByEmail(
      adminToken,
      email,
      role,
    );

    const res = await api
      .patch(`/api/v1/admin/users/${userId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  };

  it("login and profile payloads include avatarUrl and isActive", async () => {
    const email = `av${Date.now()}@test.com`;
    await registerUser(email);

    // Simulate an avatar uploaded in an earlier session (Cloudinary URL
    // persisted on the user document).
    await User.findOneAndUpdate(
      { email },
      { avatarUrl: "https://res.cloudinary.com/test/avatar.jpg" },
    );

    const res = await api
      .post("/api/v1/auth/login")
      .send({ email, password: "Password123!" });

    expect(res.status).toBe(200);
    expect(res.body.data.user.avatarUrl).toBe(
      "https://res.cloudinary.com/test/avatar.jpg",
    );
    expect(res.body.data.user.isActive).toBe(true);

    // The profile endpoint reports the status too (used by the frontend
    // to poll for deactivations without a page refresh).
    const { token } = await login(email);
    const me = await api
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${token}`);

    expect(me.status).toBe(200);
    expect(me.body.data.isActive).toBe(true);
    expect(me.body.data.avatarUrl).toBe(
      "https://res.cloudinary.com/test/avatar.jpg",
    );
  });

  it("blocks a deactivated buyer's cart access immediately", async () => {
    const adminToken = await adminLogin();

    const seller = await createApprovedSeller();
    const product = await createProduct(seller.token, {
      name: "Blocked Widget",
      status: "ACTIVE",
    });
    const productId = product.body.data.id;

    const email = `blocked${Date.now()}@test.com`;
    await registerUser(email);
    const { token } = await login(email);

    // Sanity check: the buyer can add to cart while active.
    const before = await api
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId, quantity: 1 });
    expect(before.status).toBe(201);

    await deactivateUser(adminToken, email, "BUYER");

    // The SAME (still valid) access token must now be rejected on every
    // buyer action - no token-expiry wait, no page refresh.
    const cartRes = await api
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId, quantity: 1 });

    expect(cartRes.status).toBe(403);
    expect(cartRes.body.code).toBe("ACCOUNT_INACTIVE");
    expect(cartRes.body.message).toBe(
      "Your account is inactive",
    );

    const addressesRes = await api
      .get("/api/v1/users/me/addresses")
      .set("Authorization", `Bearer ${token}`);
    expect(addressesRes.status).toBe(403);
    expect(addressesRes.body.code).toBe("ACCOUNT_INACTIVE");
  });

  it("blocks a deactivated seller from creating products", async () => {
    const adminToken = await adminLogin();

    const seller = await createApprovedSeller();

    // Sanity check: the approved seller can create products while active.
    const before = await createProduct(seller.token, {
      name: "Allowed Widget",
    });
    expect(before.status).toBe(201);

    await deactivateUser(adminToken, seller.email, "SELLER");

    const after = await createProduct(seller.token, {
      name: "Should Be Blocked",
    });

    expect(after.status).toBe(403);
    expect(after.body.code).toBe("ACCOUNT_INACTIVE");
    expect(after.body.message).toBe(
      "Your account is inactive",
    );
  });

  it("revokes refresh tokens when a user is deactivated", async () => {
    const adminToken = await adminLogin();

    const email = `refresh${Date.now()}@test.com`;
    await registerUser(email);
    const { cookie } = await login(email);

    await deactivateUser(adminToken, email, "BUYER");

    const refresh = await api
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie)
      .send();

    // All refresh tokens were revoked, so no new access token is issued.
    expect(refresh.status).toBe(401);
    expect(refresh.body.code).toBe("INVALID_REFRESH_TOKEN");

    // Logging out must still work so the deactivated user can leave.
    const logout = await api
      .post("/api/v1/auth/logout")
      .set("Cookie", cookie)
      .send();

    expect(logout.status).toBe(200);
  });

  it("tells refresh attempts of inactive accounts why they fail", async () => {
    // Direct deactivation without refresh-token revocation (e.g. a
    // status flipped by operations tooling): the refresh endpoint must
    // answer 403 ACCOUNT_INACTIVE instead of a generic 401, so the
    // frontend can show "Your account is inactive".
    const email = `direct${Date.now()}@test.com`;
    await registerUser(email);
    const { cookie } = await login(email);

    await User.findOneAndUpdate(
      { email },
      { isActive: false },
    );

    const refresh = await api
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie)
      .send();

    expect(refresh.status).toBe(403);
    expect(refresh.body.code).toBe("ACCOUNT_INACTIVE");
    expect(refresh.body.message).toBe(
      "Your account is inactive",
    );
  });

  it("restores access when the account is reactivated", async () => {
    const adminToken = await adminLogin();

    const email = `react${Date.now()}@test.com`;
    await registerUser(email);
    const { token } = await login(email);

    await deactivateUser(adminToken, email, "BUYER");

    const userId = await findUserIdByEmail(
      adminToken,
      email,
      "BUYER",
    );

    const reactivate = await api
      .patch(`/api/v1/admin/users/${userId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: true });

    expect(reactivate.status).toBe(200);
    expect(reactivate.body.data.isActive).toBe(true);

    // The still-valid access token works again.
    const me = await api
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${token}`);

    expect(me.status).toBe(200);
    expect(me.body.data.isActive).toBe(true);
  });
});
