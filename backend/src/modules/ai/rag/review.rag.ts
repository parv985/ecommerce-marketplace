import type { RAGChunk, RAGSearchResult } from "../ai.types.js";
import { vectorStore } from "./vector.store.js";
import { generateGroqText, isGroqConfigured } from "../groq.client.js";

/**
 * In-memory cache for generated AI review summaries with fingerprint tracking.
 */
const reviewSummaryCache = new Map<
  string,
  { summary: string; fingerprint: string; timestamp: number }
>();

export const invalidateReviewRAGSummary = (productId: string): void => {
  if (productId) {
    reviewSummaryCache.delete(productId.toString());
    vectorStore.clearCategory(`review_${productId}`);
  }
};

export const computeReviewFingerprint = (
  reviews: Array<{ rating: number; comment?: string | null | undefined }>,
): string => {
  return reviews
    .map((r) => `${r.rating}:${(r.comment || "").trim().toLowerCase()}`)
    .sort()
    .join("||");
};

const NEGATIVE_SENTIMENT_REGEX =
  /\b(bad|poor|worst|terrible|horrible|awful|pathetic|rubbish|waste|junk|defective|broken|damage|damaged|issue|issues|problem|problems|fake|disappoint|disappointed|disappointing|unsatisfied|dissatisfied|useless|regret|scam|hate|rough|slow|lag|heating|overheat|overheating|crack|cracked)\b|not\s+(good|working|worth|happy|satisfied|great|recommend)|cheap quality|low quality|stopped working|does not work|doesn't work/i;

const POSITIVE_SENTIMENT_REGEX =
  /\b(good|great|excellent|awesome|amazing|superb|fantastic|outstanding|brilliant|love|loved|perfect|nice|best|satisfy|satisfied|satisfying|worth|solid|jordar|badhiya|badiya|mast|gazab|jhakaas|wonderful|durable|premium|super|value for money)\b/i;

export const classifyReviewSentiment = (r: {
  rating: number;
  comment?: string | null | undefined;
}): "positive" | "negative" | "neutral" => {
  const comment = (r.comment || "").trim();
  const hasNegative = NEGATIVE_SENTIMENT_REGEX.test(comment);
  const hasPositive = POSITIVE_SENTIMENT_REGEX.test(comment);

  if (hasNegative && !hasPositive) return "negative";
  if (hasPositive && !hasNegative) return "positive";
  if (hasNegative && hasPositive) return r.rating <= 3 ? "negative" : "positive";
  if (r.rating >= 4) return "positive";
  if (r.rating <= 2.5) return "negative";
  return "neutral";
};

const cleanSnippet = (text: string, maxLen = 50): string => {
  const trimmed = text.replace(/^["'“”]|["'“”]$/g, "").trim();
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}...` : trimmed;
};

/**
 * Preprocesses and indexes customer reviews into the RAG vector store.
 */
export const indexProductReviewsForRAG = async (
  productId: string,
  productName: string,
  reviews: Array<{ rating: number; comment?: string | null | undefined }>,
): Promise<void> => {
  vectorStore.clearCategory(`review_${productId}`);

  const chunks: Array<Omit<RAGChunk, "embedding">> = [];

  reviews.forEach((r, idx) => {
    const comment = (r.comment || "").trim();
    if (!comment && r.rating == null) return;

    const sentiment = classifyReviewSentiment(r);
    const sentimentTags = sentiment === "negative" ? "criticism complaint defect dislike issue problem" : "positive praise satisfaction recommend";
    const content = `Review #${idx + 1} (${r.rating}/5★, ${sentiment}): "${comment || `Rated ${r.rating} stars`}" [${sentimentTags}]`;

    chunks.push({
      id: `review_${productId}:${idx + 1}`,
      title: `Review #${idx + 1} (${r.rating}/5★)`,
      category: `review_${productId}` as any,
      content,
      metadata: {
        productId,
        rating: r.rating,
        sentiment,
        comment,
      },
    });
  });

  if (chunks.length > 0) {
    await vectorStore.addChunks(chunks);
  }
};

/**
 * Semantic retrieval of reviews for a specific question (e.g., "What do customers dislike?").
 */
export const queryProductReviewsRAG = async (
  productId: string,
  query: string,
  limit = 5,
): Promise<RAGSearchResult[]> => {
  return vectorStore.search(query, {
    category: `review_${productId}`,
    limit,
    minScore: 0.1,
  });
};

/**
 * Generates or retrieves cached AI Review Summary using RAG and Groq.
 */
