# E-Commerce Marketplace — Complete Project Guide

> **The single, comprehensive guide to the entire project: frontend (React + Vite), backend (Node.js + Express + TypeScript), database (MongoDB), third-party integrations, architecture, workflows, setup, testing, and business rules.**
>
> The **current codebase is the source of truth** for this document. Where older documentation (the previous backend-focused `PROJECT_GUIDE.md`, the root `README.md`, or `docs/architecture.md`) conflicts with what the code actually does, the conflict is called out explicitly in [§23.2 Discrepancies between docs and code](#232-discrepancies-between-docs-and-code).

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Application Architecture](#2-application-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Complete Project Structure](#4-complete-project-structure)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Backend Architecture](#6-backend-architecture)
7. [User Roles & Permissions](#7-user-roles--permissions)
8. [Authentication & Security](#8-authentication--security)
9. [Frontend ↔ Backend Communication](#9-frontend--backend-communication)
10. [Database & Data Model Overview](#10-database--data-model-overview)
11. [Major Business Workflows](#11-major-business-workflows)
12. [Feature-by-Feature Overview](#12-feature-by-feature-overview)
13. [Third-Party Integrations](#13-third-party-integrations)
14. [File Uploads & Cloudinary](#14-file-uploads--cloudinary)
15. [Payments & Razorpay](#15-payments--razorpay)
16. [Notifications & Background Jobs](#16-notifications--background-jobs)
17. [Audit Logging](#17-audit-logging)
18. [API Overview](#18-api-overview)
19. [Environment Configuration](#19-environment-configuration)
20. [Running the Project](#20-running-the-project)
21. [Testing](#21-testing)
22. [Production Considerations](#22-production-considerations)
23. [Known Limitations / Missing Features](#23-known-limitations--missing-features)
24. [Developer Navigation Guide](#24-developer-navigation-guide)

---

## 1. Project Overview

### 1.1 What the project is

This is a **multi-vendor e-commerce marketplace** — in the spirit of Amazon/Flipkart, where multiple independent sellers register, list products, and buyers purchase from many sellers in a single cart and checkout. The frontend is branded **NexCart** ("India's #1 Multi-Vendor Marketplace"; the brand is centralized in `frontend/src/config/brand.ts`), and the product is clearly **India-oriented**: prices are rendered in **INR** (`₹`, Indian number format), seller onboarding requires **GSTIN, PAN, bank account, IFSC code** and a PIN-code address, and phone numbers are validated as 10 digits.

The repository is a **monorepo with two applications**:

| Part | Location | What it is |
|------|----------|------------|
| **Backend API** | repository root (`src/`, `tests/`, `package.json`) | Node.js + Express 5 + TypeScript REST API on port 5000 (`/api/v1/*`) |
| **Frontend SPA** | `frontend/` | React 19 + TypeScript + Vite single-page app on port 3000 |

There is no separate monorepo tooling (workspaces/turborepo) — each side has its own `package.json` and is installed/run independently.

### 1.2 User roles

There are three roles in the system (`src/constants/roles.ts`), stored on the `User` document:

| Role | Who they are | What they can do | Frontend area |
|------|--------------|-----------------|---------------|
| **`BUYER`** (default) | Any registered customer | Browse the catalog, cart, checkout (COD or online), track orders, pay COD on delivery, request returns, write reviews, wishlist, manage addresses/avatar, receive notifications | Marketplace pages (`/`, `/products`, `/cart`, `/checkout`, `/orders`, `/account`, `/wishlist`, `/notifications`) |
| **`SELLER`** | A business selling on the platform | All buyer-ish account features **plus**: manage products, stock/inventory, discounts, coupons, own orders (confirm/ship/deliver, mark COD paid), customers, analytics, settlements, KYC documents — **after admin approval** | `/seller/*` panel (sidebar layout) |
| **`SUPER_ADMIN`** | Platform operator | Manage users (activate/deactivate), approve/reject/suspend sellers, manage categories, moderate products, view all orders, generate/process settlements, set commission, broadcast notifications, read the audit log | `/admin/*` panel (separate layout, no marketplace header/footer) |

Unauthenticated **guests** can browse the catalog, view products/reviews, and register.

### 1.3 Major workflows per role (high level)

**Buyer:**
Register/log in (email/password or Google) → browse & search products → product detail (images, specs, reviews, wishlist) → add to cart → checkout (pick or create address, COD or online, optional coupon — totals shown from a **server-side preview**) → pay (COD on delivery, or Razorpay online) → track order timeline → (within 7 days of delivery) request a return → review delivered products.

**Seller:**
Register with KYC (business, GSTIN, PAN, bank, address) → account starts **`PENDING`** → log in, view pending status, upload KYC documents → **Super Admin approves** → seller is **required to enable TOTP 2FA** → create products (start `DRAFT`, activate to `ACTIVE`), manage stock, discounts, coupons → respond to orders (confirm → ship → deliver; mark COD paid) → watch dashboard/analytics → receive **monthly settlements** (sales − commission).

**Super Admin:**
Log in → review **pending sellers** and approve/reject (with optional reason) → create/manage categories → moderate products (deactivate) → deactivate/activate users → watch all orders → set platform **commission rate** → **generate monthly settlements** and walk them through `PENDING → PROCESSING → PAID` (or FAILED/CANCELLED) → broadcast notifications to sellers/users → inspect the **audit log**.

### 1.4 How frontend and backend work together

- The backend is a **stateless REST API** (JWT access tokens; refresh token in an httpOnly cookie). All business rules — pricing, stock, permissions, order lifecycle — are enforced **server-side**.
- The frontend is a **React SPA** that talks to the API exclusively through a typed service layer (`frontend/src/services/*`) on top of one shared Axios instance (`frontend/src/services/api.ts`) which attaches the Bearer token and transparently refreshes expired access tokens.
- In development, the **Vite dev server proxies `/api` to `http://localhost:5000`**, so the browser only ever talks to one origin (which is also what makes the httpOnly refresh cookie work cross-API). In production you point `VITE_API_URL` at the API origin and allow that origin in `CORS_ORIGIN`.
- Response shape is uniform: `{ success: true, message, data }` or `{ success: false, message, code }` — the frontend's interceptors and helpers build on this contract.

A full end-to-end walkthrough of the checkout flow (the most complex path in the system) is in [§11.6](#116-cart--checkout--payment--order).

---

## 2. Application Architecture

### 2.1 Repository layout

```
ecommerce-marketplace/            ← the BACKEND project (package.json, src/, tests/, docs/)
├── frontend/                     ← the FRONTEND project (its own package.json, src/)
├── docs/                         ← architecture notes, Postman artifacts, this guide
├── src/                          ← backend source (Express app)
├── tests/                        ← backend integration tests, seeders, E2E shell scripts
├── .env.example                  ← backend environment template
├── package.json / tsconfig.json / vitest.config.ts / prettier.config.js
└── test-cloudinary.js            ← standalone Cloudinary smoke-test script (manual)
```

### 2.2 System diagram

```
                         ┌────────────────────────────────────────────────────────┐
                         │                         BROWSER                        │
                         │   React 19 SPA (NexCart) — Vite dev server :3000       │
                         │   TanStack Query · Zustand auth · RHF+Zod · Tailwind   │
                         └───────────────┬────────────────────────────────────────┘
                                         │  fetch /api/v1/...   (same origin in dev)
                                         ▼
                         ┌────────────────────────────────────────────────────────┐
                         │            Vite dev server (dev only)                  │
                         │            proxy: /api → http://localhost:5000         │
                         └───────────────┬────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────┐   ┌────────────────────────────────────────────────────────┐   ┌──────────────┐
│ Google OAuth │◄──┤                 Express app :5000                      ├──►│  Cloudinary  │
│ (login)      │   │  helmet · rate-limit · CORS · swagger-ui · /api/v1     │   │ (images,    │
└──────────────┘   │  modules: auth, sellers, products, orders, payments…   │   │  documents) │
                   └──────┬──────────────┬──────────────┬───────────────────┘   └──────────────┘
                          │              │              │
                          ▼              ▼              ▼
                   ┌────────────┐  ┌───────────┐  ┌──────────────┐   ┌────────────────┐
                   │  MongoDB   │  │   Redis   │  │  Razorpay    │   │ SMTP / Ethereal│
                   │ (Mongoose) │  │ (optional │  │  (payments,  │   │ (transactional │
                   │ 23 models  │  │  catalog  │  │   webhooks)  │   │  email)        │
                   │            │  │   cache)  │  └──────────────┘   └────────────────┘
                   └────────────┘  └───────────┘
```

### 2.3 Frontend layering (at a glance)

```
pages/*                → one component per route (buyer, seller/, admin/, auth/)
layouts/*              → MainLayout (marketplace), SellerLayout, AdminLayout, AdminRootLayout
components/*           → reusable UI (ui/ primitives, home/ sections, uploads, reviews, audit)
hooks/*                → useCart, useWishlist, useAccountStatus, useRestrictedAction, useSellerErrorHandler
services/*             → typed API wrappers, one per backend domain; api.ts = shared axios instance
stores/authStore.ts    → Zustand store for the session (user, auth state, account-active flag)
types/api.ts           → TypeScript interfaces mirroring backend payloads
lib/                   → cn(), formatPrice(), formChanges (no-op update guard), sellerDocuments
```

Detail: [§5 Frontend Architecture](#5-frontend-architecture).

### 2.4 Backend layering (at a glance)

Every backend feature module follows the same 5-layer pattern:

```
Route → Controller → Service → Repository → Model
(routes.ts) (controller.ts) (service.ts) (repository.ts) (models/*.ts)
   + schema.ts (Zod validation) and types.ts (TS interfaces) per module
```

| Layer | Responsibility |
|-------|----------------|
| **Route** | HTTP method + path + middleware chain (`authenticate`, `authorize(roles)`, `validate(schema)`, `asyncHandler(handler)`) plus the `@openapi` JSDoc that Swagger consumes |
| **Controller** | Thin request/response plumbing: pull data off `req`, call the service, send via `sendSuccess`/`sendError` |
| **Service** | All business logic: rules, ownership checks, pricing, orchestration, audit logging, notifications |
| **Repository** | Mongoose queries only (find/create/update) — the only layer that touches a model collection directly |
| **Model** | Mongoose schema: fields, types, indexes, defaults, `select: false` for secrets |

Cross-cutting pieces live outside modules: `middlewares/` (auth, role, validation, upload, 2FA, errors), `services/` (audit, email, cloudinary, queue), `utils/` (jwt, totp, hashing, response helpers), `config/` (env, database, logger, redis, cloudinary), `constants/` (status/role enums).

Detail: [§6 Backend Architecture](#6-backend-architecture).

### 2.5 Request flow, step by step (example: `POST /api/v1/products`)

```
1. Browser: seller page POST /api/v1/products
   Header: Authorization: Bearer <sellerAccessToken>
   Body: { name, description, price, stock, sku, category, … }

2. Express app (src/app.ts):
   - helmet() security headers
   - baseline rate limiter (300 req/15 min/IP)
   - CORS check against CORS_ORIGIN
   - express.json() parses the body (raw body kept for Razorpay webhooks)
   - routes/index.ts mounts /api/v1 → products router

3. product.routes.ts:
   - authenticate  → verify Bearer JWT, RE-LOAD the user from MongoDB,
                     reject deactivated accounts (403 ACCOUNT_INACTIVE)
   - requireTwoFactorSetup (seller) → 403 TWO_FACTOR_REQUIRED if 2FA not enabled
   - authorize(SELLER) → role check
   - validate(createProductSchema) → Zod validates the body
   - asyncHandler(createProductController)

4. product.controller.ts: extracts req.user + req.body, calls the service,
   responds sendSuccess(res, "Product created", product, 201)

5. product.service.ts (business rules):
   - seller must exist and be APPROVED (else 403)
   - category must exist (if given)
   - creates product as DRAFT via the repository
   - logAudit({ action: PRODUCT_CREATED, … })
   - invalidates the Redis product-catalog cache (when Redis is enabled)

6. product.repository.ts: Product.create({ sellerId, …, status: "DRAFT" })

7. Response: { success: true, message: "Product created", data: { …product } }
```

The failure path is symmetric: any `AppError` thrown in layers 3–6 is caught by `asyncHandler`/the error middleware and rendered as `{ success: false, message, code }` with the right HTTP status — internals never leak.

---

## 3. Technology Stack

### 3.1 Frontend (`frontend/package.json`)

| Technology | Version (approx.) | Why it is used |
|------------|-------------------|----------------|
| **React** | 19 | UI framework; component model for marketplace/seller/admin screens |
| **TypeScript** | ~6 (strict) | Type safety end-to-end; `types/api.ts` mirrors the API contract |
| **Vite** | 8 | Dev server + bundler; `@` → `src` alias; **dev proxy `/api` → :5000** |
| **React Router** | 7 | Client-side routing, nested layouts, `lazy()` route components |
| **TanStack Query** | 5 | Server-state caching (catalog, cart, orders, …) with invalidation after mutations |
| **Axios** | 1 | API client; request/response interceptors (Bearer token, 401 refresh queue, 403 account-inactive handling) |
| **Zustand** | 5 | Tiny client-side store for the auth session (persisted to `sessionStorage`) |
| **React Hook Form + Zod** | 7 / 3 | Form state + validation on the client, mirroring the backend's Zod schemas |
| **Tailwind CSS** | 4 | Utility-first styling; design tokens defined in `index.css` (`@theme` + `:root` CSS variables) |
| **Recharts** | 3 | Analytics charts (sales, revenue, category performance) on seller pages |
| **MUI (Material UI) + Emotion** | 9 | Used **only** by the Super Admin Audit Log page (scoped theme, no global reset) — the only non-Tailwind styling in the app |
| **React Hot Toast** | 2 | Toast notifications (success/error, incl. global "account inactive") |
| **Lucide React** | — | Icon set |
| **clsx + tailwind-merge** | — | `cn()` class composition helper |
| **vitest + Testing Library + jsdom** | 5 | Component tests (3 suites) |
| **oxlint** | — | Linting (`npm run lint`) |

### 3.2 Backend (root `package.json`)

| Technology | Version (approx.) | Why it is used |
|------------|-------------------|----------------|
| **Node.js** | 20+ | Runtime; async I/O for an API server |
| **TypeScript** | 7 (ESM, `NodeNext`, strict) | Compile-time safety; self-documenting types across 5 layers |
| **Express** | 5 | HTTP framework; routing + middleware chains per module |
| **MongoDB + Mongoose** | 9 | Document database; flexible schemas for products/orders; **atomic operations** for concurrency (guarded `$inc`, claims, unique indexes) |
| **Zod** | 4 | Request validation (body/query/params) **and** environment validation (`config/env.ts` fails fast on bad `.env`) |
| **jsonwebtoken** | 9 | Short-lived access JWT (15 min) + rotating refresh JWT (7 d) + short-lived 2FA-pending token |
| **bcryptjs** | 3 | Password hashing (12 salt rounds) |
| **googleapis** | 174 | Google sign-in: OAuth2 URL generation, authorization-code exchange, **ID-token verification** |
| **Cloudinary** | 2 | Managed file storage: product images, user avatars, seller KYC documents (CDN, transforms) |
| **multer** | 2 | Multipart form-data parsing (memory storage) with MIME + size validation |
| **nodemailer** | 9 | Email delivery — real SMTP when configured, **Ethereal test account in dev** |
| **ioredis** | 6 | **Optional** Redis client for product-catalog caching (silently disabled without `REDIS_URL`) |
| **bull** | 4 | ⚠️ Declared dependency for a Redis-backed job queue, but **not actually used in code** — the queue service is a synchronous inline stub (see §16.3 and §23.2) |
| **swagger-jsdoc + swagger-ui-express** | 6 / 5 | Interactive API docs at `/api-docs/`, generated from `@openapi` JSDoc in the route files |
| **helmet** | 8 | Security headers (CSP, HSTS, nosniff, …) |
| **express-rate-limit** | 8 | Per-IP rate limiting (baseline + strict auth limiter) |
| **cookie-parser** | 1 | Reads the httpOnly refresh-token cookie |
| **cors** | 2 | Restricts API access to the configured frontend origin (with credentials) |
| **dotenv** | 17 | Loads `.env` |
| **vitest + supertest** | 4 / 7 | Integration tests that drive the real Express app over HTTP |
| **mongodb-memory-server** | 11 | Fallback in-memory MongoDB so tests run even without a local mongod |
| **tsx** | 4 | Runs TypeScript directly (`npm run dev`, seeders, scripts) |
| **prettier** | 3 | Formatting |

### 3.3 Database

**MongoDB** (via Mongoose) is the only primary datastore. There is no relational DB, no separate search index, and no dedicated session store. Concurrency is handled with atomic MongoDB primitives (guarded updates, claims, partial/unique indexes) rather than distributed locks — the reasoning is recorded in `docs/architecture.md`. The test suite runs against a dedicated `ecommerce_marketplace_test` database so dev data is never touched.

### 3.4 One-line summaries of the major concerns (details later)

| Concern | Implementation | Section |
|---------|----------------|---------|
| Authentication | JWT access (15 min, Bearer) + rotating refresh (7 d, httpOnly cookie); Google OAuth; TOTP 2FA mandatory for sellers/admins | §8 |
| Authorization | Role middleware (`BUYER/SELLER/SUPER_ADMIN`) + per-resource ownership checks in services | §7 |
| Cloudinary | Product images, avatars, seller KYC documents | §14 |
| Razorpay | Online payments (COD also supported); MOCK mode for dev/test | §15 |
| Redis | Optional product-catalog cache (60 s TTL, invalidated on writes) | §13.4 |
| Background jobs | Synchronous inline "queue" stub; Bull declared but unused | §16.3 |
| Email/notifications | Nodemailer (Ethereal dev / SMTP prod) + in-app Notification model with per-user preferences | §16 |
| Testing | 21 backend integration suites (215 cases) + 3 frontend component suites (25 cases) + 15 E2E shell scripts + Postman collection | §21 |
| API docs | Swagger UI at `/api-docs/` (JSDoc-generated) + Postman collection in `docs/` | §18 |


---

## 4. Complete Project Structure

> Purpose-level explanation: what each important folder/file is responsible for and why it exists. Trivial files are grouped.

### 4.1 Root (backend) — annotated

```
ecommerce-marketplace/
├── frontend/                     # the React app (see §4.2)
├── docs/
│   ├── PROJECT_GUIDE.md          # ← this guide
│   ├── architecture.md           # reliability decisions: atomic ops, idempotency map, why-no-Redis/queue history
│   ├── POSTMAN_COMPLETE_TESTING_GUIDE.md  # per-API request bodies + 70-step manual sequence
│   ├── postman-collection.json   # 100-request Postman collection (generated from the OpenAPI spec)
│   └── postman-environments.json # matching Postman environment (base URL, token variables)
├── src/
│   ├── app.ts                    # Express app assembly: helmet, rate limiters, CORS, Swagger UI,
│   │                             #   JSON parsing (raw body kept for webhooks), cookie-parser,
│   │                             #   /api/v1 router, 404 + error middleware. NO listening here.
│   ├── server.ts                 # Entry point: connect DB → verify Cloudinary config → init workers
│   │                             #   → app.listen(PORT) → SIGINT/SIGTERM graceful shutdown
│   ├── config/                   # Environment & infrastructure wiring
│   │   ├── env.ts                # Zod-validated process.env (fails fast at startup on missing/bad values)
│   │   ├── database.ts           # Mongoose connection (exits the process on failure)
│   │   ├── logger.ts             # Minimal console logger ([INFO]/[WARN]/[ERROR] prefixes)
│   │   ├── cloudinary.ts         # Cloudinary SDK init from env
│   │   └── redis.ts              # Optional Redis client + cache helpers (get/set/invalidate, TTLs)
│   ├── constants/                # Enum/single-value definitions shared everywhere
│   │   ├── roles.ts              # UserRole: BUYER, SELLER, SUPER_ADMIN
│   │   ├── orderStatus.ts        # OrderStatus, PaymentMethod (CASH_ON_DELIVERY/ONLINE), PaymentStatus
│   │   ├── sellerStatus.ts       # PENDING, APPROVED, REJECTED, PAUSED, SUSPENDED
│   │   ├── productStatus.ts      # DRAFT, ACTIVE, INACTIVE
│   │   ├── payment.ts            # PaymentGateway (RAZORPAY/MOCK), PaymentRecordStatus, RefundStatus
│   │   ├── discountStatus.ts / couponStatus.ts / returnStatus.ts / settlementStatus.ts
│   │   ├── notificationTypes.ts  # NotificationType + NotificationChannel enums
│   │   └── cookies.ts            # Refresh cookie name + options
│   ├── docs/swagger.ts           # OpenAPI definition (info, servers, tags, security scheme,
│   │                             #   reusable component schemas) + JSDoc scan of route files
│   ├── errors/AppError.ts        # Custom error class: message + HTTP status + machine-readable code
│   ├── middlewares/
│   │   ├── role.middleware.ts    # authorize(...roles) — role-based access control
│   │   ├── validation.middleware.ts # validate(schema, 'body'|'query'|'params') — Zod gate
│   │   ├── upload.middleware.ts  # Multer parsers: image (1×5MB), product images (8×5MB), documents (1×10MB)
│   │   ├── twoFactor.middleware.ts  # requireTwoFactorSetup — sellers/admins must have 2FA on
│   │   ├── error.middleware.ts   # Central error handler (AppError/MulterError/ZodError → JSON)
│   │   └── notFound.middleware.ts   # 404 for unmatched routes
│   ├── models/                   # 23 Mongoose models — see table in §10
│   ├── modules/                  # 18 feature modules — see table in §6.1
│   ├── services/
│   │   ├── audit.service.ts      # logAudit() — the one reusable audit-logging entry point
│   │   ├── email.service.ts      # Nodemailer transport (SMTP or Ethereal) + retry (500ms, 1s)
│   │   ├── cloudinary.service.ts # upload/delete helpers + startup config verification
│   │   └── queue/                # ⚠️ Synchronous job stub (queue.config.ts, workers.ts) — see §16.3
│   ├── utils/
│   │   ├── jwt.ts                # sign/verify access, refresh, 2FA-pending tokens
│   │   ├── tokenHash.ts          # SHA-256 hashing for refresh tokens / reset tokens / recovery codes
│   │   ├── totp.ts               # TOTP generate/verify (authenticator-app compatible)
│   │   ├── secretCipher.ts       # AES-256-GCM encryption for TOTP secrets at rest
│   │   ├── asyncHandler.ts       # Express 5 async error wrapper
│   │   └── apiResponse.ts        # sendSuccess / sendError — the standard response envelope
│   ├── types/
│   │   ├── user.types.ts         # IUser interface
│   │   └── express.d.ts          # Extends Express Request with `user`
│   └── routes/index.ts           # The single router mounted at /api/v1: /health + all module routers
├── tests/                        # see §21
├── .env.example                  # backend environment template (annotated)
├── package.json                  # scripts: dev, build, start, typecheck, test, format
├── tsconfig.json / vitest.config.ts / prettier.config.js
└── test-cloudinary.js            # ad-hoc Cloudinary upload smoke script (manual, not part of the suite)
```

### 4.2 `frontend/` — annotated

```
frontend/
├── index.html                    # HTML shell: font loading (Plus Jakarta Sans), NexCart meta/OG tags
├── vite.config.ts                # React + Tailwind plugins, '@' alias, port 3000, host 0.0.0.0,
│                                 #   allowedHosts (sandbox previews), and the /api → :5000 dev proxy
├── vitest.config.ts              # jsdom component-test config + setup file
├── tsconfig*.json / .oxlintrc.json
├── .env.example                  # VITE_API_URL=http://localhost:5000/api/v1
├── scripts/                      # Node verification scripts (run with `node scripts/…`):
│   │                             #   verify-money-ui.mjs       — money rendering across order screens
│   │                             #   verify-no-changes-guard.mjs — "no dirty form → no API call" rule audit
│   │                             #   verify-settlement-ui.mjs  — settlement rendering checks
│   └── (these are static-analysis/unit checks, not part of `npm test`)
├── public/                       # static assets (favicon.svg)
└── src/
    ├── main.tsx                  # React root render (StrictMode) + index.css import
    ├── App.tsx                   # ALL route definitions: providers (QueryClient, Router),
    │                             #   layouts, ProtectedRoute guards, lazy() page imports, 404
    ├── index.css                 # Tailwind 4 import + design tokens (@theme + :root CSS variables:
    │                             #   terracotta brand color, warm light surfaces, radii, shadows)
    ├── config/brand.ts           # APP_NAME/APP_TAGLINE/APP_DESCRIPTION/APP_COPYRIGHT — single source
    │                             #   of branding (used in header, footer, payment page, index.html)
    ├── pages/                    # One component per route. Grouped by audience:
    │   │   # top level = buyer + guest pages
    │   ├── HomePage.tsx          # Live-catalog home: hero, categories, New Arrivals, Best Deals, trust, seller CTA
    │   ├── ProductListPage.tsx   # Catalog browsing: search, category/price filters, sort, pagination
    │   ├── ProductDetailPage.tsx # Gallery, price/discount, specs, qty, add-to-cart, wishlist, reviews CRUD
    │   ├── CartPage.tsx          # Line items, quantity, remove, clear, totals (live from backend)
    │   ├── CheckoutPage.tsx      # Address select/create, COD/ONLINE, coupon apply, server-side preview, place order
    │   ├── PaymentPage.tsx       # Razorpay checkout.js host: initiate → open modal → verify signature
    │   ├── OrderListPage.tsx     # Buyer order history (status filter, pagination)
    │   ├── OrderDetailPage.tsx   # Items, totals, tracking timeline, invoice, cancel, COD pay, review CTA
    │   ├── WishlistPage.tsx      # Saved products grid
    │   ├── AccountPage.tsx       # Profile, avatar upload/delete, address book
    │   ├── NotificationsPage.tsx # Notification list, unread, mark read, preferences (buyer+seller)
    │   ├── auth/
    │   │   ├── AuthPage.tsx      # Login (with 2FA step when required)
    │   │   ├── RegisterPage.tsx  # Buyer registration
    │   │   ├── ForgotPasswordPage.tsx / ResetPasswordPage.tsx
    │   ├── seller/
    │   │   ├── RegisterSellerPage.tsx  # KYC onboarding form (GSTIN/PAN/IFSC/address/bank)
    │   │   ├── PendingApprovalPage.tsx # "Awaiting approval" status screen
    │   │   ├── SellerTwoFactorSetupPage.tsx # QR + code + recovery codes wizard (mandatory)
    │   │   ├── SellerDashboardPage.tsx  # KPI cards + sales chart + recent orders
    │   │   ├── SellerProductsPage.tsx   # Product CRUD + image upload + status
    │   │   ├── SellerOrdersPage.tsx     # Seller orders: status transitions, mark COD paid
    │   │   ├── SellerInventoryPage.tsx  # Stock levels, manual adjustments, transaction history
    │   │   ├── SellerDiscountsPage.tsx  # Date-windowed product/category discounts
    │   │   ├── SellerCouponsPage.tsx    # Coupon codes with limits
    │   │   ├── SellerCustomersPage.tsx  # Read-only customer list (aggregated from orders)
    │   │   ├── SellerAnalyticsPage.tsx  # Recharts: sales, revenue, top products, categories
    │   │   ├── SellerSettlementPage.tsx # Monthly settlement summary + order breakdown
    │   │   └── SellerProfilePage.tsx    # Seller profile + KYC document upload/delete
    │   └── admin/
    │       ├── AdminDashboardPage.tsx   # Platform KPIs (users, sellers, orders, revenue)
    │       ├── AdminUsersPage.tsx       # User list + activate/deactivate
    │       ├── AdminSellersPage.tsx     # Seller list + status (approve/reject/pause/suspend) + reason
    │       ├── AdminCategoriesPage.tsx  # Category CRUD (CategoryTable + CategoryFormDialog)
    │       ├── AdminProductsPage.tsx    # Product moderation (status changes)
    │       ├── AdminOrdersPage.tsx      # All orders across sellers
    │       ├── AdminSettlementsPage.tsx # Generate + lifecycle actions + commission
    │       ├── AdminNotificationsPage.tsx # Broadcast to sellers/users
    │       ├── AdminAuditPage.tsx       # Audit log viewer (MUI: filters, table, copy — see §17)
    │       └── AdminProfilePage.tsx     # Admin profile + avatar + change password
    ├── layouts/
    │   ├── MainLayout.tsx        # Marketplace shell: Header + Footer + Toaster; session bootstrap
    │   │                         #   (getMe → refresh → logout); role redirects (admin/seller away);
    │   │                         #   useAccountStatus() polling
    │   ├── Header.tsx            # Sticky header: logo, live product search, role-aware nav, cart badge,
    │   │                         #   notifications bell, user dropdown, mobile menu, logout
    │   ├── Footer.tsx            # Footer + policy modals (PolicyModal) + footer.css
    │   ├── SellerLayout.tsx      # Seller sidebar (pending sellers see only Profile & Documents) + mobile bottom nav
    │   ├── AdminLayout.tsx       # Admin sidebar + profile dropdown + logout + mobile bottom nav
    │   └── AdminRootLayout.tsx   # Bare root for /admin (own session bootstrap, no marketplace chrome)
    ├── components/
    │   ├── ProtectedRoute.tsx    # Auth + role gate: skeleton while auth loads; redirect rules per role
    │   ├── ProductCard.tsx       # Catalog card (image, price, discount, wishlist heart, add-to-cart)
    │   ├── ProductSearchBar.tsx  # Header search with debounce + product search suggestions
    │   ├── ui/                   # Design-system primitives: Button, Card, Input, TextArea, Select,
    │   │                         #   Badge, Dialog, Pagination, Skeleton, EmptyState, ProfileAvatar,
    │   │                         #   ImageUpload (multi-image uploader w/ previews), DocumentUpload
    │   │                         #   (KYC document manager)
    │   ├── home/                 # Homepage sections: HeroShowcase, ProductCarousel, SectionHeader,
    │   │                         #   TrustSection, SellerCtaSection, HomeProductCard, categoryVisual, home.css
    │   ├── reviews/ReviewDialog.tsx # Star rating + comment create/edit dialog (buyer)
    │   └── admin/audit/          # Audit page pieces: CopyButton (MUI-styled)
    ├── hooks/                    # see §5.8
    ├── services/                 # API layer — see §5.6
    ├── stores/authStore.ts       # Zustand session store — see §5.3
    ├── types/api.ts              # All shared TS interfaces (ApiResponse, Product, Order, Settlement, …)
    ├── lib/
    │   ├── utils.ts              # cn(), formatPrice (INR), formatDate, toAmount (NaN-safe money)
    │   ├── formChanges.ts        # getChangedFields/hasChanges/notifyNoChanges — "no-op update" guard
    │   ├── sellerDocuments.ts    # Document type normalization (GST↔GST_CERTIFICATE…), file rules, labels
    │   └── categoryLabel.ts      # Category display-label formatting
    ├── theme/auditTheme.ts       # MUI theme for the audit page only (maps MUI onto the app's design tokens)
    └── test/setup.ts             # jsdom test setup: jest-dom matchers, cleanup, matchMedia stub
```

### 4.3 `tests/` (backend) — annotated

```
tests/
├── setup.ts          # Test bootstrap: point MONGODB_URI at <db>_ecommerce_marketplace_test, NODE_ENV=test
├── global-setup.ts   # If MONGODB_URI is absent, start an in-memory MongoDB for the whole run
├── helpers.ts        # Shared factories: register buyer/seller/admin, login, approve seller, seed product…
├── *.test.ts         # 21 vitest+supertest integration suites (215 test cases) — see §21.1
├── e2e-*.sh          # 15 self-contained curl-based end-to-end scripts (run against a live dev server)
├── seed-admin.ts     # Seeder: admin@example.com / Admin@1234 (dev convenience, not part of the suite)
├── generate-postman.ts  # Regenerates docs/postman-collection.json from the OpenAPI spec
├── debug-swagger.ts / export-swagger.ts  # Swagger spec sanity/export utilities
└── swagger-full.json # ⚠️ currently an EMPTY placeholder file (0 bytes) — see §23.2
```

---

## 5. Frontend Architecture

### 5.1 Routing

- **`react-router-dom` v7** with `BrowserRouter`. All routes are declared in **`App.tsx`**, wrapped in `QueryClientProvider` → `BrowserRouter` → `Suspense`.
- **Two layout trees:**
  - **Admin tree** — `/admin/*` lives under `AdminRootLayout` (session bootstrap, slate background, *no* marketplace header/footer) → `ProtectedRoute roles={['SUPER_ADMIN']}` → `AdminLayout` (sidebar) with child routes: `dashboard, users, sellers, categories, products, orders, settlements, notifications, audit, profile`.
  - **Marketplace tree** — everything else lives under `MainLayout` (Header/Footer): public buyer pages, auth pages, seller onboarding pages, and `/seller/*` under `SellerLayout`.
- **Every page component is lazy-loaded** (`React.lazy(() => import(…))`) with a shared `PageLoader` fallback — the app is code-split per route, so e.g. the admin panel, charts, and MUI only ship when visited.
- **`ProtectedRoute`** (used per-route) handles: auth-loading skeleton → signed-out redirect to `/login` (with `state.from`) → role mismatch redirect (SELLER → `/seller/dashboard`, SUPER_ADMIN → `/admin/dashboard`, BUYER → `/`) → deactivated-account redirect.
- **Layout-level role fences:** `MainLayout` additionally bounces a logged-in SUPER_ADMIN to `/admin/dashboard` and a logged-in SELLER to `/seller/dashboard` on any customer-facing URL (small allow-lists for auth pages, seller onboarding, notifications) — so a seller can't accidentally sit on the marketplace.
- A catch-all `*` route renders a 404 screen.

#### Route table

| Path | Page | Access |
|------|------|--------|
| `/` | HomePage | public |
| `/products`, `/products/:id` | catalog / detail | public |
| `/login`, `/forgot-password`, `/reset-password` | auth (AuthPage hosts login+register) | public |
| `/cart`, `/checkout`, `/orders`, `/orders/:id`, `/orders/:id/pay`, `/account`, `/wishlist` | buyer flows | `BUYER` |
| `/notifications` | notifications | `BUYER` or `SELLER` |
| `/seller/register` | seller onboarding | public (guards inside) |
| `/seller/pending`, `/seller/2fa-setup` | seller status screens | `SELLER` |
| `/seller/{dashboard,products,orders,inventory,discounts,coupons,customers,analytics,profile,settlement,notifications}` | seller panel | `SELLER` (2FA enforced at API level) |
| `/admin/{dashboard,users,sellers,categories,products,orders,settlements,notifications,audit,profile}` | admin panel | `SUPER_ADMIN` |

### 5.2 App providers & entry

`main.tsx` mounts `<App/>` in `React.StrictMode`. `App.tsx` creates a single `QueryClient` (defaults: `retry: 1`, `refetchOnWindowFocus: false`) and the router. There is no Redux or other global state besides the Zustand auth store.

### 5.3 Authentication state & session handling

**Where state lives**

| State | Store | Persistence |
|-------|-------|-------------|
| `user` (id, name, email, role, avatarUrl, isActive) | Zustand `useAuthStore` | `sessionStorage` (`user`) |
| `accessToken` | module var in `services/api.ts` | `sessionStorage` (`access_token`) |
| `refreshToken` | **browser cookie** (httpOnly, set by backend) | cookie scoped to `/api/v1/auth`, sent with `withCredentials` |
| `accountInactive` flag | Zustand | `sessionStorage` (`account_inactive`) |

**Login flow:** `authApi.login()` → if the user has 2FA the response contains `twoFactorRequired: true` + short-lived `loginToken`; `AuthPage` then asks for the TOTP/recovery code and calls `authApi.verify2FA(loginToken, code)`. On success `setAuth(user, accessToken)` stores the session and **hydrates the full profile in the background** (`GET /users/me`) so a previously uploaded avatar is visible immediately.

**Session bootstrap on layout mount** (`MainLayout` / `AdminRootLayout`): if a token exists, call `GET /users/me`; on failure try `POST /auth/refresh` once, then `getMe` again; if that also fails, `logout()`. This is what makes a fresh page load "just work".

**Token refresh (single-flight):** the axios response interceptor in `services/api.ts` catches `401`s (except on `/auth/login`, `/auth/register`, `/auth/google`, where 401 means bad credentials), performs **one** `POST /auth/refresh` at a time; any other in-flight 401s park in `failedQueue` and are retried with the new token. On refresh failure the token is cleared and the user is redirected to `/login`.

**Deactivated accounts (live enforcement):** when a Super Admin deactivates a user, the backend answers *every* authenticated request with `403 { code: "ACCOUNT_INACTIVE" }`. The interceptor converts that into a throttled "Your account is inactive" toast + `markAccountInactive()` (clears credentials, remembers the flag so the login page can explain it). Independently, `useAccountStatus()` (mounted in both layouts) re-polls `GET /users/me` **every 30 s and on window focus**, so a user sitting on a page loses access without refreshing. `useRestrictedAction()` guards click-level actions (add to cart, place order, add product, wishlist) the same way.

### 5.4 Buyer pages & workflows

| Page | Responsibility | Key data sources |
|------|----------------|------------------|
| `HomePage` | Hero + category tiles + "New Arrivals" + "Best Deals" (products with a live discount, ranked) + trust section + become-a-seller CTA. Rendered entirely from the **live catalog** (one browse query feeds hero + carousels) | `categoryService.list`, `productService.browse`, `sellerService.getCount` |
| `ProductListPage` | Search, category filter, min/max price, sort, pagination — URL-param driven | `productService.browse(params)` |
| `ProductDetailPage` | Image gallery (with broken-image fallback), live price + discount, specs, quantity picker, **Add to Cart** (stock/ownership/inactive guards), **wishlist toggle**, full **reviews** section (list, create/edit own, delete own) | `productService.getById`, `reviewService`, `cartService`, `useWishlist`, `useRestrictedAction` |
| `CartPage` | Items with live prices, quantity steppers (stock-aware), remove/clear, totals | `useCart` |
| `CheckoutPage` | Address select-or-create (Zod-validated form), COD/ONLINE radio, **coupon apply** with per-coupon server preview, **checkout preview** (`POST /orders/preview` — cached on `[coupon, cart fingerprint]` so totals always match what the backend will charge), place order → COD: done; ONLINE: navigate to `/orders/:id/pay` | `useCart`, `userService` (addresses), `orderService.preview/create` |
| `PaymentPage` | Loads `checkout.razorpay.com/v1/checkout.js`, opens Razorpay modal (keyId, amount, `order_id` = gatewayOrderId, prefilled name/contact), on `handler` calls `paymentService.verify(paymentId, signature)` → success → order detail. Already-paid and non-ONLINE states render dedicated screens | `orderService.getById`, `paymentService.initiate/verify` |
| `OrderListPage` / `OrderDetailPage` | History with status filter; detail shows items, price breakdown, **tracking timeline**, **invoice** (once delivered), cancel (PENDING/CONFIRMED), **pay COD** button (DELIVERED + UNPAID), and review entry points per item | `orderService.list/getById/getTracking/getInvoice/cancel/markPaid`, `reviewService` |
| `WishlistPage` | Saved products grid, remove, go-to-product | `useWishlist` |
| `AccountPage` | Profile edit (no-changes guard), avatar upload/delete, address book CRUD | `userService` |
| `NotificationsPage` | List (unread filter), mark read/all read, **email/in-app preferences** per category | `notificationService` |

### 5.5 Seller pages & workflows

The seller panel sits in `SellerLayout` (sidebar). For **PENDING/REJECTED/SUSPENDED** sellers the sidebar collapses to a single "Profile & Documents" item — the rest of the panel is only reachable once APPROVED, and the API additionally enforces 2FA + approval before any seller write.

| Page | Responsibility |
|------|----------------|
| `RegisterSellerPage` | KYC onboarding: business name, GSTIN (15-char regex), PAN, IFSC, bank, address, phone — Zod-validated; calls `POST /sellers/register` (public); then routes to `/seller/pending` |
| `PendingApprovalPage` | Static "awaiting approval" screen (email notification arrives on decision) |
| `SellerTwoFactorSetupPage` | Mandatory 2FA wizard: `2fa/setup` → show QR + secret + one-time recovery codes → `2fa/enable` with TOTP code |
| `SellerProfilePage` | View/update profile; **upload/delete KYC documents** (DocumentUpload component → Cloudinary) |
| `SellerDashboardPage` | KPI cards (orders, revenue, products, customers), sales chart, recent orders |
| `SellerProductsPage` | Product CRUD; create/edit forms with **ImageUpload** (up to 8, previews, delete by publicId); DRAFT/ACTIVE/INACTIVE status switching; "no changes → no request" guard on edits |
| `SellerOrdersPage` | Seller's orders; status transitions (confirm/ship/deliver) with confirm dialogs; **mark COD paid**; ownership enforced server-side |
| `SellerInventoryPage` | Per-product stock, low-stock thresholds, manual stock **adjustments** (quantity + reason), full transaction history |
| `SellerDiscountsPage` | Create/manage date-windowed product-or-category percentage discounts |
| `SellerCouponsPage` | Create/manage coupon codes (percent/fixed, min order, max discount, limits, product/category scope) |
| `SellerCustomersPage` | Read-only customer list (names, order counts, spend) from the analytics endpoints |
| `SellerAnalyticsPage` | Recharts: sales over time (day/month), revenue stats, top products, category performance |
| `SellerSettlementPage` | Month picker → settlement summary (gross, commission, net) + per-order breakdown |

All seller mutations route through `useSellerErrorHandler()`: a `403 TWO_FACTOR_REQUIRED` is converted into a toast + redirect to `/seller/2fa-setup`; `ACCOUNT_INACTIVE` is handled globally by the interceptor; everything else toasts the backend message.

### 5.6 API / service layer

- **One shared Axios instance** — `services/api.ts`:
  - `baseURL = import.meta.env.VITE_API_URL || '/api/v1'` (in dev the default `/api/v1` is same-origin and proxied by Vite to the backend), `withCredentials: true` (refresh cookie).
  - Request interceptor: attach `Authorization: Bearer <accessToken>`.
  - Response interceptor: 403-`ACCOUNT_INACTIVE` handling; single-flight 401 refresh queue; everything else rejected as-is.
  - Helpers: `extractErrorMessage(err)` (reads `response.data.message`), `isAccountInactiveError(err)`.
- **One service module per backend domain** (all re-exported from `services/index.ts`): `authApi`, `productService`, `categoryService`, `cartService`, `orderService`, `paymentService`, `discountService`, `couponService`, `wishlistService`, `reviewService`, `userService`, `sellerService`, `adminService`, `notificationService`, `returnService`, `inventoryService`.
- Services are **thin typed wrappers** — each method maps to one endpoint, declares the `ApiResponse<T>` type, and returns the unwrapped payload. Where the backend returns raw documents, the service normalizes (e.g. `inventoryService` maps raw `InventoryTransaction` docs to the UI shape).
- File uploads build `FormData` in the service (`uploadImages`, `uploadDocument`, `uploadAvatar`) with the multipart content type.

### 5.7 State management: TanStack Query

All **server state** is TanStack Query. Conventions:

- Stable **query keys**: `['cart']`, `['wishlist']`, `['profile']`, `['addresses']`, `['categories']`, `['product', id]`, `['order', id]`, `['orders']`, `['tracking', id]`, `['invoice', id]`, `['checkout-preview', coupon, cartFingerprint]`, …
- `enabled: isAuthenticated` on user-scoped queries (cart, wishlist) so guests don't fire 401s.
- `staleTime` tuned per domain (cart 30 s, wishlist 5 min, checkout preview 15 s with `keepPreviousData`).
- Mutations invalidate the related keys on success (e.g. after add-to-cart → `['cart']`; after order status change → `['orders', 'order']`).
- Local `useState` is reserved for pure UI state (selected image tab, dialog open, form fields).
- The only non-React global state is the **Zustand auth store** (§5.3) — deliberately small.

### 5.8 Hooks

| Hook | Responsibility |
|------|----------------|
| `useCart` | TanStack Query wrapper for the buyer's cart (auth-gated, 30 s stale) |
| `useWishlist` | Wishlist query + `isWishlisted(id)` + `toggle(id)` mutation (409 → refetch; inactive-account errors suppressed since the interceptor toasts them) |
| `useAccountStatus` | Polls `GET /users/me` every 30 s + on window focus; marks the session inactive without a page refresh (see §5.3) |
| `useRestrictedAction` | Click-level guard for role-restricted actions; blocks + toasts for inactive/unauthenticated users, sends guests to `/login` |
| `useSellerErrorHandler` | Shared mutation error handler for seller pages (`TWO_FACTOR_REQUIRED` → 2FA setup redirect; global inactive handling; backend-message toasts) |

### 5.9 Forms & validation

- **React Hook Form + Zod + `zodResolver`** on every form (checkout address, seller KYC, product create/edit, discounts, coupons, categories, audit filters, profile, 2FA code, …).
- Client schemas **mirror the backend's Zod schemas** (same field constraints: GSTIN/PAN/IFSC regexes, 10-digit phone, 6-digit PIN, price min/max, …) so obviously invalid data never leaves the browser — but the backend re-validates everything regardless.
- **No-op update guard:** every edit form compares submitted values against the pre-filled baseline using `lib/formChanges.ts` (`getChangedFields` / `hasChanges`). A pristine form shows *"No changes to update."* and **does not call the API** (no request, no success toast). `scripts/verify-no-changes-guard.mjs` audits all update-capable screens so a new edit form can't skip the rule.

### 5.10 Role-based UI

Defense in depth, outermost first: (1) `ProtectedRoute` role lists on routes; (2) layout fences in `MainLayout`/`SellerLayout`/`AdminLayout`; (3) role-conditional rendering inside pages (e.g. Header nav items, seller sidebar collapse for pending sellers); (4) action guards (`useRestrictedAction`, `useSellerErrorHandler`). The frontend role comes from the `user` object in the auth store; the **backend re-enforces the same rules on every request**, so UI state can never grant access the API wouldn't.

### 5.11 Error & loading handling

- **Loading:** full-page skeletons (`Skeleton` primitive) in layouts while auth resolves; per-page skeletons (product grid, tables); spinner fallback for lazy routes; `keepPreviousData` on the checkout preview so totals don't flicker while a coupon is re-validated.
- **Errors:** every mutation toasts via `toast.error(extractErrorMessage(err))` or a domain fallback; axios-level errors (401 refresh failure, 403 inactive) are handled globally in the interceptor so pages don't double-toast; specific codes get specific UX (409 wishlist → refetch; `TWO_FACTOR_REQUIRED` → redirect; `ACCOUNT_INACTIVE` → session teardown).
- **Empty states:** `EmptyState` primitive for empty carts/orders/audit results etc.

### 5.12 Styling & theming

- **Tailwind CSS 4** with a custom token system in `index.css` (`@theme` + `:root` variables): warm-light palette, single terracotta brand color (`#b83e20`), radii/shadows tokens, `Plus Jakarta Sans` font. Components use `cn()` (clsx + tailwind-merge) for conditional classes.
- **MUI** appears exactly once — the Admin Audit Log page — wrapped in a `ThemeProvider` with `theme/auditTheme.ts` (palette mapped to the same design tokens) and **no** `CssBaseline`, so nothing outside that page is affected.
- Brand strings (name, tagline, copyright) come from `config/brand.ts` so rebranding is one file.


---

## 6. Backend Architecture

### 6.1 Module structure

`src/modules/` contains **18 feature modules**, each with the same internal files (where applicable: `routes.ts`, `controller.ts`, `service.ts`, `repository.ts`, `schema.ts`, `types.ts`; some modules add specialized files, e.g. `payments/razorpay.service.ts`, `auth/google.service.ts` + `auth.middleware.ts`, `discounts/discount.pricing.ts`):

| Module | Mounted at | Responsibility (highlights) |
|--------|-----------|------------------------------|
| `auth` | `/auth` | Register, login (with 2FA-pending step), refresh rotation, logout, forgot/reset password, Google OAuth (redirect + callback + ID-token), TOTP 2FA setup/enable/disable/verify/recovery-codes; `auth.middleware.ts` = the `authenticate` middleware used by all modules |
| `sellers` | `/sellers` | Public seller registration (creates User + Seller, status PENDING), own profile read/update, KYC document upload/delete (Cloudinary), public approved-seller count |
| `products` | `/products` | Public browse (search/filter/sort/paginate, **Redis-cached**), product detail; seller CRUD with ownership; image upload/delete; DRAFT/ACTIVE/INACTIVE lifecycle; cache invalidation on writes |
| `categories` | `/categories` | Public list (`/`, `/all`); admin create/update/delete |
| `users` | `/users` | Own profile (read/update), address book CRUD, avatar upload/delete (Cloudinary) |
| `cart` | `/cart` | One cart per user; add/update/remove/clear; **prices resolved from the DB, stock checked**; atomic checkout claim |
| `orders` | `/orders` | Checkout (multi-seller split, stock guards, discount + coupon pricing, rollback), checkout **preview** (no side effects), list/detail (buyer or owning seller), status transitions, cancellation (stock restore + coupon release + auto-refund), COD mark-paid, **invoice**, **tracking timeline** |
| `payments` | `/payments` | Gateway order initiate (idempotent), signature verify, **Razorpay webhook** (raw-body HMAC + idempotent event claim), refund (full, idempotent); `razorpay.service.ts` = RAZORPAY/MOCK gateway abstraction |
| `discounts` | `/discounts` | Seller date-windowed product-XOR-category percentage discounts; `discount.pricing.ts` = the shared checkout pricing engine |
| `coupons` | `/coupons` | Seller coupon codes (percent/fixed, min order, max discount, scope, total + per-user limits); atomic usage reservation/release |
| `reviews` | `/reviews` | Create (only after a delivered order, one per user per product), public list per product, update/delete own |
| `returns` | `/returns` | Request within 7 days of delivery; seller/admin status transitions; buyer cancel; stock restore on completion; duplicate block via partial unique index |
| `notifications` | `/notifications` | In-app notification list/unread/read; preferences read/update; the `notifyUser()`/`broadcastTo…` services that every other module calls |
| `wishlist` | `/wishlist` | Buyer wishlist: get, add, check, remove, clear |
| `inventory` | `/inventory` | Seller stock operations: transaction history (own products / one product), manual stock adjust (reason recorded); also `recordStockChange` used by orders/returns |
| `analytics` | `/sellers` (composes with sellers router) | Seller-scoped MongoDB aggregations: dashboard, sales series, top products, category performance, customers, revenue |
| `settlements` | `/sellers` | Seller's own settlement for a month (`GET /sellers/settlement`); `commission.service.ts` = platform commission rate (read/set/calculate) |
| `admin` | `/admin` | SUPER_ADMIN only: users list/activate-deactivate, sellers list/set status (with reason), products list/moderate, all-orders view, **audit-log viewer**, notification broadcast, settlements (generate/detail/process/mark-paid/cancel/fail/remind), commission settings |

All are mounted in **`src/routes/index.ts`** under `/api/v1`, which also defines `GET /health`.

### 6.2 Middleware chain

| Middleware | Defined in | What it does |
|------------|-----------|--------------|
| `authenticate` | `modules/auth/auth.middleware.ts` | Verifies the Bearer JWT, **re-loads the user from MongoDB on every request** (so deactivations take effect immediately — a still-valid token of a deactivated user gets `403 ACCOUNT_INACTIVE`), attaches `req.user` |
| `authorize(...roles)` | `middlewares/role.middleware.ts` | Checks `req.user.role` against the allowed roles → `403 FORBIDDEN` |
| `validate(schema, source)` | `middlewares/validation.middleware.ts` | Zod `safeParse` of body/query/params; on failure → `400 VALIDATION_ERROR`; parsed body replaces `req.body` (query/params consumers re-parse in the service layer, since Express 5 makes `req.query` read-only) |
| `uploadImage` / `uploadProductImages` / `uploadDocument` | `middlewares/upload.middleware.ts` | Multer (memory storage) with MIME allowlists and size limits (images 5 MB ×8; documents 10 MB) → `400 INVALID_FILE_TYPE` on violation |
| `requireTwoFactorSetup` | `middlewares/twoFactor.middleware.ts` | SELLER/SUPER_ADMIN users must have 2FA enabled or get `403 TWO_FACTOR_REQUIRED` (skipped in `NODE_ENV=test`) |
| `errorMiddleware` | `middlewares/error.middleware.ts` | Maps `AppError` → its status+code; `MulterError` → 400; `ZodError` → 400; anything else → logged + generic `500 INTERNAL_SERVER_ERROR`. No internals leak |
| `notFoundMiddleware` | `middlewares/notFound.middleware.ts` | `404` JSON for unmatched routes |

App-level middleware (`app.ts`), in order: `helmet` → rate limiters (300/15 min on `/api`, 20/15 min on `/api/v1/auth`; **disabled in test mode**) → `cors({origin: CORS_ORIGIN, credentials: true})` → Swagger UI at `/api-docs` → `express.json` (raw body captured for webhook signature) → `urlencoded` → `cookieParser` → routes → 404 → error handler.

### 6.3 Validation

- **Requests:** every route declares its Zod schema in the module's `schema.ts`; the `validate()` middleware runs it before the controller. Schemas use `.strict()` so unknown fields are rejected — the API surface is explicit.
- **Environment:** `config/env.ts` parses `process.env` with Zod **at startup** — a missing `MONGODB_URI` or a short JWT secret crashes the process with a clear message instead of failing at request time.
- **Files:** MIME + size validation in the multer file filters (§14).

### 6.4 Business logic — where it lives

- **Pricing engine** (`discounts/discount.pricing.ts`, used by cart, checkout, and preview): resolves the active discount per product — **product discount beats category discount; the highest percentage wins; discounts are never stacked**; date windows enforced.
- **Checkout orchestration** (`orders/order.service.ts`, ~1300 lines — the largest service): cart claim → per-seller order drafts → atomic stock decrements → coupon reservation → order creation → coupon usage records → payment record (ONLINE) → audit + notifications, with **rollback of every applied side effect** on failure.
- **Settlement calculation** (`settlements/settlement.service.ts` + `commission.service.ts`): monthly period bounds, commission rate **snapshotted once per generation run**, eligible = delivered non-cancelled orders, per-seller settlement with order-level breakdown, unique `(sellerId, periodKey)`.
- **Payment gateway** (`payments/razorpay.service.ts`): RAZORPAY (native `fetch` + HMAC, no SDK) vs MOCK (deterministic), signature verification (client + webhook), refund creation.
- **Return eligibility** (`returns/return.service.ts`): 7-day window anchored at `order.deliveredAt`, status machine, stock restore.

### 6.5 Concurrency & consistency (no distributed locks)

Every race-prone operation uses an **atomic MongoDB primitive** — the full map is recorded in `docs/architecture.md` (V3.11/V3.12):

| Concern | Mechanism |
|---------|-----------|
| Overselling at checkout | `$inc` stock with `$gte` guard; failed checkouts roll back already-applied decrements |
| Double-submit checkout | Cart claim: `checkoutLockedAt` set atomically (5-minute stale expiry) → `409 CART_CHECKOUT_IN_PROGRESS` |
| Coupon total limit | Atomic `findOneAndUpdate` `$inc usageCount` guarded by `$lt usageLimit` — the 101st concurrent claim fails |
| Coupon per-user limit | Unique `(couponId, userId)` partial index + atomic slot reservation; usage released on cancellation |
| Duplicate webhook processing | Sparse unique index on `Payment.webhookEventId` — the event claim is the lock |
| Duplicate return requests | Partial unique index on active `ReturnRequest.orderId` |
| Double settlement generation | Unique `(sellerId, periodKey)` index; regenerating returns the existing settlement |
| Double recovery-code use | `updateOne` + `$pull` with modifiedCount check |

### 6.6 Caching (Redis, optional)

`config/redis.ts` lazily connects to `REDIS_URL` (2 s timeout, no retry loop) and exposes `getFromCache` / `setCache` / `invalidateCache` with TTL constants. **Currently wired in one place:** the public product-catalog listing (`GET /products`) is cached for **60 s** and the cache is invalidated on product create/update/deactivate, discount changes, and admin product moderation. Without `REDIS_URL` (the default in `.env.example`) caching is silently disabled and everything reads MongoDB. (TTL constants for product-detail and category-list caches exist but are not yet used — §23.2.)

### 6.7 Error handling & response format

- `AppError(message, statusCode, code)` is the only expected error type; services throw it with a **machine-readable code** (`EMPTY_CART`, `INSUFFICIENT_STOCK`, `SELLER_NOT_APPROVED`, `ACCOUNT_INACTIVE`, `TWO_FACTOR_REQUIRED`, `CART_CHECKOUT_IN_PROGRESS`, `INVALID_COUPON`, …).
- `utils/apiResponse.ts`: `sendSuccess(res, message, data, status)` → `{ success: true, message, data }`; `sendError` → `{ success: false, message, code }`.
- The centralized error middleware guarantees: validation/upload errors → 400, business errors → their own status, unknowns → logged 500 with a generic message.

### 6.8 Audit logging & notifications

See dedicated sections: [§17 Audit Logging](#17-audit-logging) and [§16 Notifications & Background Jobs](#16-notifications--background-jobs). Both are invoked **from services** (fire-and-forget; a failed notification never fails the business operation).

---

## 7. User Roles & Permissions

### 7.1 Roles

`UserRole` (src/constants/roles.ts): `BUYER` (default), `SELLER`, `SUPER_ADMIN`. A `User` has exactly one role. Seller users additionally have a 1:1 `Seller` document whose `status` gates seller capabilities.

### 7.2 Capability matrix

| Capability | Guest | Buyer | Seller | Super Admin |
|------------|:-----:|:-----:|:------:|:-----------:|
| Browse products / read reviews / view categories | ✅ | ✅ | ✅ | — |
| Register buyer account / seller account | ✅ | — | — | — |
| Cart, checkout, orders, wishlist, addresses, avatar | — | ✅ | — | — |
| Pay COD on delivery / pay online | — | ✅ | — | — |
| Request returns, write reviews | — | ✅ | — | — |
| Manage own products / stock / discounts / coupons / orders | — | — | ✅ (APPROVED only) | — |
| Mark COD orders paid, deliver orders | — | — | ✅ (own orders) | ✅ (any) |
| View own analytics / customers / settlement | — | — | ✅ | — |
| Approve/reject/pause/suspend sellers | — | — | — | ✅ |
| Activate/deactivate users | — | — | — | ✅ |
| Manage categories, moderate products | — | — | — | ✅ |
| View all orders | — | — | — | ✅ |
| Generate/process settlements, set commission | — | — | — | ✅ |
| Broadcast notifications | — | — | — | ✅ |
| Read audit log | — | — | — | ✅ |

### 7.3 How access is enforced

1. **Route level:** `authenticate` (any logged-in user) → `authorize(Role…)` per route.
2. **Status level:** seller writes additionally require `Seller.status === APPROVED` (403 `SELLER_NOT_APPROVED`) and 2FA enabled (`requireTwoFactorSetup`); every route requires the user to be `isActive` (403 `ACCOUNT_INACTIVE`).
3. **Ownership level (IDOR-safe):** checked in services — a seller can only read/modify **their own** products/discounts/coupons/orders/inventory; a buyer only their own orders/cart/addresses/reviews/wishlist. Admin endpoints are role-gated, not owner-gated.
4. **UI level (frontend):** route guards, layout fences, and action guards mirror 1–3 for UX — but the API is the enforcement point.

---

## 8. Authentication & Security

### 8.1 Credential & token model

| Artifact | Format | Lifetime | Storage |
|----------|--------|----------|---------|
| Password | bcryptjs hash, **12 rounds** | — | DB, `select: false` (never in responses) |
| Access token | JWT (`type: "access"`, userId + role) | **15 min** (`JWT_ACCESS_EXPIRES_IN`) | `sessionStorage` in the browser; sent as `Authorization: Bearer` |
| Refresh token | JWT (`type: "refresh"`, with `tokenId`) | **7 days** (`JWT_REFRESH_EXPIRES_IN`) | **httpOnly** cookie scoped to `/api/v1/auth`; only its **SHA-256 hash** is stored in the `RefreshToken` collection |
| 2FA-pending token | JWT (`type: "2fa_pending"`) | minutes | returned in login response for 2FA users |
| Password-reset token | random, **hashed** at rest | short | `PasswordResetToken` collection |
| TOTP secret | 20-byte base32 | until disabled | DB, **AES-256-GCM encrypted** (key derived from `JWT_ACCESS_SECRET`), `select: false` |
| 2FA recovery codes | 8 single-use codes | until used/regenerated | DB, **hashed** (raw values shown exactly once) |

**Refresh rotation:** `POST /auth/refresh` is **single-use** — it invalidates the presented refresh token and issues a new one (and new cookie). Reusing a rotated token is rejected. `POST /auth/logout` revokes the token and clears the cookie. JWT secrets are validated ≥ 32 chars by the env schema.

### 8.2 Login flows

- **Password (buyer):** `POST /auth/login` → `{ accessToken, user }` + refresh cookie.
- **Password (2FA-enabled seller/admin):** `POST /auth/login` → `{ twoFactorRequired: true, loginToken }` → `POST /auth/2fa/verify` with TOTP code **or** a recovery code → `{ accessToken, user }`.
- **Google:** two entry points — (a) redirect flow: `GET /auth/google` → Google consent → `GET /auth/google/callback` (code exchange via `googleapis`); (b) ID-token flow: `POST /auth/google` with `{ idToken }` (the frontend's current path). Both verify the token/audience server-side, **upsert the user by `googleId` or email**, mark email verified, set the avatar if new, then issue a normal session. Deactivated accounts are rejected here too.
- **2FA setup:** `POST /auth/2fa/setup` (secret + `otpauthUrl` QR + one-time recovery codes) → `POST /auth/2fa/enable` (verify a live TOTP code). `POST /auth/2fa/disable` and `POST /auth/2fa/recovery-codes` (regenerate) also require a valid TOTP code.
- **Deactivated accounts:** login, 2FA-verify, and refresh all reject with `403 ACCOUNT_INACTIVE`; deactivation also **revokes all live refresh tokens**, and `authenticate` re-checks `isActive` on every request.

### 8.3 Two-factor authentication (TOTP)

- Google-Authenticator-compatible TOTP (custom implementation in `utils/totp.ts`, no extra dependency).
- **Mandatory** for SELLER and SUPER_ADMIN on all protected routes via `requireTwoFactorSetup` (skipped only in test mode) — a seller/admin without 2FA can log in but gets `403 TWO_FACTOR_REQUIRED` on API calls; the frontend converts that into a redirect to `/seller/2fa-setup`.
- Secret encrypted at rest; recovery codes hashed + single-use (atomic `$pull` with modifiedCount check).

### 8.4 Transport & hardening

- **helmet** — security headers on every response.
- **CORS** — single configured origin (`CORS_ORIGIN`) with credentials; anything else is blocked by the browser.
- **Rate limiting** — baseline **300 req/15 min/IP** on `/api`; strict **20 req/15 min/IP** on `/api/v1/auth` (login/register/password-reset brute-force protection). In-memory (single instance), disabled in test mode.
- **File validation** — MIME allowlists + size caps in multer before bytes touch any storage (§14).
- **Payment integrity** — payment status is never trusted from the client: client signatures are re-derived server-side (HMAC-SHA256 over `orderId|paymentId`); webhooks verify `x-razorpay-signature` over the **raw request body** (captured in `app.ts`) and claim events idempotently.
- **Secret hygiene** — `passwordHash`, token hashes, TOTP secrets, recovery codes are `select: false` and excluded by explicit response mappers; gateway errors surface as generic `502 PAYMENT_GATEWAY_ERROR` without provider bodies.
- **Centralized errors** — no stack traces or internal details in production responses.
- **Graceful shutdown** — SIGINT/SIGTERM close queues and exit cleanly.

---

## 9. Frontend ↔ Backend Communication

### 9.1 API base URL & dev proxy

```
browser ──▶ http://localhost:3000/api/v1/... ──(Vite proxy)──▶ http://localhost:5000/api/v1/...
```

- Frontend: `baseURL = import.meta.env.VITE_API_URL || '/api/v1'` (`frontend/.env.example` sets `VITE_API_URL=http://localhost:5000/api/v1`; the code also works with the relative `/api/v1` because of the Vite proxy in `vite.config.ts`).
- `vite.config.ts` also sets `host: '0.0.0.0'` and `allowedHosts: true` so the dev server works when reached through remote preview hosts.
- **Production:** serve the built SPA anywhere, set `VITE_API_URL` to the API origin at build time, and set `CORS_ORIGIN` (backend) to the SPA origin.

### 9.2 Authentication token & session handling

| Step | What happens |
|------|--------------|
| Login/register/2FA-verify/Google | Backend returns `accessToken` in JSON **and** sets the httpOnly refresh cookie |
| Store | `setAuth()` writes user → `sessionStorage`, token → `sessionStorage` (via `setAccessToken`) |
| Every request | Axios request interceptor adds `Authorization: Bearer <token>` |
| `401` (expired) | Response interceptor: single-flight `POST /auth/refresh` (cookie is sent automatically thanks to `withCredentials: true`); queued concurrent 401s retry with the new token; the original request is replayed. Refresh failure → clear token → redirect `/login` |
| Auth endpoints | `/auth/login`, `/auth/register`, `/auth/google` **skip** the refresh logic (a 401 there = bad credentials) |
| Page load | Layouts bootstrap: `getMe` → (on error) `refresh` + `getMe` → (on error) `logout` |
| Logout | `POST /auth/logout` (revokes refresh token, clears cookie) + local `logout()` |
| Deactivation while logged in | Global `403 ACCOUNT_INACTIVE` handling + 30 s status polling (§5.3) |

### 9.3 How protected requests work

1. The interceptor attaches the Bearer token.
2. Backend `authenticate` verifies the JWT and **re-loads the user** (role + `isActive`).
3. `authorize(...)` enforces the role; services enforce ownership/status.
4. Any failure yields the standard error envelope, which the frontend maps to UX (redirect/toast) per §5.10–5.11.

### 9.4 Role-based access handling

The frontend knows the role from the stored `user` object and uses it for (a) route guards, (b) layout/nav rendering, (c) action guards. The backend re-checks the role from the freshly-loaded user on **every** request — the client can never elevate itself.

### 9.5 How API errors are handled on the frontend

- `extractErrorMessage(err)` → `response.data.message` (the backend always sends a user-safe message) → fallback text.
- Global interceptor-level handling: 401 (refresh queue), 403 `ACCOUNT_INACTIVE` (throttled toast + session teardown).
- Page-level: mutations toast errors; special codes get special UX (`TWO_FACTOR_REQUIRED` → 2FA setup redirect; 409 on wishlist add → cache refetch; "No changes to update." for pristine edit forms).
- The `isAccountInactiveError` helper prevents double-toasting for errors already handled globally.

### 9.6 Contract details both sides rely on

- Envelope: `{ success, message, data }` / `{ success: false, message, code }`.
- Pagination: `{ items, total, page, limit, totalPages }`.
- Money is in **INR units** (numeric); the frontend renders with `Intl.NumberFormat('en-IN')` and `toAmount()` guards against `NaN`.
- Dates are ISO strings.
- Uploads: `multipart/form-data` with the field names `images` (product), `image` (avatar), `document` + `documentType` (seller KYC).
- ⚠️ One known contract mismatch (COD vs CASH_ON_DELIVERY) is documented in §23.2.

---

## 10. Database & Data Model Overview

**23 Mongoose models** (`src/models/`):

| Model | Purpose | Key fields / relations |
|-------|---------|------------------------|
| `User` | Account + role + auth data | `role`, `email` (unique), `passwordHash` (select:false), `googleId` (sparse unique), `authProvider` (LOCAL/GOOGLE), `avatarUrl`/`avatarPublicId`, `isActive`, `twoFactorEnabled`, `twoFactorSecretEncrypted` (select:false), `recoveryCodes` (hashed, select:false) |
| `Seller` | 1:1 seller profile (KYC) | `userId` (unique → User), `businessName`, `gstin`/`pan` (unique, uppercase, **immutable after creation**), bank fields, address, `documents[] {type,url,publicId}`, `status` (PENDING→APPROVED/REJECTED/PAUSED/SUSPENDED), `statusReason` |
| `Category` | Admin-managed taxonomy | `name` (unique), `description`, `isActive` |
| `Product` | Catalog item (belongs to one seller) | `sellerId`, `categoryId`, `name`, `description`, `price`, `compareAtPrice`, `sku`, `stock`, `lowStockThreshold`, `images[] {url,publicId}`, `specifications[] {key,value}`, `status` (DRAFT/ACTIVE/INACTIVE), **aggregate `rating`/`numReviews`** maintained server-side |
| `Cart` | One cart per user | `userId` (unique), `items[] {productId, quantity}`, `checkoutLockedAt` (atomic claim, 5-min stale) |
| `Order` | One order **per seller** per checkout | `orderNumber`, `userId` (buyer), `sellerId`, `items[]` **snapshot** {productId, name, price, quantity, subtotal, discountAmount}, `shippingAddress` **snapshot**, `itemsTotal`, `discountTotal`, `couponId/couponCode/couponDiscount`, `total`, `paymentMethod`, `paymentStatus`, `paymentId`, `status`, `deliveredAt` (anchors the 7-day return window) |
| `OrderTimeline` | Audit trail of order status changes | `orderId`, `status`, `actorId/actorRole`, `reason`, `createdAt` → powers the tracking endpoint |
| `Payment` | One payment record per order | `orderId`, `gateway` (RAZORPAY/MOCK), `gatewayOrderId`, `paymentId`, `amount`, `status` (PENDING/PAID/FAILED/REFUNDED), `refundStatus`, `webhookEventId` (sparse unique — idempotency), refund fields |
| `Discount` | Seller sales discount | `sellerId`, `name`, `type` (PRODUCT xor CATEGORY), `productId|categoryId`, `percentage` (1–100), `startDate/endDate`, `status` (ACTIVE/INACTIVE) |
| `Coupon` | Seller coupon code | `sellerId`, `code` (unique per seller), `type` (PERCENTAGE/FIXED), `value`, `minOrderValue`, `maxDiscount`, scope (product/category), `usageLimit`, `perUserLimit`, `usageCount`, `startDate/endDate`, `status` |
| `CouponUsage` | Who used which coupon on which order | `couponId`+`userId` (partial unique for per-user limit), `orderId`, `released` (flag on cancellation) |
| `Review` | One per user per product | `productId`, `userId`, `orderId`, `rating` (1–5), `comment`; unique `(productId,userId)` |
| `ReturnRequest` | Return lifecycle | `orderId`, `userId`, `productId`, `reason`, `status` (PENDING→APPROVED→COMPLETED \| REJECTED \| CANCELLED), `refundAmount`; partial unique index on active `orderId` |
| `InventoryTransaction` | Stock audit trail | `productId`, `sellerId`, `type` (DECREMENT/INCREMENT/ADJUST), `quantity`, `previousStock`, `newStock`, `reason`, `referenceId/Type` |
| `Notification` | In-app notifications | `userId`, `type`, `title`, `message`, `entityType/Id`, `channel`, `isRead` |
| `NotificationPreference` | Per-user delivery prefs | `userId` (unique), toggles per category (order/payment/promotional) for in-app + email |
| `Address` | Saved shipping addresses | `userId`, `label`, recipient, phone, address lines, city/state/pincode |
| `RefreshToken` | Rotating session tokens | `userId`, `tokenHash` (SHA-256), `expiresAt` |
| `PasswordResetToken` | Forgot-password flow | `userId`, `tokenHash`, `expiresAt` |
| `Settlement` | Monthly seller settlement | `sellerId`+`periodKey` (unique), `month`, `orderSnapshots[]` {orderId, total, commissionRate, commissionAmount, sellerPayable}, `totalSales`, `totalCommission`, `netPayable`, `commissionRate` (snapshotted), `status` (PENDING→PROCESSING→PAID/FAILED/CANCELLED), timestamps |
| `PlatformSetting` | Configurable platform values | Singleton doc: `commissionRate` (default **10%**) |
| `Wishlist` | One per buyer | `userId` (unique), `items[] {productId, addedAt}` |
| `AuditLog` | Audit trail (append-only) | `actorId/actorRole`, `action`, `entityType`, `entityId`, `before/after`, `metadata`, `createdAt` |

### Relationship map (simplified)

```
User 1──1 Seller            (seller KYC; status gates selling)
User 1──N Order (as buyer)      Seller 1──N Order (as seller)
Order ──N──1 Product            (via item snapshots; pricing frozen at checkout)
Product N──1 Category           Product N──1 Seller
Order 1──1 Payment              Order 1──N OrderTimeline
Order 1──0..1 ReturnRequest     Review N──1 Product (+User, +Order)
Coupon 1──N CouponUsage N──1 Order
Settlement 1──1 Seller + month  (order snapshots embedded)
Address / Wishlist / Notification / NotificationPreference 1──1 or N──1 User
AuditLog references any actor + entity (loose coupling by id)
```

**Design notes**

- **Snapshots, not references, for money-critical data:** order items freeze name/price/discount, orders freeze the shipping address, settlements freeze per-order commission math — later edits to products/prices/settings never rewrite history.
- **Unique/partial indexes are the idempotency layer** (webhooks, coupons, returns, settlements, recovery codes) — see §6.5.
- **Sensitive fields are `select: false`** and mapped out of responses.

---

## 11. Major Business Workflows

### 11.1 Buyer registration / login

1. `POST /auth/register` {name, email, password} → bcrypt hash → `User` (role BUYER).
2. Login: `POST /auth/login` → access token + rotating refresh cookie. 2FA users (sellers/admins) get a `loginToken` step instead (§8.2).
3. Google sign-in: ID token (or redirect+callback) → verified → upsert by `googleId`/email → session.
4. Frontend stores the session (`sessionStorage` + cookie), hydrates the profile, and the layout's 30-s status poll keeps the session honest.
5. Password recovery: `forgot-password` (email with token link — Ethereal preview in dev) → `reset-password`.

### 11.2 Seller registration → documents → admin approval

1. `POST /sellers/register` (public, Zod-validated KYC: GSTIN/PAN/IFSC regexes) → creates `User` (SELLER) + `Seller` (**status PENDING**). Frontend lands on `/seller/pending`.
2. Seller logs in (2FA is already enforced for sellers on API calls → they must run the 2FA wizard first — the API surfaces `TWO_FACTOR_REQUIRED` and the frontend redirects to `/seller/2fa-setup`).
3. Seller uploads KYC documents (GST/PAN/bank statement) via `POST /sellers/me/documents` (Cloudinary).
4. Super Admin (`/admin/sellers`) reviews and sets status via `PATCH /admin/sellers/:id/status` — `APPROVED` (or `REJECTED`/`SUSPENDED` with a **reason** shown to the seller). A notification (+ email per preferences) is sent on the decision; audit-logged.
5. Only from `APPROVED` can the seller create products; GSTIN/PAN become **immutable** after creation.

### 11.3 Seller product creation & management

1. `POST /products` (APPROVED seller, 2FA enabled) → product created as **DRAFT** (not visible in the public catalog).
2. Images: `POST /products/:id/images` (up to 8, Cloudinary); delete by publicId.
3. Seller flips status to **ACTIVE** (public) or **INACTIVE** (hidden) via `PATCH /products/:id`.
4. Every mutation: ownership check → service rules → repository → **audit log** + **catalog cache invalidation**.
5. Admins can moderate any product (status change, `/admin/products`).

### 11.4 Buyer product browsing

`GET /products` (public) with `search`, `category`, `minPrice`/`maxPrice`, `sort` (newest/oldest/price_asc/price_desc/name_asc), `page`/`limit` — served from the Redis catalog cache when enabled (60 s TTL). `GET /products/:id` adds the full detail (specs, images, aggregate rating). The homepage and catalog pages are 100 % live data (no seeded/mock products in the UI).

### 11.5 Cart

- One `Cart` per buyer. `POST /cart/items` checks **stock** and resolves the **current price from the DB** (client prices are never trusted).
- `PATCH /cart/items/:productId` (quantity, stock-aware), `DELETE /cart/items/:productId`, `DELETE /cart` (clear).
- The cart response includes live line prices so the UI always shows current money.

### 11.6 Cart → checkout → payment → order

1. **Preview (no side effects):** `POST /orders/preview` {couponCode?} returns the exact per-seller order breakdown (items, product discounts, coupon discount, totals). The checkout page calls it whenever the cart fingerprint or coupon changes.
2. **Place order:** `POST /orders` {shippingAddressId, paymentMethod, couponCode?}:
   1. Address ownership check → **cart claim** (atomic; double-submit → `409 CART_CHECKOUT_IN_PROGRESS`);
   2. Build per-seller drafts with the shared pricing engine (product discount beats category, highest wins, never stacked);
   3. **Atomic stock decrement** per line (`$gte` guard; any failure rolls back applied decrements);
   4. Coupon: validate → atomically reserve total + per-user slots → record usage against the order;
   5. Create **one Order per seller** (status PENDING, paymentStatus PENDING, price snapshots);
   6. ONLINE payment → create a `Payment` record; COD → stays UNPAID until delivered;
   7. Notifications to seller(s) (+ buyer), audit log.
3. **COD path:** order sits UNPAID; seller delivers → buyer pays on delivery → seller/admin `POST /orders/:id/pay` → PAID.
4. **Online path:** see §15.2.

### 11.7 Order status lifecycle

```
PENDING ──▶ CONFIRMED ──▶ SHIPPED ──▶ DELIVERED
   │            │
   └────────────┴──▶ CANCELLED   (buyer, while PENDING/CONFIRMED)
```

- Transitions go through `PATCH /orders/:id/status` (seller for own orders, admin for any) — the service validates the transition, appends an **OrderTimeline** entry, notifies the buyer, and (on DELIVERED) stamps `deliveredAt` (return window anchor).
- **Cancellation** (`POST /orders/:id/cancel`, buyer, PENDING/CONFIRMED only): restores stock **exactly once** (idempotent), releases coupon usage, and **auto-refunds** paid online payments.
- Each transition is audit-logged.

### 11.8 Reviews (after delivery)

- Eligibility: the product must have been **delivered** in one of the buyer's orders; **one review per user per product** (unique index); rating 1–5 + optional comment.
- Creating/updating/deleting a review maintains the product's **server-side aggregate** (`rating`, `numReviews`).
- Public: `GET /reviews/product/:productId`.

### 11.9 Returns & refunds

1. Buyer `POST /returns` {orderId, productId, reason} — allowed only **within 7 days of `deliveredAt`**, and only for delivered orders (partial unique index blocks a second active request for the same order).
2. Seller/admin `PATCH /returns/:id/status`: PENDING → APPROVED or REJECTED (buyer can `POST /returns/:id/cancel` while PENDING).
3. On **APPROVED → COMPLETED**: stock is restored (inventory transaction recorded) and, for online-paid orders, a **full refund** is issued (idempotent; real-mode refunds complete asynchronously via the `refund.processed` webhook).
4. Every step notifies both parties and is audit-logged.

### 11.10 Discounts

- Seller creates a date-windowed percentage discount scoped to **one product XOR one category** (1–100 %).
- The shared pricing engine resolves it at cart/preview/checkout time; **product-level beats category-level, the highest percentage wins, and discounts never stack**.
- Date windows are enforced; inactive discounts are ignored. Changes invalidate the catalog cache.

### 11.11 Coupons

- Seller creates a code (PERCENTAGE or FIXED) with min order value, max discount cap, optional product/category scope, total usage limit, per-user limit, date window.
- Buyer applies the code at checkout; the preview endpoint validates it before the order is placed.
- Usage is reserved **atomically** (total limit + per-user slot); the 101st concurrent claim fails. Usage is recorded per order and **released when the order is cancelled**.

### 11.12 Inventory

- Every stock change (checkout decrement, cancellation/return restore, manual adjustment) writes an `InventoryTransaction` with `previousStock → newStock` and a reason — a full audit trail.
- Sellers can view levels, set low-stock thresholds, and make **manual adjustments** (`POST /inventory/product/:productId/adjust` with a required reason).

### 11.13 Seller analytics

All MongoDB aggregations **scoped to the authenticated seller** (no cross-seller leakage): dashboard KPIs (`/sellers/dashboard`), sales time series by day/month (`/sellers/analytics/sales`), top products, category performance, customer list (`/sellers/customers`), revenue statistics (`/sellers/revenue`). Rendered with Recharts on `SellerAnalyticsPage` / `SellerDashboardPage`.

### 11.14 Seller settlements

1. Admin sets/adjusts the platform commission (`GET/PATCH /admin/settings/commission`, default 10 %).
2. Admin generates settlements for a month (`POST /admin/settlements/generate` {month}): eligible = **delivered, non-cancelled** orders in the period; the commission rate is **snapshotted once per run**; one `Settlement` per seller (unique per seller+period — regenerating is a no-op returning the existing one).
3. Admin walks the lifecycle: `process` → `mark-paid` (or `fail` → retry, or `cancel`), with `remind` notifications to the seller.
4. Seller views their own settlement (`GET /sellers/settlement?month=YYYY-MM`) with the per-order breakdown.

### 11.15 Super Admin management

- **Users:** list (role filter) / activate-deactivate (`PATCH /admin/users/:id` — deactivation revokes refresh tokens and takes effect immediately, §5.3).
- **Sellers:** list (status filter) / set status with reason (§11.2).
- **Categories:** full CRUD.
- **Products:** list + moderate (status).
- **Orders:** list all (status filter).
- **Notifications:** broadcast to `SELLERS`/`USERS` audience or explicit recipients.
- **Settlements + commission:** §11.14.
- **Audit log:** §17.

### 11.16 Audit logging (workflow)

Every significant action (login, register, order create/cancel/status, payment initiate/verify/refund, product/discount/coupon mutations, return requests, seller decisions, settlement actions, commission changes, user status changes) calls `logAudit()` from its service with actor, action, entity, before/after and safe metadata. The result is a filterable, paginated ledger consumed by the admin console (§17).


---

## 12. Feature-by-Feature Overview

| Feature | Frontend | Backend | Status / notes |
|---------|----------|---------|----------------|
| Buyer registration / login | `RegisterPage`, `AuthPage` | `auth` module | ✅ Complete |
| Forgot / reset password | `ForgotPasswordPage`, `ResetPasswordPage` | `auth` module + email | ✅ Complete (Ethereal preview in dev) |
| Google sign-in | `googleLogin` (ID token) in `authApi` | `google.service.ts` (ID-token + redirect/callback) | ✅ Implemented; needs Google OAuth credentials to be usable (§19.1) |
| TOTP 2FA (sellers/admins, mandatory) | `AuthPage` 2FA step, `SellerTwoFactorSetupPage` | `auth` 2FA endpoints + `requireTwoFactorSetup` middleware | ✅ Complete (recovery codes included) |
| Account deactivation enforcement | interceptor + `useAccountStatus` + guards | `authenticate` re-check + refresh-token revocation | ✅ Complete, no page refresh needed |
| Seller onboarding + approval | `RegisterSellerPage`, `PendingApprovalPage`, `SellerProfilePage` (documents) | `sellers` + `admin` modules | ✅ Complete |
| KYC document upload/delete | `DocumentUpload` component | Cloudinary upload/delete | ✅ Complete |
| Product CRUD + images | `SellerProductsPage`, `ImageUpload` | `products` module | ✅ Complete (max 8 images, ownership, DRAFT/ACTIVE/INACTIVE) |
| SKU & specifications | product forms | `Product` fields | ✅ Complete |
| Category management | `AdminCategoriesPage` (+`CategoryFormDialog`) | `categories` module | ✅ Complete |
| Catalog browsing / search / filters | `ProductListPage`, `HomePage`, `ProductSearchBar` | `GET /products` (Redis-cached) | ✅ Complete (MongoDB text-ish search only) |
| Cart (live prices, stock checks) | `CartPage`, `useCart` | `cart` module | ✅ Complete (double-submit protection) |
| Checkout with server preview | `CheckoutPage` | `POST /orders` + `POST /orders/preview` | ✅ Complete (multi-seller split) |
| Coupons at checkout | coupon apply + preview | `coupons` module (atomic limits) | ✅ Complete |
| Discounts (auto-applied) | price display in catalog/detail/cart | `discounts` pricing engine | ✅ Complete |
| COD payment | `OrderDetailPage` "pay" flow | `POST /orders/:id/pay` | ⚠️ Works via API; see COD enum mismatch §23.2 |
| Online payment (Razorpay) | `PaymentPage` (checkout.js) | `payments` module (RAZORPAY/MOCK) | ✅ Implemented; browser flow needs real (test) keys, §23.2 |
| Refunds (full, auto on cancel) | — (admin/seller endpoints) | `payments` + webhook | ✅ Full only; no partial refunds |
| Order tracking timeline | `OrderDetailPage` | `OrderTimeline` + `GET /orders/:id/tracking` | ✅ Complete |
| Order invoice | `OrderDetailPage` | `GET /orders/:id/invoice` | ✅ Complete |
| Returns (7-day window) | return request UI (order detail) | `returns` module | ✅ Complete (stock restore + refund) |
| Reviews | `ReviewDialog`, detail page | `reviews` module | ✅ Complete (post-delivery, one per product) |
| Wishlist | `WishlistPage`, hearts on cards, `useWishlist` | `wishlist` module | ✅ Complete |
| Addresses | `AccountPage`, `CheckoutPage` | `users` addresses | ✅ Complete |
| Avatar upload/delete | `ProfileAvatar`, `AccountPage`, `AdminProfilePage` | `users` avatar + Cloudinary | ✅ Complete |
| In-app notifications + preferences | `NotificationsPage` | `notifications` module | ✅ Complete |
| Email notifications | — | Nodemailer (Ethereal/SMTP) | ✅ Complete (Ethereal in dev) |
| Admin broadcast | `AdminNotificationsPage` | `POST /admin/notifications` | ✅ Complete |
| Inventory management | `SellerInventoryPage` | `inventory` module + transactions | ✅ Complete |
| Seller analytics | `SellerAnalyticsPage`, `SellerDashboardPage` (Recharts) | `analytics` module (aggregations) | ✅ Complete |
| Settlements | `SellerSettlementPage`, `AdminSettlementsPage` | `settlements` module | ✅ Complete (admin-triggered, no auto cron) |
| Commission management | `AdminSettlementsPage` | `commission.service.ts` | ✅ Complete |
| Audit log viewer | `AdminAuditPage` (MUI) | `GET /admin/audit-logs` | ✅ Complete |
| API docs | — | Swagger UI `/api-docs/` | ✅ Served (coverage note in §23.2) |
| Real-time updates (push) | — (30 s polling for account status only) | — | ❌ Not implemented |

---

## 13. Third-Party Integrations

### 13.1 MongoDB / Mongoose

The only primary datastore. Mongoose 9 for schemas/validation; atomic operations for concurrency (§6.5); compound + partial unique indexes for idempotency (§10). `config/database.ts` connects at startup and exits the process on failure. Tests target a derived `*_test` database.

### 13.2 Cloudinary

Managed file storage for **product images, user avatars, seller KYC documents**. The SDK is configured in `config/cloudinary.ts`; `services/cloudinary.service.ts` wraps upload/delete and runs a startup `verifyCloudinaryConfig()`. Files are referenced by `url` + `publicId`; deletion always goes through `publicId`. **Required env** (the env schema enforces them — the API will not boot without Cloudinary configured; §19.1).

### 13.3 Razorpay

Online payment gateway (India). See the full flow in §15. Two modes: **RAZORPAY** (real API via native `fetch` + Basic auth, HMAC verification) and **MOCK** (deterministic, fixed dev signing secret) when no keys are configured.

### 13.4 Redis (optional)

`ioredis` client with lazy connect, 2 s timeout, and **fail-open** behavior: if `REDIS_URL` is unset or Redis is down, all cache helpers no-op and the app runs on MongoDB alone. Today it is used exclusively for the public product-catalog listing cache (60 s TTL) with explicit invalidation on product/discount/admin writes (§6.6).

### 13.5 Bull / background jobs

`bull` is declared in `package.json`, and `src/services/queue/` exists — but the code is a **synchronous inline stub** (`addJob` just runs the handler; `workers.ts` only logs; `addJob` is not called from any module). There is no actual queue, no worker process, and no persisted jobs. "Async" work today means either fire-and-forget promises (email/notifications) or synchronous inline execution. See §16.3 and §23.2.

### 13.6 Nodemailer / SMTP

`services/email.service.ts` creates one shared transport: **real SMTP** when `SMTP_HOST` is set (TLS strict in production), otherwise an **Ethereal test account** (dev) whose preview URL is logged. `sendNotificationEmail` retries twice (500 ms, 1 s backoff) — duplicates are considered harmless. Email is only sent when the recipient's preference allows, and never in test mode.

### 13.7 Google OAuth

`googleapis` OAuth2 client: generates the consent URL, exchanges the authorization code (`/auth/google/callback`), and **verifies ID tokens** (`POST /auth/google`). Requires `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` — and note the module throws at import time when they are missing (§19.1, §23.2).

### 13.8 Swagger

`swagger-jsdoc` builds the OpenAPI spec from the shared definition in `src/docs/swagger.ts` (info, servers, tags, `bearerAuth` security scheme, reusable component schemas) plus `@openapi` JSDoc blocks in the route files; `swagger-ui-express` serves it at **`/api-docs/`**. The Postman collection in `docs/` is generated from the same spec (`tests/generate-postman.ts`).

### 13.9 Other notable frontend integrations

**Recharts** (seller analytics charts), **MUI 9 + Emotion** (admin audit page only), **Razorpay checkout.js** (loaded on demand by `PaymentPage`), **Vite proxy** (dev-only API bridge), **mongodb-memory-server** (test-only, backend).

---

## 14. File Uploads & Cloudinary

### 14.1 Flow

```
Browser (FormData) → multer (MIME + size gate, memory storage)
  → cloudinary.service.upload → Cloudinary (url + publicId)
  → DB stores { url, publicId } → response
Delete: DB lookup → cloudinary.service.delete(publicId) → clear DB field
```

### 14.2 Endpoints & limits

| Endpoint | Field | Accepted types | Limit | Stored on |
|----------|-------|----------------|-------|-----------|
| `POST /products/:id/images` | `images` (multi) | JPEG, PNG, WebP, GIF | 5 MB × **8** | `Product.images[]` |
| `DELETE /products/:id/images/:imageId` | — (imageId = publicId, URL-encoded) | — | — | removes entry |
| `POST /users/me/avatar` | `image` | JPEG, PNG, WebP, GIF | 5 MB | `User.avatarUrl/PublicId` (previous avatar deleted) |
| `DELETE /users/me/avatar` | — | — | — | clears avatar |
| `POST /sellers/me/documents` | `document` + `documentType` | JPEG, PNG, **PDF** | **10 MB** | `Seller.documents[]` |
| `DELETE /sellers/me/documents/:documentId` | — (publicId, URL-encoded) | — | — | removes entry |

### 14.3 Frontend

`components/ui/ImageUpload.tsx` (multi-image with drag-drop, local previews, pending-then-upload, delete-by-publicId, maxImages prop) and `components/ui/DocumentUpload.tsx` (KYC document manager with type selector, size/format pre-validation, preview/download/delete — types normalized via `lib/sellerDocuments.ts`, which also maps legacy short aliases `GST`/`PAN` to canonical types). Both mirror the backend's type/size rules on the client for fast feedback; the backend remains the authority.

---

## 15. Payments & Razorpay

### 15.1 Payment methods

- **`CASH_ON_DELIVERY`** — order stays UNPAID; seller/admin marks it paid after delivery (`POST /orders/:id/pay`).
- **`ONLINE`** — Razorpay gateway (real or MOCK).

### 15.2 Online payment flow

```
1. Checkout creates Order(PENDING) + Payment(PENDING, gateway order created)
   POST /payments/orders/:orderId/initiate   (idempotent — returns the existing record)
   ↳ response: { keyId, amount, gatewayOrderId, … }

2. Frontend (PaymentPage):
   - loads https://checkout.razorpay.com/v1/checkout.js
   - opens Razorpay modal: keyId, amount (INR), order_id = gatewayOrderId,
     prefilled name/contact, themed
   - on success handler: POST /payments/orders/:orderId/verify
     { paymentId: razorpay_payment_id, signature: razorpay_signature }

3. Backend verify: re-derives HMAC-SHA256(orderId|paymentId) server-side
   (client status is never trusted) → matches → Payment=PAID,
   Order.paymentStatus=PAID → notify buyer+seller, audit log

4. Webhook (parallel safety net):
   POST /payments/webhook/razorpay — verifies x-razorpay-signature over the RAW
   body (RAZORPAY_WEBHOOK_SECRET; mock fixture in MOCK mode), claims the event id
   idempotently (unique webhookEventId), marks PAID on paid.* / REFUNDED on
   refund.processed. Duplicate deliveries are no-ops.
```

### 15.3 MOCK mode (development & tests)

When `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are empty, the gateway abstraction serves **deterministic mock** orders/payments and verifies signatures with a fixed, documented dev-only secret — so the *entire server-side verification path* (initiate → verify → webhook → refund) runs end-to-end without credentials or real money. This is what the backend test suite and the Postman collection exercise. **Important for the browser:** `PaymentPage` still loads the *real* Razorpay checkout.js, which will only render with a real (e.g. sandbox/test) publishable key — see §23.2.

### 15.4 Refunds

- Full-amount only (`POST /payments/orders/:orderId/refund` — buyer/admin; idempotent: already-REFUNDED returns the current state).
- **Automatic** when a paid online order is cancelled.
- Real mode: refund created as PENDING, completed asynchronously via the `refund.processed` webhook (`RefundStatus: PENDING/PROCESSED/FAILED`). Mock mode completes immediately.

### 15.5 Idempotency map (payments)

| Operation | Idempotent? | How |
|-----------|-------------|-----|
| `initiate` | yes | returns the existing Payment instead of a second gateway order |
| `verify` | yes | already-PAID returns current state |
| webhook | yes | unique event claim (sparse unique index) |
| `refund` | yes | already-REFUNDED returns current state (same gateway refund id) |
| order cancel (paid) | yes | already-CANCELLED is a no-op; stock restored exactly once |

### 15.6 Environment

`RAZORPAY_KEY_ID` (publishable key, also sent to the browser as `keyId`), `RAZORPAY_KEY_SECRET` (server-side), `RAZORPAY_WEBHOOK_SECRET` (webhook HMAC). All optional in dev (MOCK mode); required for real/test payments.

---

## 16. Notifications & Background Jobs

### 16.1 In-app notifications

- `Notification` documents per user, with `type` (order confirmed/shipped/delivered/cancelled, payment received/refunded, seller approved/rejected, return status, settlement, admin message, …), `entityType/Id` deep-link context, and `isRead`.
- API: list (unread filter), unread count, mark read / mark all read, **preferences** (per category: in-app on/off, email on/off).
- Delivery rules (`notification.service.ts`): in-app is created unless the recipient disabled the channel; **emails are sent only when the recipient's preference allows the category, and never in test mode**.
- The notification call is **fire-and-forget** — a failed notification never fails the business operation that triggered it.
- Admin **broadcast** (`POST /admin/notifications`) targets `SELLERS` / `USERS` audiences or explicit recipient ids and reports how many were delivered.

### 16.2 Email

- Triggered by the same events as in-app (order, payment, promotional categories), via `sendNotificationEmail` (Nodemailer; Ethereal preview URL in dev, real SMTP in production; 2 retries with backoff).
- Password-reset emails use the same transport.

### 16.3 Background jobs — current state (important)

- `src/services/queue/queue.config.ts` defines `JobType` (SEND_EMAIL, SEND_NOTIFICATION, PROCESS_WEBHOOK, OUT_OF_STOCK_CHECK) and an `addJob` that **runs the handler synchronously inline** — its own docblock calls it a stub, and **no module in the app calls `addJob`**.
- `workers.ts` only logs "Workers initialized (synchronous mode)" at startup; `server.ts` calls it and closes queues on shutdown (both currently no-ops).
- **Net effect:** there is no durable queue, no retries at the queue level, and no off-request processing. Long-running work (settlement generation) runs directly in the admin request; emails/notifications run as fire-and-forget promises. The `bull` dependency is present but unused. If real background processing is needed, this stub is the intended swap point (Bull + Redis).

---

## 17. Audit Logging

- **What is logged:** logins, registrations, order creation/cancellation/status changes, payment initiate/verify/capture/refund, product/discount/coupon create-update-delete, return requests/decisions, seller registration/approval/decisions, user activation/deactivation, settlement generation/lifecycle actions, commission changes, category changes, broadcasts.
- **Shape:** `{ actorId, actorRole, action, entityType, entityId, before, after, metadata, createdAt }` — one append-only `AuditLog` document per action, written via the single `logAudit()` service. **Passwords, tokens, TOTP secrets, recovery codes and payment credentials are never passed to it.**
- **Viewer API:** `GET /api/v1/admin/audit-logs` (SUPER_ADMIN only) — paginated (`page`, `limit` ≤ 100) with filters `actorId`, `actorRole`, `action`, `entityType`, `entityId`, inclusive `fromDate`/`toDate` on `createdAt`, and sorting via `sortBy` (`createdAt|action|entityType|actorRole|actorId`) + `sortOrder`. It is a pure read — it never writes its own entries.
- **Viewer UI:** `AdminAuditPage` (`/admin/audit`) — the one MUI-based page: filter bar, data table, per-cell **copy** buttons, themed to match the app (see `theme/auditTheme.ts`, `components/admin/audit/`).
- **Tests:** `tests/audit.test.ts` (service-level) and `tests/audit-logs.test.ts` (endpoint-level: filters, sorting, pagination, role gating) — the latter is the largest suite (46 cases).

---

## 18. API Overview

- **Base URL:** `/api/v1` (e.g. `http://localhost:5000/api/v1`).
- **Envelope:** `{ success: true, message, data }` / `{ success: false, message, code }`.
- **Pagination:** `{ items, total, page, limit, totalPages }`.
- **Auth:** `Authorization: Bearer <accessToken>`; refresh via httpOnly cookie on `/api/v1/auth/*`.
- **Health:** `GET /api/v1/health` → `{ status: "UP", timestamp }`.

The route files currently define **~120 endpoints** across the module routers listed below (exact, current list):

### 18.1 Authentication — `/auth` (14)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/register` | public | Create buyer account |
| POST | `/login` | public | Login (2FA users get `loginToken`) |
| POST | `/refresh` | cookie | Rotate refresh token |
| POST | `/logout` | bearer | Revoke session |
| POST | `/forgot-password` | public | Email reset link |
| POST | `/reset-password` | public (token) | Set new password |
| GET | `/google` | public | Redirect to Google consent |
| POST | `/google` | public | Login with Google **ID token** |
| GET | `/google/callback` | public | OAuth code callback |
| POST | `/2fa/verify` | loginToken | Complete 2FA login (TOTP or recovery code) |
| POST | `/2fa/setup` | seller/admin | Generate TOTP secret + QR + recovery codes |
| POST | `/2fa/enable` | seller/admin | Enable 2FA with a live code |
| POST | `/2fa/disable` | seller/admin | Disable 2FA (code required) |
| POST | `/2fa/recovery-codes` | seller/admin | Regenerate recovery codes |

### 18.2 Sellers — `/sellers` (6)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/count` | public | Count of approved sellers |
| POST | `/register` | public | Seller KYC registration (→ PENDING) |
| GET | `/me` | seller | Own profile (+documents, status, reason) |
| PATCH | `/me` | seller | Update own profile (GSTIN/PAN immutable) |
| POST | `/me/documents` | seller (multipart) | Upload KYC document |
| DELETE | `/me/documents/:documentId` | seller | Delete document (publicId) |

### 18.3 Products — `/products` (9)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | public | Browse: search/category/price/sort/pagination (cached) |
| GET | `/:id` | public | Product detail |
| POST | `/` | seller (APPROVED) | Create product (DRAFT) |
| GET | `/my` | seller | Own products |
| GET | `/my/:id` | seller | Own product detail |
| PATCH | `/:id` | seller (owner) | Update (incl. status) |
| DELETE | `/:id` | seller (owner) | Deactivate |
| POST | `/:id/images` | seller (owner, multipart) | Add images (≤8) |
| DELETE | `/:id/images/:imageId` | seller (owner) | Delete image (publicId) |

### 18.4 Categories — `/categories` (5)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | public | List (active) |
| GET | `/all` | public | List all |
| POST | `/` | admin | Create |
| PATCH | `/:id` | admin | Update |
| DELETE | `/:id` | admin | Delete |

### 18.5 Users — `/users` (8)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/me` | bearer | Own profile (avatar, isActive) |
| PATCH | `/me` | bearer | Update profile |
| GET | `/me/addresses` | bearer | List addresses |
| POST | `/me/addresses` | bearer | Add address |
| PATCH | `/me/addresses/:id` | bearer (owner) | Update address |
| DELETE | `/me/addresses/:id` | bearer (owner) | Delete address |
| POST | `/me/avatar` | bearer (multipart) | Upload avatar |
| DELETE | `/me/avatar` | bearer | Delete avatar |

### 18.6 Cart — `/cart` (5)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | buyer | Cart with live prices |
| POST | `/items` | buyer | Add item (stock check) |
| PATCH | `/items/:productId` | buyer | Update quantity |
| DELETE | `/items/:productId` | buyer | Remove item |
| DELETE | `/` | buyer | Clear cart |

### 18.7 Orders — `/orders` (9)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/` | buyer | Checkout from cart (multi-seller split) |
| POST | `/preview` | buyer | Checkout totals preview (no side effects) |
| GET | `/` | buyer/seller | Own orders (status filter, pagination) |
| GET | `/:id` | buyer/seller (owner) | Order detail |
| PATCH | `/:id/status` | seller/admin | Transition status |
| POST | `/:id/cancel` | buyer (owner) | Cancel (PENDING/CONFIRMED) |
| POST | `/:id/pay` | seller/admin | Mark COD paid |
| GET | `/:id/invoice` | buyer/seller (owner) | Invoice data |
| GET | `/:id/tracking` | buyer/seller (owner) | Tracking timeline |

### 18.8 Payments — `/payments` (4)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/orders/:orderId/initiate` | buyer | Create/return gateway order |
| POST | `/orders/:orderId/verify` | buyer | Verify client signature |
| POST | `/webhook/razorpay` | signed webhook | Idempotent payment/refund events |
| POST | `/orders/:orderId/refund` | buyer/admin | Full refund (idempotent) |

### 18.9 Discounts — `/discounts` (5) & Coupons — `/coupons` (5)

Both follow the same pattern (seller-scoped CRUD): `POST /` create · `GET /` list own · `GET /:id` · `PATCH /:id` · `DELETE /:id` (owner only).

### 18.10 Reviews — `/reviews` (4)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/` | buyer | Create (delivered order required) |
| GET | `/product/:productId` | public | List product reviews |
| PATCH | `/:id` | buyer (owner) | Update own |
| DELETE | `/:id` | buyer (owner) | Delete own |

### 18.11 Returns — `/returns` (5)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/` | buyer | Request return (7-day window) |
| GET | `/` | buyer/seller | List own |
| GET | `/:id` | buyer/seller (owner) | Detail |
| PATCH | `/:id/status` | seller/admin | Approve/reject/complete |
| POST | `/:id/cancel` | buyer | Cancel while PENDING |

### 18.12 Notifications — `/notifications` (6)

`GET /` list · `GET /unread-count` · `PATCH /:id/read` · `PATCH /read-all` · `GET /preferences` · `PATCH /preferences` — all for the authenticated user.

### 18.13 Analytics & seller settlement — `/sellers` (7, composed with the sellers router)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/dashboard` | seller | KPI dashboard |
| GET | `/analytics/sales` | seller | Sales series (from/to, day/month) |
| GET | `/analytics/top-products` | seller | Best sellers |
| GET | `/analytics/categories` | seller | Category performance |
| GET | `/customers` | seller | Customer list (search, pagination) |
| GET | `/revenue` | seller | Revenue statistics |
| GET | `/settlement` | seller | Own settlement for `?month=YYYY-MM` |

### 18.14 Inventory — `/inventory` (3, seller)

`GET /` (own transactions) · `GET /product/:productId` · `POST /product/:productId/adjust` (quantity + reason).

### 18.15 Wishlist — `/wishlist` (5, buyer)

`GET /` · `POST /items` · `GET /items/:productId` (check) · `DELETE /items/:productId` · `DELETE /` (clear).

### 18.16 Admin — `/admin` (19, all SUPER_ADMIN)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/users` | List users (role filter) |
| PATCH | `/users/:id` | Activate/deactivate (`isActive`) |
| GET | `/sellers` | List sellers (status filter) |
| PATCH | `/sellers/:id/status` | Approve/reject/pause/suspend (+reason) |
| GET | `/products` | List products (status filter) |
| PATCH | `/products/:id/status` | Moderate product |
| GET | `/orders` | List all orders (status filter) |
| GET | `/audit-logs` | Filterable audit ledger |
| POST | `/notifications` | Broadcast (audience or recipient ids) |
| GET | `/settlements` | List settlements |
| POST | `/settlements/generate` | Generate for `{ month }` |
| GET | `/settlements/:id` | Settlement detail |
| POST | `/settlements/:id/process` | → PROCESSING |
| POST | `/settlements/:id/mark-paid` | → PAID |
| POST | `/settlements/:id/fail` | → FAILED |
| POST | `/settlements/:id/cancel` | → CANCELLED |
| POST | `/settlements/:id/remind` | Reminder notification to seller |
| GET | `/settings/commission` | Read commission rate |
| PATCH | `/settings/commission` | Set commission rate |

### 18.17 Documentation & tooling

- **Swagger UI:** `http://localhost:5000/api-docs/` (JSDoc-generated; coverage note in §23.2).
- **Postman:** `docs/postman-collection.json` (100 requests, folders per tag, bearer preconfigured) + `docs/postman-environments.json`; regenerate with `npx tsx tests/generate-postman.ts`; run with Newman: `newman run docs/postman-collection.json -e docs/postman-environments.json`.
- **Detailed manual sequences:** `docs/POSTMAN_COMPLETE_TESTING_GUIDE.md`.


---

## 19. Environment Configuration

> No real secrets appear in this document. Templates live in `.env.example` (backend) and `frontend/.env.example` (frontend).

### 19.1 Backend (`.env` at repo root)

The backend validates its environment **at startup** with Zod (`src/config/env.ts`) — missing required values crash the process with a clear message.

| Variable | Required? | Purpose & dev notes |
|----------|-----------|---------------------|
| `NODE_ENV` | optional (default `development`) | `development` \| `test` \| `production`. In `test` the rate limiters and email sending are disabled |
| `PORT` | optional (default `5000`) | API port |
| `MONGODB_URI` | **required** | e.g. `mongodb://localhost:27017/ecommerce_marketplace`; Atlas URI in production |
| `CORS_ORIGIN` | optional (default `http://localhost:3000`) | The **only** origin allowed to call the API (with credentials) |
| `CLIENT_URL` | optional (default `http://localhost:3000`) | Frontend base URL used for redirects and email links |
| `JWT_ACCESS_SECRET` | **required** (≥ 32 chars) | Signs access tokens (and derives the TOTP at-rest cipher key). Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_ACCESS_EXPIRES_IN` | optional (default `15m`) | Access token lifetime |
| `JWT_REFRESH_SECRET` | **required** (≥ 32 chars) | Signs refresh tokens |
| `JWT_REFRESH_EXPIRES_IN` | optional (default `7d`) | Refresh token lifetime |
| `CLOUDINARY_CLOUD_NAME` | **required** | Cloudinary credentials — the API **will not boot** without them (uploads are core: images, avatars, documents) |
| `CLOUDINARY_API_KEY` | **required** | — |
| `CLOUDINARY_API_SECRET` | **required** | — |
| `GOOGLE_CLIENT_ID` | ⚠️ effectively **required at boot** | Google OAuth. `google.service.ts` **throws at import time** if any of the three Google vars is missing/empty, and the auth module imports it — so the server currently cannot start without them (see §23.2; the README's "only if you use Google sign-in" note describes intent, not current behavior) |
| `GOOGLE_CLIENT_SECRET` | ⚠️ effectively **required at boot** | — |
| `GOOGLE_REDIRECT_URI` | ⚠️ effectively **required at boot** | Must exactly match an Authorized redirect URI in Google Cloud (default template: `http://localhost:5000/api/v1/auth/google/callback`) |
| `SMTP_HOST` | optional | Real SMTP host. **Empty (default) → Ethereal test account** in dev; preview URLs logged to console |
| `SMTP_PORT` / `SMTP_SECURE` | optional | 587 / false by default |
| `SMTP_USER` / `SMTP_PASS` | optional | SMTP credentials |
| `SMTP_FROM` | optional | From address for transactional email |
| `REDIS_URL` | optional | **Empty (default) → catalog caching disabled** (app runs fine on MongoDB alone). Set to enable the product-list cache |
| `RAZORPAY_KEY_ID` | optional | **Empty (default) → MOCK payment mode** (deterministic, no real money). Set for real/sandbox payments (this key is also the browser `keyId`) |
| `RAZORPAY_KEY_SECRET` | optional | Server-side key for gateway calls + signature verification |
| `RAZORPAY_WEBHOOK_SECRET` | optional | Verifies `x-razorpay-signature` on the webhook; mock fixture used in MOCK mode |

### 19.2 Frontend (`frontend/.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_URL` | `http://localhost:5000/api/v1` | API base URL baked into the build. In dev you can also omit it entirely — the code falls back to relative `/api/v1` and the Vite proxy forwards to `:5000`. In production set it to the deployed API origin and match `CORS_ORIGIN` to the SPA origin. |

### 19.3 Dev vs production checklist

| Concern | Development | Production |
|---------|-------------|------------|
| Mongo | local mongod or Atlas dev DB | Atlas/managed with auth + backups |
| JWT secrets | any ≥ 32-char strings | strong random, rotated policy |
| Cloudinary | your Cloudinary account (required even in dev) | same service, live usage |
| Google | test OAuth client (required to boot — §23.2) | production client + redirect URIs |
| Email | Ethereal (auto) | real SMTP (SendGrid/SES/Gmail app password…) |
| Payments | MOCK mode (or Razorpay sandbox keys) | Razorpay live keys + registered webhook |
| Redis | none (caching off) | enable for catalog cache; Redis-backed rate limiting if multi-instance |
| TLS | http fine locally | **HTTPS required** (httpOnly cookies, OAuth, webhooks) |

---

## 20. Running the Project

### 20.1 Prerequisites

- **Node.js 20+**
- **MongoDB** — local instance or Atlas connection string (tests derive their own test DB; with no `MONGODB_URI` at all, tests fall back to an in-memory MongoDB)
- **Redis** — optional (only for the catalog cache)

### 20.2 Backend setup (repo root)

```bash
npm install
cp .env.example .env          # then fill in the required values (§19.1):
                              #   MONGODB_URI, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
                              #   CLOUDINARY_*, and GOOGLE_* (see §23.2 boot note)

npm run dev                   # tsx watch src/server.ts → http://localhost:5000
```

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server with hot reload (port 5000) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server (`node dist/server.js`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` / `npm run test:watch` | Vitest integration suite (see §21) |
| `npm run format` / `format:check` | Prettier |

Useful extras:

```bash
npx tsx tests/seed-admin.ts                 # seed admin@example.com / Admin@1234 (dev convenience)
npx tsx tests/generate-postman.ts           # regenerate docs/postman-collection.json
bash tests/e2e-flow.sh                      # full business journey against a running dev server
```

- **Swagger UI:** `http://localhost:5000/api-docs/`
- **Health:** `http://localhost:5000/api/v1/health`

### 20.3 Frontend setup (`frontend/`)

```bash
cd frontend
npm install
cp .env.example .env        # VITE_API_URL=http://localhost:5000/api/v1 (default is fine for local dev)
npm run dev                 # Vite → http://localhost:3000 (proxies /api → :5000)
```

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server on port 3000 |
| `npm run build` | `tsc -b && vite build` → static `dist/` |
| `npm run preview` | Preview the production build |
| `npm test` / `npm run test:watch` | Component tests (see §21.2) |
| `npm run lint` | oxlint |
| `npx tsc --noEmit` | Type check |

**Order of operations:** start the backend first, then the frontend (the proxy just fails fast if the API is down). Open `http://localhost:3000`.

### 20.4 Suggested first-run smoke test

1. `GET /api/v1/health` → `UP`.
2. Swagger: register a buyer → login → `/auth/me`.
3. Seed admin (`tests/seed-admin.ts`), log in, create a category.
4. Register a seller → approve in the admin UI → enable 2FA (wizard) → create a product → set ACTIVE.
5. As the buyer: browse → add to cart → checkout (COD) → seller confirms/ships/delivers → buyer pays COD → review.

---

## 21. Testing

### 21.1 Backend integration tests (vitest + supertest)

- **What:** 21 suites / **215 test cases** in `tests/*.test.ts`. They drive the **real Express app over HTTP** (supertest) — full middleware stack, real services, real Mongoose models — covering success *and* failure paths.
- **Database isolation:** `tests/setup.ts` rewrites `MONGODB_URI` to a dedicated `ecommerce_marketplace_test` database; collections are cleared between tests (the DB is never dropped). If `MONGODB_URI` is absent, `tests/global-setup.ts` starts an **in-memory MongoDB** (`mongodb-memory-server`) for the whole run — the suite works on a fresh checkout with zero services.
- **Config:** `fileParallelism: false` (one shared test DB, cleared per test), 30 s timeouts; rate limiters and email are disabled in test mode; 2FA enforcement is skipped in test mode.
- **Coverage by suite:** auth (register/login/refresh rotation/logout/401s), twofa (setup/verify/recovery codes), account-status (deactivation enforcement), sellers (approval gate, immutable GSTIN), products (CRUD, ownership/IDOR, validation, image upload), cart/orders (multi-seller checkout, stock guards, oversell, cancellations, transitions), payments (initiate/verify/webhook/refund, mock gateway), discounts & coupon **pricing math** (separate `*-pricing.test.ts` suites), returns, reviews, notifications, analytics, settlements, admin (users/sellers/products/orders), **audit** (service) and **audit-logs** (endpoint filters/sorting/pagination — 46 cases), cloudinary upload, swagger spec sanity.
- **Run:**

```bash
npm test                                # whole suite
npx vitest run tests/orders.test.ts     # single suite
npm run test:watch                      # watch mode
```

### 21.2 Frontend component tests (vitest + Testing Library + jsdom)

- **What:** 3 suites / **25 cases** — `components/home/HeroShowcase.test.tsx` (live-catalog hero rendering), `components/ui/DocumentUpload.test.tsx` (KYC upload/delete UX, type/size rules), `pages/admin/AdminAuditPage.test.tsx` (audit filters/table/copy). Toasts are mocked; `matchMedia`/`scrollTo` are stubbed in `src/test/setup.ts` (jsdom gaps the carousel/MUI rely on).
- **Run (from `frontend/`):** `npm test` or `npm run test:watch`.

### 21.3 Manual E2E scripts (shell, curl-based)

15 self-contained scripts in `tests/` — each registers its own users and walks a complete business flow against a **running dev server** on `http://localhost:5000`:

`e2e-flow.sh` (the full journey: register → approve → sell → buy → deliver → review), plus dedicated scripts for products, users, cart, orders, reviews, admin, discounts, coupons, returns, analytics, notifications, payments (mock gateway), twofa, settlements.

```bash
npm run dev            # backend running
bash tests/e2e-flow.sh
```

### 21.4 Postman / Newman

Import `docs/postman-collection.json` + `docs/postman-environments.json`; run the **Authentication folder first** (captures tokens), then the rest in order. Full per-request documentation: `docs/POSTMAN_COMPLETE_TESTING_GUIDE.md`. CLI:

```bash
npm i -g newman
newman run docs/postman-collection.json -e docs/postman-environments.json
```

### 21.5 Frontend verification scripts (not part of `npm test`)

Static-analysis/unit guards in `frontend/scripts/`, run with `node`:

| Script | Enforces |
|--------|----------|
| `verify-money-ui.mjs` | Money rendering (no `₹NaN`, correct fields) across order screens |
| `verify-no-changes-guard.mjs` | Every edit/update screen uses the "no changes → no request" guard |
| `verify-settlement-ui.mjs` | Settlement rendering (summary/breakdown/lifecycle/empty state) |

---

## 22. Production Considerations

- **HTTPS everywhere** — required for httpOnly refresh cookies, Google OAuth, and Razorpay webhooks.
- **Secrets management** — strong `JWT_*` secrets, real Cloudinary/Google/SMTP/Razorpay credentials; never commit `.env`.
- **Razorpay webhook** — register `https://<api-host>/api/v1/payments/webhook/razorpay` in the dashboard with the same `RAZORPAY_WEBHOOK_SECRET`; the handler is idempotent, so retries are safe.
- **Email** — configure a real SMTP provider; keep `SMTP_FROM` on a domain you control.
- **Scaling** — the app is a **single-instance** design: rate limiting is in-memory and all atomicity relies on single-database Mongo operations. For multiple instances, first upgrades: Redis-backed rate limiting, the catalog cache already supports it, and the queue stub becomes a real Bull+Redis queue (§16.3).
- **Settlements** are **admin-triggered**, not scheduled — run them on a monthly process (1st–7th) or add a cron/call-out later.
- **MongoDB** — Atlas with backups, index monitoring (unique/partial indexes carry the consistency guarantees).
- **Observability** — logging today is a minimal console logger (`config/logger.ts`); pair with a log aggregator in production. Audit log is a business-level trail, not request logging.
- **Frontend** — `npm run build` → static hosting (CDN); set `VITE_API_URL` at build time; set backend `CORS_ORIGIN` to the exact SPA origin.
- **Admin accounts** — `tests/seed-admin.ts` is a dev convenience only; provision super admins deliberately in production.
- **Known gaps to close before launch** — see §23 (notably the COD enum mismatch, real payment keys, and the unused queue).

---

## 23. Known Limitations / Missing Features

### 23.1 Honest status

**Implemented and tested** (backend suites + E2E scripts): auth (JWT+refresh+2FA+Google), seller onboarding/approval, products with images/SKU/specs, categories, cart with live pricing, multi-seller checkout with stock guards, COD + online payments (mock & real paths), refunds (full), returns with stock restore, reviews, wishlist, inventory transactions, notifications (in-app + email + preferences + broadcast), seller analytics, monthly settlements with commission, admin user/seller/product/order management, audit log + viewer, Cloudinary uploads (images/avatars/documents), Swagger UI, Postman collection.

**Partially implemented / environment-dependent**

| Item | State |
|------|-------|
| Google sign-in | Code complete (ID-token + redirect flows), but unusable until Google OAuth credentials are configured — and currently **blocks server startup** when unset (§23.2) |
| Online payments in a real browser | Backend complete (RAZORPAY + MOCK); the browser modal is the real Razorpay checkout.js, which needs real (test) keys — MOCK mode is exercised via Postman/tests, not the checkout modal |
| Email delivery | Complete pipeline; dev uses Ethereal (preview links only), production needs SMTP |
| Redis caching | Working for the catalog listing only; detail/category TTLs defined but unused |
| 2FA enforcement | Mandatory for sellers/admins in all non-test environments (intentional) |

**Not implemented** (verified absent from the codebase)

| Area | Notes |
|------|-------|
| Background job queue | `bull` dependency + `services/queue/` exist but the code is a synchronous inline stub; no durable jobs, no scheduled/cron work (settlements are admin-triggered) |
| Real-time updates | No WebSockets/Socket.io; the frontend polls account status every 30 s; order status changes appear on navigation/refetch |
| Push / SMS notifications | Only in-app + email |
| Partial refunds | Full-amount only |
| Multi-currency | INR hardcoded (backend math + `Intl` en-IN rendering) |
| Email verification flow | `isEmailVerified` exists (set true for Google logins) but there is no self-service verification email/endpoint |
| Payment reconciliation | No automated gateway-vs-local reconciliation |
| Advanced search | Basic MongoDB field/text matching only (no Elasticsearch/Algolia) |
| Persistent rate limiting | In-memory limiter resets on restart (fine for single instance) |
| i18n / multi-language UI | English only |
| Seller "customers" write access | Read-only customer list (aggregated) |

### 23.2 Discrepancies between docs and code

Documented here so nobody is surprised — the **code is the source of truth**:

1. **Bull "complete" claim (old guide) vs reality.** The previous `PROJECT_GUIDE.md` listed "Background Job Queue (Bull) ✅ Complete". In the current code, `services/queue/queue.config.ts` is explicitly a **synchronous stub** (its own comment says so), `workers.ts` only logs, and **nothing in the app calls `addJob`**. Bull is an unused dependency. (§16.3)
2. **`docs/architecture.md` is partially stale.** It (V3.8–V3.12) records decisions that Redis and queues were *intentionally not introduced*. The current code **does** include optional Redis catalog caching (`config/redis.ts` + products service invalidation). The architecture doc's atomic-operations and idempotency maps remain accurate and are reflected in this guide (§6.5).
3. **COD payment-method mismatch (real bug candidate).** The frontend sends `paymentMethod: 'COD' | 'ONLINE'` (`CheckoutPage`, `orderService.create`, `types/api.ts`), but the backend validates against the `PaymentMethod` enum **`CASH_ON_DELIVERY` | `ONLINE`** (`order.schema.ts` is `.strict()`). A COD checkout from the UI therefore fails Zod validation with 400. Symptom 2: `OrderDetailPage`'s "pay on delivery" button checks `paymentMethod === 'COD'`, which never matches the stored `CASH_ON_DELIVERY`. The API itself works when called with `CASH_ON_DELIVERY`.
4. **Swagger coverage.** The README claims "118 operations" documented; the route files currently contain **~120 endpoints** but only **~65 `@openapi` annotations**, so the Swagger UI covers a subset (the admin, wishlist, inventory, analytics and several newer endpoints lack annotations). `tests/swagger-full.json` is an **empty (0-byte) placeholder** file.
5. **Stale API tables in the old guide.** The previous guide's endpoint tables predate several renames: there is **no** `/admin/login` (admins use `/auth/login`), seller management is a single `PATCH /admin/sellers/:id/status`, commission lives at `/admin/settings/commission`, broadcast is `POST /admin/notifications`, returns use `PATCH /:id/status` + `POST /:id/cancel`, reviews list at `/reviews/product/:productId`, analytics exposes `dashboard/top-products/categories/customers/revenue`, and orders gained `POST /orders/preview`. §18 reflects the current routes.
6. **Google OAuth optionality.** `.env.example`/README suggest Google vars are optional; `google.service.ts` throws **at import time** when they are empty, so the server currently cannot start without them. Either set them or make the module lazy/optional before relying on "no Google" dev setups.
7. **Mock payments vs browser.** As noted in §23.1, the mock gateway verifies signatures server-side without credentials, but `PaymentPage` loads the real `checkout.razorpay.com` script — mock mode is fully usable via Postman/tests, while the browser payment UI needs Razorpay (test) keys.

---

## 24. Developer Navigation Guide

### 24.1 "Where do I find / change X?"

| Task | Where |
|------|-------|
| Add a new API endpoint | `src/modules/<module>/<module>.routes.ts` (route + middleware + `@openapi`) → `controller.ts` → `service.ts` (rules) → `repository.ts` → `schema.ts` (Zod) → `types.ts`; mount in `src/routes/index.ts` if it's a new module |
| Change a business rule (pricing, checkout, returns…) | The owning module's `service.ts` (pricing engine: `discounts/discount.pricing.ts`) |
| Add/modify a data field | `src/models/<Model>.ts` (+ `types/` + any response mappers + frontend `types/api.ts`) |
| Add a new status/enum value | `src/constants/<x>Status.ts` (+ frontend `types/api.ts`) |
| Add audit coverage for a new action | Call `logAudit()` in the service; the admin viewer picks it up automatically (action is a free-form string) |
| Add a frontend page | `frontend/src/pages/…` → route in `App.tsx` (wrap in `ProtectedRoute` as needed, keep it `lazy()`) → service method in `services/` |
| Add a frontend service method | `frontend/src/services/<domain>.service.ts` (typed wrapper on the shared axios instance) |
| Change the API base URL | `frontend/.env` (`VITE_API_URL`) + backend `CORS_ORIGIN` for production |
| Understand session/auth behavior | Frontend: `services/api.ts` + `stores/authStore.ts`; Backend: `modules/auth/auth.middleware.ts` + `utils/jwt.ts` |
| Understand the response format | `src/utils/apiResponse.ts` + `middlewares/error.middleware.ts` |
| Adjust upload limits/types | `src/middlewares/upload.middleware.ts` (+ `components/ui/ImageUpload.tsx` / `DocumentUpload.tsx` for the client-side mirror) |
| Change branding | `frontend/src/config/brand.ts` |
| Change design tokens | `frontend/src/index.css` (`@theme` + `:root`) |
| Seed an admin | `npx tsx tests/seed-admin.ts` |
| Regenerate Postman collection | `npx tsx tests/generate-postman.ts` |
| Run one backend test file | `npx vitest run tests/<file>.test.ts` |
| Run one frontend test file | `cd frontend && npx vitest run src/<file>.test.tsx` |

### 24.2 Conventions to preserve

- **Backend:** controllers stay thin (no business logic); services own rules + ownership checks; repositories own queries; throw `AppError` with a machine code; audit + notify from services; invalidate the catalog cache on product-affecting writes; keep secrets out of responses and audit entries.
- **Frontend:** pages stay route-level (extract reusable pieces into `components/`); server data via TanStack Query (stable keys, invalidate after mutations); forms via RHF+Zod mirroring backend schemas; every edit form uses the `formChanges` no-op guard; money rendering only through `formatPrice`/`toAmount`; toasts for user-facing errors (respect the global `ACCOUNT_INACTIVE` handling).
- **Both:** the API is the enforcement point — never implement an access rule only in the UI.

### 24.3 Companion documents

| Document | What it covers |
|----------|----------------|
| `README.md` (root) | Backend quick-start, module overview, security notes, testing, Postman |
| `frontend/README.md` | Frontend setup, structure, roles, no-op guard rule, verification scripts |
| `docs/architecture.md` | Reliability decisions: atomic ops, idempotency map, retry policy (some sections predate Redis — see §23.2) |
| `docs/POSTMAN_COMPLETE_TESTING_GUIDE.md` | Per-API request bodies, variables, and the full manual test sequence |
| `docs/postman-collection.json` / `postman-environments.json` | Importable Postman artifacts |

---

*End of guide. If you change the codebase, update this document — and keep the "Discrepancies" section (§23.2) current: it exists to keep honest what is implemented versus what is planned.*
