# E-commerce Marketplace Backend

A production-oriented REST API for a multi-vendor e-commerce marketplace, built with Node.js, TypeScript, Express 5, MongoDB (Mongoose), and Zod.

## Tech Stack

- **Node.js + TypeScript** (strict, ESM / NodeNext)
- **Express 5** with modular `routes → controllers → services → repositories → models` layering
- **MongoDB + Mongoose** with atomic stock updates and compound indexes
- **Zod** for request validation (body, query and params)
- **JWT authentication**: short-lived access token (Bearer) + rotating httpOnly refresh-token cookie
- **Google OAuth 2.0** sign-in (authorization-code flow)
- **Cloudinary** for file uploads (product images, user avatars, seller documents)
- **multer** for multipart form-data parsing
- **swagger-jsdoc + swagger-ui-express** for live API documentation
- **helmet, cors, express-rate-limit** for security hardening
- **vitest + supertest** for integration tests

## Prerequisites

- Node.js 20+
- A MongoDB instance — either local or Atlas (tests automatically use a separate `<db>_test` database so development data is never touched)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the environment file:

   ```bash
   cp .env.example .env
   ```

   Fill in at minimum `MONGODB_URI`, `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (32+ characters — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). Google OAuth variables are only needed if you use Google sign-in; the redirect URI must match the "Authorized redirect URIs" in the Google Cloud console. Cloudinary variables (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) are required for file uploads (product images, avatars, documents).

3. Start the development server:

   ```bash
   npm run dev
   ```

   The API listens on `http://localhost:5000` and hot-reloads on changes.

## Scripts

| Command               | Description                                   |
| --------------------- | --------------------------------------------- |
| `npm run dev`         | Start the dev server with hot reload          |
| `npm run build`       | Compile TypeScript to `dist/`                 |
| `npm start`           | Run the compiled server (`node dist/server.js`) |
| `npm run typecheck`   | Type-check with `tsc --noEmit`                |
| `npm test`            | Run the vitest integration suite              |
| `npm run test:watch`  | Run tests in watch mode                       |
| `npm run format`      | Format with Prettier                          |
| `npm run format:check`| Verify formatting                             |

## API Documentation (Swagger)

Swagger UI is served at:

```
http://localhost:5000/api-docs/
```

Every production endpoint is documented there (118 operations), grouped by tag: **Authentication, Sellers, Products, Categories, Users, Cart, Orders, Discounts, Coupons, Returns, Payments, Reviews, Notifications, Analytics, Admin, System**. Use the **Authorize** button to paste an access token and call protected endpoints interactively.

A ready-made **Postman collection** (generated from the OpenAPI spec, folder per tag, bearer auth preconfigured) lives at `docs/postman-collection.json`. Regenerate it with `npx tsx tests/generate-postman.ts`.

For comprehensive API testing instructions, see the [Postman Testing Guide](docs/POSTMAN_TESTING_GUIDE.md).

## Authentication Overview

- **Register / Login** return an access token in the response body and set an httpOnly refresh-token cookie scoped to `/api/v1/auth`.
- **Refresh** (`POST /api/v1/auth/refresh`) rotates the refresh token — each refresh token is single-use, and a reused token is rejected.
- **Logout** revokes the stored refresh token and clears the cookie.
- **Google OAuth** (`GET /api/v1/auth/google`) redirects to Google's consent screen; the callback exchanges the code, upserts the user, and redirects back to the frontend with `access_token` in the query string.
- **Two-factor authentication (TOTP)** is available for sellers and admins (`/auth/2fa/setup` → `/auth/2fa/enable`). Once enabled, login becomes two-step: the password step returns a short-lived `loginToken`, and only `/auth/2fa/verify` (TOTP code or single-use recovery code) issues real tokens. The secret is encrypted at rest (AES-256-GCM) and never returned after setup; recovery codes are stored hashed and shown exactly once. Buyers keep the single-step flow.
- **Authorization** is role-based (`BUYER | SELLER | SUPER_ADMIN`) plus resource ownership checks (a seller can only touch their own products/orders/discounts/coupons; a buyer only their own orders/addresses/reviews — IDOR-safe).

