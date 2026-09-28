import type { RAGSearchResult } from "../ai.types.js";
import { vectorStore } from "./vector.store.js";
import { queryProductReviewsRAG } from "./review.rag.js";

/**
 * Unified RAG Service for NexCart.
 * Coordinates semantic retrieval across policies, FAQs, and customer reviews.
 */
export class RAGService {
  /**
   * Retrieves relevant policy and FAQ chunks for a user query.
   */
  public static async retrievePoliciesAndFaqs(
    query: string,
    options: { limit?: number | undefined; topic?: string | undefined } = {},
  ): Promise<RAGSearchResult[]> {
    const limit = options.limit ?? 3;
    const category = options.topic;

    return vectorStore.search(query, {
      category,
      limit,
      minScore: 0.12,
    });
  }

  /**
   * Retrieves relevant customer review chunks for a specific product and question.
   */
  public static async retrieveProductReviews(
    productId: string,
    query: string,
    limit = 4,
  ): Promise<RAGSearchResult[]> {
    return queryProductReviewsRAG(productId, query, limit);
  }

  /**
   * Formats retrieved RAG chunks into a clear text context block for Gemini grounding.
   */
  public static formatRAGContext(results: RAGSearchResult[]): string {
    if (results.length === 0) {
      return "No specific static policy documents matched.";
    }

    return results
      .map(
        (r, idx) =>
          `[Source ${idx + 1}: ${r.chunk.title} (${r.chunk.category})] (Relevance: ${(r.score * 100).toFixed(0)}%)\n${r.chunk.content}`,
      )
      .join("\n\n");
  }
}
