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
