import mongoose from "mongoose";
import { Product, type IProduct } from "../../models/Product.js";
import { Category, type ICategory } from "../../models/Category.js";
import { Order, type IOrder } from "../../models/Order.js";
import { Review } from "../../models/Review.js";
import { ProductStatus } from "../../constants/productStatus.js";
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "../../constants/orderStatus.js";
import {
  generateGeminiJson,
  generateGeminiText,
  isGeminiConfigured,
} from "./gemini.client.js";
import type { ProductResponse } from "../products/product.types.js";

export interface AISearchCriteria {
  category?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  brand?: string | null;
  color?: string | null;
  useCase?: string | null;
  searchTerms: string[];
  summary: string;
}

export interface AISearchResult {
  query: string;
  extractedCriteria: AISearchCriteria;
  products: ProductResponse[];
  total: number;
}

/**
 * Maps raw IProduct document to standardized ProductResponse for frontend consistency.
 */
const formatProductResponse = (
  product: IProduct,
  categoryMap: Map<string, string>,
): ProductResponse => {
  const catId = product.category ? product.category.toString() : null;
  const categoryName = catId ? categoryMap.get(catId) ?? null : null;

  return {
    id: product._id.toString(),
    sellerId: product.sellerId.toString(),
    name: product.name,
    description: product.description ?? null,
    sku: product.sku ?? null,
    category: catId ? { id: catId, name: categoryName } : null,
    price: product.price,
    stock: product.stock,
    images: product.images ?? [],
    specifications: product.specifications ?? [],
    status: product.status,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
};

/**
 * Escapes special characters for MongoDB RegExp.
 */
const escapeRegex = (text: string): string => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * In-memory cache for generated AI review summaries (1 hour TTL).
 * Keyed by productId, storing the summary, reviews fingerprint, and creation timestamp.
 */
const reviewSummaryCache = new Map<
  string,
  { summary: string; fingerprint: string; timestamp: number }
>();

/**
 * Invalidates the cached AI review summary for a specific product.
 * Should be called whenever a review is created, updated, or deleted.
 */
export const invalidateAIReviewSummary = (productId: string): void => {
  if (productId) {
    reviewSummaryCache.delete(productId.toString());
  }
};

/**
 * Computes a deterministic content-based fingerprint of a set of reviews.
 * If any review is added, deleted, or has its rating/comment edited, the fingerprint changes.
 */
const computeReviewFingerprint = (
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

const classifyReviewSentiment = (r: {
  rating: number;
  comment?: string | null | undefined;
}): "positive" | "negative" | "neutral" => {
  const comment = (r.comment || "").trim();
  const hasNegative = NEGATIVE_SENTIMENT_REGEX.test(comment);
  const hasPositive = POSITIVE_SENTIMENT_REGEX.test(comment);

  if (hasNegative && !hasPositive) {
    return "negative";
  }
  if (hasPositive && !hasNegative) {
    return "positive";
  }
  if (hasNegative && hasPositive) {
    return r.rating <= 3 ? "negative" : "positive";
  }

  // If no sentiment keywords in comment, rely on star rating
  if (r.rating >= 4) return "positive";
  if (r.rating <= 2.5) return "negative";
  return "neutral";
};

const cleanSnippet = (text: string, maxLen = 50): string => {
  const trimmed = text.replace(/^["'“”]|["'“”]$/g, "").trim();
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}...` : trimmed;
};

/**
 * Generates an AI summary of customer reviews for a given product.
 * Identifies common positive points and common criticisms from actual reviews.
 */
export const getOrGenerateAIReviewSummary = async (
  productName: string,
  productId: string,
  reviews: Array<{ rating: number; comment?: string | null | undefined }>,
): Promise<string | null> => {
  if (!reviews || reviews.length === 0) {
    invalidateAIReviewSummary(productId);
    return null;
  }

  const validReviews = reviews.filter(
    (r) => r && (r.comment?.trim() || r.rating != null),
  );
  if (validReviews.length === 0) {
    invalidateAIReviewSummary(productId);
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

  if (isGeminiConfigured()) {
    const prompt = `
You are the AI review summarizer for NexCart, an e-commerce platform.
Analyze the following current customer reviews for the product "${productName}":

${validReviews.map((r, i) => `Review ${i + 1} (${r.rating}/5 stars): "${r.comment?.trim() || `Rated ${r.rating} stars`}"`).join("\n")}

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
      const summary = await generateGeminiText({
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
      console.warn(`[WARN] Gemini review summary failed for ${productName}:`, err);
    }
  }

  // Heuristic review summarization based on actual ratings & comment sentiments
  const positiveReviews = validReviews.filter(
    (r) => classifyReviewSentiment(r) === "positive",
  );
  const criticismReviews = validReviews.filter(
    (r) => classifyReviewSentiment(r) === "negative",
  );

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

/**
 * Enriches ProductResponse array with actual MongoDB ratings and AI review summaries.
 */
export const enrichProductsWithReviewsAndSummary = async (
  products: ProductResponse[],
): Promise<ProductResponse[]> => {
  if (products.length === 0) return products;

  const productIds = products.map((p) => new mongoose.Types.ObjectId(p.id));
  const allReviews = await Review.find({ productId: { $in: productIds } })
    .lean()
    .exec();

  const reviewsMap = new Map<string, Array<{ rating: number; comment?: string | null | undefined }>>();
  for (const r of allReviews) {
    const pid = r.productId.toString();
    if (!reviewsMap.has(pid)) {
      reviewsMap.set(pid, []);
    }
    reviewsMap.get(pid)!.push({ rating: r.rating, comment: r.comment });
  }

  await Promise.all(
    products.map(async (p) => {
      const pReviews = reviewsMap.get(p.id) || [];
      p.totalReviews = pReviews.length;
      if (pReviews.length > 0) {
        const sumRatings = pReviews.reduce((sum, r) => sum + r.rating, 0);
        p.averageRating = Number((sumRatings / pReviews.length).toFixed(1));
        p.aiReviewSummary = await getOrGenerateAIReviewSummary(p.name, p.id, pReviews);
      } else {
        p.averageRating = 0;
        p.aiReviewSummary = null;
      }
    }),
  );

  return products;
};

/**
 * Uses Gemini to parse a natural-language query into structured product filters.
 */
export const extractSearchCriteriaWithGemini = async (
  userQuery: string,
  categories: ICategory[],
): Promise<AISearchCriteria> => {
  const categoryNames = categories.map((c) => c.name);

  const prompt = `
Available store categories in our catalog:
${JSON.stringify(categoryNames)}

User search query:
"${userQuery}"

Instructions:
1. Extract search parameters for querying our MongoDB e-commerce catalog.
2. If the user mentions a category matching or clearly synonymous with one of the available store categories, select that exact category name; otherwise return null.
3. Extract budget constraints in INR (rupees). Handle expressions like "under 3000", "below ₹1,500", "under 60k", "between 1000 and 5000", "max 2000". Convert "k" to thousands (e.g., 60k -> 60000, 3k -> 3000).
4. Extract specific brand, color, or use-case keywords if mentioned.
5. Provide 1 to 4 core search terms (words) to match product title/description.
6. Provide a concise, friendly 1-sentence summary of what the user is looking for.
`.trim();

  const responseSchema = {
    type: "OBJECT",
    properties: {
      category: { type: "STRING" },
      minPrice: { type: "NUMBER" },
      maxPrice: { type: "NUMBER" },
      brand: { type: "STRING" },
      color: { type: "STRING" },
      useCase: { type: "STRING" },
      searchTerms: {
        type: "ARRAY",
        items: { type: "STRING" },
      },
      summary: { type: "STRING" },
    },
    required: ["searchTerms", "summary"],
  };

  const systemInstruction =
    "You are an AI search parser for an e-commerce platform. Return strict, clean JSON extracting product search parameters from natural language user queries.";

  return generateGeminiJson<AISearchCriteria>({
    prompt,
    systemInstruction,
    responseSchema,
    temperature: 0.1,
  });
};

/**
 * Performs AI Natural-Language Product Search:
 * 1. Prompts Gemini to extract semantic requirements (category, price range, brand, color, keywords).
 * 2. Queries the actual MongoDB database with those requirements.
 * 3. Never invents products — only returns real listings stored in the database.
 */
export const searchProductsWithAI = async (
  query: string,
  options?: { limit?: number; page?: number },
): Promise<AISearchResult> => {
  const cleanQuery = query.trim();
  const limit = options?.limit ?? 20;

  // 1. Guard against very short queries (1-2 chars) - never search catalog or return random products
  if (cleanQuery.length <= 2) {
    return {
      query: cleanQuery,
      extractedCriteria: {
        searchTerms: [],
        summary: "Query too short to perform a product search.",
      },
      products: [],
      total: 0,
    };
  }

  // 2. Fetch active categories to provide exact catalog context to Gemini
  const activeCategories = await Category.find({ isActive: true }).lean().exec();
  const categoryMap = new Map<string, string>();
  activeCategories.forEach((cat) => {
    categoryMap.set(cat._id.toString(), cat.name);
  });

  // 3. Call Gemini for natural-language extraction (or fallback if Gemini is offline)
  let criteria: AISearchCriteria;

  if (isGeminiConfigured()) {
    try {
      criteria = await extractSearchCriteriaWithGemini(cleanQuery, activeCategories as ICategory[]);
    } catch (aiError) {
      // If AI fails (e.g. rate limit), fall back to graceful keyword extraction
      console.warn("[WARN] Gemini search extraction failed, falling back to keyword heuristics:", aiError);
      criteria = fallbackCriteriaExtractor(cleanQuery);
    }
  } else {
    // When GEMINI_API_KEY is not configured yet, provide local heuristic extraction
    criteria = fallbackCriteriaExtractor(cleanQuery);
  }

  // 4. Build MongoDB query from extracted criteria
  const baseFilter: Record<string, unknown> = {
    status: ProductStatus.ACTIVE,
  };

  // Price constraints
  if (criteria.minPrice != null || criteria.maxPrice != null) {
    const priceFilter: Record<string, number> = {};
    if (criteria.minPrice != null && !isNaN(criteria.minPrice)) {
      priceFilter.$gte = criteria.minPrice;
    }
    if (criteria.maxPrice != null && !isNaN(criteria.maxPrice)) {
      priceFilter.$lte = criteria.maxPrice;
    }
    if (Object.keys(priceFilter).length > 0) {
      baseFilter.price = priceFilter;
    }
  }

  // Category matching
  let matchedCategoryId: string | null = null;
  if (criteria.category) {
    const foundCategory = activeCategories.find(
      (c) => c.name.toLowerCase() === criteria.category!.toLowerCase(),
    );
    if (foundCategory) {
      matchedCategoryId = foundCategory._id.toString();
    }
  }

  // Keywords, color, brand matching
  const terms: string[] = [
    ...(criteria.searchTerms || []),
    criteria.color || "",
    criteria.brand || "",
  ].filter((t) => t && t.trim().length > 1);

  // Guard: if no category, no terms, and no price constraint were identified, do not dump random catalog items
  const hasMeaningfulCriteria = Boolean(
    matchedCategoryId ||
    terms.length > 0 ||
    criteria.minPrice != null ||
    criteria.maxPrice != null
  );

  if (!hasMeaningfulCriteria) {
    return {
      query: cleanQuery,
      extractedCriteria: criteria,
      products: [],
      total: 0,
    };
  }

  const buildTextConditions = (termList: string[]) => {
    return termList.map((term) => {
      const escaped = escapeRegex(term.trim());
      return {
        $or: [
          { name: { $regex: escaped, $options: "i" } },
          { description: { $regex: escaped, $options: "i" } },
          { "specifications.value": { $regex: escaped, $options: "i" } },
        ],
      };
    });
  };

  // Attempt 1: Strict query (combines category + price + all keywords)
  const strictFilter = { ...baseFilter };
  const andClauses: Record<string, unknown>[] = [];

  if (matchedCategoryId) {
    andClauses.push({ category: matchedCategoryId });
  }

  if (terms.length > 0) {
    andClauses.push(...buildTextConditions(terms));
  }

  if (andClauses.length > 0) {
    strictFilter.$and = andClauses;
  }

  let products = await Product.find(strictFilter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();

  // Attempt 2: Relaxed query if strict search yielded 0 items
  // (e.g. if category was slightly different or only some keywords matched)
  if (products.length === 0 && terms.length > 0) {
    const relaxedFilter = { ...baseFilter };
    const orClauses: Record<string, unknown>[] = [];

    if (matchedCategoryId) {
      orClauses.push({ category: matchedCategoryId });
    }

    terms.forEach((term) => {
      const escaped = escapeRegex(term.trim());
      orClauses.push({ name: { $regex: escaped, $options: "i" } });
      orClauses.push({ description: { $regex: escaped, $options: "i" } });
    });

    if (orClauses.length > 0) {
      relaxedFilter.$or = orClauses;
    }

    products = await Product.find(relaxedFilter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  // Attempt 3: General fallback if still 0 items (e.g. broad search by query words)
  if (products.length === 0) {
    const queryWords = cleanQuery
      .split(/\s+/)
      .filter((w) => w.length > 2 && !["under", "below", "above", "with", "show", "need", "find", "want"].includes(w.toLowerCase()));

    if (queryWords.length > 0) {
      const fallbackFilter = { ...baseFilter };
      fallbackFilter.$or = queryWords.map((word) => ({
        name: { $regex: escapeRegex(word), $options: "i" },
      }));

      products = await Product.find(fallbackFilter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec();
    }
  }

  const formattedProducts = products.map((p) => formatProductResponse(p, categoryMap));
  const enrichedProducts = await enrichProductsWithReviewsAndSummary(formattedProducts);

  return {
    query: cleanQuery,
    extractedCriteria: criteria,
    products: enrichedProducts,
    total: enrichedProducts.length,
  };
};

/**
 * Fallback parser used when Gemini API key is not yet set or in offline mode.
 * Uses regex heuristics to extract price and keywords.
 */
function fallbackCriteriaExtractor(query: string): AISearchCriteria {
  const clean = query.trim();
  let maxPrice: number | null = null;
  let minPrice: number | null = null;

  // Detect price patterns: "under ₹3,000", "below 1500", "under 60k", "below 50000"
  const underMatch = clean.match(/(?:under|below|less than|within|max)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:,\d+)*(?:\.\d+)?|\d+k)/i);
  if (underMatch && underMatch[1]) {
    const rawVal = underMatch[1].toLowerCase().replace(/,/g, "");
    if (rawVal.endsWith("k")) {
      maxPrice = parseFloat(rawVal) * 1000;
    } else {
      maxPrice = parseFloat(rawVal);
    }
  }

  const aboveMatch = clean.match(/(?:above|over|more than|min)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:,\d+)*(?:\.\d+)?|\d+k)/i);
  if (aboveMatch && aboveMatch[1]) {
    const rawVal = aboveMatch[1].toLowerCase().replace(/,/g, "");
    if (rawVal.endsWith("k")) {
      minPrice = parseFloat(rawVal) * 1000;
    } else {
      minPrice = parseFloat(rawVal);
    }
  }

  // Extract core keywords excluding noise words
  const noiseWords = new Set([
    "show", "me", "find", "i", "need", "want", "for", "a", "an", "the",
    "under", "below", "above", "over", "within", "good", "which", "are", "is",
    "in", "to", "with", "buy", "looking"
  ]);

  const searchTerms = clean
    .toLowerCase()
    .replace(/[₹$,.?!]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !noiseWords.has(w) && !/^\d+k?$/.test(w));

  return {
    category: null,
    minPrice,
    maxPrice,
    brand: null,
    color: null,
    useCase: null,
    searchTerms: searchTerms.slice(0, 4),
    summary: `Searching products matching "${clean}"`,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Modular extension points for upcoming Gemini AI features:
 * ─────────────────────────────────────────────────────────────────────────────
 * - chatWithShoppingAssistant: Multi-turn conversational shopping assistant
 * - getProductRecommendations: Personalized product recommendations
 * - compareProducts: Feature-by-feature product comparison
 * - summarizeReviews: Customer review sentiment and key pros/cons summary
 * - customerSupportReply: Automated support resolution based on platform FAQs
 * ───────────────────────────────────────────────────────────────────────────── */

export type AIChatIntent =
  | "SHOPPING_SEARCH"
  | "PRODUCT_QA"
  | "CUSTOMER_SUPPORT"
  | "ORDER_QUERY"
  | "OUT_OF_SCOPE"
  | "GREETING"
  | "UNCLEAR";

export type OrderSubIntent =
  | "PAYMENT_STATUS"
  | "SHIPPING_STATUS"
  | "ITEMS_QUERY"
  | "CANCEL_QUERY"
  | "TOTAL_QUERY"
  | "LIST_ALL_ORDERS"
  | "GENERAL_ORDER";

export interface AIChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIChatOrderSummary {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  total: number;
  createdAt: Date | string;
  itemCount: number;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  cancellable: boolean;
}

export interface AIChatResult {
  message: string;
  intent: AIChatIntent;
  products?: ProductResponse[];
  orders?: AIChatOrderSummary[];
}

export interface AIChatParams {
  userId: string;
  message: string;
  history?: AIChatMessage[];
}

interface DetectedIntentResult {
  intent: AIChatIntent;
  subIntent?: OrderSubIntent | undefined;
  searchKeywords?: string | undefined;
  orderNumber?: string | undefined;
}

/**
 * Extracts previously discussed order numbers or product names from chat history
 * to handle follow-up pronouns like "it", "that order", "what about payment", etc.
 */
const extractContextFromHistory = (history: AIChatMessage[]) => {
  let lastMentionedOrderNumber: string | undefined;
  let lastMentionedProduct: string | undefined;

  for (let i = history.length - 1; i >= 0; i--) {
    const text = history[i]?.content || "";
    if (!lastMentionedOrderNumber) {
      const match = text.match(/\b(ORD-[A-Z0-9\-]+)\b/i);
      if (match && match[1]) {
        lastMentionedOrderNumber = match[1].toUpperCase();
      }
    }
    if (!lastMentionedProduct) {
      const prodMatch = text.match(/\*\*([^*]+)\*\*/);
      if (prodMatch && prodMatch[1] && !prodMatch[1].startsWith("ORD-")) {
        lastMentionedProduct = prodMatch[1].trim();
      }
    }
    if (lastMentionedOrderNumber && lastMentionedProduct) break;
  }

  return { lastMentionedOrderNumber, lastMentionedProduct };
};

/**
 * Detects the specific sub-intent for an order-related query.
 */
const detectOrderSubIntent = (text: string): OrderSubIntent => {
  const lower = text.toLowerCase();
  if (
    lower.includes("payment") ||
    lower.includes("paid") ||
    lower.includes("how did i pay") ||
    lower.includes("payment status") ||
    lower.includes("payment method") ||
    lower.includes("razorpay") ||
    lower.includes("cod")
  ) {
    return "PAYMENT_STATUS";
  }
  if (
    lower.includes("cancel") ||
    lower.includes("cancellation") ||
    lower.includes("can i cancel")
  ) {
    return "CANCEL_QUERY";
  }
  if (
    lower.includes("what did i order") ||
    lower.includes("what products did i order") ||
    lower.includes("what was in") ||
    lower.includes("what is inside") ||
    lower.includes("which items") ||
    lower.includes("products in my") ||
    lower.includes("items in my") ||
    lower.includes("what items")
  ) {
    return "ITEMS_QUERY";
  }
  if (
    lower.includes("where is") ||
    lower.includes("where's") ||
    lower.includes("track") ||
    lower.includes("delivery") ||
    lower.includes("arrive") ||
    lower.includes("when will") ||
    lower.includes("shipped") ||
    lower.includes("shipping status") ||
    lower.includes("order status") ||
    lower.includes("status of")
  ) {
    return "SHIPPING_STATUS";
  }
  if (
    lower.includes("total") ||
    lower.includes("how much") ||
    lower.includes("amount") ||
    lower.includes("price") ||
    lower.includes("bill")
  ) {
    return "TOTAL_QUERY";
  }
  if (
    lower.includes("all orders") ||
    lower.includes("recent orders") ||
    lower.includes("my orders") ||
    lower.includes("order history") ||
    lower.includes("list orders") ||
    lower.includes("show orders") ||
    lower.includes("show my orders") ||
    lower.includes("past orders")
  ) {
    return "LIST_ALL_ORDERS";
  }
  return "GENERAL_ORDER";
};

/**
 * Fallback heuristic intent classifier used when Gemini is offline or rate-limited.
 */
const fallbackIntentClassifier = (
  message: string,
  history: AIChatMessage[] = [],
): DetectedIntentResult => {
  const clean = message.trim();
  const lower = clean.toLowerCase();

  // 1. Short or casual greeting / unclear input detection
  if (
    clean.length <= 2 ||
    /^(hi|hey|hello|yo|sup|greetings|gm|ge)\b/i.test(lower) ||
    /^(.)\1{2,}$/i.test(lower) ||
    /^(asdfgh|zxcvbn|qwerty)/i.test(lower) ||
    ["ok", "thanks", "thank you", "nice", "cool"].includes(lower)
  ) {
    if (/^(hi|hey|hello|yo|sup|greetings|gm|ge)\b/i.test(lower)) {
      return { intent: "GREETING" };
    }
    return { intent: "UNCLEAR" };
  }

  // Out of scope detection
  const outOfScopePatterns = [
    /\bwho is\b/i,
    /\bpython\b/i,
    /\bprogram\b/i,
    /\bjavascript\b/i,
    /\bcode\b/i,
    /\bweather\b/i,
    /\bjoke\b/i,
    /\bcapital of\b/i,
    /\bhow to bake\b/i,
    /\brecipe\b/i,
    /\bwho won\b/i,
    /\bmath\b/i,
    /\bcalculate\b/i,
    /\belon musk\b/i,
  ];
  if (outOfScopePatterns.some((pattern) => pattern.test(lower))) {
    return { intent: "OUT_OF_SCOPE" };
  }

  const { lastMentionedOrderNumber } = extractContextFromHistory(history);

  // Order queries & follow-up questions
  if (
    lower.includes("order") ||
    lower.includes("where is my") ||
    lower.includes("where is it") ||
    lower.includes("track") ||
    lower.includes("my package") ||
    lower.includes("bought") ||
    lower.includes("purchased") ||
    lower.includes("payment status") ||
    lower.includes("what about the payment") ||
    lower.includes("can i cancel") ||
    (lastMentionedOrderNumber && (lower.includes("it") || lower.includes("that")))
  ) {
    const orderMatch = lower.match(/(ord-[a-z0-9\-]+)/i);
    const orderNum = orderMatch && orderMatch[1] ? orderMatch[1].toUpperCase() : undefined;
    const subIntent = detectOrderSubIntent(lower);
    return {
      intent: "ORDER_QUERY",
      subIntent,
      orderNumber: orderNum,
    };
  }

  // Customer support / store policies
  if (
    lower.includes("return") ||
    lower.includes("refund") ||
    lower.includes("shipping") ||
    lower.includes("delivery") ||
    lower.includes("payment") ||
    lower.includes("cash on delivery") ||
    lower.includes("cod") ||
    lower.includes("cancellation") ||
    lower.includes("cancel policy") ||
    lower.includes("policy")
  ) {
    return { intent: "CUSTOMER_SUPPORT" };
  }

  // Product Q&A (including customer reviews & ratings)
  if (
    lower.includes("does this") ||
    lower.includes("does it have") ||
    lower.includes("is it") ||
    lower.includes("specs") ||
    lower.includes("specification") ||
    lower.includes("ram") ||
    lower.includes("battery") ||
    lower.includes("warranty") ||
    lower.includes("review") ||
    lower.includes("rating") ||
    lower.includes("feedback") ||
    lower.includes("criticism") ||
    lower.includes("what do people say") ||
    lower.includes("what do customers say")
  ) {
    return { intent: "PRODUCT_QA", searchKeywords: lower };
  }

  // Only classify as SHOPPING_SEARCH if there is meaningful shopping/product intent
  const nonProductWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "to", "at", "in", "on",
    "for", "from", "by", "with", "about", "into", "through", "during",
    "before", "after", "above", "below", "up", "down", "in", "out",
    "off", "over", "under", "again", "further", "then", "once", "here",
    "there", "when", "where", "why", "how", "all", "any", "both",
    "each", "few", "more", "most", "other", "some", "such", "no", "nor",
    "not", "only", "own", "same", "so", "than", "too", "very", "can",
    "will", "just", "should", "now", "show", "find", "need", "want",
    "looking", "please", "give", "tell", "me", "you", "i", "we", "products"
  ]);

  const words = lower
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !nonProductWords.has(w));

  const hasPriceMention = /(?:under|below|less than|within|max|min|above|over|between|price|budget|₹|rs\.?|inr|\d+k|\d{3,})/i.test(lower);

  if (words.length > 0 || hasPriceMention) {
    return { intent: "SHOPPING_SEARCH", searchKeywords: lower };
  }

  return { intent: "UNCLEAR" };
};

/**
 * Uses Gemini to classify user intent and sub-intent into grounded categories.
 */
const detectIntentWithGemini = async (
  message: string,
  history: AIChatMessage[],
): Promise<DetectedIntentResult> => {
  const prompt = `
You are the AI intent classifier for NexCart, an Indian e-commerce marketplace.
Analyze the user's latest query in the context of recent chat turns.

Recent chat history (if any):
${history.slice(-4).map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`).join("\n")}

Latest User Message:
"${message}"

Classify into EXACTLY ONE of these 7 intents:
1. "ORDER_QUERY": Questions about user's orders, order status, tracking, items purchased, payment status, or cancelling an order ("Where is my order?", "status of my order", "what did I order", "can I cancel my order?", "what is the payment status of my previous order?", "can I cancel it?").
2. "SHOPPING_SEARCH": Asking for product recommendations, searching for products to buy with budget, category, or features ("I need a laptop for programming under ₹60,000", "show me running shoes under 3000", "find shirts"). ONLY classify as SHOPPING_SEARCH if there is clear, meaningful product intent.
3. "PRODUCT_QA": Inquiries about specific product specifications, features, customer reviews, ratings, or feedback ("Does this laptop have 16GB RAM?", "what are the reviews for trimmer?", "does the trimmer have battery display?").
4. "CUSTOMER_SUPPORT": Questions about NexCart policies: shipping delivery times, returns, refunds, payment options (Razorpay/COD), cancellations policy, marketplace model.
5. "OUT_OF_SCOPE": Anything unrelated to NexCart products, orders, shopping, or policies (e.g. general trivia "Who is Elon Musk?", coding/programming, weather, jokes, math, politics, non-ecommerce topics).
6. "GREETING": Casual greetings ("hi", "hello", "hey", "good morning") without a specific shopping or order question.
7. "UNCLEAR": Random letters, gibberish, or vague input ("hh", "gg", "jj", "asdfgh") with no clear question or product intent.

Extract also:
- "subIntent": If intent is ORDER_QUERY, one of: "PAYMENT_STATUS", "SHIPPING_STATUS", "ITEMS_QUERY", "CANCEL_QUERY", "TOTAL_QUERY", "LIST_ALL_ORDERS", "GENERAL_ORDER".
- "searchKeywords": relevant search terms for finding the product in the database if intent is SHOPPING_SEARCH or PRODUCT_QA (e.g., "laptop", "trimmer", "running shoes").
- "orderNumber": order number if mentioned in message or history (e.g., "ORD-1234"), or null.
`.trim();

  const responseSchema = {
    type: "OBJECT",
    properties: {
      intent: {
        type: "STRING",
        enum: [
          "ORDER_QUERY",
          "SHOPPING_SEARCH",
          "PRODUCT_QA",
          "CUSTOMER_SUPPORT",
          "OUT_OF_SCOPE",
          "GREETING",
          "UNCLEAR",
        ],
      },
      subIntent: {
        type: "STRING",
        enum: [
          "PAYMENT_STATUS",
          "SHIPPING_STATUS",
          "ITEMS_QUERY",
          "CANCEL_QUERY",
          "TOTAL_QUERY",
          "LIST_ALL_ORDERS",
          "GENERAL_ORDER",
        ],
      },
      searchKeywords: { type: "STRING" },
      orderNumber: { type: "STRING" },
    },
    required: ["intent"],
  };

  return generateGeminiJson<DetectedIntentResult>({
    prompt,
    systemInstruction:
      "You are a strict, precise e-commerce intent classifier. Classify user message accurately into one of the 7 allowed intents. Never classify greetings or random characters as SHOPPING_SEARCH.",
    responseSchema,
    temperature: 0.1,
  });
};

/**
 * Main AI Assistant Chatbot implementation:
 * 1. Authenticated buyer access only.
 * 2. Intent & sub-intent determination.
 * 3. Query-specific answers without unrequested detail dumping.
 * 4. Grounded retrieval from MongoDB (Products, Orders) and verified NexCart policies.
 * 5. Grounded answer generation via Gemini (never hallucinates; refuses out of scope).
 */
export const chatWithShoppingAssistant = async (
  params: AIChatParams,
): Promise<AIChatResult> => {
  const { userId, message, history = [] } = params;
  const cleanMessage = message.trim();
  const lowerMessage = cleanMessage.toLowerCase();

  // 1. Immediate guard for short queries (1-2 chars) or casual greetings / unclear inputs
  if (cleanMessage.length <= 2) {
    if (["hi", "yo", "gm", "ge"].includes(lowerMessage)) {
      return {
        message:
          "Hello! Welcome to NexCart. How can I help you today? You can ask me to search for products, check product specifications, track your orders, or answer questions about our store policies. What would you like to search for?",
        intent: "GREETING",
      };
    }
    // Any other 1-2 characters like hh, gg, jj, etc.
    return {
      message:
        "I didn't quite catch that. Could you please specify what product you are looking for, or how I can assist you with your orders?",
      intent: "UNCLEAR",
    };
  }

  // Pure casual greeting guard
  const greetingWords = [
    "hi",
    "hello",
    "hey",
    "hey there",
    "hello there",
    "good morning",
    "good evening",
    "good afternoon",
    "sup",
    "yo",
    "greetings",
  ];
  if (
    greetingWords.includes(lowerMessage.replace(/[!.,?]+$/g, "")) ||
    (/^(hi|hey|hello|yo|sup|greetings)\b/i.test(lowerMessage) &&
      cleanMessage.length < 15 &&
      !lowerMessage.includes("order") &&
      !lowerMessage.includes("buy") &&
      !lowerMessage.includes("search") &&
      !lowerMessage.includes("find"))
  ) {
    return {
      message:
        "Hello! Welcome to NexCart. How can I assist you with your shopping or orders today? What product are you looking to search for?",
      intent: "GREETING",
    };
  }

  // Repeated character gibberish (e.g. hhhhh, jjjjj) or keyboard smash
  if (/^(.)\1{2,}$/i.test(lowerMessage) || /^(asdfgh|zxcvbn|qwertyui)/i.test(lowerMessage)) {
    return {
      message:
        "I didn't understand that input. Could you please let me know which product you would like to find, or ask a question about your orders?",
      intent: "UNCLEAR",
    };
  }

  // 2. Determine Intent
  let detected: DetectedIntentResult;
  if (isGeminiConfigured()) {
    try {
      detected = await detectIntentWithGemini(cleanMessage, history);
    } catch (err) {
      console.warn("[WARN] Gemini intent classification failed, falling back to heuristics:", err);
      detected = fallbackIntentClassifier(cleanMessage, history);
    }
  } else {
    detected = fallbackIntentClassifier(cleanMessage, history);
  }

  // 3. Handle GREETING and UNCLEAR
  if (detected.intent === "GREETING") {
    return {
      message:
        "Hello! Welcome to NexCart. How can I help you today? You can ask me to search for products, check product specifications, track your orders, or answer questions about our store policies. What would you like to search for?",
      intent: "GREETING",
    };
  }

  if (detected.intent === "UNCLEAR") {
    return {
      message:
        "I'm not sure what you're looking for. Could you please specify a product category, name, or budget so I can help you search our catalog?",
      intent: "UNCLEAR",
    };
  }

  // 4. Handle OUT_OF_SCOPE
  if (detected.intent === "OUT_OF_SCOPE") {
    return {
      message:
        "I am NexCart's AI Assistant. I can only assist you with NexCart shopping, products, orders, and customer support (shipping, returns, refunds, payments, and cancellations). How can I help you with NexCart today?",
      intent: "OUT_OF_SCOPE",
    };
  }

  // Common system instruction for conversational answering
  const systemInstruction = `
You are the official conversational AI Assistant for NexCart, an Indian e-commerce marketplace.
Rules:
1. Answer ONLY what the user specifically asked. Keep answers natural, friendly, concise, and direct (1-2 sentences).
2. DO NOT dump unrequested details:
   - If asked about payment status, answer ONLY about payment status.
   - If asked "Where is my order?" or shipping status, answer ONLY about shipping/delivery status.
   - If asked "What did I order?", answer ONLY the items/products in that order.
   - If asked "Can I cancel my order?", answer ONLY whether it can be cancelled and how.
   - Do NOT dump complete order details, total amount, or full product lists unless specifically asked.
3. ONLY answer based on the provided ground-truth database and policy context.
4. DO NOT invent or hallucinate specifications, products, orders, or policies.
5. If information is not in the provided context, state clearly that it is unavailable in NexCart's database.
6. Use INR (₹) for currency.
`.trim();

  // 3. Handle ORDER_QUERY (Strictly scoped to logged-in buyer's orders)
  if (detected.intent === "ORDER_QUERY") {
    const userOrders = await Order.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
      .exec();

    if (userOrders.length === 0) {
      return {
        message:
          "You currently have no orders placed on NexCart. You can browse our catalog to find products and place your first order!",
        intent: "ORDER_QUERY",
      };
    }

    const { lastMentionedOrderNumber } = extractContextFromHistory(history);
    const subIntent = detected.subIntent || detectOrderSubIntent(cleanMessage);

    // If the user explicitly asked to list all orders / order history:
    if (subIntent === "LIST_ALL_ORDERS") {
      const orderSummaries: AIChatOrderSummary[] = userOrders.slice(0, 5).map((o) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        total: o.total,
        createdAt: o.createdAt,
        itemCount: o.items.reduce((sum, item) => sum + item.quantity, 0),
        items: o.items.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          price: it.price,
        })),
        cancellable: [OrderStatus.PENDING, OrderStatus.CONFIRMED].includes(o.status as OrderStatus),
      }));

      const ordersListText = userOrders
        .slice(0, 5)
        .map(
          (o) =>
            `• **${o.orderNumber}** — ${o.status} (Total: ₹${o.total.toLocaleString("en-IN")})`,
        )
        .join("\n");

      return {
        message: `Here are your recent orders:\n\n${ordersListText}\n\nYou can ask me specific questions about any of these orders or manage them on your Orders page.`,
        intent: "ORDER_QUERY",
        orders: orderSummaries,
      };
    }

    // Resolving target order:
    const firstOrder = userOrders[0];
    if (!firstOrder) {
      return {
        message: "You currently have no orders placed on NexCart.",
        intent: "ORDER_QUERY",
      };
    }
    let targetOrder: (typeof userOrders)[0] = firstOrder;

    // Check 1: User explicitly provided an order number in message
    const orderNumMatch = cleanMessage.match(/\b(ORD-[A-Z0-9\-]+)\b/i);
    const requestedOrderNumber = orderNumMatch?.[1]?.toUpperCase() || detected.orderNumber;

    if (requestedOrderNumber) {
      const matched = userOrders.find(
        (o) => o.orderNumber.toUpperCase() === requestedOrderNumber,
      );
      if (!matched) {
        // SECURITY & PRIVACY: Never search or disclose another user's orders
        return {
          message: `I could not find an order with number **${requestedOrderNumber}** in your account. Please check the order number on your Orders page.`,
          intent: "ORDER_QUERY",
        };
      }
      targetOrder = matched;
    } else if (
      lastMentionedOrderNumber &&
      (cleanMessage.toLowerCase().includes(" it") ||
        cleanMessage.toLowerCase().includes("that") ||
        cleanMessage.toLowerCase().includes("the payment") ||
        cleanMessage.toLowerCase().startsWith("can i cancel"))
    ) {
      // Follow-up pronoun referring to previously discussed order
      const matched = userOrders.find(
        (o) => o.orderNumber.toUpperCase() === lastMentionedOrderNumber,
      );
      if (matched) {
        targetOrder = matched;
      }
    } else if (
      cleanMessage.toLowerCase().includes("second order") ||
      cleanMessage.toLowerCase().includes("2nd order") ||
      cleanMessage.toLowerCase().includes("order before that")
    ) {
      targetOrder = userOrders[1] || firstOrder;
    } else {
      // Default: most recent order (e.g. "previous order", "last order", "latest order", "my order")
      targetOrder = firstOrder;
    }

    if (!targetOrder) {
      targetOrder = firstOrder;
    }

    const cancellable = [OrderStatus.PENDING, OrderStatus.CONFIRMED].includes(
      targetOrder.status as OrderStatus,
    );
    const paymentMethodLabel =
      targetOrder.paymentMethod === PaymentMethod.CASH_ON_DELIVERY
        ? "Cash on Delivery"
        : "Online Payment (Razorpay)";

    // Call Gemini if configured
    if (isGeminiConfigured()) {
      const prompt = `
User Message: "${cleanMessage}"

Conversation History:
${history.slice(-4).map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`).join("\n")}

Referenced Order from MongoDB:
- Order Number: ${targetOrder.orderNumber}
- Order Status: ${targetOrder.status}
- Payment Status: ${targetOrder.paymentStatus}
- Payment Method: ${paymentMethodLabel}
- Total Amount: ₹${targetOrder.total.toLocaleString("en-IN")}
- Items: ${targetOrder.items.map((i) => `${i.name} (qty: ${i.quantity}, price: ₹${i.price})`).join(", ")}
- Cancellable: ${cancellable ? "Yes (not yet dispatched)" : "No (already shipped/delivered)"}

CRITICAL RULES:
1. Answer ONLY what the user asked about this order. Keep it concise, natural, and direct (1-2 sentences).
2. DO NOT dump total amount, item list, cancellation info, or order status unless specifically asked.
   - If asked about payment status ("What is the payment status of my previous order?"), answer ONLY the payment status (e.g. "The payment for your previous order ${targetOrder.orderNumber} is currently ${targetOrder.paymentStatus.toLowerCase()}.").
   - If asked "Where is my previous order?" or shipping status, answer ONLY the order/shipping status (e.g. "Your previous order ${targetOrder.orderNumber} is currently ${targetOrder.status}.").
   - If asked "What did I order?", answer ONLY the items in this order.
   - If asked "Can I cancel my previous order?", answer ONLY about cancellation eligibility.
3. NEVER invent or assume missing data.
`.trim();

      try {
        const reply = await generateGeminiText({
          prompt,
          systemInstruction,
          temperature: 0.1,
        });

        return {
          message: reply.trim(),
          intent: "ORDER_QUERY",
          // DO NOT attach orders array on specific queries so the card widget does not display
        };
      } catch (err) {
        console.warn("[WARN] Gemini text generation failed for order query:", err);
      }
    }

    // Specific, natural responses based on sub-intent:
    if (subIntent === "PAYMENT_STATUS") {
      return {
        message: `The payment for your previous order **${targetOrder.orderNumber}** is currently **${targetOrder.paymentStatus.toLowerCase()}** (${paymentMethodLabel}).`,
        intent: "ORDER_QUERY",
      };
    }

    if (subIntent === "SHIPPING_STATUS") {
      let statusDesc = `currently **${targetOrder.status}**`;
      if (targetOrder.status === OrderStatus.PENDING) statusDesc += " (awaiting seller confirmation)";
      else if (targetOrder.status === OrderStatus.CONFIRMED) statusDesc += " and being packed for dispatch";
      else if (targetOrder.status === OrderStatus.SHIPPED) statusDesc += " and has been dispatched";
      else if (targetOrder.status === OrderStatus.DELIVERED) statusDesc += " and was delivered";
      else if (targetOrder.status === OrderStatus.CANCELLED) statusDesc += " and has been cancelled";
      return {
        message: `Your previous order **${targetOrder.orderNumber}** is ${statusDesc}.`,
        intent: "ORDER_QUERY",
      };
    }

    if (subIntent === "ITEMS_QUERY") {
      const itemsList = targetOrder.items.map((i) => `**${i.name}** (x${i.quantity})`).join(", ");
      return {
        message: `In your previous order **${targetOrder.orderNumber}**, you ordered: ${itemsList}.`,
        intent: "ORDER_QUERY",
      };
    }

    if (subIntent === "CANCEL_QUERY") {
      if (targetOrder.status === OrderStatus.CANCELLED) {
        return {
          message: `Order **${targetOrder.orderNumber}** has already been cancelled.`,
          intent: "ORDER_QUERY",
        };
      }
      if (cancellable) {
        return {
          message: `Yes, you can cancel your previous order **${targetOrder.orderNumber}** directly from your Orders page because it is currently ${targetOrder.status}.`,
          intent: "ORDER_QUERY",
        };
      } else {
        return {
          message: `No, your previous order **${targetOrder.orderNumber}** cannot be cancelled because it is already ${targetOrder.status}. Once delivered, you can raise a return request within the 7-day return window.`,
          intent: "ORDER_QUERY",
        };
      }
    }

    if (subIntent === "TOTAL_QUERY") {
      return {
        message: `The total amount for your order **${targetOrder.orderNumber}** is ₹${targetOrder.total.toLocaleString("en-IN")}.`,
        intent: "ORDER_QUERY",
      };
    }

    // Default concise response
    return {
      message: `Your previous order **${targetOrder.orderNumber}** is currently **${targetOrder.status}** with payment **${targetOrder.paymentStatus.toLowerCase()}** (${paymentMethodLabel}).`,
      intent: "ORDER_QUERY",
    };
  }

  // 5. Handle SHOPPING_SEARCH
  if (detected.intent === "SHOPPING_SEARCH") {
    const searchResult = await searchProductsWithAI(cleanMessage, { limit: 5 });

    if (!isGeminiConfigured()) {
      if (searchResult.products.length === 0) {
        return {
          message:
            "I couldn't find any products in our catalog matching your requirements. Try adjusting your search or budget!",
          intent: "SHOPPING_SEARCH",
          products: [],
        };
      }
      return {
        message: `I found ${searchResult.products.length} matching product(s) in our catalog:`,
        intent: "SHOPPING_SEARCH",
        products: searchResult.products,
      };
    }

    const prompt = `
User Search Request: "${cleanMessage}"

Real Products Found in NexCart MongoDB Database:
${searchResult.products.length === 0 ? "No matching products found in the catalog." : JSON.stringify(searchResult.products.map((p) => ({
      id: p.id,
      name: p.name,
      price: `₹${p.price.toLocaleString("en-IN")}`,
      stock: p.stock,
      rating: p.totalReviews ? `⭐ ${p.averageRating}/5 (${p.totalReviews} review${p.totalReviews === 1 ? "" : "s"})` : "No reviews yet",
      aiReviewSummary: p.aiReviewSummary || null,
      specifications: p.specifications,
      description: p.description,
    })), null, 2)}

Instructions:
1. Act as NexCart's friendly shopping assistant.
2. Recommend these products in 1-2 natural sentences, mentioning why they fit the user's request.
3. If a product has customer reviews, mention its rating and the AI summary of reviews (e.g. ⭐ 4.3/5 - customers praise X and criticism Y).
4. If no matching products were found in the database, clearly inform the user that no products currently match their specific budget or requirements on NexCart, and suggest trying a different price range or search terms.
5. DO NOT invent or recommend products that are not in the provided database list.
`.trim();

    try {
      const reply = await generateGeminiText({
        prompt,
        systemInstruction,
        temperature: 0.2,
      });

      return {
        message: reply.trim(),
        intent: "SHOPPING_SEARCH",
        products: searchResult.products,
      };
    } catch (err) {
      console.warn("[WARN] Gemini text generation failed for shopping search:", err);
      return {
        message:
          searchResult.products.length > 0
            ? `I found ${searchResult.products.length} matching product(s) in our catalog:`
            : "No matching products were found in our catalog for your search.",
        intent: "SHOPPING_SEARCH",
        products: searchResult.products,
      };
    }
  }

  // 6. Handle PRODUCT_QA
  if (detected.intent === "PRODUCT_QA") {
    const { lastMentionedProduct } = extractContextFromHistory(history);
    const rawTerms = detected.searchKeywords || lastMentionedProduct || cleanMessage;
    const cleanTerms = rawTerms
      .toLowerCase()
      .replace(/[?.,!]/g, " ")
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 2 &&
          !["does", "this", "have", "with", "what", "the", "are", "product", "item"].includes(w),
      );

    let matchedProducts: IProduct[] = [];
    if (cleanTerms.length > 0) {
      const orClauses = cleanTerms.map((term) => {
        const escaped = escapeRegex(term);
        return {
          $or: [
            { name: { $regex: escaped, $options: "i" } },
            { description: { $regex: escaped, $options: "i" } },
            { "specifications.key": { $regex: escaped, $options: "i" } },
            { "specifications.value": { $regex: escaped, $options: "i" } },
          ],
        };
      });

      matchedProducts = await Product.find({
        status: ProductStatus.ACTIVE,
        $and: orClauses,
      })
        .limit(3)
        .lean()
        .exec();

      if (matchedProducts.length === 0) {
        matchedProducts = await Product.find({
          status: ProductStatus.ACTIVE,
          $or: orClauses.flatMap((c) => c.$or),
        })
          .limit(3)
          .lean()
          .exec();
      }
    }

    if (matchedProducts.length === 0) {
      return {
        message:
          "I could not find that product in our catalog to check its specifications or reviews.",
        intent: "PRODUCT_QA",
      };
    }

    const firstMatched = matchedProducts[0]!;
    const pReviews = await Review.find({ productId: firstMatched._id }).lean().exec();
    const totalReviews = pReviews.length;
    let avgRating = 0;
    let aiReviewSummary: string | null = null;
    if (totalReviews > 0) {
      avgRating = Number(
        (pReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1),
      );
      aiReviewSummary = await getOrGenerateAIReviewSummary(
        firstMatched.name,
        firstMatched._id.toString(),
        pReviews,
      );
    }

    const p = {
      name: firstMatched.name,
      price: `₹${firstMatched.price.toLocaleString("en-IN")}`,
      stock: firstMatched.stock,
      specifications: firstMatched.specifications || [],
      description: firstMatched.description || "",
    };

    if (isGeminiConfigured()) {
      const prompt = `
User Question: "${cleanMessage}"

Conversation History:
${history.slice(-4).map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`).join("\n")}

