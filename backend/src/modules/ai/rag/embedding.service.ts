const EMBEDDING_DIMENSION = 128;

/**
 * Deterministic local vectorizer generating a normalized unit vector.
 * Captures token frequency, word stems, and character 3-grams for semantic matching.
 */
export const generateLocalEmbedding = (text: string): number[] => {
  const vector = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const tokens = normalized.split(/\s+/).filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return vector;
  }

  // 1. Unigrams hashing
  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = (hash << 5) - hash + token.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % EMBEDDING_DIMENSION;
    vector[idx] = (vector[idx] ?? 0) + 1.0;
  }

  // 2. Character 3-grams for subword matching (e.g. "cancel", "cancellation")
  for (let i = 0; i < normalized.length - 2; i++) {
    const gram = normalized.slice(i, i + 3);
    let hash = 0;
    for (let j = 0; j < 3; j++) {
      hash = (hash << 5) - hash + gram.charCodeAt(j);
      hash |= 0;
    }
    const idx = Math.abs(hash) % EMBEDDING_DIMENSION;
    vector[idx] = (vector[idx] ?? 0) + 0.3;
  }

  // 3. L2 Normalize to unit vector
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    norm += vector[i]! * vector[i]!;
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      vector[i] = vector[i]! / norm;
    }
  }

  return vector;
};

/**
 * Generates an embedding vector for a single text using deterministic local vectorizer.
 */
export const embedText = async (text: string): Promise<number[]> => {
  if (!text || text.trim().length === 0) {
    return new Array(EMBEDDING_DIMENSION).fill(0);
  }

  return generateLocalEmbedding(text);
};

/**
 * Generates embeddings in batch for multiple texts.
 */
export const embedBatch = async (texts: string[]): Promise<number[][]> => {
  return Promise.all(texts.map((t) => embedText(t)));
};

/**
 * Computes cosine similarity between two numeric vectors.
 * Returns a value between -1.0 and 1.0 (typically 0.0 to 1.0 for normalized text vectors).
 */
export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;

  const minLen = Math.min(vecA.length, vecB.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < minLen; i++) {
    const a = vecA[i]!;
    const b = vecB[i]!;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};
