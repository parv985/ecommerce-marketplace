/**
 * Groq Function Calling Tool Definitions for NexCart AI Assistant.
 * Fully compatible with OpenAI / Groq tool definitions schema.
 * Grounded in dynamic MongoDB operations and the RAG Layer.
 */
export const GROQ_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "searchProducts",
      description:
        "Search the NexCart product catalog in MongoDB based on buyer requirements such as keywords, category, price range, or brand. Returns matching active products with real-time prices, stock, and ratings.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search keywords (e.g. 'running shoes', 'laptop for coding', 'cotton shirt').",
          },
          category: {
            type: "string",
            description: "Product category name or slug (e.g. 'Electronics', 'Footwear', 'Clothing').",
          },
          minPrice: {
            type: "number",
            description: "Minimum price budget in Indian Rupees (INR).",
          },
          maxPrice: {
            type: "number",
            description: "Maximum price budget in Indian Rupees (INR).",
          },
          brand: {
            type: "string",
            description: "Specific brand name if requested by the user.",
          },
          limit: {
            type: "integer",
            description: "Maximum number of products to return (default: 5).",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getProductDetails",
      description:
        "Retrieve real-time details from MongoDB for a specific product including current price, stock availability, specifications, description, and rating.",
      parameters: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description: "MongoDB ObjectID of the product.",
          },
          productName: {
            type: "string",
            description: "Name of the product to look up if ID is unknown.",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getUserOrders",
      description:
        "Retrieve the authenticated buyer's order history from MongoDB. Returns recent orders with order numbers, dates, statuses, total amounts, and item names. NEVER exposes another user's orders.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: "Number of recent orders to fetch (default: 5).",
          },
          status: {
            type: "string",
            description: "Filter by order status: PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED, or RETURNED.",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getOrderStatus",
      description:
        "Get real-time order status and tracking information from MongoDB for a specific order or the most recent order of the authenticated buyer.",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "The order ID or order number (optional; defaults to the most recent order if not provided).",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getPaymentStatus",
      description:
        "Get real-time payment status (PAID, PENDING, FAILED, REFUNDED) and payment method (COD or ONLINE via Razorpay) for an order of the authenticated buyer from MongoDB.",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "The order ID or order number (optional; defaults to the most recent order if not provided).",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "checkCancellationEligibility",
      description:
        "Check whether an order can be cancelled based on its current MongoDB status (allowed while PENDING or CONFIRMED; not allowed once SHIPPED or DELIVERED).",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "The order ID or order number (optional; defaults to the most recent order if not provided).",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getShippingStatus",
      description:
        "Retrieve shipping, delivery address, and carrier progress details for an order of the authenticated buyer from MongoDB.",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "The order ID or order number (optional; defaults to the most recent order if not provided).",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "searchPoliciesAndFaqs",
      description:
        "Use the RAG Layer to retrieve verified NexCart store policies, shipping rules, return windows, refund timelines, payment security, and FAQ guidelines.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The buyer's policy question (e.g. 'return window', 'shipping cost', 'COD rules', 'refund time').",
          },
          topic: {
            type: "string",
            description: "Optional policy category: 'shipping', 'returns', 'cancellation', 'payment', 'faq'.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "searchProductReviews",
      description:
        "Use the Review RAG Layer to retrieve actual customer reviews and feedback for a product. Use for questions like 'What do customers dislike about this product?', 'Is the sound quality good?', or 'Summarize complaints'.",
      parameters: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description: "MongoDB ObjectID of the product.",
          },
          productName: {
            type: "string",
            description: "Name of the product.",
          },
          query: {
            type: "string",
            description: "The specific aspect or feedback to search for (e.g. 'dislike', 'battery', 'quality', 'complaints', 'pros').",
          },
        },
        required: ["query"],
      },
    },
  },
];