Product from MongoDB:
- Name: ${p.name}
- Price: ${p.price}
- Stock: ${p.stock > 0 ? "In Stock" : "Out of Stock"}
- Customer Reviews (${totalReviews} reviews): Average rating: ⭐ ${avgRating > 0 ? `${avgRating}/5` : "No ratings yet"}. AI Review Summary: "${aiReviewSummary || "No customer reviews in database"}".
- Specifications: ${JSON.stringify(p.specifications)}
- Description: ${p.description}

CRITICAL RULES:
1. Answer ONLY what the user asked about the product (e.g. RAM, battery, screen, material, reviews, rating). Keep it concise, natural, and direct (1-2 sentences).
2. DO NOT dump all specifications, full description, or unasked details.
3. If the user asks about customer reviews, ratings, or feedback, state the rating (⭐ ${avgRating}/5) and the AI review summary: “${aiReviewSummary || "There are no customer reviews for this product yet."}”.
4. GROUNDING RULE: Do NOT invent specifications or reviews that are not present in the database. If a specification is not listed in the product data, clearly state: "According to our product specifications in the database, this information is not specified."
5. If the product was not found in the catalog, state that it was not found in NexCart's catalog.
`.trim();

      try {
        const reply = await generateGeminiText({
          prompt,
          systemInstruction,
          temperature: 0.1,
        });

        return {
          message: reply.trim(),
          intent: "PRODUCT_QA",
        };
      } catch (err) {
        console.warn("[WARN] Gemini text generation failed for product QA:", err);
      }
    }

    // Precise fallback for product QA
    const lowerQ = cleanMessage.toLowerCase();

    // Review / Rating inquiry
    if (
      lowerQ.includes("review") ||
      lowerQ.includes("rating") ||
      lowerQ.includes("feedback") ||
      lowerQ.includes("criticism") ||
      lowerQ.includes("what do people say") ||
      lowerQ.includes("what do customers say")
    ) {
      if (totalReviews > 0) {
        return {
          message: `For **${p.name}**, the rating is ⭐ ${avgRating}/5 based on ${totalReviews} customer review${totalReviews === 1 ? "" : "s"}.\n\nAI Summary:\n“${aiReviewSummary}”`,
          intent: "PRODUCT_QA",
        };
      } else {
        return {
          message: `For **${p.name}**, there are currently no customer reviews available in our database.`,
          intent: "PRODUCT_QA",
        };
      }
    }

    const matchedSpec = p.specifications.find(
      (s) =>
        lowerQ.includes(s.key.toLowerCase()) ||
        lowerQ.includes(s.value.toLowerCase()),
    );

    if (matchedSpec) {
      return {
        message: `For **${p.name}**, the specifications state ${matchedSpec.key}: ${matchedSpec.value}.`,
        intent: "PRODUCT_QA",
      };
    }

    if (lowerQ.includes("ram") || lowerQ.includes("memory")) {
      const ramSpec = p.specifications.find((s) => /ram|memory/i.test(s.key));
      return {
        message: ramSpec
          ? `For **${p.name}**, the RAM is ${ramSpec.value}.`
          : `According to our product specifications in the database, the RAM size for **${p.name}** is not specified.`,
        intent: "PRODUCT_QA",
      };
    }

    return {
      message: `For **${p.name}** (Price: ${p.price}${totalReviews > 0 ? `, Rating: ⭐ ${avgRating}/5` : ""}), specifications: ${p.specifications.map((s) => `${s.key}: ${s.value}`).join(", ") || "None specified in database."}.${aiReviewSummary ? `\n\nAI Summary of Reviews: “${aiReviewSummary}”` : ""}`,
      intent: "PRODUCT_QA",
    };
  }

  // 6. Handle CUSTOMER_SUPPORT (Store policies)
  const policiesContext = `
