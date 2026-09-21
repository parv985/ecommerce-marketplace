import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, RefreshCw, ShoppingCart } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import { extractErrorMessage } from '@/services/api'
import { formatPrice, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { Skeleton } from '@/components/ui/Skeleton'

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error' | 'secondary' | 'brand'> = {
  PENDING: 'warning', CONFIRMED: 'secondary', SHIPPED: 'secondary', DELIVERED: 'success', CANCELLED: 'error', RETURNED: 'brand',
}

export function AdminOrdersPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-orders', page, status],
    queryFn: () => adminService.getOrders({ page, status: status || undefined }),
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">All Orders</h1>
      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'].map(s => (
          <button
            key={s}
            onClick={() => { setStatus(s); setPage(1); }}
            className={`px-3 py-1 text-sm rounded ${status === s ? 'bg-[var(--primary)] text-white' : 'bg-zinc-100 hover:bg-zinc-200'}`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array(4).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-[var(--radius)]" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="p-3 rounded-full bg-[var(--destructive-subtle)] text-[var(--destructive)] mb-4">
            <AlertCircle size={28} strokeWidth={1.75} />
          </div>
          <h3 className="text-lg font-medium mb-1">Could not load orders</h3>
          <p className="text-sm text-[var(--muted)] max-w-sm mb-4">{extractErrorMessage(error)}</p>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={`mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Try again
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.items?.map(order => (
            <Link to={`/admin/orders/${order.id}`} key={order.id} className="block border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-medium">#{order.orderNumber}</span>
                  <span className="text-xs text-[var(--muted)] ml-2">{formatDate(order.createdAt)}</span>
                </div>
                <Badge variant={statusColors[order.status] ?? 'default'}>{order.status}</Badge>
              </div>
              <p className="text-sm text-[var(--muted)] mt-1">{order.itemCount} item(s) • {formatPrice(order.total)} • {order.paymentStatus}</p>
            </Link>
          ))}
          {(!data?.items || data.items.length === 0) && (
            <EmptyState
              icon={<ShoppingCart size={44} strokeWidth={1.5} />}
              title="No orders found"
              description={status ? `No orders found with status "${status}".` : 'Orders will appear here once customers start placing them.'}
            />
          )}
          {data && data.totalPages > 1 && (
            <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} />
          )}
        </div>
      )}
    </div>
  )
}
