import { Product, type IProduct } from "../../models/Product.js";
import { Category, type ICategory } from "../../models/Category.js";
import { ProductStatus } from "../../constants/productStatus.js";
import { generateGeminiJson, isGeminiConfigured } from "./gemini.client.js";
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

  // 1. Fetch active categories to provide exact catalog context to Gemini
  const activeCategories = await Category.find({ isActive: true }).lean().exec();
  const categoryMap = new Map<string, string>();
  activeCategories.forEach((cat) => {
    categoryMap.set(cat._id.toString(), cat.name);
  });

  // 2. Call Gemini for natural-language extraction (or fallback if Gemini is offline)
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

  // 3. Build MongoDB query from extracted criteria
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
      .filter((w) => w.length > 2 && !["under", "below", "above", "with", "show", "need"].includes(w.toLowerCase()));

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

  return {
    query: cleanQuery,
    extractedCriteria: criteria,
    products: formattedProducts,
    total: formattedProducts.length,
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

export const chatWithShoppingAssistant = async (
  _conversation: Array<{ role: "user" | "model"; text: string }>,
) => {
  // Scaffold for AI Shopping Chatbot
  throw new Error("Chatbot feature will be implemented in the next phase");
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
