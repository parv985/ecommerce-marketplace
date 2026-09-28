import { Product, type IProduct } from "../../models/Product.js";
import { Category, type ICategory } from "../../models/Category.js";
import { Order, type IOrder } from "../../models/Order.js";
import { ProductStatus } from "../../constants/productStatus.js";
import { OrderStatus } from "../../constants/orderStatus.js";
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

export type AIChatIntent =
  | "SHOPPING_SEARCH"
  | "PRODUCT_QA"
  | "CUSTOMER_SUPPORT"
  | "ORDER_QUERY"
  | "OUT_OF_SCOPE";

export interface AIChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIChatOrderSummary {
  orderNumber: string;
  status: string;
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
  searchKeywords?: string | undefined;
  orderNumber?: string | undefined;
}

/**
 * Fallback heuristic intent classifier used when Gemini is offline or rate-limited.
 */
const fallbackIntentClassifier = (message: string): DetectedIntentResult => {
  const lower = message.toLowerCase().trim();

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

  // Order queries
  if (
    lower.includes("order") ||
    lower.includes("where is my") ||
    lower.includes("track") ||
    lower.includes("my package") ||
    lower.includes("bought") ||
    lower.includes("purchased")
  ) {
    const orderMatch = lower.match(/(ord-[a-z0-9\-]+)/i);
    const orderNum = orderMatch && orderMatch[1] ? orderMatch[1].toUpperCase() : undefined;
    return {
      intent: "ORDER_QUERY",
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

  // Product Q&A
  if (
    lower.includes("does this") ||
    lower.includes("does it have") ||
    lower.includes("is it") ||
    lower.includes("specs") ||
    lower.includes("specification") ||
    lower.includes("ram") ||
    lower.includes("battery") ||
    lower.includes("warranty")
  ) {
    return { intent: "PRODUCT_QA", searchKeywords: lower };
  }

  return { intent: "SHOPPING_SEARCH", searchKeywords: lower };
};

/**
 * Uses Gemini to classify user intent into one of 5 grounded categories.
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

Classify into EXACTLY ONE of these 5 intents:
1. "ORDER_QUERY": Questions about user's orders, order status, tracking, items purchased, or cancelling an order ("Where is my order?", "status of my order", "what did I order", "can I cancel my order?").
2. "SHOPPING_SEARCH": Asking for product recommendations, searching for products to buy with budget, category, or features ("I need a laptop for programming under ₹60,000", "show me running shoes under 3000", "find shirts").
3. "PRODUCT_QA": Inquiries about specific product specifications, features, or details ("Does this laptop have 16GB RAM?", "does the trimmer have battery display?").
4. "CUSTOMER_SUPPORT": Questions about NexCart policies: shipping delivery times, returns, refunds, payment options (Razorpay/COD), cancellations policy, marketplace model.
5. "OUT_OF_SCOPE": Anything unrelated to NexCart products, orders, shopping, or policies (e.g. general trivia "Who is Elon Musk?", coding/programming, weather, jokes, math, politics, non-ecommerce topics).

Extract also:
- "searchKeywords": relevant search terms for finding the product in the database if intent is SHOPPING_SEARCH or PRODUCT_QA (e.g., "laptop", "trimmer", "running shoes").
- "orderNumber": order number if mentioned (e.g., "ORD-1234"), or null.
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
      "You are a strict, precise e-commerce intent classifier. Classify user message accurately into one of the 5 allowed intents.",
    responseSchema,
    temperature: 0.1,
  });
};

/**
 * Main AI Assistant Chatbot implementation:
 * 1. Authenticated buyer access only.
 * 2. Intent determination (Shopping, Product Q&A, Support, Order Query, Out of Scope).
 * 3. Grounded retrieval from MongoDB (Products, Orders) and verified NexCart policies.
 * 4. Grounded answer generation via Gemini (never hallucinates; refuses out of scope).
 */
export const chatWithShoppingAssistant = async (
  params: AIChatParams,
): Promise<AIChatResult> => {
  const { userId, message, history = [] } = params;
  const cleanMessage = message.trim();

  // 1. Determine Intent
  let detected: DetectedIntentResult;
  if (isGeminiConfigured()) {
    try {
      detected = await detectIntentWithGemini(cleanMessage, history);
    } catch (err) {
      console.warn("[WARN] Gemini intent classification failed, falling back to heuristics:", err);
      detected = fallbackIntentClassifier(cleanMessage);
    }
  } else {
    detected = fallbackIntentClassifier(cleanMessage);
  }

  // 2. Handle OUT_OF_SCOPE
  if (detected.intent === "OUT_OF_SCOPE") {
    return {
      message:
        "I am NexCart's AI Assistant. I can only assist you with NexCart shopping, products, orders, and customer support (shipping, returns, refunds, payments, and cancellations). How can I help you with NexCart today?",
      intent: "OUT_OF_SCOPE",
    };
  }

  // Common system instruction for grounded answering
  const systemInstruction = `
You are the official AI Assistant for NexCart, an Indian e-commerce marketplace.
Rules:
1. ONLY answer based on the provided ground-truth database and policy context.
2. DO NOT invent or hallucinate specifications, products, orders, or policies.
3. If information is not in the provided context, state clearly that it is unavailable in NexCart's database.
4. Keep answers friendly, clear, concise, and helpful. Use INR (₹) for currency.
`.trim();

  // 3. Handle ORDER_QUERY (Strictly scoped to logged-in buyer's orders)
  if (detected.intent === "ORDER_QUERY") {
    const userOrders = await Order.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
      .exec();

    const orderSummaries: AIChatOrderSummary[] = userOrders.map((o) => {
      const cancellable = [OrderStatus.PENDING, OrderStatus.CONFIRMED].includes(
        o.status as OrderStatus,
      );
      return {
        orderNumber: o.orderNumber,
        status: o.status,
        total: o.total,
        createdAt: o.createdAt,
        itemCount: o.items.reduce((sum, item) => sum + item.quantity, 0),
        items: o.items.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          price: it.price,
        })),
        cancellable,
      };
    });

    if (!isGeminiConfigured()) {
      const latest = orderSummaries[0];
      if (!latest) {
        return {
          message:
            "You currently have no orders placed on NexCart. You can browse our catalog to place your first order!",
          intent: "ORDER_QUERY",
          orders: [],
        };
      }
      const itemsList = latest.items.map((i) => `${i.name} (x${i.quantity})`).join(", ");
      return {
        message: `Your latest order **${latest.orderNumber}** is currently **${latest.status}** (Total: ₹${latest.total.toLocaleString("en-IN")}). Items: ${itemsList}. ${latest.cancellable ? "This order can be cancelled from your Orders page." : "This order cannot be cancelled as it has already progressed."}`,
        intent: "ORDER_QUERY",
        orders: orderSummaries,
      };
    }

    const prompt = `
User Question: "${cleanMessage}"

Logged-in Buyer's Real Orders from MongoDB:
${orderSummaries.length === 0 ? "The user currently has no orders placed on NexCart." : JSON.stringify(orderSummaries, null, 2)}

NexCart Order Policies:
- Orders can be cancelled while in "PENDING" or "CONFIRMED" status directly from the Orders page.
- Once an order is "SHIPPED" or "DELIVERED", it cannot be cancelled. Once delivered, buyers can request a return within the 7-day return window.
- Orders can be tracked anytime in the Account -> Orders section.

Instructions:
1. Answer the user's order question using ONLY the provided order data above.
2. If they ask "Where is my order?" or "What's the status of my order?", inform them of their most recent order(s) by order number, items, and current status.
3. If they ask "What products did I order?", list the items and quantities from their orders.
4. If they ask "Can I cancel my order?", check the order status: if PENDING or CONFIRMED, state that they can cancel it directly from their Orders page; if SHIPPED or DELIVERED, explain that cancellation is no longer possible and they can initiate a return within 7 days of delivery.
5. If the user has no orders, inform them politely that no orders were found in their account.
6. NEVER invent any order number or order details not present in this data.
`.trim();

    try {
      const reply = await generateGeminiText({
        prompt,
        systemInstruction,
        temperature: 0.2,
      });

      return {
        message: reply.trim(),
        intent: "ORDER_QUERY",
        orders: orderSummaries,
      };
    } catch (err) {
      console.warn("[WARN] Gemini text generation failed for order query:", err);
      const latest = orderSummaries[0];
      return {
        message:
          latest
            ? `You have ${orderSummaries.length} order(s). Your latest order ${latest.orderNumber} is ${latest.status}. You can view and manage your orders in the Orders section.`
            : "You currently have no orders placed on NexCart.",
        intent: "ORDER_QUERY",
        orders: orderSummaries,
      };
    }
  }

  // 4. Handle SHOPPING_SEARCH
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
      const prodList = searchResult.products
        .map((p) => `• **${p.name}** - ₹${p.price.toLocaleString("en-IN")}`)
        .join("\n");
      return {
        message: `Here are the matching products from our database:\n\n${prodList}`,
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
      specifications: p.specifications,
      description: p.description,
    })), null, 2)}

