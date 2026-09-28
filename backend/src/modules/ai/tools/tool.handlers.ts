import mongoose from "mongoose";
import { Product, type IProduct } from "../../../models/Product.js";
import { Category, type ICategory } from "../../../models/Category.js";
import { Order } from "../../../models/Order.js";
import { Review } from "../../../models/Review.js";
import { ProductStatus } from "../../../constants/productStatus.js";
import { OrderStatus, PaymentMethod } from "../../../constants/orderStatus.js";
import { RAGService } from "../rag/rag.service.js";
import { getOrGenerateAIReviewSummary } from "../rag/review.rag.js";
import type { AIChatOrderSummary } from "../ai.types.js";
import type { ProductResponse } from "../../products/product.types.js";

export interface ToolContext {
  userId: string;
  matchedProducts: ProductResponse[];
  matchedOrders: AIChatOrderSummary[];
}

const escapeRegex = (text: string): string => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * Tool Handler: searchProducts
 * Queries active products in MongoDB matching user criteria.
 */
export const handleSearchProducts = async (
  args: {
    query?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    brand?: string;
    limit?: number;
  },
  ctx: ToolContext,
): Promise<any> => {
  const limit = Math.min(Math.max(args.limit || 5, 1), 10);
  const filter: any = { status: ProductStatus.ACTIVE };

  // Category matching
  if (args.category) {
    const cat = await Category.findOne({
      $or: [
        { name: new RegExp(`^${escapeRegex(args.category)}$`, "i") },
        { slug: new RegExp(`^${escapeRegex(args.category)}$`, "i") },
      ],
      isActive: true,
    })
      .lean()
      .exec();

    if (cat) {
      filter.category = cat._id;
    }
  }

  // Price range
  if (args.minPrice != null || args.maxPrice != null) {
    filter.price = {};
    if (args.minPrice != null && args.minPrice > 0) {
      filter.price.$gte = args.minPrice;
    }
    if (args.maxPrice != null && args.maxPrice > 0) {
      filter.price.$lte = args.maxPrice;
    }
  }

  // Text/Brand keywords
  const searchTerms: string[] = [];
  if (args.query) {
    const cleanTokens = args.query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !["show", "find", "need", "want", "under", "below", "with", "good"].includes(t));
    searchTerms.push(...cleanTokens);
  }
  if (args.brand) {
    searchTerms.push(args.brand.trim());
  }

  if (searchTerms.length > 0) {
    const regexOr = searchTerms.map((term) => ({
      $or: [
        { name: new RegExp(escapeRegex(term), "i") },
        { description: new RegExp(escapeRegex(term), "i") },
        { "specifications.value": new RegExp(escapeRegex(term), "i") },
      ],
    }));
    filter.$and = regexOr;
  }

  const products = await Product.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .exec();

  if (products.length === 0) {
    // If strict AND query had 0 results, fall back to relaxed keyword search
    delete filter.$and;
    if (searchTerms.length > 0) {
      filter.$or = searchTerms.map((t) => ({ name: new RegExp(escapeRegex(t), "i") }));
    }
    const relaxed = await Product.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
    products.push(...relaxed);
  }

  // Enrich with ratings and summaries
  const pIds = products.map((p) => p._id);
  const reviews = await Review.find({ productId: { $in: pIds } }).lean().exec();
  const reviewsByPid = new Map<string, any[]>();
  for (const r of reviews) {
    const pid = r.productId.toString();
    if (!reviewsByPid.has(pid)) reviewsByPid.set(pid, []);
    reviewsByPid.get(pid)!.push(r);
  }

  const resultItems = await Promise.all(
    products.map(async (p) => {
      const pid = p._id.toString();
      const pReviews = reviewsByPid.get(pid) || [];
      const totalReviews = pReviews.length;
      const avgRating =
        totalReviews > 0
          ? Number((pReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1))
          : 0;

      const aiSummary = await getOrGenerateAIReviewSummary(p.name, pid, pReviews);

      const formatted: ProductResponse = {
        id: pid,
        sellerId: p.sellerId.toString(),
        name: p.name,
        description: p.description ?? null,
        sku: p.sku ?? null,
        category: null,
        price: p.price,
        stock: p.stock,
        images: p.images ?? [],
        specifications: p.specifications ?? [],
        status: p.status,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        averageRating: avgRating,
        totalReviews,
        aiReviewSummary: aiSummary,
      };

      ctx.matchedProducts.push(formatted);

      return {
        id: pid,
        name: p.name,
        price: `₹${p.price.toLocaleString("en-IN")}`,
        stock: p.stock > 0 ? `${p.stock} available in stock` : "Out of stock",
        rating: avgRating > 0 ? `⭐ ${avgRating}/5 (${totalReviews} reviews)` : "No ratings yet",
        aiReviewSummary: aiSummary,
        specifications: (p.specifications || []).slice(0, 4).map((s) => `${s.key}: ${s.value}`).join(", "),
      };
    }),
  );

  return {
    totalFound: resultItems.length,
    products: resultItems,
  };
};

