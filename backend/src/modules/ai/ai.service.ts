import mongoose from "mongoose";
import { Product, type IProduct } from "../../models/Product.js";
import { Category, type ICategory } from "../../models/Category.js";
import { Order } from "../../models/Order.js";
import { Review } from "../../models/Review.js";
import { ProductStatus } from "../../constants/productStatus.js";
import { OrderStatus, PaymentMethod } from "../../constants/orderStatus.js";
import {
  generateGeminiJson,
  generateGeminiText,
  generateGeminiWithTools,
  isGeminiConfigured,
} from "./gemini.client.js";
import type { ProductResponse } from "../products/product.types.js";
import type {
  AIChatMessage,
  AIChatOrderSummary,
  AIChatResult,
  AISearchCriteria,
  AISearchResult,
  ToolCallRequest,
} from "./ai.types.js";
import { GEMINI_TOOL_DECLARATIONS } from "./tools/tool.definitions.js";
import { executeToolCall } from "./tools/tool.executor.js";
import type { ToolContext } from "./tools/tool.handlers.js";
import { vectorStore } from "./rag/vector.store.js";
import { RAGService } from "./rag/rag.service.js";
import {
  computeReviewFingerprint,
  getOrGenerateAIReviewSummary,
  invalidateReviewRAGSummary,
} from "./rag/review.rag.js";
import { NEXCART_ASSISTANT_SYSTEM_INSTRUCTION } from "./prompts/assistant.prompt.js";

export type { AISearchCriteria, AISearchResult, AIChatMessage, AIChatResult };
export { getOrGenerateAIReviewSummary };
export const invalidateAIReviewSummary = invalidateReviewRAGSummary;

// Initialize static RAG knowledge store in the background
vectorStore.initStaticKnowledge().catch((err) => {
  console.warn("[WARN] Failed to initialize static RAG knowledge store:", err);
});

/**
 * Escapes special characters for MongoDB RegExp.
 */
const escapeRegex = (text: string): string => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

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
 * Extracts search criteria using Gemini from natural-language shopping queries.
 */
export const extractSearchCriteriaWithGemini = async (
  query: string,
  categories: ICategory[],
): Promise<AISearchCriteria> => {
  const categoryNames = categories.map((c) => c.name).join(", ");

  const prompt = `
Extract structured product search criteria from this shopping query:
"${query}"

Available Categories in NexCart Catalog:
${categoryNames}

Return a valid JSON object matching this schema:
{
  "category": "Matched category from list above or null",
  "minPrice": number or null (in INR/Rs/₹),
  "maxPrice": number or null (in INR/Rs/₹),
  "brand": "Brand name if mentioned or null",
  "color": "Color if mentioned or null",
  "useCase": "Use case or null (e.g. running, gaming, programming, casual)",
  "searchTerms": ["array", "of", "core", "keywords", "without", "stopwords"],
  "summary": "1-sentence summary of what user wants"
}
`.trim();

  return generateGeminiJson<AISearchCriteria>({
    prompt,
    systemInstruction:
      "You are an e-commerce semantic search parser. Extract structured shopping parameters accurately into JSON.",
    temperature: 0.1,
  });
};

/**
 * Fallback parser used when Gemini API key is not yet set or in offline mode.
 */