Official NexCart Store Policies & Services:
- Marketplace Structure: NexCart connects you with verified independent sellers. Each order is packed and dispatched directly by the seller you purchased from.
- Shipping & Delivery: Sellers dispatch within 2-3 working days of order confirmation. Typical metro deliveries land in 2–5 business days, other regions within about a week (up to 7 business days). Shipments can be tracked directly from the 'Orders' section.
- Returns & Refunds: NexCart provides a 7-day return window starting from delivery. Returns can be initiated directly from the order page in your account. Items must be unused and in original packaging with tags intact. Refunds are issued to the original payment method (via Razorpay for online payments or after return completion for Cash on Delivery).
- Cancellations: Cancellable orders can be cancelled before dispatch (while the order status is PENDING or CONFIRMED) directly from the 'Orders' page. Any paid amount is refunded automatically, and stock is restored to the seller. Orders that are SHIPPED or DELIVERED cannot be cancelled.
- Payment Methods: Online payment is securely processed through Razorpay (Credit/Debit cards, UPI, Net Banking). Cash on Delivery (COD) is also available on eligible orders.
`.trim();

  if (!isGeminiConfigured()) {
    const lowerInq = cleanMessage.toLowerCase();
    if (lowerInq.includes("return") || lowerInq.includes("refund")) {
      return {
        message:
          "NexCart provides a 7-day return window starting from the delivery date. You can raise a return directly from the order page in your account for unused items in original packaging. Refunds are credited to your original payment method.",
        intent: "CUSTOMER_SUPPORT",
      };
    }
    if (lowerInq.includes("shipping") || lowerInq.includes("delivery")) {
      return {
        message:
          "Sellers dispatch within 2-3 working days. Typical delivery takes 2–5 business days for metro areas and up to 7 business days for other regions across India.",
        intent: "CUSTOMER_SUPPORT",
      };
    }
    if (lowerInq.includes("cancel")) {
      return {
        message:
          "You can cancel your order before dispatch directly from your Orders page if it is in PENDING or CONFIRMED status. Orders that have already shipped cannot be cancelled.",
        intent: "CUSTOMER_SUPPORT",
      };
    }
    if (lowerInq.includes("payment") || lowerInq.includes("cod")) {
      return {
        message:
          "NexCart supports secure online payments via Razorpay (Credit/Debit Cards, UPI, Net Banking) as well as Cash on Delivery (COD) on eligible orders.",
        intent: "CUSTOMER_SUPPORT",
      };
    }
    return {
      message:
        "NexCart offers a 7-day return window from delivery, dispatch within 2-3 business days (delivery in 2-5 days for metros), cancellations before dispatch from your Orders page, and secure payments via Razorpay and Cash on Delivery.",
      intent: "CUSTOMER_SUPPORT",
    };
  }

  const prompt = `
