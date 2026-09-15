import { OrderDetailPage } from '@/pages/OrderDetailPage'

/**
 * Super Admin order details route element (`/admin/orders/:id`).
 *
 * Reuses the shared `OrderDetailPage` in its read-only admin variant —
 * there is a single order-details implementation for buyers and admins.
 * The backend already authorizes SUPER_ADMIN on
 * `GET /orders/:id`, `/orders/:id/tracking` and `/orders/:id/invoice`.
 */
export function AdminOrderDetailPage() {
  return <OrderDetailPage variant="admin" />
}