export const getOrGenerateAIReviewSummary = async (
  productName: string,
  productId: string,
  reviews: Array<{ rating: number; comment?: string | null | undefined }>,
): Promise<string | null> => {
  if (!reviews || reviews.length === 0) {
    invalidateReviewRAGSummary(productId);
    return null;
  }

  const validReviews = reviews.filter(
    (r) => r && (r.comment?.trim() || r.rating != null),
  );
  if (validReviews.length === 0) {
    invalidateReviewRAGSummary(productId);
    return null;
  }

  const fingerprint = computeReviewFingerprint(validReviews);
  const cached = reviewSummaryCache.get(productId);
  if (
    cached &&
    cached.fingerprint === fingerprint &&
    Date.now() - cached.timestamp < 3600000
  ) {
    return cached.summary;
  }

  // 1. Index reviews into RAG vector store for semantic retrieval
  await indexProductReviewsForRAG(productId, productName, validReviews);

  // 2. Retrieve representative positive & criticism chunks via RAG if many reviews exist
  let contextReviews = validReviews;
  if (validReviews.length > 10) {
    const praiseChunks = await queryProductReviewsRAG(productId, "good great quality praise satisfaction love best", 5);
    const criticismChunks = await queryProductReviewsRAG(productId, "bad poor defect problem issue worst criticism", 5);
    const merged = new Map<string, { rating: number; comment?: string | null }>();

    for (const res of [...praiseChunks, ...criticismChunks]) {
      merged.set(res.chunk.id, {
        rating: res.chunk.metadata?.rating,
        comment: res.chunk.metadata?.comment,
      });
    }

    if (merged.size > 0) {
      contextReviews = Array.from(merged.values());
    }
  }

  // 3. Groq Generation
  if (isGroqConfigured()) {
    const prompt = `
You are the AI review summarizer for NexCart, an e-commerce platform.
Analyze the following customer reviews retrieved from the database for "${productName}":

${contextReviews.map((r, i) => `Review ${i + 1} (${r.rating}/5 stars): "${r.comment?.trim() || `Rated ${r.rating} stars`}"`).join("\n")}

CRITICAL INSTRUCTIONS:
1. Generate an AI Summary of the reviews in 1 to 2 natural, concise sentences.
2. The summary must strictly reflect the CURRENT reviews above. Do not carry over or assume any previous reviews or opinions.
3. Identify common positive points (praises) and common criticisms from the available reviews.
4. IMPORTANT SENTIMENT ANALYSIS:
   - Carefully analyze what reviewers actually wrote in their comments.
   - If a review's comment states dissatisfaction, defects, issues, or bad/poor quality (e.g. "the product quality is bad", "poor battery", "defective item"), classify that comment as a CRITICISM regardless of what star rating number was selected.
   - If a review's comment praises the product (e.g. "jordar product che", "excellent quality", "works great"), classify that comment as PRAISE.
5. If the current reviews only express criticisms or negative feedback, summarize the criticisms accurately (e.g. "Customers express criticism regarding product quality, noting poor quality. No major positive points were reported.").
6. If the current reviews only express positive feedback with no criticisms, summarize the praises accurately (e.g. "Customers generally praise the product's quality and satisfaction. No major criticisms were reported.").
7. If both praises and criticisms exist, summarize both balanced and concisely (e.g. "Customers generally praise the battery life and display quality. The most common criticism is the keyboard layout.").
8. Base the summary strictly on the actual current reviews provided above. Do NOT invent features, pros, or cons not present in these reviews.
9. Return only the summary text without adding "AI Summary:" prefix.
`.trim();

    try {
      const summary = await generateGroqText({
        prompt,
        systemInstruction:
          "You are an objective e-commerce review summarizer. Generate concise 1-2 sentence summaries capturing common praise and common criticisms from actual buyer reviews.",
        temperature: 0.2,
      });

      if (summary && summary.trim().length > 0) {
        const cleanSummary = summary
          .trim()
          .replace(/^ai\s*summary:?\s*/i, "")
          .replace(/^["'“”]|["'“”]$/g, "");

        reviewSummaryCache.set(productId, {
          summary: cleanSummary,
          fingerprint,
          timestamp: Date.now(),
        });
        return cleanSummary;
      }
    } catch (err) {
      console.warn(`[WARN] Groq review summary failed for ${productName}:`, err);
    }
  }

  // 4. Grounded Heuristic Review Summarization Fallback
  const positiveReviews = validReviews.filter((r) => classifyReviewSentiment(r) === "positive");
  const criticismReviews = validReviews.filter((r) => classifyReviewSentiment(r) === "negative");

  const posComment = positiveReviews
    .find((r) => r.comment && r.comment.trim().length > 2)
    ?.comment?.trim();

  const critComment = criticismReviews
    .find((r) => r.comment && r.comment.trim().length > 2)
    ?.comment?.trim();

  const avg = (
    validReviews.reduce((acc, r) => acc + r.rating, 0) / validReviews.length
  ).toFixed(1);

  let summary = "";
  if (posComment && critComment) {
    summary = `Customers generally praise the product experience ("${cleanSnippet(posComment, 45)}"). The most common criticism is regarding "${cleanSnippet(critComment, 45)}".`;
  } else if (critComment && (!posComment || criticismReviews.length >= positiveReviews.length)) {
    summary = `Customers express criticism regarding product quality and satisfaction ("${cleanSnippet(critComment, 50)}"). No major positive points were reported.`;
  } else if (posComment) {
    summary = `Customers generally praise the product's quality and satisfaction ("${cleanSnippet(posComment, 50)}"). No major criticisms were reported.`;
  } else if (criticismReviews.length > 0 && positiveReviews.length === 0) {
    summary = `Customers express criticism regarding overall quality with an average rating of ${avg}/5 stars.`;
  } else if (positiveReviews.length > criticismReviews.length) {
    summary = `Customers generally praise the overall value and performance with an average rating of ${avg}/5 stars.`;
  } else if (criticismReviews.length > positiveReviews.length) {
    summary = `Customers express criticism regarding overall quality with an average rating of ${avg}/5 stars.`;
  } else {
    summary = `Customers rated this product an average of ${avg}/5 based on ${validReviews.length} customer review${validReviews.length === 1 ? "" : "s"}.`;
  }

  reviewSummaryCache.set(productId, {
    summary,
    fingerprint,
    timestamp: Date.now(),
  });
  return summary;
};