User Inquiry: "${cleanMessage}"

${policiesContext}

Instructions:
1. Answer the customer's question directly, concisely, and politely (1-2 sentences) using ONLY the official NexCart policies above.
2. Answer ONLY the specific policy they asked about (do not dump unrelated policies).
3. If the user asks about a service or policy not mentioned in these official policies (such as physical store pickups, international delivery outside India, or extended warranties), clearly state that this information or service is unavailable on NexCart instead of making up an answer.
`.trim();

  try {
    const reply = await generateGeminiText({
      prompt,
      systemInstruction,
      temperature: 0.1,
    });

    return {
      message: reply.trim(),
      intent: "CUSTOMER_SUPPORT",
    };
  } catch (err) {
    console.warn("[WARN] Gemini text generation failed for customer support:", err);
    return {
      message:
        "NexCart offers a 7-day return window from delivery, dispatch within 2-3 business days (delivery in 2-5 days for metros), cancellations before dispatch from your Orders page, and secure payments via Razorpay and Cash on Delivery.",
      intent: "CUSTOMER_SUPPORT",
    };
  }
};



export const getProductRecommendations = async (_productId: string) => {
  // Scaffold for AI Product Recommendations
  throw new Error("AI Recommendations feature will be implemented in the next phase");
};

export const compareProducts = async (_productIds: string[]) => {
  // Scaffold for AI Product Comparison
  throw new Error("Product comparison feature will be implemented in the next phase");
};

export const summarizeReviews = async (_productId: string) => {
  // Scaffold for AI Review Summarization
  throw new Error("Review summarizer feature will be implemented in the next phase");
};

export const customerSupportReply = async (_inquiry: string) => {
  // Scaffold for AI Customer Support
  throw new Error("Customer support assistant feature will be implemented in the next phase");
};
