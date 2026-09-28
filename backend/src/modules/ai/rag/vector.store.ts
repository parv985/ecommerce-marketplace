import type { RAGChunk, RAGSearchResult } from "../ai.types.js";
import { cosineSimilarity, embedText } from "./embedding.service.js";
import { NEXCART_KNOWLEDGE_CHUNKS } from "./knowledge.data.js";

/**
 * Lightweight, in-memory vector store for RAG semantic search.
 * Self-contained, fits seamlessly into the project without requiring external vector DB services.
 */
class InMemoryVectorStore {
  private chunks: Map<string, RAGChunk> = new Map();
  private initialized = false;

  /**
   * Initializes static knowledge chunks (shipping, returns, cancellation, payment policies).
   */
  public async initStaticKnowledge(): Promise<void> {
    if (this.initialized) return;

    for (const raw of NEXCART_KNOWLEDGE_CHUNKS) {
      const embedding = await embedText(`${raw.title}\n${raw.content}`);
      this.chunks.set(raw.id, {
        ...raw,
        embedding,
      });
    }

    this.initialized = true;
  }

  /**
   * Adds or updates a single knowledge chunk.
   */
  public async addChunk(chunk: Omit<RAGChunk, "embedding"> & { embedding?: number[] }): Promise<void> {
    const embedding = chunk.embedding || (await embedText(`${chunk.title}\n${chunk.content}`));
    this.chunks.set(chunk.id, {
      ...chunk,
      embedding,
    });
  }

  /**
   * Adds multiple knowledge chunks in bulk.
   */
  public async addChunks(chunks: Array<Omit<RAGChunk, "embedding"> & { embedding?: number[] }>): Promise<void> {
    for (const c of chunks) {
      await this.addChunk(c);
    }
  }

  /**
   * Removes all chunks matching a specific category (e.g. for product reviews cache eviction).
   */
  public clearCategory(category: string): void {
    for (const [id, chunk] of this.chunks.entries()) {
      if (chunk.category === category || chunk.id.startsWith(`${category}:`)) {
        this.chunks.delete(id);
      }
    }
  }

  /**
   * Semantic similarity search against stored chunks using cosine similarity.
   */
  public async search(
    query: string,
    options: {
      category?: string | undefined;
      limit?: number | undefined;
      minScore?: number | undefined;
    } = {},
  ): Promise<RAGSearchResult[]> {
    await this.initStaticKnowledge();

    const limit = options.limit ?? 4;
    const minScore = options.minScore ?? 0.15;
    const queryEmbedding = await embedText(query);

    const scored: RAGSearchResult[] = [];

    for (const chunk of this.chunks.values()) {
      if (options.category && chunk.category !== options.category) {
        continue;
      }

      if (!chunk.embedding) continue;

      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      if (score >= minScore) {
        scored.push({ chunk, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /**
   * Returns all chunks for inspection or diagnostics.
   */
  public getAllChunks(): RAGChunk[] {
    return Array.from(this.chunks.values());
  }
}

export const vectorStore = new InMemoryVectorStore();
