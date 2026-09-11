import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { sellerService } from '@/services/seller.service'
import { orderService } from '@/services/order.service'
import { formatPrice, formatDate } from '@/lib/utils'
import { Pagination } from '@/components/ui/Pagination'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { Skeleton } from '@/components/ui/Skeleton'
import type { CustomerInfo, Order } from '@/types/api'
import { Search } from 'lucide-react'

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error' | 'secondary' | 'brand'> = {
  PENDING: 'warning', CONFIRMED: 'secondary', SHIPPED: 'secondary', DELIVERED: 'success', CANCELLED: 'error', RETURNED: 'brand',
}

/**
 * Fetches this seller's orders (GET /orders is already seller-scoped on the
 * backend) across pages and returns only the given buyer's orders. The backend
 * has no per-customer filter, so the seller scope comes from the API and the
 * buyer scope is applied client-side — no hardcoded data.
 */
async function fetchCustomerOrders(customerId: string): Promise<Order[]> {
  const limit = 100
  let page = 1
  let totalPages = 1
  const matched: Order[] = []

  do {
    const res = await orderService.list({ page, limit })
    totalPages = res.totalPages || 1
    for (const order of res.items) {
      if (order.userId === customerId) matched.push(order)
    }
    page += 1
    // Safety cap: 50 pages = up to 5000 seller orders scanned.
    if (page > 50) break
  } while (page <= totalPages)

  return matched
}

function CustomerOrdersDialog({
  customer,
  open,
  onClose,
}: {
  customer: CustomerInfo | null
  open: boolean
  onClose: () => void
}) {
  const { data: orders, isLoading, isError } = useQuery({
    queryKey: ['customer-orders', customer?.customerId],
    queryFn: () => fetchCustomerOrders(customer!.customerId),
    enabled: open && !!customer,
  })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={customer ? `Orders by ${customer.name}` : 'Customer orders'}
      className="max-w-2xl"
    >
      {customer && (
        <p className="text-xs text-[var(--muted)] mb-4 -mt-1">
          {customer.email} • {customer.orderCount} order{customer.orderCount === 1 ? '' : 's'} • {formatPrice(customer.totalSpent)} spent
        </p>
      )}
      {isLoading ? (
        <div className="space-y-3">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : isError ? (
        <p className="text-sm text-red-600 py-6 text-center">Failed to load orders. Please try again.</p>
      ) : !orders?.length ? (
        <p className="text-sm text-[var(--muted)] py-6 text-center">No orders found for this customer.</p>
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
          {orders.map(order => (
            <div key={order.id} className="border rounded-lg p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">#{order.orderNumber}</p>
                  <p className="text-xs text-[var(--muted)]">{formatDate(order.createdAt)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="default">{order.paymentStatus}</Badge>
                  <Badge variant={statusColors[order.status] ?? 'default'}>{order.status}</Badge>
                </div>
              </div>
              <div className="text-xs text-[var(--muted)] space-y-0.5 mt-2">
                {order.items.map(item => (
                  <p key={item.productId} className="truncate">
                    {item.name} <span className="text-[var(--fg)] font-medium">× {item.quantity}</span>
                  </p>
                ))}
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t">
                <span className="text-xs text-[var(--muted)]">
                  {order.items.length} item{order.items.length === 1 ? '' : 's'} • {order.paymentMethod}
                </span>
                <span className="text-sm font-semibold">{formatPrice(order.total)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}

export function SellerCustomersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<CustomerInfo | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search],
    queryFn: () => sellerService.getCustomers({ page, limit: 20, search: search || undefined }),
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Customers</h1>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted)]" />
        <input type="text" placeholder="Search by name or email..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-4 py-2 border rounded-md text-sm" />
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b">
            <tr>
              <th className="text-left p-3 font-medium">Customer</th>
              <th className="text-left p-3 font-medium">Orders</th>
              <th className="text-left p-3 font-medium">Spent</th>
              <th className="text-left p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="p-3"><Skeleton className="h-10 w-full" /></td></tr>
            ) : !data?.items?.length ? (
              <tr><td colSpan={4} className="p-6 text-center text-[var(--muted)]">No customers yet. Buyers who order from you will appear here.</td></tr>
            ) : (
              data.items.map((c) => (
                <tr key={c.customerId} className="border-b last:border-0">
                  <td className="p-3">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-[var(--muted)]">{c.email}</p>
                  </td>
                  <td className="p-3">{c.orderCount}</td>
                  <td className="p-3 font-medium">{formatPrice(c.totalSpent)}</td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => setSelected(c)}>
                      View
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {data && data.totalPages > 1 && <div className="p-4"><Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} /></div>}
      </div>

      <CustomerOrdersDialog
        customer={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