## Module Overview

| Module      | Highlights |
| ----------- | ---------- |
| Auth        | Register, login, refresh rotation, logout, forgot/reset password, Google OAuth, TOTP 2FA with recovery codes |
| Users       | Profile, saved shipping addresses, **avatar upload/delete via Cloudinary** |
| Sellers     | Registration (PENDING until approved), profile self-service (`/sellers/me`), immutable GSTIN/PAN, **document upload/delete via Cloudinary** |
| Products    | Seller CRUD with ownership enforcement; only **APPROVED** sellers can list products; statuses `DRAFT / ACTIVE / INACTIVE`; **image upload/delete via Cloudinary** (up to 8 images per product) |
| Categories  | Admin-managed categories; public catalog browsing with search, category/price filters, sorting, pagination |
| Cart        | One cart per user; prices resolved live from the database (never client-supplied); stock-aware quantity updates |
| Orders      | Checkout from cart splits into one order per seller; snapshot pricing; strict status transitions (`PENDING → CONFIRMED → SHIPPED → DELIVERED`); cancellation restores stock and releases coupon usage; a cart claim prevents double-submit duplicate orders |
| Discounts   | Seller-created sales discounts (product XOR category, percentage 1–100, date-windowed, active/inactive). Checkout resolves them through one shared pricing service — **product discount beats category discount, highest percentage wins, never stacked** |
| Coupons     | Seller-created codes (percentage or fixed, min order value, max discount, product/category restrictions, total + per-user usage limits). Limits are enforced atomically (101st concurrent claim fails); usage is tracked per order and released on cancellation |
| Returns     | Buyer requests within 7 days of delivery; `PENDING → APPROVED → COMPLETED | REJECTED | CANCELLED`; stock restored on completion; partial unique index blocks duplicate requests |
| Payments    | Cash-on-delivery (marked paid by seller/admin after delivery) **plus** an online gateway. Razorpay is the provider with a deterministic MOCK mode when no credentials are configured. Payment orders are created server-side, verified by HMAC signature, and webhooks are signature-checked + idempotent (unique event claim). Refunds are full-amount, idempotent, and issued automatically on cancellation of a paid online order |
| Reviews     | One review per user per product, only after a delivered order; ownership enforced on update/delete; average rating aggregated server-side |
| Notifications | In-app + email notifications for orders, payments, returns, seller decisions, settlements and admin broadcasts; per-recipient preference model (`/notifications/preferences`); email is fire-and-forget with bounded retries |
| Analytics   | Seller dashboard, sales series, top products, customers and revenue statistics — all MongoDB aggregations scoped to the authenticated seller |
| Settlements | Configurable platform commission (default 10%, admin-adjustable, snapshotted per settlement so history is never recalculated). Admin generates monthly settlements (unique per seller+period — idempotent) and walks `PENDING → PROCESSING → PAID | FAILED | CANCELLED`; sellers view their own settlements |
| Admin       | User activation/deactivation, seller approval/rejection, product moderation, order overview, settlement dashboard, commission settings, notification broadcasts, **filterable audit log viewer** — `SUPER_ADMIN` only |

## Audit Logging

Every important action is written to the `auditlogs` collection through one reusable service: logins, order creation/cancellation/status changes, product/discount/coupon changes, return requests, seller registration/approval, payments (initiated/verified/captured/refunded), settlement actions and commission changes. Entries carry actor, action, entity, before/after values and metadata — passwords, tokens, TOTP secrets and recovery codes are never logged.

The ledger is readable through **`GET /api/v1/admin/audit-logs`** (`SUPER_ADMIN` only), which paginates the existing entries (`page` default 1, `limit` default 20, max 100) and filters them by `actorId`, `actorRole`, `action`, `entityType`, `entityId` and an inclusive `fromDate`/`toDate` range on `createdAt`. Sorting is configurable via `sortBy` (`createdAt` | `action` | `entityType` | `actorRole` | `actorId`) and `sortOrder` (`asc` | `desc`), defaulting to newest first. The endpoint is a pure read — it never writes an audit entry itself — and is consumed by the admin console's **Audit Log** page (`/admin/audit`).

