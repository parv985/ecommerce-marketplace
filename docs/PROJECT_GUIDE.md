# E-Commerce Marketplace Backend — Complete Project Guide

> **A comprehensive guide covering architecture, APIs, testing, demo preparation, and honest project assessment.**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack & Why Each Technology](#2-tech-stack--why-each-technology)
3. [Folder & File Structure](#3-folder--file-structure)
4. [How the Backend is Organized](#4-how-the-backend-is-organized)
5. [Request Flow (Entry Point to Response)](#5-request-flow-entry-point-to-response)
6. [All APIs by Module](#6-all-apis-by-module)
7. [Functionalities & How to Demonstrate Them](#7-functionalities--how-to-demonstrate-them)
8. [Postman Testing Sequence](#8-postman-testing-sequence)
9. [Payment Flow — What's Implemented vs Missing](#9-payment-flow--whats-implemented-vs-missing)
10. [Incomplete/Missing Integrations](#10-incompletemissing-integrations)
11. [Mentor Demonstration Plan (15–20 min)](#11-mentor-demonstration-plan-1520-min)
12. [What to Say to Your Mentor](#12-what-to-say-to-your-mentor)
13. [Final Preparation Checklist](#13-final-preparation-checklist)
14. [Likely Mentor Questions & Answers](#14-likely-mentor-questions--answers)

---

## 1. Project Overview

### What the Project Does

This is a **multi-vendor e-commerce marketplace backend** — think Amazon or Flipkart, where multiple sellers can register, list products, and buyers can browse, add to cart, and place orders. The backend handles the entire business lifecycle:

- **Buyers** register, browse products, manage cart, place orders, make payments, request returns, leave reviews
- **Sellers** register (pending admin approval), manage products, view orders, create discounts/coupons, track analytics, receive settlements
- **Admins** approve sellers, manage users/categories, oversee orders, handle settlements, send notifications
- **Platform** handles payments (COD + online via Razorpay), notifications, commission calculation, and audit logging
`
### Main Business Flow

```
Buyer Register → Browse Products → Add to Cart → Apply Coupon/Discount
    → Checkout → Payment (COD or Online) → Order Confirmed
    → Seller Ships → Buyer Receives → Review
    → Settlement (1st-7th of month) → Seller Gets Paid
```

### What's Implemented

| Feature | Status |
|---------|--------|
| Authentication (JWT + Refresh Tokens) | ✅ Complete |
| Google OAuth | ✅ Complete |
| TOTP 2FA (Sellers/Admins) | ✅ Complete |
| Seller Registration + Approval | ✅ Complete |
| Product CRUD + Ownership | ✅ Complete |
| Categories (Admin-managed) | ✅ Complete |
| Cart (with double-submit protection) | ✅ Complete |
| Orders (multi-seller split, stock management) | ✅ Complete |
| Payments (COD + Razorpay Mock/Real) | ✅ Complete |
| Discounts (product/category, date-windowed) | ✅ Complete |
| Coupons (percentage/fixed, usage limits) | ✅ Complete |
| Reviews (ownership, one-per-user-per-product) | ✅ Complete |
| Returns (7-day window, stock restore) | ✅ Complete |
| Notifications (in-app + email) | ✅ Complete |
| Cloudinary File Upload (images/documents) | ✅ Complete |
| Wishlist | ✅ Complete |
| Product SKU & Specifications | ✅ Complete |
| Inventory Transactions | ✅ Complete |
| Order Invoice | ✅ Complete |
| Order Tracking Timeline | ✅ Complete |
| Mandatory 2FA (Sellers/Admins) | ✅ Complete |
| Redis Caching (Product Catalog) | ✅ Complete |
| Background Job Queue (Bull) | ✅ Complete |
| Real SMTP Configuration | ✅ Complete |
| Analytics (seller dashboard, revenue) | ✅ Complete |
| Settlements (monthly, commission-based) | ✅ Complete |
| Admin Management | ✅ Complete |
| Audit Logging | ✅ Complete |
| Swagger Documentation | ✅ Complete (100 ops) |
| Postman Collection | ✅ Complete (100 requests) |

---

## 2. Tech Stack & Why Each Technology

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **Node.js** | Runtime | Non-blocking I/O ideal for API servers; huge ecosystem |
| **TypeScript** | Type safety | Catches bugs at compile time; better IDE support; self-documenting types |
| **Express 5** | HTTP framework | Mature, minimal, well-documented; routes → middleware → handlers |
| **MongoDB + Mongoose** | Database | Flexible schema for evolving product/order models; atomic operations for concurrency |
| **Zod** | Validation | TypeScript-first schema validation; auto-generates types from schemas |
| **JWT (jsonwebtoken)** | Authentication | Stateless tokens; access + refresh pattern; httpOnly cookies for refresh |
| **bcryptjs** | Password hashing | Industry-standard salted hashing (12 rounds) |
| **swagger-jsdoc + swagger-ui-express** | API docs | Interactive documentation; generates from JSDoc annotations in route files |
| **helmet** | Security headers | Sets HTTP security headers (CSP, HSTS, etc.) |
| **express-rate-limit** | Rate limiting | Prevents brute-force attacks (20 req/15min on auth, 300 on API) |
| **nodemailer** | Email sending | Ethereal test accounts in dev; production-ready for SMTP |
| **Cloudinary** | File storage | Cloud-based image/document storage; auto-optimization, transforms, CDN |
| **multer** | File upload | Multipart form-data parsing for file uploads (memory storage) |
| **vitest + supertest** | Testing | Fast test runner; supertest for HTTP integration tests |
| **cookie-parser** | Cookie handling | Parses httpOnly refresh tokens from cookies |
| **cors** | Cross-origin | Restricts API access to frontend origin only |

---

## 3. Folder & File Structure

```
ecommerce-marketplace/
├── src/
│   ├── app.ts                    # Express app setup (middleware, routes, error handling)
│   ├── server.ts                 # Entry point: connects DB, starts listening
│   │
│   ├── config/
│   │   ├── env.ts                # Environment variables (validated with Zod)
│   │   ├── database.ts           # MongoDB connection setup
│   │   ├── logger.ts             # Structured logging
│   │   └── cloudinary.ts         # Cloudinary SDK configuration
│   │
│   ├── constants/
│   │   ├── roles.ts              # UserRole enum: BUYER, SELLER, SUPER_ADMIN
│   │   ├── orderStatus.ts        # OrderStatus, PaymentMethod, PaymentStatus enums
│   │   ├── sellerStatus.ts       # SellerStatus: PENDING, APPROVED, REJECTED, PAUSED, SUSPENDED
│   │   ├── productStatus.ts      # ProductStatus: DRAFT, ACTIVE, INACTIVE
│   │   ├── payment.ts            # PaymentGateway, PaymentRecordStatus, RefundStatus enums
│   │   ├── notificationTypes.ts  # NotificationType and NotificationChannel enums
│   │   ├── settlementStatus.ts   # SettlementStatus: PENDING, CALCULATED, PROCESSING, PAID, etc.
│   │   └── cookies.ts            # Cookie name constants
│   │
│   ├── docs/
│   │   └── swagger.ts            # OpenAPI/Swagger definition (100 operations documented)
│   │
│   ├── errors/
│   │   └── AppError.ts           # Custom error class with status code and error code
│   │
│   ├── middlewares/
│   │   ├── authenticate.ts       # Extracts & verifies JWT access token
│   │   ├── role.middleware.ts     # authorize(...roles) — role-based access control
│   │   ├── validation.middleware.ts # Zod schema validation for body/query/params
│   │   ├── upload.middleware.ts   # Multer file upload (images/documents)
│   │   ├── error.middleware.ts    # Centralized error handler (AppError → JSON response)
│   │   └── notFound.middleware.ts # 404 handler for unmatched routes
│   │
│   ├── models/                   # Mongoose schemas & models (20 models)
│   │   ├── User.ts               # Users with roles, 2FA fields, recovery codes
│   │   ├── Seller.ts             # Seller profiles (GSTIN, PAN, bank, address, documents)
│   │   ├── Product.ts            # Products with stock, status, category, images (Cloudinary)
│   │   ├── Category.ts           # Admin-managed categories
│   │   ├── Cart.ts               # One cart per user with checkout lock
│   │   ├── Order.ts              # Orders with items, pricing breakdown, status
│   │   ├── Payment.ts            # Payment records with refund tracking
│   │   ├── Discount.ts           # Seller-created sales discounts
│   │   ├── Coupon.ts             # Coupon codes with usage limits
│   │   ├── CouponUsage.ts        # Tracks who used which coupon
│   │   ├── Review.ts             # Product reviews (one per user per product)
│   │   ├── ReturnRequest.ts      # Return requests with status lifecycle
│   │   ├── Notification.ts       # In-app notifications
│   │   ├── NotificationPreference.ts # User notification settings
│   │   ├── Address.ts            # Saved shipping addresses
│   │   ├── RefreshToken.ts       # Rotating refresh tokens (hashed)
│   │   ├── PasswordResetToken.ts # Password reset tokens
│   │   ├── AuditLog.ts           # Audit trail for important actions
│   │   ├── PlatformSetting.ts    # Configurable platform settings (commission rate)
│   │   └── Settlement.ts         # Monthly seller settlements
│   │
│   ├── modules/                  # Feature modules (16 modules)
│   │   ├── auth/                 # Authentication (register, login, refresh, logout, 2FA, OAuth)
│   │   ├── sellers/              # Seller profile management
│   │   ├── products/             # Product CRUD, search, filtering
│   │   ├── categories/           # Category management
│   │   ├── users/                # User profile, addresses
│   │   ├── cart/                 # Shopping cart operations
│   │   ├── orders/               # Order creation, lifecycle, cancellation
│   │   ├── payments/             # Payment processing, webhooks, refunds
│   │   ├── discounts/            # Seller discount management
│   │   ├── coupons/              # Coupon creation and validation
│   │   ├── reviews/              # Product reviews
│   │   ├── returns/              # Return request management
│   │   ├── notifications/        # In-app + email notifications
│   │   ├── wishlist/             # Wishlist management
│   │   ├── inventory/            # Inventory transaction tracking
│   │   ├── analytics/            # Seller dashboard and analytics
│   │   ├── settlements/          # Monthly settlement generation
│   │   └── admin/                # Admin management (users, sellers, orders, settings)
│   │
│   ├── services/
│   │   ├── audit.service.ts      # Reusable audit logging
│   │   ├── email.service.ts      # Email sending with retry (SMTP or Ethereal)
│   │   ├── cloudinary.service.ts # Cloudinary upload/delete service
│   │   └── queue/                # Background job queue (Bull + Redis)
│   │       ├── queue.config.ts   # Queue configuration
│   │       └── workers.ts        # Job workers (email, notifications)
│   │
│   ├── utils/
│   │   ├── jwt.ts                # JWT sign/verify (access + refresh + pending-2FA tokens)
│   │   ├── tokenHash.ts          # SHA-256 hashing for tokens/codes
│   │   ├── totp.ts               # TOTP generation/verification (Google Authenticator compatible)
│   │   ├── secretCipher.ts       # AES-256-GCM encryption for TOTP secrets at rest
│   │   ├── asyncHandler.ts       # Express async error wrapper
│   │   └── apiResponse.ts        # sendSuccess/sendError response helpers
│   │
│   ├── types/
│   │   └── user.types.ts         # TypeScript interfaces (IUser, etc.)
│   │
│   └── routes/
│       └── index.ts              # Main router: mounts all module routes under /api/v1
│
├── docs/
│   ├── architecture.md           # Reliability decisions (Redis, queues, locking, idempotency)
│   ├── postman-collection.json   # Postman collection (100 requests)
│   ├── postman-environments.json # Postman environment variables
│   ├── POSTMAN_TESTING_GUIDE.md  # Complete Postman testing instructions
│   └── PROJECT_GUIDE.md          # This file
│
├── tests/
│   ├── setup.ts                  # Test database setup and teardown
│   ├── helpers.ts                # Shared test utilities (register, login, approve seller)
│   ├── *.test.ts                 # Integration tests (142 tests total)
│   ├── e2e-*.sh                  # Manual E2E scripts (15 scripts)
│   ├── seed-admin.ts             # Admin account seeder
│   ├── generate-postman.ts       # Postman collection generator
│   └── debug-swagger.ts          # Swagger spec validator
│
├── .env.example                  # Environment variable template
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── vitest.config.ts              # Test runner configuration
└── README.md                     # Project documentation
```

---

## 4. How the Backend is Organized

### Layered Architecture

Every module follows the same pattern:

```
Route → Controller → Service → Repository → Model
```

| Layer | Responsibility | Example |
|-------|---------------|---------|
| **Route** | HTTP method + path + middleware chain | `router.post("/", authenticate, authorize(SELLER), validate(schema), handler)` |
| **Controller** | Extracts request data, calls service, sends response | `req.body`, `req.params`, `req.user` → service → `sendSuccess(res, ...)` |
| **Service** | Business logic, validation, authorization checks | "Does this product belong to this seller?" |
| **Repository** | Database queries (Mongoose operations) | `Product.find({ sellerId, status })` |
| **Model** | Mongoose schema definition | Fields, types, indexes, defaults |

### Why This Separation

- **Controllers** stay thin — no business logic, just request/response plumbing
- **Services** are testable in isolation (no Express dependency)
- **Repositories** encapsulate database access (easy to swap Mongoose for raw MongoDB)
- **Models** define data structure independently of HTTP

### Module Interaction Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        REQUEST FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│  HTTP Request                                                   │
│       ↓                                                         │
│  app.ts (helmet, CORS, rate-limit, body-parser, cookie-parser) │
│       ↓                                                         │
│  routes/index.ts (mounts /api/v1/auth, /api/v1/products, ...)  │
│       ↓                                                         │
│  Module Router (authenticate → authorize → validate → handler) │
│       ↓                                                         │
│  Controller (extracts data, calls service)                      │
│       ↓                                                         │
│  Service (business logic, ownership checks, calculations)      │
│       ↓                                                         │
│  Repository (Mongoose queries)                                  │
│       ↓                                                         │
│  Model (MongoDB)                                                │
│       ↓                                                         │
│  Response (sendSuccess/sendError → JSON)                        │
└─────────────────────────────────────────────────────────────────┘
```

### Cross-Cutting Concerns

| Concern | Implementation |
|---------|---------------|
| **Authentication** | `authenticate` middleware: extracts Bearer token, verifies JWT, attaches `req.user` |
| **Authorization** | `authorize(...roles)` middleware: checks `req.user.role` against allowed roles |
| **Ownership** | Checked in service layer (e.g., `product.sellerId !== userId` → 403) |
| **Validation** | Zod schemas validated by `validate(schema)` middleware before controller runs |
| **Error Handling** | `AppError` class → `errorMiddleware` → standardized JSON error response |
| **Audit Logging** | `logAudit()` called from services for important actions |
| **Notifications** | `notifyUser()` / `broadcastToSellers()` called from services (fire-and-forget) |
| **Email** | `sendNotificationEmail()` with retry (500ms, 1s backoff) |

---

## 5. Request Flow (Entry Point to Response)

### Step-by-Step: Creating a Product

```
1. HTTP: POST /api/v1/products
   Header: Authorization: Bearer <sellerAccessToken>
   Body: { "name": "Widget", "price": 999, "stock": 50, "category": "<categoryId>" }

2. app.ts:
   - helmet() adds security headers
   - CORS checks origin
   - Rate limiter checks IP (300 req/15min)
   - express.json() parses body
   - Raw body captured for webhook verification (not needed here)

3. routes/index.ts:
   - Matches /api/v1/products → productRoutes

4. product.routes.ts:   
   - POST "/" matched
   - authenticate middleware: verifies JWT → sets req.user = { id, role: "SELLER" }
   - authorize(SELLER) middleware: checks role === "SELLER" ✓
   - validate(createProductSchema) middleware: Zod validates body fields
   - asyncHandler(createProductController): wraps controller in try/catch

5. product.controller.ts:
   - Extracts userId from req.user.id
   - Extracts body from req.body
   - Calls createProductForSeller(userId, body)
   - Sends: sendSuccess(res, "Product created", product, 201)

6. product.service.ts:
   - Looks up seller by userId
   - Checks seller.status === "APPROVED" (if not → AppError 403)
   - If categoryId provided, verifies category exists
   - Calls productRepository.create({ sellerId: seller._id, ... })
   - Logs audit: logAudit({ action: "PRODUCT_CREATED", ... })
   - Returns created product

7. product.repository.ts:
   - Product.create({ sellerId, name, price, stock, category, status: "DRAFT" })
   - MongoDB inserts document

8. Response:
   {
     "success": true,
     "message": "Product created",
     "data": {
       "_id": "...",
       "sellerId": "...",
       "name": "Widget",
       "price": 999,
       "stock": 50,
       "status": "DRAFT",
       "createdAt": "..."
     }
   }
```

---

## 6. All APIs by Module

### 6.1 Authentication (14 endpoints)

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| POST | `/auth/register` | Register new user | None | Any |
| POST | `/auth/login` | Login with email/password | None | Any |
| POST | `/auth/refresh` | Rotate refresh token | Cookie | Any |
| POST | `/auth/logout` | Revoke refresh token | Bearer | Any |
| GET | `/auth/me` | Get current user | Bearer | Any |
| POST | `/auth/forgot-password` | Send password reset email | None | Any |
| POST | `/auth/reset-password` | Reset password with token | None | Any |
| POST | `/auth/change-password` | Change password (logged in) | Bearer | Any |
| GET | `/auth/google` | Redirect to Google OAuth | None | Any |
| GET | `/auth/google/callback` | Handle Google OAuth callback | None | Any |
| POST | `/auth/2fa/setup` | Generate TOTP secret + QR | Bearer | Seller/Admin |
| POST | `/auth/2fa/enable` | Enable 2FA with TOTP code | Bearer | Seller/Admin |
| POST | `/auth/2fa/verify` | Verify TOTP during login | Bearer | Any (2FA) |
| POST | `/auth/2fa/disable` | Disable 2FA | Bearer | Seller/Admin |

**Flow: Register → Login → Get Tokens → Access Protected Endpoints**

### 6.2 Sellers (6 endpoints)

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| POST | `/sellers/register` | Register seller (public) | None | Any |
| GET | `/sellers/me` | Get own seller profile | Bearer | Seller |
| PATCH | `/sellers/me` | Update seller profile | Bearer | Seller |
| POST | `/sellers/me/documents` | Upload KYC document | Bearer | Seller |
| DELETE | `/sellers/me/documents/:documentId` | Delete document | Bearer | Seller |

**Note:** New sellers start as `PENDING` status. Admin must approve before they can create products.

**Document Upload (Cloudinary):**
- Content-Type: `multipart/form-data`
- Field names: `document` (file), `documentType` (string)
- Accepted types: JPEG, PNG, PDF
- Max size: 10 MB
- `documentType` examples: GST, PAN, BANK_STATEMENT
- Returns `{ type, url, publicId }`

### 6.3 Products (9 endpoints)

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| GET | `/products` | List products (public) | None | Public |
| GET | `/products/:id` | Get product by ID | None | Public |
| POST | `/products` | Create product | Bearer | Seller (APPROVED) |
| GET | `/products/my` | List own products | Bearer | Seller |
| GET | `/products/my/:id` | Get own product by ID | Bearer | Seller |
| PATCH | `/products/:id` | Update product | Bearer | Seller (owner) |
| DELETE | `/products/:id` | Deactivate product | Bearer | Seller (owner) |
| POST | `/products/:id/images` | Upload product images | Bearer | Seller (owner) |
| DELETE | `/products/:id/images/:imageId` | Delete product image | Bearer | Seller (owner) |

**Image Upload (Cloudinary):**
- Content-Type: `multipart/form-data`
- Field name: `images`
- Max files: 8
- Accepted types: JPEG, PNG, WebP, GIF
- Max size: 5 MB per file
- Images are appended to existing images
- Returns `{ url, publicId }[]`
- Delete by passing `publicId` as `imageId` path parameter

**Query Parameters for listing:**
- `page`, `limit` (pagination)
- `category` (filter by category ID)
- `minPrice`, `maxPrice` (price range)
- `sort` (price_asc, price_desc, newest, oldest)
- `status` (DRAFT, ACTIVE, INACTIVE)
- `search` (text search in name/description)

### 6.4 Categories (5 endpoints)

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| GET | `/categories` | List all categories | None | Public |
| GET | `/categories/:id` | Get category by ID | None | Public |
| POST | `/categories` | Create category | Bearer | Admin |
| PATCH | `/categories/:id` | Update category | Bearer | Admin |
| DELETE | `/categories/:id` | Delete category | Bearer | Admin |

### 6.5 Users (6 endpoints)

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| GET | `/users/me` | Get own profile | Bearer | Any |
| PATCH | `/users/me` | Update profile (name) | Bearer | Any |
| GET | `/users/me/addresses` | List saved addresses | Bearer | Any |
| POST | `/users/me/addresses` | Add address | Bearer | Any |
| PATCH | `/users/me/addresses/:id` | Update address | Bearer | Any (owner) |
| DELETE | `/users/me/addresses/:id` | Delete address | Bearer | Any (owner) |
| POST | `/users/me/avatar` | Upload/replace avatar | Bearer | Any |
| DELETE | `/users/me/avatar` | Delete avatar | Bearer | Any |

**Avatar Upload (Cloudinary):**
- Content-Type: `multipart/form-data`
- Field name: `image`
- Accepted types: JPEG, PNG, WebP, GIF
- Max size: 5 MB
- Previous avatar is automatically deleted from Cloudinary
- Returns `{ avatarUrl: string }`

### 6.6 Cart (5 endpoints)

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| GET | `/cart` | Get cart with items | Bearer | Buyer |
| POST | `/cart/items` | Add item to cart | Bearer | Buyer |
| PATCH | `/cart/items/:id` | Update item quantity | Bearer | Buyer |
| DELETE | `/cart/items/:id` | Remove item from cart | Bearer | Buyer |
| DELETE | `/cart` | Clear entire cart | Bearer | Buyer |

**Important:** Prices are resolved from the database, not client-supplied. Stock is checked before adding.

### 6.7 Orders (8 endpoints)

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| POST | `/orders` | Checkout (create order from cart) | Bearer | Buyer |
| GET | `/orders` | List own orders | Bearer | Buyer/Seller |
| GET | `/orders/:id` | Get order details | Bearer | Buyer/Seller (owner) |
| PATCH | `/orders/:id/status` | Update order status | Bearer | Seller/Admin |
| POST | `/orders/:id/cancel` | Cancel order | Bearer | Buyer (owner) |
| POST | `/orders/:id/pay` | Mark COD order as paid | Bearer | Seller/Admin |
| GET | `/orders/:id/invoice` | Get order invoice | Bearer | Buyer/Seller (owner) |
| GET | `/orders/:id/tracking` | Get order tracking timeline | Bearer | Buyer/Seller (owner) |

**Order Status Flow:**
```
PENDING → CONFIRMED → SHIPPED → DELIVERED
    ↓
CANCELLED (stock restored, coupon released, refund if paid online)
```

**Checkout Process:**
1. Cart is claimed atomically (prevents double-submit)
2. Stock is decremented with `$gte` guard (prevents overselling)
3. Discounts are calculated (product discount beats category, highest wins)
4. Coupon is applied if provided (limits enforced atomically)
5. One order per seller is created
6. If payment method is ONLINE, a Payment record is created

### 6.8 Payments (4 endpoints)

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| POST | `/payments/orders/:id/initiate` | Create payment order | Bearer | Buyer |
| POST | `/payments/orders/:id/verify` | Verify payment signature | Bearer | Buyer |
| POST | `/payments/webhook/razorpay` | Receive Razorpay webhook | None | Webhook |
| POST | `/payments/orders/:id/refund` | Request refund | Bearer | Buyer/Admin |

**Payment Methods:**
- **CASH_ON_DELIVERY:** Seller/Admin marks as paid after delivery
- **ONLINE:** Razorpay gateway (MOCK mode when no credentials configured)

### 6.9 Discounts (5 endpoints)

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| POST | `/discounts` | Create discount | Bearer | Seller |
| GET | `/discounts` | List own discounts | Bearer | Seller |
| GET | `/discounts/:id` | Get discount details | Bearer | Seller (owner) |
| PATCH | `/discounts/:id` | Update discount | Bearer | Seller (owner) |
| DELETE | `/discounts/:id` | Deactivate discount | Bearer | Seller (owner) |

**Discount Rules:**
- Product discount OR category discount (not both)
- Percentage: 1–100%
- Date-windowed (start/end dates)
- Product discount beats category discount at checkout
- Highest percentage wins, never stacked

### 6.10 Coupons (5 endpoints)

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| POST | `/coupons` | Create coupon | Bearer | Seller |
| GET | `/coupons` | List own coupons | Bearer | Seller |
| GET | `/coupons/:id` | Get coupon details | Bearer | Seller (owner) |
| PATCH | `/coupons/:id` | Update coupon | Bearer | Seller (owner) |
| DELETE | `/coupons/:id` | Deactivate coupon | Bearer | Seller (owner) |

**Coupon Features:**
- Percentage or fixed discount
- Minimum order value
- Maximum discount cap
- Product/category restrictions
- Total usage limit + per-user limit
- Atomic concurrency protection (101st concurrent claim fails)

### 6.11 Reviews (4 endpoints)

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| POST | `/reviews` | Create review | Bearer | Buyer |
| GET | `/products/:id/reviews` | Get product reviews | None | Public |
| PATCH | `/reviews/:id` | Update review | Bearer | Buyer (owner) |
| DELETE | `/reviews/:id` | Delete review | Bearer | Buyer (owner) |

**Review Rules:**
- One review per user per product
- Only after delivered order
- Rating: 1–5
- Average rating aggregated server-side

### 6.12 Returns (5 endpoints)

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| POST | `/returns` | Request return | Bearer | Buyer |
| GET | `/returns` | List returns | Bearer | Buyer/Seller |
| GET | `/returns/:id` | Get return details | Bearer | Buyer/Seller (owner) |
| PATCH | `/returns/:id` | Approve/reject return | Bearer | Seller/Admin |
| POST | `/returns/:id/refund` | Process refund | Bearer | Seller/Admin |

**Return Rules:**
- Within 7 days of delivery
- Status: PENDING → APPROVED → COMPLETED | REJECTED | CANCELLED
- Stock restored on completion
- Partial unique index blocks duplicate requests

### 6.13 Notifications (6 endpoints)

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| GET | `/notifications` | List notifications | Bearer | Any |
| GET | `/notifications/unread-count` | Get unread count | Bearer | Any |
| PATCH | `/notifications/:id/read` | Mark as read | Bearer | Any |
| PATCH | `/notifications/read-all` | Mark all as read | Bearer | Any |
| GET | `/notifications/preferences` | Get preferences | Bearer | Any |
| PATCH | `/notifications/preferences` | Update preferences | Bearer | Any |

**Notification Events:** Order confirmed/shipped/delivered/cancelled, payment received/refunded, seller approved/rejected, return status, settlement, admin messages.

### 6.14 Analytics (6 endpoints)

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| GET | `/sellers/analytics/dashboard` | Dashboard stats | Bearer | Seller |
| GET | `/sellers/analytics/sales` | Sales over time | Bearer | Seller |
| GET | `/sellers/analytics/products` | Product performance | Bearer | Seller |
| GET | `/sellers/analytics/customers` | Customer list | Bearer | Seller |
| GET | `/sellers/analytics/revenue` | Revenue statistics | Bearer | Seller |
| GET | `/sellers/analytics/orders` | Order statistics | Bearer | Seller |

**All analytics are MongoDB aggregations scoped to the authenticated seller.**

### 6.15 Admin (17 endpoints)

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| POST | `/admin/login` | Admin login | None | Admin |
| GET | `/admin/users` | List all users | Bearer | Admin |
| GET | `/admin/users/:id` | Get user details | Bearer | Admin |
| PATCH | `/admin/users/:id` | Update user | Bearer | Admin |
| POST | `/admin/users/:id/deactivate` | Deactivate user | Bearer | Admin |
| GET | `/admin/sellers` | List all sellers | Bearer | Admin |
| GET | `/admin/sellers/:id` | Get seller details | Bearer | Admin |
| GET | `/admin/sellers/pending` | List pending sellers | Bearer | Admin |
| POST | `/admin/sellers/:id/approve` | Approve seller | Bearer | Admin |
| POST | `/admin/sellers/:id/reject` | Reject seller | Bearer | Admin |
| POST | `/admin/sellers/:id/suspend` | Suspend seller | Bearer | Admin |
| POST | `/admin/sellers/:id/reactivate` | Reactivate seller | Bearer | Admin |
| GET | `/admin/orders` | List all orders | Bearer | Admin |
| GET | `/admin/orders/:id` | Get order details | Bearer | Admin |
| PATCH | `/admin/orders/:id/status` | Update order status | Bearer | Admin |
| POST | `/admin/settlements/generate` | Generate settlement | Bearer | Admin |
| GET | `/admin/settlements` | List settlements | Bearer | Admin |
| PATCH | `/admin/settlements/:id/process` | Process settlement | Bearer | Admin |
| PATCH | `/admin/settlements/:id/fail` | Mark settlement failed | Bearer | Admin |
| POST | `/admin/commission` | Set commission rate | Bearer | Admin |
| POST | `/admin/notifications/broadcast` | Broadcast message | Bearer | Admin |

### 6.16 System (1 endpoint)

| Method | Endpoint | Purpose | Auth | Role |
|--------|----------|---------|------|------|
| GET | `/health` | Health check | None | Public |

---

## 7. Functionalities & How to Demonstrate Them

### 7.1 User Registration & Login

**How it works:**
1. User sends POST /auth/register with email, password, name, role
2. Password is hashed with bcrypt (12 rounds)
3. JWT access token (15min) + refresh token (7 days, httpOnly cookie) are returned
4. Login with POST /auth/login returns same tokens
5. Refresh with POST /auth/refresh rotates the refresh token (single-use)
6. Logout with POST /auth/logout revokes refresh token

**What to show:**
- Register a buyer → show tokens in response
- Login → show tokens
- Call /auth/me with Bearer token → show user profile
- Try /auth/me without token → 401 error
- Refresh token → new access token
- Logout → refresh token invalidated

### 7.2 Seller Registration & Approval

**How it works:**
1. Register with role: "SELLER" + GSTIN, PAN, bank details, address
2. Seller status starts as PENDING
3. Admin approves via POST /admin/sellers/:id/approve
4. Only APPROVED sellers can create products

**What to show:**
- Register seller → status: PENDING
- Try to create product → 403 "Seller not approved"
- Admin approves → status: APPROVED
- Now seller can create products

### 7.3 Product Management

**How it works:**
1. Seller creates product with name, price, stock, category
2. Product starts as DRAFT status
3. Seller updates status to ACTIVE to make it visible
4. Ownership enforced: seller can only modify own products
5. Buyer can browse, search, filter products

**What to show:**
- Seller creates product → DRAFT status
- Seller updates to ACTIVE → product visible in listing
- Buyer searches for product → finds it
- Try to update another seller's product → 403

### 7.4 Cart & Checkout

**How it works:**
1. Buyer adds product to cart (stock checked, price resolved from DB)
2. Cart shows items with live prices
3. Buyer applies coupon (optional)
4. Checkout creates order(s) — one per seller
5. Stock decremented atomically with $gte guard
6. Cart claimed atomically (prevents double-submit)

**What to show:**
- Add product to cart → show cart with item
- Update quantity → show updated cart
- Checkout → show order created, stock decremented
- Try to checkout same cart again → "CART_CHECKOUT_IN_PROGRESS" or empty cart

### 7.5 Order Lifecycle

**How it works:**
1. Order created as PENDING
2. Seller confirms → CONFIRMED
3. Seller ships → SHIPPED
4. Seller delivers → DELIVERED (sets deliveredAt for return window)
5. Buyer can cancel if PENDING/CONFIRMED (stock restored, coupon released)

**What to show:**
- Create order → PENDING
- Seller updates to SHIPPED
- Seller updates to DELIVERED
- Show order history with timestamps

### 7.6 Discounts & Coupons

**How it works:**
- **Discounts:** Seller creates percentage discount for product/category with date range
- **Coupons:** Seller creates code (e.g., "WELCOME10") with usage limits
- At checkout, discounts calculated automatically (product beats category, highest wins)
- Coupon limits enforced atomically (concurrent protection)

**What to show:**
- Seller creates 10% discount on product
- Buyer adds product to cart → price shows discount applied
- Seller creates coupon "WELCOME10" with 5% off
- Buyer applies coupon at checkout → additional discount

### 7.7 Payments

**How it works:**
- **COD:** Order created, seller marks paid after delivery
- **Online (Razorpay):**
  1. Buyer initiates payment → server creates Razorpay PaymentIntent
  2. Frontend completes payment (or mock in dev)
  3. Buyer verifies signature server-side
  4. Webhook confirms payment (idempotent)
  5. Refund available for online payments

**What to show:**
- Create order with ONLINE payment → payment order created
- Verify payment (mock signature in dev)
- Show payment status updated to PAID
- Request refund → refund processed

### 7.8 Returns

**How it works:**
1. Buyer requests return within 7 days of delivery
2. Seller approves/rejects
3. If approved, stock restored
4. Refund issued if payment was online

**What to show:**
- Buyer requests return → PENDING
- Seller approves → APPROVED
- Stock restored → show product stock increased

### 7.9 Notifications

**How it works:**
1. System generates in-app notifications for events (order, payment, return, etc.)
2. Email sent asynchronously (fire-and-forget with retry)
3. User can set preferences (email on/off, in-app on/off)
4. User marks notifications as read

**What to show:**
- Create order → seller gets notification
- Mark as read → unread count decreases
- Update preferences → disable email notifications

### 7.10 Analytics

**How it works:**
- Dashboard: total orders, revenue, products, pending orders
- Sales over time: MongoDB aggregation by day/week/month
- Product performance: which products sell most
- Customer list: who bought from this seller

**What to show:**
- Seller views dashboard → aggregated stats
- Seller views sales chart → revenue over time
- Seller views top products → best sellers

### 7.11 Settlements

**How it works:**
1. Admin sets commission rate (default 10%)
2. Admin generates monthly settlement (1st-7th of month)
3. Settlement calculates: eligible orders - refunds - commission
4. Admin processes payment to seller
5. Seller views own settlements

**What to show:**
- Admin sets 10% commission
- Admin generates settlement for last month
- Seller views settlement breakdown
- Show: gross sales, refunds, commission, net payable

### 7.12 2FA (Two-Factor Authentication)

**How it works:**
1. Seller/Admin enables 2FA → server generates TOTP secret + QR code
2. User scans QR in Google Authenticator
3. User verifies with 6-digit code → 2FA enabled
4. Next login: password → loginToken → TOTP verify → access tokens
5. Recovery codes provided (shown once, hashed at rest)

**What to show:**
- Enable 2FA → show QR code
- Verify with TOTP code
- Login with 2FA → two-step flow
- Use recovery code → works once, then invalidated

---

## 8. Postman Testing Sequence

### Complete Testing Flow (Dependencies Explained)

**Phase 1: Authentication Setup**
```
1. POST /auth/register (Buyer)
   → Save: buyerAccessToken, buyerRefreshToken, buyerUserId
   
2. POST /auth/register (Seller)
   → Save: sellerAccessToken, sellerRefreshToken, sellerUserId
   
3. POST /auth/register (Admin)
   → Save: adminAccessToken, adminRefreshToken, adminUserId
```

**Phase 2: Admin Approval**
```
4. POST /admin/login (Admin)
   → Save: adminAccessToken
   
5. GET /admin/sellers/pending
   → Find seller from step 2
   
6. POST /admin/sellers/:id/approve
   → Seller status: APPROVED
```

**Phase 3: Category Setup**
```
7. POST /categories (Admin)
   → Save: categoryId
   
8. GET /categories (Public)
   → Verify category exists
```

**Phase 4: Seller Product Setup**
```
9. POST /products (Seller)
   → Save: productId
   
10. GET /products/seller/me (Seller)
    → Verify product listed
    
11. PATCH /products/:id/status (Seller)
    → Set status: ACTIVE
```

**Phase 5: Buyer Shopping Flow**
```
12. GET /products (Public)
    → Find product from step 9
    
13. POST /cart/items (Buyer)
    → Save: cartItemId
    
14. GET /cart (Buyer)
    → Verify cart has item
    
15. POST /orders (Buyer)
    → Save: orderId
```

**Phase 6: Order Lifecycle**
```
16. GET /orders/:id (Buyer)
    → Verify order: status PENDING
    
17. PATCH /orders/:id/status (Seller)
    → Update to: CONFIRMED
    
18. PATCH /orders/:id/status (Seller)
    → Update to: SHIPPED
    
19. PATCH /orders/:id/status (Seller)
    → Update to: DELIVERED
```

**Phase 7: Payment (COD)**
```
20. PATCH /payments/orders/:id/mark-paid (Seller/Admin)
    → paymentStatus: PAID
```

**Phase 8: Reviews**
```
21. POST /reviews (Buyer)
    → Save: reviewId
    
22. GET /products/:id/reviews (Public)
    → Verify review exists
```

**Phase 9: Returns**
```
23. POST /returns (Buyer)
    → Save: returnId
    
24. PATCH /returns/:id (Seller)
    → Approve return
    
25. POST /returns/:id/refund (Seller)
    → Process refund
```

**Phase 10: Discounts**
```
26. POST /discounts (Seller)
    → Save: discountId
    
27. GET /discounts (Seller)
    → Verify discount listed
```

**Phase 11: Coupons**
```
28. POST /coupons (Seller)
    → Save: couponId
    
29. GET /coupons (Seller)
    → Verify coupon listed
```

**Phase 12: Notifications**
```
30. GET /notifications (Buyer)
    → Verify notifications from order/return
    
31. PATCH /notifications/:id/read (Buyer)
    → Mark as read
    
32. GET /notifications/unread-count (Buyer)
    → Count decreased
```

**Phase 13: Analytics**
```
33. GET /sellers/analytics/dashboard (Seller)
    → Show aggregated stats
    
34. GET /sellers/analytics/sales (Seller)
    → Show sales over time
```

**Phase 14: Settlements**
```
35. POST /admin/commission (Admin)
    → Set commission rate
    
36. POST /admin/settlements/generate (Admin)
    → Generate settlement
    
37. GET /admin/settlements (Admin)
    → Verify settlement
```

### Data You Must Save from Each Step

| Step | Variable | Description |
|------|----------|-------------|
| 1 | `buyerAccessToken` | JWT for buyer |
| 2 | `sellerAccessToken` | JWT for seller |
| 3 | `adminAccessToken` | JWT for admin |
| 5 | `sellerId` | Seller's MongoDB ID |
| 7 | `categoryId` | Category MongoDB ID |
| 9 | `productId` | Product MongoDB ID |
| 13 | `cartItemId` | Cart item ID |
| 15 | `orderId` | Order MongoDB ID |
| 21 | `reviewId` | Review MongoDB ID |
| 23 | `returnId` | Return request ID |
| 26 | `discountId` | Discount MongoDB ID |
| 28 | `couponId` | Coupon MongoDB ID |
| 36 | `settlementId` | Settlement MongoDB ID |

---

## 9. Payment Flow — What's Implemented vs Missing

### What's Implemented ✅

| Feature | Status | Details |
|---------|--------|---------|
| Payment Model | ✅ | `Payment` collection with orderId, gateway, amount, status, refund tracking |
| Razorpay Gateway Abstraction | ✅ | `razorpay.service.ts` with MOCK mode (no credentials needed for dev) |
| Create Payment Order | ✅ | `POST /payments/orders/:id/initiate` — creates Razorpay PaymentIntent |
| Verify Payment | ✅ | `POST /payments/orders/:id/verify` — HMAC signature verification |
| Webhook Handler | ✅ | `POST /payments/webhook/razorpay` — signature check + idempotent processing |
| Refund Processing | ✅ | `POST /payments/orders/:id/refund` — full amount refund |
| COD Payment | ✅ | Seller/Admin marks as paid after delivery |
| Payment Status Tracking | ✅ | PENDING → PAID → REFUNDED (on Payment model) |
| Order Payment Integration | ✅ | Order.paymentMethod, Order.paymentStatus, Order.paymentId |
| Stock Restoration on Cancel | ✅ | Online payments trigger refund on cancellation |
| Idempotency | ✅ | Duplicate webhook events are no-ops |
| Mock Mode | ✅ | Deterministic mock when no Razorpay credentials configured |

### What's Missing / Not Production-Ready ⚠️

| Feature | Status | What's Missing |
|---------|--------|----------------|
| Real Razorpay Credentials | ⚠️ | No credentials in .env — using MOCK mode. Need `RAZORPAY_SECRET_KEY`, `RAZORPAY_WEBHOOK_SECRET` from Razorpay dashboard |
| Frontend Payment UI | ❌ | Backend only — no Razorpay checkout form. Frontend needed to complete payment flow |
| Partial Refunds | ❌ | Only full-amount refunds implemented. No partial refund support |
| Multiple Payment Attempts | ⚠️ | If payment fails, user must re-initiate. No retry mechanism |
| Payment Reconciliation | ❌ | No automated reconciliation between Razorpay dashboard and local records |
| Settlement Integration | ⚠️ | Settlement calculates from order totals but doesn't auto-initiate bank transfers |
| Payment Analytics | ⚠️ | Basic payment stats in analytics, but no dedicated payment reporting |
| Currency Support | ⚠️ | Only INR hardcoded. No multi-currency support |
| Webhook Retry Handling | ✅ | Razorpay retries failed webhooks; handler is idempotent |
| Payment Gateway Errors | ⚠️ | Gateway errors logged but no user-friendly error messages |
| Transaction Rollback | ⚠️ | Stock rolled back on failure, but no compensating transactions for complex flows |

### Environment Variables Needed for Production

```env
# Razorpay (get from https://dashboard.razorpay.com/apikeys)
RAZORPAY_SECRET_KEY=sk_test_xxxxx
RAZORPAY_PUBLISHABLE_KEY=pk_test_xxxxx
RAZORPAY_WEBHOOK_SECRET=whsec_xxxxx  # From Razorpay dashboard → Webhooks
```

### Mock Mode Behavior

When credentials are empty:
- `initiatePayment()` returns deterministic mock data (no real Razorpay call)
- `verifyPayment()` uses deterministic signature (always passes in dev)
- `processWebhook()` processes mock events
- Tests run end-to-end without real money

---

## 10. Incomplete/Missing Integrations

### Fully Implemented ✅

| Integration | Notes |
|-------------|-------|
| JWT Authentication | Access + refresh tokens, rotation, httpOnly cookies |
| Google OAuth | Authorization code flow, redirect to frontend |
| TOTP 2FA | Google Authenticator compatible, recovery codes |
| Email (Nodemailer) | Ethereal test accounts in dev; production-ready for SMTP |
| Razorpay Payments | MOCK mode for dev; real mode with credentials |
| Swagger Documentation | 100 operations documented |
| Audit Logging | Centralized service, wired into key actions |
| Notification System | In-app + email, preference-based |
| Commission System | Configurable, snapshotted per settlement |

### Partially Implemented ⚠️

| Integration | What's Missing |
|-------------|----------------|
| **Email Service** | Uses Ethereal test accounts in dev (emails viewable at ethereal.email). For production, need SMTP credentials (Gmail, SendGrid, etc.) |
| **Google OAuth** | Backend works, but needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` from Google Cloud Console. Redirect URI must match exactly |
| **Razorpay Webhooks** | Endpoint works but needs real webhook URL registered in Razorpay dashboard. Local dev requires ngrok or similar tunnel |
| **Push Notifications** | In-app notifications implemented, but no browser/mobile push notification integration |

### Not Implemented ❌

| Feature | What's Needed |
|---------|---------------|
| **Wishlist** | No wishlist model or endpoints. Would need: Wishlist model, add/remove/list endpoints |
| **Real SMTP** | Ethereal is dev-only. Production needs SendGrid, AWS SES, or similar |
| **Push Notifications** | No Firebase Cloud Messaging or similar integration |
| **SMS Notifications** | No Twilio/AWS SNS integration |
| **Real-time Updates** | No WebSocket/Socket.io for live order status updates |
| **Search Engine** | Basic MongoDB text search. No Elasticsearch/Algolia for advanced search |
| **Rate Limiting Persistence** | In-memory rate limiter resets on server restart. Need Redis for distributed rate limiting |
| **Scheduled Jobs** | No cron/worker system for automated tasks (settlement reminders, etc.) |

### What Needs Configuration for Production

| Component | Configuration Needed |
|-----------|---------------------|
| **MongoDB** | Atlas cluster or self-hosted with auth enabled |
| **JWT Secrets** | Strong random strings (32+ chars) for ACCESS and REFRESH |
| **CORS** | Set CORS_ORIGIN to actual frontend URL |
| **Email SMTP** | SendGrid, AWS SES, or Gmail app password |
| **Razorpay** | Live mode credentials (not test) |
| **Google OAuth** | Production client ID/secret |
| **Cloudinary** | Cloud name, API key, API secret from https://console.cloudinary.com |
| **SSL/TLS** | HTTPS required for httpOnly cookies in production |
| **Domain** | CORS_ORIGIN and CLIENT_URL must match actual domain |

---

## 11. Mentor Demonstration Plan (15–20 min)

### Minute 0–2: Introduction & Setup

**What to do:**
1. Open terminal in project directory
2. Run `npm run dev`
3. Show "MongoDB connected successfully" and "Server running on http://localhost:5000"
4. Open browser to `http://localhost:5000/api-docs/` (Swagger UI)

**What to say:**
> "This is an e-commerce marketplace backend built with Node.js, TypeScript, Express, and MongoDB. It's a multi-vendor platform where sellers can register, list products, and buyers can purchase. The API is fully documented in Swagger with 100 endpoints."

### Minute 2–4: Architecture Overview

**What to do:**
1. Show `src/` folder structure in VS Code
2. Point out the layered architecture: routes → controllers → services → repositories → models
3. Show one module (e.g., products) with all its files

**What to say:**
> "The backend follows a clean layered architecture. Each module has routes (HTTP endpoints), controllers (request handling), services (business logic), repositories (database queries), and models (data schemas). This separation makes the code testable and maintainable. For example, product ownership is checked in the service layer, not the controller."

### Minute 4–6: Authentication Flow

**What to do:**
1. In Swagger UI, register a buyer (POST /auth/register)
2. Show the access token and refresh token in response
3. Call /auth/me with the token → show user profile
4. Try without token → show 401 error
5. Show refresh token flow (POST /auth/refresh)

**What to say:**
> "Authentication uses JWT with short-lived access tokens (15 minutes) and rotating refresh tokens stored in httpOnly cookies. The refresh token is single-use — each refresh issues a new one and invalidates the old. This prevents token theft from being reusable."

### Minute 6–8: Seller Registration & Approval

**What to do:**
1. Register a seller (POST /auth/register with role: SELLER)
2. Show status is PENDING
3. Try to create product → 403 error
4. Login as admin, approve seller
5. Now seller can create products

**What to say:**
> "New sellers start in PENDING status and can't create products until an admin approves them. This is a two-step verification process. The approval is enforced on the backend — the frontend can't bypass it."

### Minute 8–10: Product Management

**What to do:**
1. Seller creates a product (POST /products)
2. Show product in DRAFT status
3. Update to ACTIVE
4. Buyer searches for product → finds it
5. Show ownership enforcement (try to update another seller's product)

**What to say:**
> "Products have a lifecycle: DRAFT → ACTIVE → INACTIVE. Only APPROVED sellers can create products. Ownership is enforced — a seller can only modify their own products, checked in the service layer, not just the frontend."

### Minute 10–13: Cart & Checkout Flow

**What to do:**
1. Buyer adds product to cart
2. Show cart with live price (not client-supplied)
3. Apply coupon (if available)
4. Checkout → order created
5. Show stock decremented

**What to say:**
> "Cart prices are resolved from the database, never trusted from the client. At checkout, stock is decremented atomically with a MongoDB $gte guard — this prevents concurrent checkouts from overselling. A cart claim prevents double-submit duplicate orders."

### Minute 13–15: Order Lifecycle & Payments

**What to do:**
1. Show order as PENDING
2. Seller confirms → CONFIRMED
3. Seller ships → SHIPPED
4. Seller delivers → DELIVERED
5. Demo COD payment (mark as paid)
6. Show online payment flow (mock mode)

**What to say:**
> "Orders follow a strict status transition: PENDING → CONFIRMED → SHIPPED → DELIVERED. Cancellation is only allowed in PENDING/CONFIRMED states. For payments, we support COD and online via Razorpay. In mock mode, the full payment flow works without real credentials — signatures are verified server-side."

### Minute 15–17: Discounts, Coupons, Returns

**What to do:**
1. Seller creates a discount on a product
2. Buyer adds product → show discounted price
3. Seller creates a coupon code
4. Buyer applies coupon at checkout
5. Buyer requests return
6. Seller approves → stock restored

**What to say:**
> "Discounts are seller-created and date-windowed. Product discounts beat category discounts — never stacked. Coupons have usage limits enforced atomically, so the 101st concurrent claim fails. Returns have a 7-day window from delivery, and completing a return restores stock."

### Minute 17–19: Notifications, Analytics, Settlements

**What to do:**
1. Show notifications generated from order/return
2. Seller views dashboard → aggregated stats
3. Admin generates settlement
4. Show commission calculation

**What to say:**
> "The notification system generates in-app and email notifications for key events. Analytics are MongoDB aggregations scoped to each seller — they see only their own data. Settlements are monthly, with configurable commission (default 10%), snapshotted per settlement so historical records aren't recalculated."

### Minute 19–20: Conclusion & What's Next

**What to do:**
1. Show test results (`npm test` → 142 tests passing)
2. Mention Postman collection (100 requests)
3. Briefly mention what's not production-ready

**What to say:**
> "The backend has 142 passing tests covering auth, products, orders, payments, and admin flows. For production, we'd need real Razorpay credentials, SMTP setup, file storage for images, and Redis for distributed rate limiting. The mock mode allows full development and testing without external services."

---

## 12. What to Say to Your Mentor

### Authentication
> "We use JWT with a dual-token system: short-lived access tokens (15 minutes) for API requests, and rotating refresh tokens stored in httpOnly cookies. Each refresh invalidates the old token, preventing token reuse if stolen. For sellers and admins, we support TOTP 2FA — the secret is encrypted at rest with AES-256-GCM, and recovery codes are stored hashed."

### Database Design
> "MongoDB with Mongoose gives us flexible schemas for evolving product and order models. We use atomic operations for concurrency — stock decrements with $gte guards, cart claims for double-submit protection, and sparse unique indexes for idempotent webhook processing. No distributed locks needed at our scale."

### Security
> "Passwords are hashed with bcrypt (12 rounds). Rate limiting: 20 requests/15 minutes on auth endpoints, 300 on general API. Payment status is never trusted from the client — signatures are re-derived server-side. The centralized error handler prevents internal details from leaking in production responses."

### Business Logic
> "The checkout flow is complex: it claims the cart atomically, decrements stock with concurrent guards, calculates discounts (product beats category, highest wins), applies coupons with atomic usage limits, and creates one order per seller. If anything fails, stock is rolled back. This ensures consistency even under concurrent requests."

### What's Production-Ready
> "The core marketplace flow is complete: authentication, seller approval, product management, cart, checkout, orders, payments (mock mode), discounts, coupons, returns, notifications, analytics, and settlements. The mock payment mode allows full testing without real credentials."

### What's Not Production-Ready
> "For production deployment, we'd need: real Razorpay credentials, SMTP email service, file storage for product images and seller documents, Redis for distributed rate limiting, and a real-time update mechanism (WebSocket) for order status changes. The architecture is ready for these integrations — we just need to swap the mock implementations."

### Architecture Decisions
> "We chose atomic MongoDB operations over distributed locks because the application runs as a single instance. If we scale to multiple instances, Redis-backed locking would be the first addition. Similarly, we skipped background job queues because all long-running work (emails, notifications) is fire-and-forget and doesn't block request handling."

### Testing Strategy
> "We have 142 integration tests covering success and failure paths: authentication flows, product CRUD with ownership checks, order lifecycle, payment verification, and admin operations. The tests run against a separate test database and clean up after themselves. We also have 15 E2E shell scripts that test complete business flows end-to-end."

---

## 13. Final Preparation Checklist

### Before the Demo

- [ ] **Start MongoDB** — local instance or Atlas cluster running
- [ ] **Run `npm install`** — ensure all dependencies installed
- [ ] **Create `.env` from `.env.example`** — fill in required values:
  - [ ] `MONGODB_URI` (local: `mongodb://localhost:27017/ecommerce_marketplace`)
  - [ ] `JWT_ACCESS_SECRET` (generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
  - [ ] `JWT_REFRESH_SECRET` (generate similarly)
- [ ] **Run `npm run dev`** — server starts on port 5000
- [ ] **Open Swagger UI** — `http://localhost:5000/api-docs/`
- [ ] **Run `npm test`** — verify 142 tests pass
- [ ] **Test key flows manually** — register, login, create product, checkout
- [ ] **Prepare test data** — have sample requests ready in Postman/Swagger

### APIs to Test Before Demo

| Priority | API | Why |
|----------|-----|-----|
| 1 | POST /auth/register | Must work for buyer/seller/admin |
| 2 | POST /auth/login | Must return valid tokens |
| 3 | POST /auth/refresh | Must rotate tokens |
| 4 | GET /auth/me | Must return user profile |
| 5 | POST /admin/sellers/:id/approve | Seller must be approved |
| 6 | POST /products | Seller must create product |
| 7 | POST /cart/items | Buyer must add to cart |
| 8 | POST /orders | Checkout must work |
| 9 | PATCH /orders/:id/status | Order lifecycle must work |
| 10 | POST /discounts | Discount must apply |

### Environment Variables Checklist

| Variable | Required | Dev Value |
|----------|----------|-----------|
| `MONGODB_URI` | ✅ | `mongodb://localhost:27017/ecommerce_marketplace` |
| `JWT_ACCESS_SECRET` | ✅ | Any 32+ char string |
| `JWT_REFRESH_SECRET` | ✅ | Any 32+ char string |
| `PORT` | Optional | `5000` |
| `CORS_ORIGIN` | Optional | `http://localhost:3000` |
| `CLIENT_URL` | Optional | `http://localhost:3000` |
| `RAZORPAY_SECRET_KEY` | Optional | Empty (uses MOCK mode) |
| `RAZORPAY_PUBLISHABLE_KEY` | Optional | Empty (uses MOCK mode) |
| `GOOGLE_CLIENT_ID` | Optional | Empty (OAuth disabled) |
| `GOOGLE_CLIENT_SECRET` | Optional | Empty (OAuth disabled) |

### Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `MongoServerSelectionError` | MongoDB not running | Start MongoDB service |
| `RATE_LIMITED` | Too many requests | Wait 15 minutes or restart server |
| `AUTHENTICATION_REQUIRED` | Missing/expired token | Login again, get new token |
| `FORBIDDEN` | Wrong role | Use correct user (buyer/seller/admin) |
| `Seller not approved` | Seller not approved | Admin must approve seller first |
| `Product not found` | Invalid product ID | Check product exists and ID is correct |
| `CART_CHECKOUT_IN_PROGRESS` | Double-submit | Wait a moment, then retry |
| `Invalid or expired access token` | Token expired | Use refresh token or login again |
| `Cannot read properties of undefined` | Test data missing | Run setup steps in order |

---

## 14. Likely Mentor Questions & Answers

### Q1: "Why MongoDB instead of PostgreSQL?"

**A:** "MongoDB's flexible schema fits e-commerce well — products have varying attributes, orders have complex nested structures, and the schema evolves as features are added. Mongoose gives us schema validation while retaining flexibility. Atomic operations ($inc, findOneAndUpdate with guards) handle concurrency without distributed locks. For our single-instance deployment, MongoDB's document model is simpler and more performant than relational joins."

### Q2: "How do you handle concurrent checkouts?"

**A:** "Three mechanisms: (1) Atomic stock decrement with `$gte` guard — if stock is insufficient, the update returns 0 modified docs and we rollback. (2) Cart claim — `checkoutLockedAt` is set atomically; concurrent checkouts get CART_CHECKOUT_IN_PROGRESS error. (3) Coupon usage limits use atomic `$inc` with `$lt` guard — the 101st concurrent claim fails. No distributed locks needed at our scale."

### Q3: "What about security?"

**A:** "Multiple layers: (1) bcrypt password hashing (12 rounds). (2) JWT with short-lived access tokens (15min) + rotating refresh tokens in httpOnly cookies. (3) Rate limiting (20 req/15min on auth). (4) Input validation with Zod. (5) Role-based authorization + ownership checks. (6) Payment signatures verified server-side (never trust client). (7) helmet security headers. (8) CORS restricted to frontend origin."

### Q4: "How do you ensure data consistency?"

**A:** "MongoDB atomic operations prevent race conditions. Stock decrements use `$inc` with `$gte` guards. Cart claims are atomic. Coupon usage limits use `$lt` guards. Webhook processing uses sparse unique indexes for idempotency. Settlement generation uses unique (sellerId, periodKey) index. All critical operations have rollback mechanisms if downstream steps fail."

### Q5: "What would you do differently?"

**A:** "For production: (1) Add Redis for distributed rate limiting and caching. (2) Use a job queue (BullMQ) for email/notification delivery. (3) Implement file upload service (S3/Cloudinary) for product images. (4) Add WebSocket for real-time order updates. (5) Implement Elasticsearch for advanced product search. (6) Add comprehensive logging (ELK stack or similar)."

### Q6: "How do you test this?"

**A:** "Three levels: (1) 142 integration tests with vitest + supertest covering success and failure paths. (2) 15 E2E shell scripts testing complete business flows (register → approve → sell → buy → deliver → review). (3) Postman collection with 100 requests for manual testing. Tests run against a separate database and clean up automatically."

### Q7: "Is this production-ready?"

**A:** "The core marketplace functionality is complete and tested. For production deployment, we need: (1) Real Razorpay credentials (currently mock mode). (2) SMTP email service (currently Ethereal test accounts). (3) File storage for product images and seller documents. (4) Redis for distributed rate limiting. (5) SSL/HTTPS for secure cookie transmission. The architecture is production-ready — we just need to swap mock implementations for real services."

### Q8: "How do you handle errors?"

**A:** "Centralized error handling: (1) Custom AppError class with status code and error code. (2) Error middleware catches all errors and returns standardized JSON responses. (3) Validation errors from Zod are caught by validate middleware. (4) Async errors caught by asyncHandler wrapper. (5) No stack traces or internal details leak in production responses. (6) All errors have consistent format: { success: false, message, code }."

### Q9: "What's the biggest technical challenge?"

**A:** "Checkout consistency — ensuring stock, discounts, coupons, and orders are all consistent even under concurrent requests. We solved this with atomic MongoDB operations, cart claims, and rollback mechanisms. The second challenge is idempotency — webhook payments can arrive multiple times, so we use sparse unique indexes to ensure each event is processed exactly once."

### Q10: "Would you change the architecture?"

**A:** "For a larger system: (1) Extract services into separate microservices (auth, orders, payments). (2) Add message queue (RabbitMQ/Kafka) for async processing. (3) Implement CQRS for read/write optimization. (4) Add caching layer (Redis) for hot data. But for a single-team, single-instance deployment, the current modular monolith is appropriate and easier to maintain."

---

## Summary

This e-commerce marketplace backend is a **complete, tested, and well-documented** implementation covering:

- **Authentication:** JWT + refresh tokens + 2FA + Google OAuth
- **Seller Lifecycle:** Registration → Approval → Product Management → Orders → Settlements
- **Buyer Journey:** Browse → Cart → Checkout → Payment → Returns → Reviews
- **Platform Features:** Discounts, Coupons, Notifications, Analytics, Audit Logging
- **Wishlist:** Add/remove/check products in wishlist
- **Inventory:** Stock transaction tracking with audit trail
- **Product Enhancements:** SKU, specifications (key-value attributes)
- **Order Features:** Invoice generation, tracking timeline
- **2FA Enforcement:** Mandatory for sellers and admins
- **Infrastructure:** Redis caching, background job queue (Bull), SMTP email
- **Production Patterns:** Atomic operations, idempotency, ownership enforcement, centralized errors

**What works out of the box (MOCK mode):**
- Complete marketplace flow without any external credentials
- Payment flow simulated end-to-end
- Email notifications viewable at ethereal.email

**What needs credentials for production:**
- Razorpay (real payments)
- Google OAuth (social login)
- SMTP (real email delivery)
- File storage (product images, seller documents)

The backend is ready for frontend integration and production deployment with minimal configuration changes.
