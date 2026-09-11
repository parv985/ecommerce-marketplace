import swaggerJSDoc from "swagger-jsdoc";

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: "3.0.0",

    info: {
      title: "Your Project API",
      version: "1.0.0",
      description:
        "API documentation for the application backend",
    },

    servers: [
      {
        url: "http://localhost:5000",
        description: "Local development server",
      },
    ],

    tags: [
      {
        name: "Authentication",
        description:
          "Authentication and account management APIs",
      },

      {
        name: "Sellers",
        description:
          "Seller profile and seller management APIs",
      },

      {
        name: "Products",
        description:
          "Product catalog and seller product management APIs",
      },

      {
        name: "Categories",
        description:
          "Product category management APIs",
      },

      {
        name: "Users",
        description:
          "User profile and address management APIs",
      },

      {
        name: "Cart",
        description:
          "Shopping cart APIs",
      },

      {
        name: "Orders",
        description:
          "Order lifecycle and payment status APIs",
      },

      {
        name: "Reviews",
        description:
          "Product review and rating APIs",
      },

      {
        name: "Discounts",
        description:
          "Seller-created sales discounts and automatic checkout calculation",
      },

      {
        name: "Coupons",
        description:
          "Seller-created coupon codes with usage limits and checkout application",
      },

      {
        name: "Returns",
        description:
          "Order return requests and their lifecycle",
      },

      {
        name: "Analytics",
        description:
          "Seller dashboard, sales analytics, customers and revenue statistics",
      },

      {
        name: "Notifications",
        description:
          "In-app notifications, preferences and administrative broadcasts",
      },

      {
        name: "Payments",
        description:
          "Payment gateway integration, webhooks and refunds (Razorpay, with a deterministic mock mode when no credentials are configured)",
      },

      {
        name: "Admin",
        description:
          "Administrator-only management APIs",
      },

      {
        name: "System",
        description:
          "Health and system status APIs",
      },
    ],

    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },

      schemas: {
        UserSummary: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            name: {
              type: "string",
            },
            email: {
              type: "string",
              format: "email",
            },
            role: {
              type: "string",
              enum: [
                "BUYER",
                "SELLER",
                "SUPER_ADMIN",
              ],
            },
            isEmailVerified: {
              type: "boolean",
            },
            avatarUrl: {
              type: "string",
              format: "uri",
              nullable: true,
            },
          },
        },

        SellerProfile: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            userId: {
              type: "string",
            },
            businessName: {
              type: "string",
            },
            phone: {
              type: "string",
              nullable: true,
            },
            gstin: {
              type: "string",
            },
            pan: {
              type: "string",
            },
            bankAccountHolderName: {
              type: "string",
            },
            bankAccountNumber: {
              type: "string",
            },
            ifscCode: {
              type: "string",
            },
            address: {
              type: "object",
              properties: {
                addressLine1: {
                  type: "string",
                },
                addressLine2: {
                  type: "string",
                },
                city: {
                  type: "string",
                },
                state: {
                  type: "string",
                },
                pincode: {
                  type: "string",
                },
              },
            },
            documents: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                  },
                  url: {
                    type: "string",
                    format: "uri",
                  },
                  publicId: {
                    type: "string",
                  },
                },
              },
            },
            status: {
              type: "string",
              enum: [
                "PENDING",
                "APPROVED",
                "REJECTED",
                "PAUSED",
                "SUSPENDED",
              ],
            },
            statusReason: {
              type: "string",
              nullable: true,
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        SellerProfileUpdate: {
          type: "object",
          properties: {
            businessName: {
              type: "string",
              minLength: 2,
              maxLength: 150,
            },
            phone: {
              type: "string",
              pattern: "^[0-9]{10}$",
            },
            bankAccountHolderName: {
              type: "string",
            },
            bankAccountNumber: {
              type: "string",
              minLength: 8,
              maxLength: 20,
            },
            ifscCode: {
              type: "string",
            },
            addressLine1: {
              type: "string",
            },
            addressLine2: {
              type: "string",
            },
            city: {
              type: "string",
            },
            state: {
              type: "string",
            },
            pincode: {
              type: "string",
              pattern: "^[1-9][0-9]{5}$",
            },
            documents: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                  },
                  url: {
                    type: "string",
                    format: "uri",
                  },
                  publicId: {
                    type: "string",
                  },
                },
              },
            },
          },
        },

        Product: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            sellerId: {
              type: "string",
            },
            name: {
              type: "string",
            },
            description: {
              type: "string",
              nullable: true,
            },
            category: {
              type: "object",
              nullable: true,
              properties: {
                id: {
                  type: "string",
                },
                name: {
                  type: "string",
                  nullable: true,
                },
              },
            },
            price: {
              type: "number",
            },
            stock: {
              type: "number",
            },
            images: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  url: {
                    type: "string",
                    format: "uri",
                  },
                  publicId: {
                    type: "string",
                  },
                },
              },
            },
            status: {
              type: "string",
              enum: [
                "DRAFT",
                "ACTIVE",
                "INACTIVE",
              ],
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        ProductInput: {
          type: "object",
          required: [
            "name",
            "price",
            "stock",
          ],
          properties: {
            name: {
              type: "string",
              minLength: 2,
              maxLength: 150,
              example: "Wireless Mouse",
            },
            description: {
              type: "string",
              maxLength: 2000,
            },
            category: {
              type: "string",
              description: "Category ObjectId",
            },
            price: {
              type: "number",
              /* OpenAPI 3.0: exclusiveMinimum is a boolean modifier
                 on `minimum` (price must be > 0). */
              minimum: 0,
              exclusiveMinimum: true,
              maximum: 10000000,
              example: 499.5,
            },
            stock: {
              type: "integer",
              minimum: 0,
              maximum: 1000000,
              example: 50,
            },
            images: {
              type: "array",
              maxItems: 8,
              items: {
                type: "object",
                properties: {
                  url: {
                    type: "string",
                    format: "uri",
                  },
                  publicId: {
                    type: "string",
                  },
                },
              },
              description: "Optional array of image objects. You can also use POST /products/:id/images to upload images via multipart form-data.",
            },
            status: {
              type: "string",
              enum: [
                "DRAFT",
                "ACTIVE",
                "INACTIVE",
              ],
              default: "DRAFT",
            },
          },
        },

        ProductUpdate: {
          type: "object",
          properties: {
            name: {
              type: "string",
              minLength: 2,
              maxLength: 150,
            },
            description: {
              type: "string",
              maxLength: 2000,
            },
            category: {
              type: "string",
              nullable: true,
              description: "Category ObjectId or null to remove",
            },
            price: {
              type: "number",
              /* OpenAPI 3.0: exclusiveMinimum is a boolean modifier
                 on `minimum` (price must be > 0). */
              minimum: 0,
              exclusiveMinimum: true,
              maximum: 10000000,
            },
            stock: {
              type: "integer",
              minimum: 0,
              maximum: 1000000,
            },
            images: {
              type: "array",
              maxItems: 8,
              items: {
                type: "object",
                properties: {
                  url: {
                    type: "string",
                    format: "uri",
                  },
                  publicId: {
                    type: "string",
                  },
                },
              },
            },
            status: {
              type: "string",
              enum: [
                "DRAFT",
                "ACTIVE",
                "INACTIVE",
              ],
            },
          },
        },

        PaginatedProducts: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                $ref: "#/components/schemas/Product",
              },
            },
            page: {
              type: "integer",
            },
            limit: {
              type: "integer",
            },
            total: {
              type: "integer",
            },
            totalPages: {
              type: "integer",
            },
          },
        },

        Discount: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            sellerId: {
              type: "string",
            },
            productId: {
              type: "string",
              nullable: true,
            },
            categoryId: {
              type: "string",
              nullable: true,
            },
            discountType: {
              type: "string",
              enum: ["PERCENTAGE"],
            },
            discountValue: {
              type: "integer",
              minimum: 1,
              maximum: 100,
            },
            startAt: {
              type: "string",
              format: "date-time",
            },
            endAt: {
              type: "string",
              format: "date-time",
            },
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE"],
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        DiscountInput: {
          type: "object",
          required: [
            "discountValue",
            "startAt",
            "endAt",
          ],
          description:
            "Provide exactly one of productId or categoryId. A product discount beats a category discount at checkout; discounts are never stacked.",
          properties: {
            productId: {
              type: "string",
              description: "Product ObjectId (mutually exclusive with categoryId)",
            },
            categoryId: {
              type: "string",
              description: "Category ObjectId (mutually exclusive with productId)",
            },
            discountType: {
              type: "string",
              enum: ["PERCENTAGE"],
              default: "PERCENTAGE",
            },
            discountValue: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              example: 10,
            },
            startAt: {
              type: "string",
              format: "date-time",
              description: "Discount window start (ISO 8601)",
            },
            endAt: {
              type: "string",
              format: "date-time",
              description: "Discount window end, must be after startAt (ISO 8601)",
            },
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE"],
              default: "ACTIVE",
            },
          },
        },

        DiscountUpdate: {
          type: "object",
          description:
            "All fields optional. Switching target type replaces the previous target.",
          properties: {
            productId: {
              type: "string",
              nullable: true,
              description: "Product ObjectId (mutually exclusive with categoryId)",
            },
            categoryId: {
              type: "string",
              nullable: true,
              description: "Category ObjectId (mutually exclusive with productId)",
            },
            discountType: {
              type: "string",
              enum: ["PERCENTAGE"],
            },
            discountValue: {
              type: "integer",
              minimum: 1,
              maximum: 100,
            },
            startAt: {
              type: "string",
              format: "date-time",
            },
            endAt: {
              type: "string",
              format: "date-time",
            },
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE"],
            },
          },
        },

        PaginatedDiscounts: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                $ref: "#/components/schemas/Discount",
              },
            },
            page: {
              type: "integer",
            },
            limit: {
              type: "integer",
            },
            total: {
              type: "integer",
            },
            totalPages: {
              type: "integer",
            },
          },
        },

        Coupon: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            sellerId: {
              type: "string",
            },
            code: {
              type: "string",
              description: "Uppercase coupon code",
            },
            type: {
              type: "string",
              enum: ["PERCENTAGE", "FIXED"],
            },
            value: {
              type: "number",
              description: "Percent (PERCENTAGE) or absolute amount (FIXED)",
            },
            minOrderValue: {
              type: "number",
            },
            maxDiscount: {
              type: "number",
              nullable: true,
            },
            productIds: {
              type: "array",
              items: {
                type: "string",
              },
            },
            categoryIds: {
              type: "array",
              items: {
                type: "string",
              },
            },
            startAt: {
              type: "string",
              format: "date-time",
            },
            endAt: {
              type: "string",
              format: "date-time",
            },
            usageLimit: {
              type: "integer",
              nullable: true,
            },
            perUserLimit: {
              type: "integer",
              nullable: true,
            },
            usageCount: {
              type: "integer",
            },
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE"],
              description:
                "Derived status, never stale: ACTIVE only while the manual switch is enabled, the current date is inside [startAt, endAt] and the usage limit has not been reached (expired or fully-used coupons are automatically INACTIVE).",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        CouponInput: {
          type: "object",
          required: ["code", "type", "value", "startAt", "endAt"],
          description:
            "Coupons apply AFTER sales discounts. When product/category restrictions exist, every item in the seller's order must qualify. Codes are normalized to uppercase.",
          properties: {
            code: {
              type: "string",
              minLength: 3,
              maxLength: 30,
              pattern: "^[A-Za-z0-9_-]+$",
              example: "WELCOME10",
            },
            type: {
              type: "string",
              enum: ["PERCENTAGE", "FIXED"],
            },
            value: {
              type: "number",
              minimum: 1,
              description: "1-100 for PERCENTAGE",
              example: 10,
            },
            minOrderValue: {
              type: "number",
              minimum: 0,
              default: 0,
            },
            maxDiscount: {
              type: "number",
              minimum: 1,
              nullable: true,
            },
            productIds: {
              type: "array",
              maxItems: 50,
              items: {
                type: "string",
              },
            },
            categoryIds: {
              type: "array",
              maxItems: 50,
              items: {
                type: "string",
              },
            },
            startAt: {
              type: "string",
              format: "date-time",
            },
            endAt: {
              type: "string",
              format: "date-time",
            },
            usageLimit: {
              type: "integer",
              minimum: 1,
              nullable: true,
            },
            perUserLimit: {
              type: "integer",
              minimum: 1,
              nullable: true,
              default: 1,
            },
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE"],
              default: "ACTIVE",
              description:
                "Manual switch only. The status returned by the API is derived from this flag, the coupon dates and the remaining usage limit.",
            },
          },
        },

        CouponUpdate: {
          type: "object",
          description:
            "All fields optional. The coupon code itself is immutable.",
          properties: {
            type: {
              type: "string",
              enum: ["PERCENTAGE", "FIXED"],
            },
            value: {
              type: "number",
              minimum: 1,
            },
            minOrderValue: {
              type: "number",
              minimum: 0,
            },
            maxDiscount: {
              type: "number",
              minimum: 1,
              nullable: true,
            },
            productIds: {
              type: "array",
              maxItems: 50,
              items: {
                type: "string",
              },
            },
            categoryIds: {
              type: "array",
              maxItems: 50,
              items: {
                type: "string",
              },
            },
            startAt: {
              type: "string",
              format: "date-time",
            },
            endAt: {
              type: "string",
              format: "date-time",
            },
            usageLimit: {
              type: "integer",
              minimum: 1,
              nullable: true,
            },
            perUserLimit: {
              type: "integer",
              minimum: 1,
              nullable: true,
            },
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE"],
              description:
                "Manual switch only (re-enable a deactivated coupon). Expired or fully-used coupons always come back as INACTIVE.",
            },
          },
        },

        PaginatedCoupons: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                $ref: "#/components/schemas/Coupon",
              },
            },
            page: {
              type: "integer",
            },
            limit: {
              type: "integer",
            },
            total: {
              type: "integer",
            },
            totalPages: {
              type: "integer",
            },
          },
        },

        ReturnRequest: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            orderId: {
              type: "string",
            },
            userId: {
              type: "string",
            },
            sellerId: {
              type: "string",
            },
            reason: {
              type: "string",
            },
            status: {
              type: "string",
              enum: [
                "PENDING",
                "APPROVED",
                "REJECTED",
                "CANCELLED",
                "COMPLETED",
              ],
            },
            statusReason: {
              type: "string",
              nullable: true,
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        PaginatedReturns: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                $ref: "#/components/schemas/ReturnRequest",
              },
            },
            page: {
              type: "integer",
            },
            limit: {
              type: "integer",
            },
            total: {
              type: "integer",
            },
            totalPages: {
              type: "integer",
            },
          },
        },

        Dashboard: {
          type: "object",
          properties: {
            orders: {
              type: "object",
              properties: {
                total: { type: "integer" },
                pending: { type: "integer" },
                confirmed: { type: "integer" },
                shipped: { type: "integer" },
                delivered: { type: "integer" },
                cancelled: { type: "integer" },
              },
            },
            revenue: {
              type: "object",
              properties: {
                total: { type: "number" },
                currentMonth: { type: "number" },
              },
            },
            products: {
              type: "object",
              properties: {
                total: { type: "integer" },
                active: { type: "integer" },
                lowStock: { type: "integer" },
              },
            },
            returns: {
              type: "object",
              properties: {
                pending: { type: "integer" },
              },
            },
            marketing: {
              type: "object",
              properties: {
                coupons: { type: "integer" },
                discounts: { type: "integer" },
              },
            },
          },
        },

        SalesPoint: {
          type: "object",
          properties: {
            period: { type: "string" },
            orders: { type: "integer" },
            revenue: { type: "number" },
          },
        },

        TopProduct: {
          type: "object",
          properties: {
            productId: { type: "string" },
            name: { type: "string" },
            quantity: { type: "integer" },
            revenue: { type: "number" },
            orders: { type: "integer" },
          },
        },

        CategoryPerformance: {
          type: "object",
          properties: {
            categoryId: { type: "string" },
            categoryName: { type: "string", nullable: true },
            quantity: { type: "integer" },
            revenue: { type: "number" },
          },
        },

        CustomerSummary: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            name: { type: "string" },
            email: { type: "string" },
            orderCount: { type: "integer" },
            totalSpent: { type: "number" },
          },
        },

        PaginatedCustomers: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                $ref: "#/components/schemas/CustomerSummary",
              },
            },
            page: { type: "integer" },
            limit: { type: "integer" },
            total: { type: "integer" },
            totalPages: { type: "integer" },
          },
        },

        RevenueResponse: {
          type: "object",
          properties: {
            totalRevenue: { type: "number" },
            totalOrders: { type: "integer" },
            deliveredOrders: { type: "integer" },
            cancelledOrders: { type: "integer" },
            returnedOrders: { type: "integer" },
            series: {
              type: "array",
              items: {
                $ref: "#/components/schemas/SalesPoint",
              },
            },
          },
        },

        Notification: {
          type: "object",
          properties: {
            id: { type: "string" },
            type: { type: "string" },
            title: { type: "string" },
            message: { type: "string" },
            entityType: { type: "string", nullable: true },
            entityId: { type: "string", nullable: true },
            isRead: { type: "boolean" },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        PaginatedNotifications: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                $ref: "#/components/schemas/Notification",
              },
            },
            page: { type: "integer" },
            limit: { type: "integer" },
            total: { type: "integer" },
            totalPages: { type: "integer" },
          },
        },

        NotificationPreferences: {
          type: "object",
          properties: {
            userId: { type: "string" },
            emailOrderUpdates: { type: "boolean" },
            emailPaymentUpdates: { type: "boolean" },
            emailPromotional: { type: "boolean" },
            inApp: { type: "boolean" },
          },
        },

        Category: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            name: {
              type: "string",
            },
            description: {
              type: "string",
              nullable: true,
            },
            isActive: {
              type: "boolean",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        CategoryInput: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
              minLength: 2,
              maxLength: 100,
              example: "Electronics",
            },
            description: {
              type: "string",
              maxLength: 500,
            },
          },
        },

        CategoryUpdate: {
          type: "object",
          properties: {
            name: {
              type: "string",
              minLength: 2,
              maxLength: 100,
            },
            description: {
              type: "string",
              maxLength: 500,
              nullable: true,
            },
            isActive: {
              type: "boolean",
            },
          },
        },

        UserProfile: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            name: {
              type: "string",
            },
            email: {
              type: "string",
              format: "email",
            },
            role: {
              type: "string",
              enum: [
                "BUYER",
                "SELLER",
                "SUPER_ADMIN",
              ],
            },
            avatarUrl: {
              type: "string",
              format: "uri",
              nullable: true,
            },
            isEmailVerified: {
              type: "boolean",
            },
            isActive: {
              type: "boolean",
              description:
                "False when a Super Admin has deactivated the account.",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        UserProfileUpdate: {
          type: "object",
          properties: {
            name: {
              type: "string",
              minLength: 2,
              maxLength: 100,
            },
          },
        },

        Address: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            label: {
              type: "string",
            },
            recipientName: {
              type: "string",
            },
            phone: {
              type: "string",
            },
            addressLine1: {
              type: "string",
            },
            addressLine2: {
              type: "string",
              nullable: true,
            },
            city: {
              type: "string",
            },
            state: {
              type: "string",
            },
            pincode: {
              type: "string",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        AddressInput: {
          type: "object",
          required: [
            "recipientName",
            "phone",
            "addressLine1",
            "city",
            "state",
            "pincode",
          ],
          properties: {
            label: {
              type: "string",
              maxLength: 30,
              default: "Home",
            },
            recipientName: {
              type: "string",
              minLength: 2,
              maxLength: 100,
            },
            phone: {
              type: "string",
              pattern: "^[0-9]{10}$",
            },
            addressLine1: {
              type: "string",
              minLength: 3,
              maxLength: 200,
            },
            addressLine2: {
              type: "string",
              maxLength: 200,
            },
            city: {
              type: "string",
              minLength: 2,
              maxLength: 100,
            },
            state: {
              type: "string",
              minLength: 2,
              maxLength: 100,
            },
            pincode: {
              type: "string",
              pattern: "^[1-9][0-9]{5}$",
            },
          },
        },

        AddressUpdate: {
          type: "object",
          properties: {
            label: {
              type: "string",
              maxLength: 30,
            },
            recipientName: {
              type: "string",
              minLength: 2,
              maxLength: 100,
            },
            phone: {
              type: "string",
              pattern: "^[0-9]{10}$",
            },
            addressLine1: {
              type: "string",
              minLength: 3,
              maxLength: 200,
            },
            addressLine2: {
              type: "string",
              maxLength: 200,
              nullable: true,
            },
            city: {
              type: "string",
              minLength: 2,
              maxLength: 100,
            },
            state: {
              type: "string",
              minLength: 2,
              maxLength: 100,
            },
            pincode: {
              type: "string",
              pattern: "^[1-9][0-9]{5}$",
            },
          },
        },

        Cart: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  productId: {
                    type: "string",
                  },
                  quantity: {
                    type: "integer",
                  },
                  product: {
                    type: "object",
                    nullable: true,
                    properties: {
                      id: {
                        type: "string",
                      },
                      sellerId: {
                        type: "string",
                      },
                      name: {
                        type: "string",
                      },
                      price: {
                        type: "number",
                      },
                      stock: {
                        type: "integer",
                      },
                      images: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            url: {
                              type: "string",
                              format: "uri",
                            },
                            publicId: {
                              type: "string",
                            },
                          },
                        },
                      },
                      status: {
                        type: "string",
                        enum: [
                          "DRAFT",
                          "ACTIVE",
                          "INACTIVE",
                        ],
                      },
                    },
                  },
                  subtotal: {
                    type: "number",
                  },
                },
              },
            },
            totalItems: {
              type: "integer",
            },
            totalQuantity: {
              type: "integer",
            },
            totalPrice: {
              type: "number",
            },
          },
        },

        CartItemInput: {
          type: "object",
          required: ["productId", "quantity"],
          properties: {
            productId: {
              type: "string",
              description: "Product ObjectId",
            },
            quantity: {
              type: "integer",
              minimum: 1,
              maximum: 999,
            },
          },
        },

        CartItemUpdate: {
          type: "object",
          required: ["quantity"],
          properties: {
            quantity: {
              type: "integer",
              minimum: 1,
              maximum: 999,
            },
          },
        },

        Order: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            orderNumber: {
              type: "string",
            },
            userId: {
              type: "string",
            },
            sellerId: {
              type: "string",
            },
            sellerBusinessName: {
              type: "string",
              nullable: true,
            },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  productId: {
                    type: "string",
                  },
                  name: {
                    type: "string",
                  },
                  price: {
                    type: "number",
                  },
                  quantity: {
                    type: "integer",
                  },
                  subtotal: {
                    type: "number",
                    description: "Original line total (price * quantity)",
                  },
                  discountAmount: {
                    type: "number",
                    description: "Sales-discount amount applied to this line",
                  },
                },
              },
            },
            shippingAddress: {
              type: "object",
              properties: {
                recipientName: {
                  type: "string",
                },
                phone: {
                  type: "string",
                },
                addressLine1: {
                  type: "string",
                },
                addressLine2: {
                  type: "string",
                  nullable: true,
                },
                city: {
                  type: "string",
                },
                state: {
                  type: "string",
                },
                pincode: {
                  type: "string",
                },
              },
            },
            itemsTotal: {
              type: "number",
              description: "Sum of original line subtotals before discounts",
            },
            discountTotal: {
              type: "number",
              description: "Total sales discount applied",
            },
            couponId: {
              type: "string",
              nullable: true,
            },
            couponCode: {
              type: "string",
              nullable: true,
            },
            couponDiscount: {
              type: "number",
              description: "Absolute discount contributed by the coupon",
            },
            total: {
              type: "number",
              description: "Final payable amount (itemsTotal - discountTotal - couponDiscount)",
            },
            paymentMethod: {
              type: "string",
              enum: ["CASH_ON_DELIVERY", "ONLINE"],
            },
            paymentStatus: {
              type: "string",
              enum: ["PENDING", "PAID", "FAILED", "REFUNDED"],
            },
            paymentId: {
              type: "string",
              nullable: true,
              description: "Payment record id once payment is initiated through the gateway",
            },
            status: {
              type: "string",
              enum: [
                "PENDING",
                "CONFIRMED",
                "SHIPPED",
                "DELIVERED",
                "CANCELLED",
              ],
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        CreateOrderInput: {
          type: "object",
          required: ["shippingAddressId"],
          properties: {
            shippingAddressId: {
              type: "string",
              description: "Saved address ObjectId of the authenticated user",
            },
            paymentMethod: {
              type: "string",
              enum: ["CASH_ON_DELIVERY", "ONLINE"],
              description: "Defaults to CASH_ON_DELIVERY. ONLINE orders are paid through the payment gateway (initiate + verify).",
            },
            couponCode: {
              type: "string",
              description: "Optional coupon code. Applied after sales discounts to the coupon owner's order only.",
            },
          },
        },

        PaginatedOrders: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                $ref: "#/components/schemas/Order",
              },
            },
            page: {
              type: "integer",
            },
            limit: {
              type: "integer",
            },
            total: {
              type: "integer",
            },
            totalPages: {
              type: "integer",
            },
          },
        },

        Refund: {
          type: "object",
          properties: {
            gatewayRefundId: {
              type: "string",
              nullable: true,
            },
            amount: {
              type: "number",
              description: "Refunded amount in rupees (always the full paid amount)",
            },
            status: {
              type: "string",
              enum: ["PENDING", "PROCESSED", "FAILED"],
            },
            reason: {
              type: "string",
              nullable: true,
            },
            requestedAt: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            completedAt: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
          },
        },

        Payment: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            orderId: {
              type: "string",
            },
            gateway: {
              type: "string",
              enum: ["RAZORPAY", "MOCK"],
              description: "MOCK is used when no Razorpay credentials are configured (development/test)",
            },
            gatewayOrderId: {
              type: "string",
            },
            gatewayPaymentId: {
              type: "string",
              nullable: true,
            },
            amount: {
              type: "number",
              description: "Amount in rupees, always the server-side order total",
            },
            currency: {
              type: "string",
            },
            status: {
              type: "string",
              enum: ["PENDING", "PAID", "FAILED", "REFUNDED"],
            },
            refund: {
              $ref: "#/components/schemas/Refund",
              nullable: true,
            },
            keyId: {
              type: "string",
              nullable: true,
              description: "Public Razorpay key id for the checkout widget (never the secret)",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        SettlementOrder: {
          type: "object",
          properties: {
            orderId: {
              type: "string",
            },
            orderNumber: {
              type: "string",
            },
            total: {
              type: "number",
            },
            commissionRate: {
              type: "number",
              description: "Commission rate snapshotted at generation",
            },
            commissionAmount: {
              type: "number",
            },
            sellerPayable: {
              type: "number",
            },
            deliveredAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        Settlement: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            sellerId: {
              type: "string",
            },
            periodKey: {
              type: "string",
              description: "Month covered (YYYY-MM)",
            },
            periodStart: {
              type: "string",
              format: "date-time",
            },
            periodEnd: {
              type: "string",
              format: "date-time",
            },
            status: {
              type: "string",
              enum: ["PENDING", "PROCESSING", "PAID", "FAILED", "CANCELLED"],
            },
            orders: {
              type: "array",
              items: {
                $ref: "#/components/schemas/SettlementOrder",
              },
            },
            totalSales: {
              type: "number",
            },
            totalCommission: {
              type: "number",
            },
            totalPayable: {
              type: "number",
            },
            commissionRate: {
              type: "number",
              description: "Platform commission rate used for this settlement",
            },
            paidAt: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            reminderSentAt: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        PaginatedSettlements: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                $ref: "#/components/schemas/Settlement",
              },
            },
            page: {
              type: "integer",
            },
            limit: {
              type: "integer",
            },
            total: {
              type: "integer",
            },
            totalPages: {
              type: "integer",
            },
          },
        },

        Review: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            userId: {
              type: "string",
            },
            userName: {
              type: "string",
            },
            userAvatarUrl: {
              type: "string",
              format: "uri",
              nullable: true,
            },
            productId: {
              type: "string",
            },
            rating: {
              type: "integer",
              minimum: 1,
              maximum: 5,
            },
            comment: {
              type: "string",
              nullable: true,
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        ReviewInput: {
          type: "object",
          required: ["productId", "rating"],
          properties: {
            productId: {
              type: "string",
              description: "Product ObjectId",
            },
            rating: {
              type: "integer",
              minimum: 1,
              maximum: 5,
            },
            comment: {
              type: "string",
              maxLength: 1000,
            },
          },
        },

        ReviewUpdate: {
          type: "object",
          properties: {
            rating: {
              type: "integer",
              minimum: 1,
              maximum: 5,
            },
            comment: {
              type: "string",
              maxLength: 1000,
              nullable: true,
            },
          },
        },

        ProductReviews: {
          type: "object",
          properties: {
            productId: {
              type: "string",
            },
            averageRating: {
              type: "number",
            },
            reviewCount: {
              type: "integer",
            },
            items: {
              type: "array",
              items: {
                $ref: "#/components/schemas/Review",
              },
            },
            page: {
              type: "integer",
            },
            limit: {
              type: "integer",
            },
            total: {
              type: "integer",
            },
            totalPages: {
              type: "integer",
            },
          },
        },

        AdminUser: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            name: {
              type: "string",
            },
            email: {
              type: "string",
              format: "email",
            },
            role: {
              type: "string",
              enum: [
                "BUYER",
                "SELLER",
                "SUPER_ADMIN",
              ],
            },
            authProvider: {
              type: "string",
            },
            isEmailVerified: {
              type: "boolean",
            },
            isActive: {
              type: "boolean",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        AdminUserList: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                $ref: "#/components/schemas/AdminUser",
              },
            },
            page: {
              type: "integer",
            },
            limit: {
              type: "integer",
            },
            total: {
              type: "integer",
            },
            totalPages: {
              type: "integer",
            },
          },
        },

        AdminSeller: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            userId: {
              type: "string",
            },
            businessName: {
              type: "string",
            },
            phone: {
              type: "string",
              nullable: true,
            },
            gstin: {
              type: "string",
            },
            pan: {
              type: "string",
            },
            status: {
              type: "string",
              enum: [
                "PENDING",
                "APPROVED",
                "REJECTED",
                "PAUSED",
                "SUSPENDED",
              ],
            },
            statusReason: {
              type: "string",
              nullable: true,
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        AdminSellerList: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                $ref: "#/components/schemas/AdminSeller",
              },
            },
            page: {
              type: "integer",
            },
            limit: {
              type: "integer",
            },
            total: {
              type: "integer",
            },
            totalPages: {
              type: "integer",
            },
          },
        },

        AdminProduct: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            sellerId: {
              type: "string",
            },
            name: {
              type: "string",
            },
            price: {
              type: "number",
            },
            stock: {
              type: "integer",
            },
            status: {
              type: "string",
              enum: [
                "DRAFT",
                "ACTIVE",
                "INACTIVE",
              ],
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        AdminProductList: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                $ref: "#/components/schemas/AdminProduct",
              },
            },
            page: {
              type: "integer",
            },
            limit: {
              type: "integer",
            },
            total: {
              type: "integer",
            },
            totalPages: {
              type: "integer",
            },
          },
        },

        AdminOrder: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            orderNumber: {
              type: "string",
            },
            userId: {
              type: "string",
            },
            sellerId: {
              type: "string",
            },
            itemCount: {
              type: "integer",
            },
            total: {
              type: "number",
            },
            paymentStatus: {
              type: "string",
              enum: ["PENDING", "PAID", "FAILED", "REFUNDED"],
            },
            status: {
              type: "string",
              enum: [
                "PENDING",
                "CONFIRMED",
                "SHIPPED",
                "DELIVERED",
                "CANCELLED",
              ],
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        AdminOrderList: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                $ref: "#/components/schemas/AdminOrder",
              },
            },
            page: {
              type: "integer",
            },
            limit: {
              type: "integer",
            },
            total: {
              type: "integer",
            },
            totalPages: {
              type: "integer",
            },
          },
        },

        /*
         * One entry of the audit ledger as returned by
         * GET /api/v1/admin/audit-logs.
         */
        AuditLog: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Audit log entry ObjectId",
            },
            actorId: {
              type: "string",
              description:
                'User ObjectId, or a system actor ("system", "webhook")',
            },
            actorName: {
              type: "string",
              nullable: true,
              description:
                "Actor's name resolved from the Users collection at read time; null for system actors and deleted users",
              example: "Parv Admin",
            },
            actorEmail: {
              type: "string",
              nullable: true,
              description:
                "Actor's email resolved from the Users collection at read time; null for system actors and deleted users",
              example: "admin@nexcart.test",
            },
            actorRole: {
              type: "string",
              description:
                "Role recorded at write time: BUYER, SELLER, SUPER_ADMIN or SYSTEM",
              example: "SUPER_ADMIN",
            },
            action: {
              type: "string",
              description:
                "Action key, e.g. USER_STATUS_UPDATE, ORDER_CREATED, SELLER_REGISTERED",
              example: "USER_STATUS_UPDATE",
            },
            entityType: {
              type: "string",
              description:
                "Entity the action targeted, e.g. USER, ORDER, SELLER, PRODUCT, SETTLEMENT",
              example: "USER",
            },
            entityId: {
              type: "string",
              nullable: true,
              description:
                "ObjectId of the affected entity, null when the entry has no entity",
            },
            before: {
              type: "object",
              nullable: true,
              additionalProperties: true,
              description:
                "Free-form state before the action (shape depends on the action)",
            },
            after: {
              type: "object",
              nullable: true,
              additionalProperties: true,
              description:
                "Free-form state after the action (shape depends on the action)",
            },
            metadata: {
              type: "object",
              nullable: true,
              additionalProperties: true,
              description:
                "Free-form extra context (e.g. the reason supplied with a status change)",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        AuditLogList: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                $ref: "#/components/schemas/AuditLog",
              },
            },
            page: {
              type: "integer",
              description: "Current 1-based page",
              example: 1,
            },
            limit: {
              type: "integer",
              description: "Page size that was applied",
              example: 20,
            },
            total: {
              type: "integer",
              description:
                "Total entries matching the filters (not just this page)",
            },
            totalPages: {
              type: "integer",
              description: "0 when nothing matches",
            },
          },
        },

        ErrorResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            message: {
              type: "string",
            },
            code: {
              type: "string",
            },
            errors: {
              type: "object",
              nullable: true,
            },
          },
        },
      },
    },
  },

  apis: [
    "./src/modules/**/*.routes.ts",
    "./src/routes/*.ts",
  ],

  failOnErrors: true,
};

export const swaggerSpec =
  swaggerJSDoc(options);