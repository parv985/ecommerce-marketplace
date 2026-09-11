import { OrderDetailPage } from '@/pages/OrderDetailPage'

/**
 * Seller Panel order details route element (`/seller/orders/:id`).
 *
 * Reuses the shared `OrderDetailPage` in its seller variant — one
 * order-details implementation for buyers, sellers and admins. The
 * backend authorizes the order's seller on `GET /orders/:id`,
 * `/orders/:id/tracking`, `/orders/:id/invoice` and the status /
 * cancel actions, and scopes everything to the seller's own orders.
 */
export function SellerOrderDetailPage() {
  return <OrderDetailPage variant="seller" />
}
