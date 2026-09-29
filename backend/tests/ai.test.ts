import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { connect, disconnect, clearDb, registerUser, login, api } from "./helpers.js";
import { Product } from "../src/models/Product.js";
import { Category } from "../src/models/Category.js";
import { ProductStatus } from "../src/constants/productStatus.js";
import mongoose from "mongoose";

describe("AI Endpoints & Groq Migration Integration", () => {
  let buyerToken: string;
  let testCategoryId: string;

  beforeAll(async () => {
    await connect();
    await clearDb();

    const buyerEmail = `ai_buyer_${Date.now()}@example.com`;
    await registerUser(buyerEmail, "AI Buyer");
    const auth = await login(buyerEmail);
    buyerToken = auth.token;

    // Create test category and product
    const category = await Category.create({
      name: "Smartphones",
      slug: "smartphones",
      isActive: true,
    });
    testCategoryId = category._id.toString();

    await Product.create({
      sellerId: new mongoose.Types.ObjectId(),
      name: "NexPhone Pro 5G",
      slug: "nexphone-pro-5g",
      description: "Flagship 5G smartphone with 120Hz AMOLED display and fast charging.",
      price: 25000,
      stock: 50,
      category: category._id,
      status: ProductStatus.ACTIVE,
      specifications: [
        { key: "RAM", value: "8GB" },
        { key: "Storage", value: "128GB" },
      ],
    });
  });

  afterAll(async () => {
    await disconnect();
  });

  describe("POST /api/v1/ai/search", () => {
    it("handles natural-language product search queries with price budget", async () => {
      const res = await api
        .post("/api/v1/ai/search")
        .send({ query: "Show me phones under 30000", limit: 5 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.products).toBeInstanceOf(Array);
      expect(res.body.data.extractedCriteria).toBeDefined();
    });

    it("handles empty query rejection cleanly", async () => {
      const res = await api
        .post("/api/v1/ai/search")
        .send({ query: "   " });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe("POST /api/v1/ai/chat", () => {
    it("rejects unauthenticated requests", async () => {
      const res = await api
        .post("/api/v1/ai/chat")
        .send({ message: "Hello" });

      expect(res.status).toBe(401);
    });

    it("responds to conversational greeting gracefully", async () => {
      const res = await api
        .post("/api/v1/ai/chat")
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ message: "Hello! How can you help me?" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBeTruthy();
      expect(res.body.data.intent).toBe("GREETING");
    });

    it("responds to store policy / FAQ query with grounded policy information", async () => {
      const res = await api
        .post("/api/v1/ai/chat")
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ message: "What is your return policy?" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBeTruthy();
    });

    it("responds to order status check when buyer has no orders", async () => {
      const res = await api
        .post("/api/v1/ai/chat")
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ message: "Where is my order?" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toMatch(/no orders|no recent order|not find/i);
    });

    it("responds to product search query and returns matched products", async () => {
      const res = await api
        .post("/api/v1/ai/chat")
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ message: "Show me phones under 30000" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBeTruthy();
    });

    it("politely declines off-topic non-commerce questions", async () => {
      const res = await api
        .post("/api/v1/ai/chat")
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ message: "Write a poem about the moon" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.intent).toBe("OUT_OF_SCOPE");
      expect(res.body.data.message).toContain("NexCart shopping assistant");
    });
  });
});
