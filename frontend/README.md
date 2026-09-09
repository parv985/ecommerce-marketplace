# ECOM Marketplace Frontend

React + TypeScript frontend for the E-Commerce Marketplace backend.

## Tech Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS 4
- React Router v7
- TanStack Query (server state)
- Axios (API client)
- Zustand (auth state)
- React Hook Form + Zod (forms & validation)
- Recharts (analytics charts)
- Lucide React (icons)
- React Hot Toast (notifications)

## Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your backend URL (default: http://localhost:5000/api/v1)
```

## Development

```bash
npm run dev
```

The app runs at `http://localhost:3000` and proxies API requests to the backend at `http://localhost:5000`.

## Build

```bash
npm run build
```

## Verification Scripts

```bash
# money/number rendering across order screens
node scripts/verify-money-ui.mjs

# "no changes → no update request" guard for every edit/update form
node scripts/verify-no-changes-guard.mjs

# settlement rendering (seller summary/breakdown, admin lifecycle/actions, empty state)
node scripts/verify-settlement-ui.mjs
```

## Type Check

```bash
npx tsc --noEmit
```

## Project Structure

```
frontend/
├── src/
│   ├── components/       # Reusable UI components
│   │   ├── ui/          # Button, Card, Input, Badge, etc.
│   │   ├── ProductCard.tsx
│   │   └── ProtectedRoute.tsx
│   ├── hooks/           # Custom hooks (useCart)
│   ├── layouts/         # Header, Footer, SellerLayout, AdminLayout
│   ├── lib/             # Utilities (formatPrice, cn, etc.)
│   ├── pages/           # All page components
│   │   ├── auth/        # Login, Register, Forgot/Reset Password
│   │   ├── seller/      # Seller dashboard, products, orders, etc.
│   │   └── admin/       # Admin dashboard, users, sellers, etc.
│   ├── services/        # API service modules (auth, products, cart, etc.)
│   ├── stores/          # Zustand auth store
│   ├── types/           # TypeScript type definitions
│   ├── App.tsx          # Routes configuration
│   ├── main.tsx         # Entry point
│   └── index.css        # Tailwind CSS styles
└── .env.example
```

## Edit / Update forms: no-op protection

Every form that edits an existing record (seller **Edit Product**, buyer **Update Profile**, seller **Edit Details**, admin **Edit Category**, admin **Commission Rate**, and the status dialogs for users / sellers / products / orders) must:

1. compare the submitted values with the values the form was pre-filled from,
2. when nothing differs, show **"No changes to update."** and **not** call the API,
3. only send the update request (and its success toast) when something really changed.

The comparison and the message live in one place — `src/lib/formChanges.ts`:

```ts
import { getChangedFields, notifyNoChanges } from '@/lib/formChanges'

const submit = (values: ProductForm) => {
  const changed = getChangedFields(values, originalValues)   // PATCH payload
  if (Object.keys(changed).length === 0) {
    notifyNoChanges()                                         // → "No changes to update."
    return                                                    // no request, no success toast
  }
  updateProduct.mutate({ id, data: changed })
}
```

`getChangedFields` treats `null` / `undefined` / `''` as the same empty value, trims
strings (whitespace-only edits are not changes) and compares `'12'` with `12`, so a
pristine form never looks dirty. Only the changed fields are sent, and the dialogs stay
open so editing can continue.

Run `node scripts/verify-no-changes-guard.mjs` to check the rule: it unit-tests the
helpers and audits every screen that can fire an update request, so a new edit form
cannot skip the guard.

## Roles

- **Buyer**: Browse products, cart, checkout, orders, wishlist, reviews, notifications
- **Seller**: Onboarding, dashboard, products, orders, inventory, discounts, coupons, analytics, customers, settlements
- **Super Admin**: Dashboard, manage sellers/users/products/orders, settlements, commission, broadcast notifications

## Running Frontend + Backend

1. Start the backend: `cd .. && npm run dev`
2. Start the frontend: `npm run dev`
3. Open http://localhost:3000

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL | `http://localhost:5000/api/v1` |