/**
 * Tool Handler: getProductDetails
 * Looks up specific product details in MongoDB.
 */
export const handleGetProductDetails = async (
  args: { productId?: string; productName?: string },
  ctx: ToolContext,
): Promise<any> => {
  let product: any = null;

  if (args.productId && mongoose.Types.ObjectId.isValid(args.productId)) {
    product = await Product.findById(args.productId).lean().exec();
  } else if (args.productName) {
    product = await Product.findOne({
      name: new RegExp(escapeRegex(args.productName), "i"),
      status: ProductStatus.ACTIVE,
    })
      .lean()
      .exec();
  }

  if (!product) {
    return {
      found: false,
      message: "Product not found in the NexCart catalog.",
    };
  }

  const pid = product._id.toString();
  const pReviews = await Review.find({ productId: product._id }).lean().exec();
  const totalReviews = pReviews.length;
  const avgRating =
    totalReviews > 0
      ? Number((pReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1))
      : 0;

  const aiReviewSummary = await getOrGenerateAIReviewSummary(product.name, pid, pReviews);

  const formatted: ProductResponse = {
    id: pid,
    sellerId: product.sellerId.toString(),
    name: product.name,
    description: product.description ?? null,
    sku: product.sku ?? null,
    category: null,
    price: product.price,
    stock: product.stock,
    images: product.images ?? [],
    specifications: product.specifications ?? [],
    status: product.status,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    averageRating: avgRating,
    totalReviews,
    aiReviewSummary,
  };
  ctx.matchedProducts.push(formatted);

  return {
    found: true,
    id: pid,
    name: product.name,
    price: `₹${product.price.toLocaleString("en-IN")}`,
    stock: product.stock > 0 ? `${product.stock} units in stock` : "Out of stock",
    description: product.description || "No description provided.",
    specifications: product.specifications || [],
    rating: avgRating > 0 ? `⭐ ${avgRating}/5 (${totalReviews} reviews)` : "No ratings yet",
    aiReviewSummary,
  };
};

/**
 * Tool Handler: getUserOrders
 * Queries the authenticated buyer's orders from MongoDB.
 */
