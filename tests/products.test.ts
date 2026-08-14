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
} from "./helpers.js";

describe("Products", () => {
  beforeAll(connect);
  beforeEach(clearDb);
  afterAll(disconnect);

  it("creates a product in DRAFT status", async () => {
    const seller = await createApprovedSeller();

    const res = await createProduct(seller.token);

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("Test Product");
    expect(res.body.data.status).toBe("DRAFT");
    expect(res.body.data.price).toBe(100);
  });

  it("lists the seller's own products", async () => {
    const seller = await createApprovedSeller();
    await createProduct(seller.token);
    await createProduct(seller.token, {
      name: "Second Product",
    });

    const res = await api
      .get("/api/v1/products/my")
      .set("Authorization", `Bearer ${seller.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it("hides drafts from the public catalog", async () => {
    const seller = await createApprovedSeller();
    const created = await createProduct(seller.token);
    const id = created.body.data.id;

    const publicRes = await api.get(
      `/api/v1/products/${id}`,
    );

    expect(publicRes.status).toBe(404);
  });

  it("publishes a product when set to ACTIVE", async () => {
    const seller = await createApprovedSeller();
    const created = await createProduct(seller.token);
    const id = created.body.data.id;

    await api
      .patch(`/api/v1/products/${id}`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({ status: "ACTIVE" });

    const publicRes = await api.get(
      `/api/v1/products/${id}`,
    );

    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.status).toBe(
      "ACTIVE",
    );
  });

  it("supports browsing with filters", async () => {
    const seller = await createApprovedSeller();
    await createProduct(seller.token, {
      name: "Wireless Mouse",
      status: "ACTIVE",
    });
    await createProduct(seller.token, {
      name: "Mechanical Keyboard",
      price: 2500,
      status: "ACTIVE",
    });

    const res = await api.get(
      "/api/v1/products?search=mouse",
    );

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);

    const sortRes = await api.get(
      "/api/v1/products?sort=price_desc&limit=1",
    );

    expect(sortRes.status).toBe(200);
    expect(
      sortRes.body.data.items[0].name,
    ).toBe("Mechanical Keyboard");
  });

  it("enforces seller ownership on update and delete", async () => {
    const sellerA = await createApprovedSeller();
    const sellerB = await createApprovedSeller();

    const created = await createProduct(
      sellerA.token,
    );
    const id = created.body.data.id;

    const patch = await api
      .patch(`/api/v1/products/${id}`)
      .set("Authorization", `Bearer ${sellerB.token}`)
      .send({ price: 1 });

    expect(patch.status).toBe(404);

    const del = await api
      .delete(`/api/v1/products/${id}`)
      .set("Authorization", `Bearer ${sellerB.token}`);

    expect(del.status).toBe(404);

    const single = await api
      .get(`/api/v1/products/my/${id}`)
      .set("Authorization", `Bearer ${sellerB.token}`);

    expect(single.status).toBe(404);
  });

  it("soft-deletes a product (INACTIVE)", async () => {
    const seller = await createApprovedSeller();
    const created = await createProduct(seller.token, {
      status: "ACTIVE",
    });
    const id = created.body.data.id;

    const res = await api
      .delete(`/api/v1/products/${id}`)
      .set("Authorization", `Bearer ${seller.token}`);

    expect(res.status).toBe(200);

    const publicRes = await api.get(
      `/api/v1/products/${id}`,
    );

    expect(publicRes.status).toBe(404);
  });

  it("validates product input", async () => {
    const seller = await createApprovedSeller();

    const negative = await createProduct(
      seller.token,
      { price: -5 },
    );

    expect(negative.status).toBe(400);

    const noName = await createProduct(
      seller.token,
      { name: undefined },
    );

    expect(noName.status).toBe(400);

    const unknownField = await createProduct(
      seller.token,
      { hacker: "field" } as Record<string, unknown>,
    );

    expect(unknownField.status).toBe(400);
  });

  it("rejects products referencing an inactive category", async () => {
    const seller = await createApprovedSeller();
    const adminToken = await adminTokenOf();

    const cat = await api
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Electronics" });

    const catId = cat.body.data.id;

    await api
      .delete(`/api/v1/categories/${catId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const res = await api
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${seller.token}`)
      .send({
        name: "Bad Product",
        category: catId,
        price: 10,
        stock: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_CATEGORY");
  });
});

const adminTokenOf = async (): Promise<string> =>
  adminLogin();
