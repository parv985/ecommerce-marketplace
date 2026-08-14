# E-commerce Marketplace Backend

A production-oriented REST API for a multi-vendor e-commerce marketplace, built with Node.js, TypeScript, Express 5, MongoDB (Mongoose), and Zod.

## Tech Stack

- **Node.js + TypeScript** (strict, ESM / NodeNext)
- **Express 5** with modular `routes → controllers → services → repositories → models` layering
- **MongoDB + Mongoose** with atomic stock updates and compound indexes
- **Zod** for request validation (body, query and params)
- **JWT authentication**: short-lived access token (Bearer) + rotating httpOnly refresh-token cookie
- **Google OAuth 2.0** sign-in (authorization-code flow)
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

   Fill in at minimum `MONGODB_URI`, `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (32+ characters — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). Google OAuth variables are only needed if you use Google sign-in; the redirect URI must match the "Authorized redirect URIs" in the Google Cloud console.

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

Every production endpoint is documented there, grouped by tag: **Authentication, Sellers, Products, Categories, Users, Cart, Orders, Reviews, Admin, System**. Use the **Authorize** button to paste an access token and call protected endpoints interactively.

## Authentication Overview

- **Register / Login** return an access token in the response body and set an httpOnly refresh-token cookie scoped to `/api/v1/auth`.
- **Refresh** (`POST /api/v1/auth/refresh`) rotates the refresh token — each refresh token is single-use, and a reused token is rejected.
- **Logout** revokes the stored refresh token and clears the cookie.
- **Google OAuth** (`GET /api/v1/auth/google`) redirects to Google's consent screen; the callback exchanges the code, upserts the user, and redirects back to the frontend with `access_token` in the query string.
- **Authorization** is role-based (`BUYER | SELLER | SUPER_ADMIN`) plus resource ownership checks (a seller can only touch their own products/orders; a buyer only their own orders/addresses/reviews — IDOR-safe).

## Module Overview

| Module      | Highlights |
| ----------- | ---------- |
| Auth        | Register, login, refresh rotation, logout, forgot/reset password, Google OAuth |
| Sellers     | Registration (PENDING until approved), profile self-service (`/sellers/me`), immutable GSTIN/PAN |
| Products    | Seller CRUD with ownership enforcement; only **APPROVED** sellers can list products; statuses `DRAFT / ACTIVE / INACTIVE` |
| Categories  | Admin-managed categories; public catalog browsing with search, category/price filters, sorting, pagination |
| Users       | Profile (`/users/me`) and saved shipping addresses |
| Cart        | One cart per user; prices resolved live from the database (never client-supplied); stock-aware quantity updates |
| Orders      | Checkout from cart splits into one order per seller; snapshot pricing; strict status transitions (`PENDING → CONFIRMED → SHIPPED → DELIVERED`); cancellation restores stock |
| Payments    | Cash-on-delivery only; payment marked as received by the seller/admin after delivery — client-supplied payment status is never trusted |
| Reviews     | One review per user per product, only after a delivered order; ownership enforced on update/delete; average rating aggregated server-side |
| Admin       | User activation/deactivation, seller approval/rejection, product moderation, order overview — `SUPER_ADMIN` only |

## Inventory Consistency

- Stock is decremented **atomically** at checkout with a guarded `$gte` update, so concurrent checkouts can never oversell or drive stock negative.
- A failed checkout rolls back any decrements already applied.
- Cancelling an order restores the committed stock (idempotent — a second cancel does not double-restore).

## Security Notes

- Passwords hashed with bcryptjs (12 salt rounds); refresh tokens and reset tokens are stored hashed.
- `passwordHash` and token hashes are excluded from API responses (`select: false` + explicit response mappers).
- Rate limiting: baseline 300 req/15min per IP, strict 20 req/15min on `/api/v1/auth` (login, register, password reset).
- helmet security headers, CORS restricted to `CORS_ORIGIN`, JWT secrets enforced ≥ 32 chars.
- Errors use a centralized `AppError` + error middleware; validation failures and 500s never leak internals.

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

Manual end-to-end scripts (each is self-contained and registers its own users):

```bash
bash tests/e2e-flow.sh      # the full business journey (register → approve → sell → buy → deliver → review)
bash tests/e2e-products.sh  # products + categories + ownership
bash tests/e2e-users.sh     # profile + addresses
bash tests/e2e-cart.sh      # cart + live pricing + stock guards
bash tests/e2e-orders.sh    # orders + inventory + COD payment
bash tests/e2e-reviews.sh   # reviews eligibility/duplicates/ownership
bash tests/e2e-admin.sh     # seller approval, moderation, user management
```

## Project Structure

```
src/
  app.ts                 # Express app: helmet, CORS, rate limits, swagger, routes
  server.ts              # Entry point: DB connection + listen
  config/                # env (zod), database, logger
  constants/             # roles, seller/product/order status enums, cookies
  docs/swagger.ts        # OpenAPI definition (tags, security, reusable schemas)
  errors/AppError.ts     # Custom error type
  middlewares/           # authenticate, authorize, validate, error, notFound
  models/                # Mongoose models (User, Seller, Product, Category, ...)
  modules/
    auth/  sellers/  products/  categories/  users/  cart/  orders/  reviews/  admin/
    # each module: routes → controller → service → repository → schema → types
  services/email.service.ts  # nodemailer (Ethereal test account in dev)
  utils/                 # jwt, tokenHash, asyncHandler, apiResponse
tests/                   # vitest suites, seed script, manual E2E scripts
```