const fallbackCriteriaExtractor = (query: string): AISearchCriteria => {
  const clean = query.trim().toLowerCase();
  let maxPrice: number | null = null;
  let minPrice: number | null = null;

  const underMatch = clean.match(/(?:under|below|less than|within|upto|up to)\s*(?:rs\.?|inr|₹)?\s*([\d,]+)/i);
  if (underMatch?.[1]) {
    maxPrice = parseInt(underMatch[1].replace(/,/g, ""), 10);
  }

  const aboveMatch = clean.match(/(?:above|over|more than|starting from)\s*(?:rs\.?|inr|₹)?\s*([\d,]+)/i);
  if (aboveMatch?.[1]) {
    minPrice = parseInt(aboveMatch[1].replace(/,/g, ""), 10);
  }

  const betweenMatch = clean.match(/(?:between)\s*(?:rs\.?|inr|₹)?\s*([\d,]+)\s*(?:and|to|-)\s*(?:rs\.?|inr|₹)?\s*([\d,]+)/i);
  if (betweenMatch?.[1] && betweenMatch?.[2]) {
    minPrice = parseInt(betweenMatch[1].replace(/,/g, ""), 10);
    maxPrice = parseInt(betweenMatch[2].replace(/,/g, ""), 10);
  }

  const stopWords = new Set([
    "show", "me", "find", "looking", "for", "i", "need", "want", "under", "below",
    "above", "over", "between", "to", "and", "rs", "inr", "rupees", "the", "a", "an",
    "some", "best", "good", "cheap", "affordable", "which", "are", "is", "can", "you",
    "please", "give", "display", "get", "product", "products", "item", "items"
  ]);

  const searchTerms = clean
    .replace(/[₹,]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !stopWords.has(word) && isNaN(Number(word)));

  return {
    category: null,
    minPrice,
    maxPrice,
    brand: null,
    color: null,
    useCase: null,
    searchTerms: searchTerms.length > 0 ? searchTerms : [clean],
    summary: `Search for ${searchTerms.join(" ")}`,
  };
};

/**
 * Performs natural-language semantic product search via Gemini AI + MongoDB.
 */
