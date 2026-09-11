import type { QueryClient } from '@tanstack/react-query'

/*
 * ---------------------------------------------------------------------------
 * Seller business-data cache invalidation
 * ---------------------------------------------------------------------------
 * Every seller-facing number (dashboard stats, analytics, customers,
 * settlements, order/return lists) is computed by the API from the database
 * — the single source of truth. React Query caches those responses, so a
 * mutation that moves money or stock must invalidate EVERY cache derived
 * from it, otherwise the dashboard keeps showing stale values.
 *
 * One action can ripple across many sections, e.g.:
 *  - delivering a COD order flips its payment to PAID → revenue, analytics,
 *    customers (totalSpent) and the next settlement all change;
 *  - cancelling an order refunds an online payment, restores stock and
 *    releases coupon usage → revenue, inventory, coupons and order counts
 *    all change;
 *  - approving a return refunds the buyer, marks the order RETURNED,
 *    restores stock and reverses the settlement → orders, returns,
 *    inventory, revenue, analytics, customers and settlement all change.
 *
 * `invalidateSellerData` invalidates the full derived set at once. Keys
 * that are not currently mounted are simply marked stale (no request is
 * made), so the cost is bounded; mounted queries refetch from the API and
 * the backend recomputes from the database — nothing is ever added up
 * client-side, so repeated invalidations can never double-count.
 */

/** Caches derived from orders, payments, returns, refunds and settlements. */
const SELLER_DATA_QUERY_KEYS: readonly (readonly string[])[] = [
  // Dashboard stat cards (orders, revenue, products, returns, marketing)
  ['seller-dashboard'],
  // Order lists / details / timelines / invoices (status + payment badges)
  ['orders'],
  ['order'],
  ['tracking'],
  ['invoice'],
  // Return lists / details (seller and buyer views of the same records)
  ['seller-returns'],
  ['returns'],
  ['return'],
  // Analytics page (sales series, revenue stats, top products, categories)
  ['sales'],
  ['revenue'],
  ['top-products'],
  ['category-performance'],
  // Customers page (orderCount / totalSpent come from PAID revenue)
  ['customers'],
  ['customer-orders'],
  // Settlement page (generated from DELIVERED+PAID, reversed on returns)
  ['seller-settlement'],
  // Coupon usage counters (released when an order is cancelled/returned)
  ['coupons'],
]

/**
 * Caches that additionally move when stock changes (order cancellation,
 * return restock, manual adjustment): the seller's product list, the
 * public catalog (stock badges) and the inventory transaction log.
 */
const INVENTORY_QUERY_KEYS: readonly (readonly string[])[] = [
  ['my-products'],
  ['products'],
  ['product'],
  ['inventory'],
]

export interface InvalidateSellerDataOptions {
  /**
   * Also invalidate product/stock caches. Pass `true` for mutations that
   * restore or adjust inventory (cancellation, return approval/completion,
   * stock adjustment).
   */
  inventory?: boolean
}

/**
 * Invalidates every query cache derived from the seller's business data so
 * all affected sections refetch the current database state from the API.
 */
export function invalidateSellerData(
  queryClient: QueryClient,
  options: InvalidateSellerDataOptions = {},
): void {
  for (const queryKey of SELLER_DATA_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey: [...queryKey] })
  }

  if (options.inventory) {
    for (const queryKey of INVENTORY_QUERY_KEYS) {
      queryClient.invalidateQueries({ queryKey: [...queryKey] })
    }
  }
}