Instructions:
1. Act as NexCart's friendly shopping assistant.
2. If products are found, recommend them clearly, highlighting their actual price in ₹, key specs, and why they fit the user's request.
3. If no matching products were found in the database, clearly inform the user that no products currently match their specific budget or requirements on NexCart, and suggest trying a different price range or search terms.
4. DO NOT invent or recommend products that are not in the provided database list.
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

  // 5. Handle PRODUCT_QA
  if (detected.intent === "PRODUCT_QA") {
    const rawTerms = detected.searchKeywords || cleanMessage;
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
            { "specifications.name": { $regex: escaped, $options: "i" } },
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

    // Format products for frontend if matched
    const activeCategories = await Category.find({ isActive: true }).lean().exec();
    const catMap = new Map<string, string>();
    activeCategories.forEach((c) => catMap.set(c._id.toString(), c.name));
    const formattedProducts = matchedProducts.map((p) =>
      formatProductResponse(p, catMap),
    );

    const productsContext = matchedProducts.map((p) => ({
      name: p.name,
      price: `₹${p.price.toLocaleString("en-IN")}`,
      stock: p.stock,
      specifications: p.specifications || [],
      description: p.description || "",
    }));

    if (!isGeminiConfigured()) {
      const p = productsContext[0];
      if (!p) {
        return {
          message:
            "I could not find that product in our catalog to check its specifications.",
          intent: "PRODUCT_QA",
        };
      }
      const specList = p.specifications
        .map((s) => `${s.key}: ${s.value}`)
        .join(", ");
      return {
        message: `For **${p.name}**, the specifications in our database are: ${specList || "None listed"}. (Price: ${p.price}).`,
        intent: "PRODUCT_QA",
        products: formattedProducts,
      };
    }

    const prompt = `
User Question: "${cleanMessage}"

Real Product Information from NexCart MongoDB Database:
${productsContext.length === 0 ? "No matching product found in the catalog." : JSON.stringify(productsContext, null, 2)}

Instructions:
1. Answer the user's product question using ONLY the provided product specifications and description.
2. CRITICAL GROUNDING RULE: Do NOT invent specifications that are not present in the database. If a specification (e.g. RAM size, battery life, screen refresh rate, water resistance) is not explicitly listed in the data above, clearly and explicitly state: "According to our product specifications in the database, this information is not specified."
3. If no matching products exist in the catalog, politely say the product was not found in NexCart's database.
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
        products: formattedProducts,
      };
    } catch (err) {
      console.warn("[WARN] Gemini text generation failed for product QA:", err);
      const firstP = productsContext[0];
      return {
        message:
          firstP
            ? `Here is the information for ${firstP.name}: Price: ${firstP.price}. Specifications: ${firstP.specifications.map((s) => `${s.key}: ${s.value}`).join(", ") || "None specified in database."}`
            : "Product not found in our database to answer your question.",
        intent: "PRODUCT_QA",
        products: formattedProducts,
      };
    }
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
    return {
      message:
        "NexCart Policies Summary:\n• Shipping: Metro delivery in 2–5 days; dispatch in 2–3 days.\n• Returns: 7-day return window from delivery date.\n• Refunds: Credited to original payment method.\n• Cancellations: Allowed before dispatch directly from your Orders page.\n• Payments: Razorpay (Cards/UPI/NetBanking) & Cash on Delivery.",
      intent: "CUSTOMER_SUPPORT",
    };
  }

  const prompt = `
User Inquiry: "${cleanMessage}"

${policiesContext}

Instructions:
1. Answer the customer's question directly and politely using ONLY the official NexCart policies above.
2. If the user asks about a service or policy not mentioned in these official policies (such as physical store pickups, international delivery outside India, or extended warranties), clearly state that this information or service is unavailable on NexCart instead of making up an answer.
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
