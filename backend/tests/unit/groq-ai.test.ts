import { describe, it, expect, vi } from "vitest";
import {
  isGroqConfigured,
  getGroqModelName,
  getGroqClient,
} from "../../src/modules/ai/groq.client.js";
import { GROQ_TOOL_DEFINITIONS } from "../../src/modules/ai/tools/tool.definitions.js";
import {
  generateLocalEmbedding,
  cosineSimilarity,
  embedText,
} from "../../src/modules/ai/rag/embedding.service.js";

describe("Groq AI Client & Configuration", () => {
  it("exposes isGroqConfigured as a boolean", () => {
    expect(typeof isGroqConfigured()).toBe("boolean");
  });

  it("returns configured or default Groq model name", () => {
    const model = getGroqModelName();
    expect(typeof model).toBe("string");
    expect(model.length).toBeGreaterThan(0);
    expect(model).toBe("llama-3.3-70b-versatile");
  });

  it("throws a structured AppError when Groq is not configured and getGroqClient is called", () => {
    if (!isGroqConfigured()) {
      expect(() => getGroqClient()).toThrowError(/Groq API is not configured/);
    }
  });
});

describe("Groq Tool Definitions Schema Compliance", () => {
  it("defines all required tools in OpenAI/Groq function calling format", () => {
    const requiredTools = [
      "searchProducts",
      "getProductDetails",
      "getUserOrders",
      "getOrderStatus",
      "getPaymentStatus",
      "checkCancellationEligibility",
      "getShippingStatus",
      "searchPoliciesAndFaqs",
      "searchProductReviews",
    ];

    expect(GROQ_TOOL_DEFINITIONS.length).toBeGreaterThanOrEqual(requiredTools.length);

    for (const name of requiredTools) {
      const tool = GROQ_TOOL_DEFINITIONS.find((t) => t.function.name === name);
      expect(tool).toBeDefined();
      expect(tool!.type).toBe("function");
      expect(tool!.function.description).toBeTruthy();
      expect(tool!.function.parameters.type).toBe("object");
      expect(tool!.function.parameters.properties).toBeDefined();
    }
  });

  it("requires query parameter for policy and review search tools", () => {
    const policyTool = GROQ_TOOL_DEFINITIONS.find(
      (t) => t.function.name === "searchPoliciesAndFaqs",
    );
    expect(policyTool?.function.parameters.required).toContain("query");

    const reviewTool = GROQ_TOOL_DEFINITIONS.find(
      (t) => t.function.name === "searchProductReviews",
    );
    expect(reviewTool?.function.parameters.required).toContain("query");
  });
});

describe("Local RAG Embeddings & Vector Operations", () => {
  it("generates 128-dimensional unit normalized vector", () => {
    const vec = generateLocalEmbedding("wireless bluetooth earbuds with noise cancellation");
    expect(vec.length).toBe(128);

    // Sum of squares should equal 1.0 (unit vector)
    const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
    expect(norm).toBeCloseTo(1.0, 4);
  });

  it("generates deterministic embeddings for identical text", () => {
    const vec1 = generateLocalEmbedding("smart watch");
    const vec2 = generateLocalEmbedding("smart watch");
    expect(vec1).toEqual(vec2);
  });

  it("computes cosine similarity correctly", () => {
    const vecA = generateLocalEmbedding("running shoes for men");
    const vecB = generateLocalEmbedding("men athletic running footwear");
    const vecC = generateLocalEmbedding("wooden dining table furniture");

    const similarityRelated = cosineSimilarity(vecA, vecB);
    const similarityUnrelated = cosineSimilarity(vecA, vecC);

    expect(similarityRelated).toBeGreaterThan(similarityUnrelated);
  });

  it("embedText handles empty or whitespace input gracefully", async () => {
    const emptyVec = await embedText("");
    expect(emptyVec.length).toBe(128);
    expect(emptyVec.every((v) => v === 0)).toBe(true);
  });
});