export const handleGetUserOrders = async (
  args: { limit?: number; status?: string },
  ctx: ToolContext,
): Promise<any> => {
  if (!ctx.userId || !mongoose.Types.ObjectId.isValid(ctx.userId)) {
    return { orders: [], message: "Authentication required to view orders." };
  }

  const filter: any = { userId: new mongoose.Types.ObjectId(ctx.userId) };
  if (args.status && Object.values(OrderStatus).includes(args.status as OrderStatus)) {
    filter.status = args.status;
  }

  const limit = Math.min(Math.max(args.limit || 5, 1), 10);
  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .exec();

  if (orders.length === 0) {
    return {
      totalFound: 0,
      message: "No orders found for your account in MongoDB.",
    };
  }

  const orderSummaries = orders.map((o) => {
    const summary: AIChatOrderSummary = {
      id: o._id.toString(),
      orderNumber: o.orderNumber,
      total: o.total,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      itemsCount: o.items.length,
      firstItemName: o.items[0]?.name || undefined,
      createdAt: o.createdAt,
      deliveredAt: o.deliveredAt || undefined,
    };
    ctx.matchedOrders.push(summary);

    return {
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod === PaymentMethod.CASH_ON_DELIVERY ? "Cash on Delivery" : "Online via Razorpay",
      total: `₹${o.total.toLocaleString("en-IN")}`,
      items: o.items.map((i) => `${i.name} (Qty: ${i.quantity})`).join(", "),
      orderDate: new Date(o.createdAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      deliveredAt: o.deliveredAt
        ? new Date(o.deliveredAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : null,
    };
  });

  return {
    totalFound: orderSummaries.length,
    orders: orderSummaries,
  };
};

/**
 * Tool Handler: getOrderStatus
 * Queries real-time order status and shipment updates for an order from MongoDB.
 */
export const handleGetOrderStatus = async (
  args: { orderId?: string },
  ctx: ToolContext,
): Promise<any> => {
  if (!ctx.userId || !mongoose.Types.ObjectId.isValid(ctx.userId)) {
    return { error: "Authentication required to check order status." };
  }

  const filter: any = { userId: new mongoose.Types.ObjectId(ctx.userId) };

  if (args.orderId && args.orderId.trim().length > 0) {
    const trimmed = args.orderId.trim();
    if (mongoose.Types.ObjectId.isValid(trimmed)) {
      filter.$or = [{ _id: new mongoose.Types.ObjectId(trimmed) }, { orderNumber: trimmed }];
    } else {
      filter.orderNumber = trimmed;
    }
  }

  // Fetch target order or most recent order
  const order = await Order.findOne(filter).sort({ createdAt: -1 }).lean().exec();

  if (!order) {
    return {
      found: false,
      message: "No matching order found in your NexCart account.",
    };
  }

  const summary: AIChatOrderSummary = {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    total: order.total,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    itemsCount: order.items.length,
    firstItemName: order.items[0]?.name || undefined,
    createdAt: order.createdAt,
    deliveredAt: order.deliveredAt || undefined,
  };
  ctx.matchedOrders.push(summary);

  let statusExplanation = "";
  switch (order.status) {
    case OrderStatus.PENDING:
      statusExplanation = "Your order has been placed successfully and is awaiting seller confirmation.";
      break;
    case OrderStatus.CONFIRMED:
      statusExplanation = "Your order is confirmed by the seller and is currently being packed for dispatch.";
      break;
    case OrderStatus.SHIPPED:
      statusExplanation = "Your order has been dispatched and is currently in transit with the courier.";
      break;
    case OrderStatus.DELIVERED:
      statusExplanation = `Your order was successfully delivered on ${order.deliveredAt ? new Date(order.deliveredAt).toLocaleDateString("en-IN") : "recently"}.`;
      break;
    case OrderStatus.CANCELLED:
      statusExplanation = "This order was cancelled.";
      break;
    case OrderStatus.RETURNED:
      statusExplanation = "This order was returned and refunded.";
      break;
  }

  return {
    found: true,
    orderNumber: order.orderNumber,
    status: order.status,
    statusExplanation,
    items: order.items.map((i) => i.name).join(", "),
    total: `₹${order.total.toLocaleString("en-IN")}`,
    paymentStatus: order.paymentStatus,
    shippingTo: `${order.shippingAddress.recipientName}, ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`,
  };
};

/**
 * Tool Handler: getPaymentStatus
 * Queries real-time payment status from MongoDB.
 */
export const handleGetPaymentStatus = async (
  args: { orderId?: string },
  ctx: ToolContext,
): Promise<any> => {
  if (!ctx.userId || !mongoose.Types.ObjectId.isValid(ctx.userId)) {
    return { error: "Authentication required to check payment status." };
  }

  const filter: any = { userId: new mongoose.Types.ObjectId(ctx.userId) };
  if (args.orderId && args.orderId.trim().length > 0) {
    const trimmed = args.orderId.trim();
    if (mongoose.Types.ObjectId.isValid(trimmed)) {
      filter.$or = [{ _id: new mongoose.Types.ObjectId(trimmed) }, { orderNumber: trimmed }];
    } else {
      filter.orderNumber = trimmed;
    }
  }

  const order = await Order.findOne(filter).sort({ createdAt: -1 }).lean().exec();
  if (!order) {
    return { found: false, message: "No matching order found." };
  }

  return {
    found: true,
    orderNumber: order.orderNumber,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY ? "Cash on Delivery (COD)" : "Online via Razorpay",
    totalAmount: `₹${order.total.toLocaleString("en-IN")}`,
    note:
      order.paymentStatus === "PAID"
        ? "Payment was successfully verified and received."
        : order.paymentStatus === "PENDING" && order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY
          ? "Payment is due upon doorstep delivery in cash or UPI."
          : "Payment is currently pending verification.",
  };
};

/**
 * Tool Handler: checkCancellationEligibility
 * Checks whether an order is eligible for cancellation from MongoDB.
 */
export const handleCheckCancellationEligibility = async (
  args: { orderId?: string },
  ctx: ToolContext,
): Promise<any> => {
  if (!ctx.userId || !mongoose.Types.ObjectId.isValid(ctx.userId)) {
    return { error: "Authentication required." };
  }

  const filter: any = { userId: new mongoose.Types.ObjectId(ctx.userId) };
  if (args.orderId && args.orderId.trim().length > 0) {
    const trimmed = args.orderId.trim();
    if (mongoose.Types.ObjectId.isValid(trimmed)) {
      filter.$or = [{ _id: new mongoose.Types.ObjectId(trimmed) }, { orderNumber: trimmed }];
    } else {
      filter.orderNumber = trimmed;
    }
  }

  const order = await Order.findOne(filter).sort({ createdAt: -1 }).lean().exec();
  if (!order) {
    return { found: false, message: "Order not found." };
  }

  const canCancel = order.status === OrderStatus.PENDING || order.status === OrderStatus.CONFIRMED;

  let reason = "";
  if (canCancel) {
    reason = "Your order is in PENDING/CONFIRMED status and has not been dispatched yet. You can cancel it directly in your 'My Orders' section.";
  } else if (order.status === OrderStatus.SHIPPED) {
    reason = "The order has already been SHIPPED and is with the delivery courier. It cannot be cancelled now, but you can decline delivery at your doorstep or initiate a 7-day return once delivered.";
  } else if (order.status === OrderStatus.DELIVERED) {
    reason = "The order is already DELIVERED. It cannot be cancelled, but you can request a return within 7 days in 'My Orders'.";
  } else if (order.status === OrderStatus.CANCELLED) {
    reason = "This order is already cancelled.";
  }

  return {
    orderNumber: order.orderNumber,
    currentStatus: order.status,
    isEligibleForCancellation: canCancel,
    explanation: reason,
  };
};

/**
 * Tool Handler: getShippingStatus
 * Queries delivery details from MongoDB.
 */
export const handleGetShippingStatus = async (
  args: { orderId?: string },
  ctx: ToolContext,
): Promise<any> => {
  return handleGetOrderStatus(args, ctx);
};

/**
 * Tool Handler: searchPoliciesAndFaqs
 * Queries the RAG Layer for static policies and FAQ knowledge.
 */
export const handleSearchPoliciesAndFaqs = async (
  args: { query: string; topic?: string | undefined },
): Promise<any> => {
  const results = await RAGService.retrievePoliciesAndFaqs(args.query, {
    limit: 3,
    topic: args.topic,
  });

  return {
    query: args.query,
    resultsFound: results.length,
    context: RAGService.formatRAGContext(results),
  };
};

/**
 * Tool Handler: searchProductReviews
 * Queries customer reviews from MongoDB and runs RAG retrieval on review chunks.
 */
export const handleSearchProductReviews = async (
  args: { productId?: string; productName?: string; query: string },
): Promise<any> => {
  let targetProduct: any = null;

  if (args.productId && mongoose.Types.ObjectId.isValid(args.productId)) {
    targetProduct = await Product.findById(args.productId).select("name").lean().exec();
  } else if (args.productName) {
    targetProduct = await Product.findOne({
      name: new RegExp(escapeRegex(args.productName), "i"),
      status: ProductStatus.ACTIVE,
    })
      .select("name")
      .lean()
      .exec();
  }

  if (!targetProduct) {
    return {
      message: "Please specify which product you would like customer reviews for.",
    };
  }

  const pid = targetProduct._id.toString();
  const dbReviews = await Review.find({ productId: targetProduct._id }).lean().exec();

  if (dbReviews.length === 0) {
    return {
      productName: targetProduct.name,
      totalReviews: 0,
      message: `There are currently no customer reviews for ${targetProduct.name} in the NexCart database.`,
    };
  }

  // Use Review RAG layer to find relevant review chunks
  const ragResults = await RAGService.retrieveProductReviews(pid, args.query, 4);

  const avgRating = (
    dbReviews.reduce((sum, r) => sum + r.rating, 0) / dbReviews.length
  ).toFixed(1);

  return {
    productName: targetProduct.name,
    totalReviews: dbReviews.length,
    averageRating: `⭐ ${avgRating}/5`,
    relevantReviews: ragResults.map((r) => ({
      reviewTitle: r.chunk.title,
      content: r.chunk.content,
      sentiment: r.chunk.metadata?.sentiment,
      relevance: `${(r.score * 100).toFixed(0)}%`,
    })),
  };
};