## Inventory Consistency

- Stock is decremented **atomically** at checkout with a guarded `$gte` update, so concurrent checkouts can never oversell or drive stock negative.
- A failed checkout rolls back any decrements already applied.
- Cancelling an order restores the committed stock (idempotent — a second cancel does not double-restore).
- The cart is **claimed atomically** at checkout start, so a double-submit can never create duplicate orders (the loser gets `CART_CHECKOUT_IN_PROGRESS` or an empty-cart error).
- Approving a return restores stock (with an inventory transaction) exactly once; cancelling a paid online order refunds it first.

## Returns & Refunds

`PATCH /api/v1/returns/:id/status` with `{ "status": "APPROVED" }` is the money event of the return flow. It runs as one unit of work:

1. **Claim** — the return is flipped `PENDING → APPROVED` by a conditional update, so a double-click or a retried call can only ever produce one refund.
2. **Refund** — the eligible amount (`order.total`, i.e. what the buyer actually paid after discounts and coupons) goes back through the payment gateway for online orders, or is recorded as an offline refund on the return for cash-on-delivery.
3. **Rollbacks (one transaction)** — the order becomes `RETURNED` with `paymentStatus = REFUNDED`; the returned units are credited back to the seller's inventory with `RETURN_RESTOCK` transactions; any coupon usage is released and the coupon counter decremented; the order is pulled out of the seller's settlement, reversing its platform commission and seller payable; the order timeline is updated.
4. **Notify** — the buyer receives *"Your return has been approved and your refund has been processed successfully."*, the seller receives a summary of what changed on their side, and the whole thing is audit-logged.

