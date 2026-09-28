import { Type } from "@google/genai";

/**
 * Gemini Function Calling Tool Definitions for NexCart AI Assistant.
 * Grounded in dynamic MongoDB operations and the RAG Layer.
 */
export const GEMINI_TOOL_DECLARATIONS = [
  {
    name: "searchProducts",
    description:
      "Search the NexCart product catalog in MongoDB based on buyer requirements such as keywords, category, price range, or brand. Returns matching active products with real-time prices, stock, and ratings.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "Search keywords (e.g. 'running shoes', 'laptop for coding', 'cotton shirt').",
        },
        category: {
          type: Type.STRING,
          description: "Product category name or slug (e.g. 'Electronics', 'Footwear', 'Clothing').",
        },
        minPrice: {
          type: Type.NUMBER,
          description: "Minimum price budget in Indian Rupees (INR).",
        },
        maxPrice: {
          type: Type.NUMBER,
          description: "Maximum price budget in Indian Rupees (INR).",
        },
        brand: {
          type: Type.STRING,
          description: "Specific brand name if requested by the user.",
        },
        limit: {
          type: Type.INTEGER,
          description: "Maximum number of products to return (default: 5).",
        },
      },
    },
  },
  {
    name: "getProductDetails",
    description:
      "Retrieve real-time details from MongoDB for a specific product including current price, stock availability, specifications, description, and rating.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        productId: {
          type: Type.STRING,
          description: "MongoDB ObjectID of the product.",
        },
        productName: {
          type: Type.STRING,
          description: "Name of the product to look up if ID is unknown.",
        },
      },
    },
  },
  {
    name: "getUserOrders",
    description:
      "Retrieve the authenticated buyer's order history from MongoDB. Returns recent orders with order numbers, dates, statuses, total amounts, and item names. NEVER exposes another user's orders.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: {
          type: Type.INTEGER,
          description: "Number of recent orders to fetch (default: 5).",
        },
        status: {
          type: Type.STRING,
          description: "Filter by order status: PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED, or RETURNED.",
        },
      },
    },
  },
  {
    name: "getOrderStatus",
    description:
      "Get real-time order status and tracking information from MongoDB for a specific order or the most recent order of the authenticated buyer.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        orderId: {
          type: Type.STRING,
          description: "The order ID or order number (optional; defaults to the most recent order if not provided).",
        },
      },
    },
  },
  {
    name: "getPaymentStatus",
    description:
      "Get real-time payment status (PAID, PENDING, FAILED, REFUNDED) and payment method (COD or ONLINE via Razorpay) for an order of the authenticated buyer from MongoDB.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        orderId: {
          type: Type.STRING,
          description: "The order ID or order number (optional; defaults to the most recent order if not provided).",
        },
      },
    },
  },
  {
    name: "checkCancellationEligibility",
    description:
      "Check whether an order can be cancelled based on its current MongoDB status (allowed while PENDING or CONFIRMED; not allowed once SHIPPED or DELIVERED).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        orderId: {
          type: Type.STRING,
          description: "The order ID or order number (optional; defaults to the most recent order if not provided).",
        },
      },
    },
  },
  {
    name: "getShippingStatus",
    description:
      "Retrieve shipping, delivery address, and carrier progress details for an order of the authenticated buyer from MongoDB.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        orderId: {
          type: Type.STRING,
          description: "The order ID or order number (optional; defaults to the most recent order if not provided).",
        },
      },
    },
  },
  {
    name: "searchPoliciesAndFaqs",
    description:
      "Use the RAG Layer to retrieve verified NexCart store policies, shipping rules, return windows, refund timelines, payment security, and FAQ guidelines.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "The buyer's policy question (e.g. 'return window', 'shipping cost', 'COD rules', 'refund time').",
        },
        topic: {
          type: Type.STRING,
          description: "Optional policy category: 'shipping', 'returns', 'cancellation', 'payment', 'faq'.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "searchProductReviews",
    description:
      "Use the Review RAG Layer to retrieve actual customer reviews and feedback for a product. Use for questions like 'What do customers dislike about this product?', 'Is the sound quality good?', or 'Summarize complaints'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        productId: {
          type: Type.STRING,
          description: "MongoDB ObjectID of the product.",
        },
        productName: {
          type: Type.STRING,
          description: "Name of the product.",
        },
        query: {
          type: Type.STRING,
          description: "The specific aspect or feedback to search for (e.g. 'dislike', 'battery', 'quality', 'complaints', 'pros').",
        },
      },
      required: ["query"],
    },
  },
];
