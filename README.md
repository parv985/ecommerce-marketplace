# E-commerce Marketplace (NexCart)

A multi-vendor e-commerce marketplace monorepo: a Node.js/Express REST API (`backend/`) and a React SPA client (`frontend/`).

## Structure

| Folder  | App                                                                        | Port | Docs                                                                                                                    |
| ------- | -------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------- |
| `backend/`  | REST API — Node.js + TypeScript + Express 5 + MongoDB (Mongoose) + Zod     | 5000 | [backend/README.md](backend/README.md) · [Project guide](backend/docs/PROJECT_GUIDE.md) · [Architecture](backend/docs/architecture.md) |
| `frontend/` | SPA — React + TypeScript + Vite + Tailwind CSS (TanStack Query + Zustand) | 3000 | [frontend/README.md](frontend/README.md)                                                                                |

Each app is standalone (no workspace tooling): install and run it from its own folder.

## Quick start

### 1. Backend — API on http://localhost:5000

```bash
cd backend
npm install
cp .env.example .env   # fill in MONGODB_URI, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, CLOUDINARY_*
npm run dev            # Swagger UI at http://localhost:5000/api-docs/
```

### 2. Frontend — SPA on http://localhost:3000

```bash
cd frontend
npm install
cp .env.example .env   # optional: VITE_API_URL (defaults to the Vite /api proxy)
npm run dev
```

The Vite dev server proxies `/api` requests to `http://localhost:5000`, so the frontend works out of the box once the backend is running.