Repeats are safe: an already-refunded return returns its current state, `COMPLETED` never credits stock a second time, cancelled/rejected returns and cancelled orders are refused, and a settlement that was already paid is corrected with the payable recovered from the next payout. See [`docs/architecture.md`](docs/architecture.md#v314--return-approval-refund--rollbacks-in-one-transaction) for the design notes.

## Security Notes

- Passwords hashed with bcryptjs (12 salt rounds); refresh tokens, reset tokens and recovery codes are stored hashed; TOTP secrets are encrypted at rest (AES-256-GCM keyed from `JWT_ACCESS_SECRET`).
- `passwordHash`, token hashes, TOTP secrets and recovery codes are excluded from API responses (`select: false` + explicit response mappers).
- Rate limiting: baseline 300 req/15min per IP, strict 20 req/15min on `/api/v1/auth` (login, register, password reset).
- Payment status is never trusted from the client — signatures are re-derived server-side; webhooks verify `x-razorpay-signature` over the raw body and are idempotent under duplicate delivery.
- helmet security headers, CORS restricted to `CORS_ORIGIN`, JWT secrets enforced ≥ 32 chars.
- Errors use a centralized `AppError` + error middleware; validation failures and 500s never leak internals.

Reliability decisions (Redis/queues/locking/idempotency) are documented in `docs/architecture.md`.

## Testing

Integration tests run against a dedicated `ecommerce_marketplace_test` database (derived from `MONGODB_URI`; the test DB is never dropped, collections are cleared between tests). Run with:

```bash
npm test
```

The suite covers success **and** failure paths: auth (register/login/refresh rotation/logout/401s), sellers (approval gate, profile, immutable GSTIN), products (CRUD, ownership/IDOR, validation), orders (multi-seller checkout, stock decrement, oversell guard, cancellations, transitions), payments, reviews, and admin.

Seed an admin account for manual/Swagger testing:

```bash
PORT=5000 npx tsx tests/seed-admin.ts   # admin@example.com / Admin@1234
```

Manual end-to-end scripts (each is self-contained and registers its own users; run against a dev server on `http://localhost:5000`):

```bash
bash tests/e2e-flow.sh            # the full business journey (register → approve → sell → buy → deliver → review)
bash tests/e2e-products.sh        # products + categories + ownership
bash tests/e2e-users.sh           # profile + addresses
bash tests/e2e-cart.sh            # cart + live pricing + stock guards
bash tests/e2e-orders.sh          # orders + inventory + COD payment
bash tests/e2e-reviews.sh         # reviews eligibility/duplicates/ownership
bash tests/e2e-admin.sh           # seller approval, moderation, user management
bash tests/e2e-discounts.sh       # discounts + automatic checkout pricing
bash tests/e2e-coupons.sh         # coupons + usage limits + cancellation release
bash tests/e2e-returns.sh         # return lifecycle + stock restore
bash tests/e2e-analytics.sh       # dashboard, sales series, customers, revenue
bash tests/e2e-notifications.sh   # in-app notifications + admin broadcast
bash tests/e2e-payments.sh        # online payment initiate/verify/webhook/refund (mock gateway)
bash tests/e2e-twofa.sh           # TOTP 2FA setup, two-step login, recovery codes
bash tests/e2e-settlements.sh     # commission settings + monthly settlement lifecycle
```

## Postman API Testing

### Quick Start

1. **Import Collection:** Postman → Collections → Import → `docs/postman-collection.json`
2. **Import Environment:** Postman → Environments → Import → `docs/postman-environments.json`
3. **Start Server:** `npm run dev`
4. **Run Authentication Folder First** to obtain access tokens
5. **Run Remaining Folders** in sequence

### Collection Structure (100 requests)

| Folder | Requests | Purpose |
|--------|----------|----------|
| Authentication | 14 | Login, register, 2FA, OAuth |
| Users | 6 | Profile, addresses |
| Sellers | 4 | Seller profile |
| Products | 7 | CRUD, search |
| Categories | 5 | Admin categories |
| Orders | 6 | Checkout, lifecycle |
| Cart | 5 | Shopping cart |
| Payments | 4 | Payment processing |
| Discounts | 5 | Seller discounts |
| Coupons | 5 | Coupon management |
| Reviews | 4 | Product reviews |
| Returns | 5 | Return requests |
| Notifications | 6 | In-app notifications |
| Analytics | 6 | Seller analytics |
| Admin | 17 | Admin management |
| System | 1 | Health check |

### Running with Newman (CLI)

```bash
# Install Newman
npm install -g newman

# Run collection
newman run docs/postman-collection.json -e docs/postman-environments.json

# Generate HTML report
newman run docs/postman-collection.json -e docs/postman-environments.json -r htmlextra
```

For detailed testing instructions, environment setup, and troubleshooting, see:

- **[Complete Postman Testing Guide](docs/POSTMAN_COMPLETE_TESTING_GUIDE.md)** — Every API with exact request bodies, responses, variables, and the full 70-step testing sequence
- [Postman Testing Guide](docs/POSTMAN_TESTING_GUIDE.md) — Quick-start setup and collection overview

## Project Structure

```
src/
  app.ts                 # Express app: helmet, CORS, rate limits, swagger, routes
  server.ts              # Entry point: DB connection + listen
  config/                # env (zod), database, logger, Cloudinary
  constants/             # roles, status enums, notification types, cookies
  docs/swagger.ts        # OpenAPI definition (tags, security, reusable schemas)
  errors/AppError.ts     # Custom error type
  middlewares/           # authenticate, authorize, validate, error, notFound, upload (multer)
  models/                # Mongoose models (User, Seller, Product, Category, Order, Payment, Settlement, ...)
  modules/
    auth/  sellers/  products/  categories/  users/  cart/  orders/  reviews/
    discounts/  coupons/  returns/  payments/  notifications/  analytics/  settlements/  admin/
    # each module: routes → controller → service → repository → schema → types
  services/audit.service.ts    # reusable audit logging
  services/cloudinary.service.ts  # Cloudinary upload/delete service
  services/email.service.ts    # nodemailer (Ethereal test account in dev) + bounded retry
  utils/                 # jwt, tokenHash, totp, secretCipher, asyncHandler, apiResponse
docs/                    # architecture.md (reliability decisions), postman-collection.json
tests/                   # vitest suites, seed script, manual E2E scripts, Postman generator
```
