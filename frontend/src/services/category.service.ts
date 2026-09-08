import api from './api'
import type {
  ApiResponse,
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '@/types/api'

/**
 * Category API (backend: src/modules/categories).
 *
 * The backend validates request bodies with strict zod schemas, so only the
 * fields declared in CreateCategoryInput / UpdateCategoryInput may be sent.
 * `undefined` values are dropped by JSON serialisation, so callers can safely
 * omit optional keys.
 */
export const categoryService = {
  /** GET /categories — public, active categories only (sorted by name). */
  list: () =>
    api.get<ApiResponse<Category[]>>('/categories').then(r => r.data.data),

  /** GET /categories/all — SUPER_ADMIN, every category incl. inactive. */
  listAll: () =>
    api.get<ApiResponse<Category[]>>('/categories/all').then(r => r.data.data),

  /** POST /categories — SUPER_ADMIN. */
  create: (data: CreateCategoryInput) =>
    api.post<ApiResponse<Category>>('/categories', data).then(r => r.data),

  /** PATCH /categories/:id — SUPER_ADMIN. Send only the fields that changed. */
  update: (id: string, data: UpdateCategoryInput) =>
    api.patch<ApiResponse<Category>>(`/categories/${id}`, data).then(r => r.data),

  /** DELETE /categories/:id — SUPER_ADMIN. Soft-deactivates (isActive=false). */
  deactivate: (id: string) =>
    api.delete<ApiResponse<null>>(`/categories/${id}`).then(r => r.data),

  // ── Descriptive aliases ────────────────────────────────────────────────
  getActiveCategories: () => categoryService.list(),
  getAllCategories: () => categoryService.listAll(),
  createCategory: (data: CreateCategoryInput) => categoryService.create(data),
  updateCategory: (id: string, data: UpdateCategoryInput) => categoryService.update(id, data),
  deactivateCategory: (id: string) => categoryService.deactivate(id),
  /** @deprecated use `deactivate` — the endpoint soft-deletes, it does not remove the record. */
  delete: (id: string) => categoryService.deactivate(id),
}