export const searchProductsWithAI = async (
  query: string,
  options: { limit?: number } = {},
): Promise<AISearchResult> => {
  const cleanQuery = query.trim();
  const limit = Math.min(Math.max(options.limit || 20, 1), 50);

  if (!cleanQuery) {
    return {
      query,
      extractedCriteria: {
        category: null,
        minPrice: null,
        maxPrice: null,
        brand: null,
        color: null,
        useCase: null,
        searchTerms: [],
        summary: "Empty search query",
      },
      products: [],
      total: 0,
    };
  }

  const activeCategories = await Category.find({ isActive: true }).lean().exec();
  const categoryMap = new Map<string, string>();
  activeCategories.forEach((cat) => {
    categoryMap.set(cat._id.toString(), cat.name);
  });

  let criteria: AISearchCriteria;
  if (isGeminiConfigured()) {
    try {
      criteria = await extractSearchCriteriaWithGemini(cleanQuery, activeCategories as ICategory[]);
    } catch (aiError) {
      criteria = fallbackCriteriaExtractor(cleanQuery);
    }
  } else {
    criteria = fallbackCriteriaExtractor(cleanQuery);
  }

  const baseFilter: Record<string, unknown> = {
    status: ProductStatus.ACTIVE,
  };

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

  if (criteria.category) {
    const foundCategory = activeCategories.find(
      (c) => c.name.toLowerCase() === criteria.category!.toLowerCase(),
    );
    if (foundCategory) {
      baseFilter.category = foundCategory._id;
    }
  }

  const textConditions: Record<string, unknown>[] = [];
  const termsToSearch = (criteria.searchTerms && criteria.searchTerms.length > 0)
    ? criteria.searchTerms
    : cleanQuery.split(/\s+/).filter((t) => t.length > 2);

  for (const term of termsToSearch) {
    const safeTerm = escapeRegex(term);
    textConditions.push({
      $or: [
        { name: { $regex: safeTerm, $options: "i" } },
        { description: { $regex: safeTerm, $options: "i" } },
        { "specifications.value": { $regex: safeTerm, $options: "i" } },
      ],
    });
  }

  const finalFilter = { ...baseFilter };
  if (textConditions.length > 0) {
    finalFilter.$and = textConditions;
  }

  let matchedProducts = await Product.find(finalFilter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .exec();

  if (matchedProducts.length === 0 && textConditions.length > 0) {
    const relaxedFilter = { ...baseFilter };
    relaxedFilter.$or = textConditions.flatMap((c) => (c as any).$or || []);
    matchedProducts = await Product.find(relaxedFilter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  const formattedProducts = matchedProducts.map((p) =>
    formatProductResponse(p as IProduct, categoryMap),
  );

  const enrichedProducts = await enrichProductsWithReviewsAndSummary(formattedProducts);

  return {
    query: cleanQuery,
    extractedCriteria: criteria,
    products: enrichedProducts,
    total: enrichedProducts.length,
  };
};

/**
 * Grounded Conversational AI Assistant using RAG + Gemini Function Calling + MongoDB.
 */
export const chatWithShoppingAssistant = async (params: {
  userId: string;
  message: string;
  history?: AIChatMessage[];
}): Promise<AIChatResult> => {
  const { userId, message, history = [] } = params;
  const cleanMessage = message.trim();
  const lowerMessage = cleanMessage.toLowerCase();

  // 1. Guard against ultra-short or empty queries
  if (!cleanMessage) {
    return {
      message: "Please enter a question or shopping query to get started.",
      intent: "EMPTY",
    };
  }

  // 1-2 character inputs (e.g. hh, hi, gg)
  if (cleanMessage.length <= 2) {
    if (["hi", "yo", "gm", "ge"].includes(lowerMessage)) {
      return {
        message:
          "Hello! Welcome to NexCart. How can I help you today? You can ask me to search for products, check product specifications, track your orders, or answer questions about our store policies. What would you like to search for?",
        intent: "GREETING",
      };
    }
    return {
      message:
        "I didn't quite catch that. Could you please specify what product you are looking for, or how I can assist you with your orders?",
      intent: "UNCLEAR",
    };
  }

  // Pure casual greeting guard
  const greetingWords = [
    "hi", "hello", "hey", "hey there", "hello there", "good morning",
    "good evening", "good afternoon", "sup", "yo", "greetings"
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

  // Repeated character gibberish (e.g. hhhhh, jjjjj)
  if (/^(.)\1{2,}$/i.test(lowerMessage) || /^(asdfgh|zxcvbn|qwertyui)/i.test(lowerMessage)) {
    return {
      message:
        "I didn't understand that input. Could you please let me know which product you would like to find, or ask a question about your orders?",
      intent: "UNCLEAR",
    };
  }

  // General off-topic query check (e.g. write essay, code in python, who is the president, weather in paris)
  const isClearlyOffTopic =
    /\b(write (an essay|code|python|poem|song|story)|who is the (president|prime minister)|weather in|capital of|solve this equation|translate to french)\b/i.test(
      lowerMessage,
    );
  if (isClearlyOffTopic) {
    return {
      message:
        "I am your NexCart shopping assistant and can only help with products, orders, reviews, and store policies on NexCart.",
      intent: "OUT_OF_SCOPE",
    };
  }

  const toolContext: ToolContext = {
    userId,
    matchedProducts: [],
    matchedOrders: [],
  };

  const executedTools: string[] = [];

  // =========================================================================
  // PATH A: GEMINI FUNCTION CALLING (When Gemini is configured)
  // =========================================================================
  if (isGeminiConfigured()) {
    try {
      // 1. Prepare contents with multi-turn history
      const formattedContents: any[] = [];

      // Add recent history turns
      const recentHistory = history.slice(-6);
      for (const h of recentHistory) {
        formattedContents.push({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: h.content }],
        });
      }

      // Add current user prompt
      formattedContents.push({
        role: "user",
        parts: [{ text: cleanMessage }],
      });

      // 2. Call Gemini with tools
      const geminiResponse = await generateGeminiWithTools({
        contents: formattedContents,
        systemInstruction: NEXCART_ASSISTANT_SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: GEMINI_TOOL_DECLARATIONS }],
        temperature: 0.15,
      });

      // 3. If Gemini decided to call one or more functions
      if (geminiResponse.functionCalls && geminiResponse.functionCalls.length > 0) {
        const toolExecutionResults: Array<{ name: string; result: any }> = [];

        for (const fc of geminiResponse.functionCalls) {
          executedTools.push(fc.name);
          const executed = await executeToolCall(
            { name: fc.name, args: fc.args || {} },
            toolContext,
          );
          toolExecutionResults.push({
            name: fc.name,
            result: executed.result,
          });
        }

        // 4. Grounded synthesis turn with retrieved database & RAG data
        const synthesisPrompt = `
User Query: "${cleanMessage}"

Conversation History:
${recentHistory.map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`).join("\n")}

Data Retrieved from NexCart Systems (MongoDB / RAG Layer):
${JSON.stringify(toolExecutionResults, null, 2)}

INSTRUCTIONS FOR FINAL ANSWER:
1. Ground your answer strictly in the retrieved data above.
2. Answer specifically and concisely what the buyer asked (1 to 3 natural sentences).
3. Do NOT invent prices, specifications, order numbers, or delivery dates.
4. If the data indicates no orders or products found, clearly state that.
5. If the user asked about payment status, mention only the payment status. If asked about cancellation, clearly state whether it is eligible and why.
6. Return only the final assistant response text.
`.trim();

        const finalReply = await generateGeminiText({
          prompt: synthesisPrompt,
          systemInstruction: NEXCART_ASSISTANT_SYSTEM_INSTRUCTION,
          temperature: 0.2,
        });

        return {
          message: finalReply.trim(),
          intent: executedTools[0] || "FUNCTION_CALL",
          products: toolContext.matchedProducts.length > 0 ? toolContext.matchedProducts.slice(0, 5) : undefined,
          orders: toolContext.matchedOrders.length > 0 ? toolContext.matchedOrders.slice(0, 5) : undefined,
          toolCallsExecuted: executedTools,
        };
      }

      // If Gemini directly produced a response without tools (e.g. conversational answer)
      if (geminiResponse.text && geminiResponse.text.trim().length > 0) {
        return {
          message: geminiResponse.text.trim(),
          intent: "CONVERSATIONAL",
          products: toolContext.matchedProducts.length > 0 ? toolContext.matchedProducts.slice(0, 5) : undefined,
          orders: toolContext.matchedOrders.length > 0 ? toolContext.matchedOrders.slice(0, 5) : undefined,
        };
      }
    } catch (geminiErr) {
      console.warn("[WARN] Gemini function calling encountered error, switching to grounded tool dispatcher:", geminiErr);
    }
  }

  // =========================================================================
  // PATH B: DETERMINISTIC GROUNDED TOOL DISPATCHER (Resilient Fallback)
  // Ensures RAG + MongoDB grounded execution even if Gemini is offline/rate-limited
  // =========================================================================

  // Check 1: Review RAG Query (e.g. "What do customers dislike about this product?")
  const isReviewQuery =
    /\b(review|reviews|rating|ratings|criticism|dislike|complaint|feedback|stars|customer opinion)\b/i.test(
      lowerMessage,
    );
  if (isReviewQuery) {
    executedTools.push("searchProductReviews");
    // Extract product name if present or search most relevant active product
    const prodWords = cleanMessage.replace(/\b(what|do|customers|dislike|like|think|about|this|product|reviews|rating|give|me)\b/gi, "").trim();
    let targetProduct: any = null;
    if (prodWords.length > 2) {
      targetProduct = await Product.findOne({
        name: new RegExp(escapeRegex(prodWords), "i"),
        status: ProductStatus.ACTIVE,
      }).lean().exec();
    }
    if (!targetProduct) {
      targetProduct = await Product.findOne({ status: ProductStatus.ACTIVE }).sort({ createdAt: -1 }).lean().exec();
    }

    if (targetProduct) {
      const reviewToolResult = await executeToolCall(
        {
          name: "searchProductReviews",
          args: {
            productId: targetProduct._id.toString(),
            productName: targetProduct.name,
            query: cleanMessage,
          },
        },
        toolContext,
      );

      const res = reviewToolResult.result;
      if (res && res.totalReviews > 0) {
        const topReviewsText = res.relevantReviews && res.relevantReviews.length > 0
          ? res.relevantReviews.map((r: any) => `• ${r.content}`).join("\n")
          : "Customer reviews are available.";

        return {
          message: `For **${targetProduct.name}** (Rating: ${res.averageRating} based on ${res.totalReviews} customer reviews):\n\n${topReviewsText}`,
          intent: "REVIEW_RAG",
          toolCallsExecuted: executedTools,
        };
      }
    }
  }

  // Check 2: Order Status, Payment Status, or Cancellation Query
  const isOrderQuery =
    /\b(order|orders|delivery|shipping status|track|where is my order|payment status|cancel my order|cancellation|item in my order)\b/i.test(
      lowerMessage,
    );
  if (isOrderQuery) {
    const isPayment = /\b(payment|paid|gateway|razorpay|cod|due)\b/i.test(lowerMessage);
    const isCancel = /\b(cancel|cancellation|can i cancel)\b/i.test(lowerMessage);

    if (isPayment) {
      executedTools.push("getPaymentStatus");
      const paymentResult = await executeToolCall({ name: "getPaymentStatus", args: {} }, toolContext);
      const res = paymentResult.result;
      if (!res?.found) {
        return { message: "No recent order was found in your NexCart account.", intent: "ORDER_PAYMENT" };
      }
      return {
        message: `For order **#${res.orderNumber}**, the payment status is **${res.paymentStatus}** via ${res.paymentMethod} (Total: ${res.totalAmount}). ${res.note}`,
        intent: "ORDER_PAYMENT",
        orders: toolContext.matchedOrders,
        toolCallsExecuted: executedTools,
      };
    }

    if (isCancel) {
      executedTools.push("checkCancellationEligibility");
      const cancelResult = await executeToolCall({ name: "checkCancellationEligibility", args: {} }, toolContext);
      const res = cancelResult.result;
      if (!res?.orderNumber) {
        return { message: "No active order was found to check for cancellation.", intent: "ORDER_CANCELLATION" };
      }
      return {
        message: `For order **#${res.orderNumber}** (Current Status: **${res.currentStatus}**): ${res.explanation}`,
        intent: "ORDER_CANCELLATION",
        orders: toolContext.matchedOrders,
        toolCallsExecuted: executedTools,
      };
    }

    executedTools.push("getOrderStatus");
    const statusResult = await executeToolCall({ name: "getOrderStatus", args: {} }, toolContext);
    const res = statusResult.result;
    if (!res?.found) {
      return {
        message: "You currently have no orders placed on NexCart. You can browse our catalog to find products and place an order!",
        intent: "ORDER_STATUS",
      };
    }
    return {
      message: `Your order **#${res.orderNumber}** is currently **${res.status}**. ${res.statusExplanation} It includes: ${res.items} (Total: ${res.total}).`,
      intent: "ORDER_STATUS",
      orders: toolContext.matchedOrders,
      toolCallsExecuted: executedTools,
    };
  }

  // Check 3: Policy, Shipping, Return, Refund, or FAQ Query via RAG Layer
  const isPolicy =
    /\b(return|refund|exchange|shipping policy|shipping cost|free delivery|delivery time|delivery charges|cancellation policy|how to cancel|payment methods|support|contact|policy|faq)\b/i.test(
      lowerMessage,
    );
  if (isPolicy) {
    executedTools.push("searchPoliciesAndFaqs");
    const policyResult = await executeToolCall(
      { name: "searchPoliciesAndFaqs", args: { query: cleanMessage } },
      toolContext,
    );

    const ragResults = await RAGService.retrievePoliciesAndFaqs(cleanMessage, { limit: 3 });
    if (ragResults.length > 0) {
      const chunksText = ragResults.map((r) => `**${r.chunk.title}:**\n${r.chunk.content}`).join("\n\n");
      return {
        message: chunksText,
        intent: "POLICY_RAG",
        toolCallsExecuted: executedTools,
        ragSourcesUsed: ragResults.map((r) => r.chunk.title),
      };
    }
  }

  // Check 4: Product Search / Recommendations via MongoDB
  executedTools.push("searchProducts");
  const searchResult = await executeToolCall(
    { name: "searchProducts", args: { query: cleanMessage, limit: 5 } },
    toolContext,
  );

  const res = searchResult.result;
  if (res && res.totalFound > 0) {
    const p1 = res.products[0];
    return {
      message: `Here are the matching products from our NexCart catalog. Top recommendation: **${p1.name}** at ${p1.price} (${p1.stock}).`,
      intent: "SHOPPING_SEARCH",
      products: toolContext.matchedProducts.slice(0, 5),
      toolCallsExecuted: executedTools,
    };
  }

  return {
    message: "I couldn't find any matching products or store details in our database for that query. Could you try specifying different keywords or a budget?",
    intent: "NO_RESULTS",
    toolCallsExecuted: executedTools,
  };
};
