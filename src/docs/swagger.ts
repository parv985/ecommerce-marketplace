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
            avatar: {
              type: "string",
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
                type: "string",
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
              exclusiveMinimum: 0,
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
                type: "string",
                format: "uri",
              },
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
              exclusiveMinimum: 0,
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
                type: "string",
                format: "uri",
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
            avatar: {
              type: "string",
              nullable: true,
            },
            isEmailVerified: {
              type: "boolean",
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
            avatar: {
              type: "string",
              format: "uri",
              nullable: true,
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
                          type: "string",
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
            },
            total: {
              type: "number",
            },
            paymentMethod: {
              type: "string",
              enum: ["CASH_ON_DELIVERY"],
            },
            paymentStatus: {
              type: "string",
              enum: ["PENDING", "PAID"],
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
            userAvatar: {
              type: "string",
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
              enum: ["PENDING", "PAID"],
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