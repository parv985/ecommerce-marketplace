import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, RefreshCw, ShoppingCart, AlertTriangle, X } from 'lucide-react'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const status = (searchParams.get('status') || '').toUpperCase()
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-orders', page, status],
    queryFn: () => adminService.getOrders({ page, status: status || undefined }),
  })

  const handleStatusChange = (s: string) => {
    const next = new URLSearchParams(searchParams)
    if (s) {
      next.set('status', s.toLowerCase())
    } else {
      next.delete('status')
    }
    next.delete('page')
    setSearchParams(next)
  }

  const handlePageChange = (newPage: number) => {
    const next = new URLSearchParams(searchParams)
    if (newPage > 1) {
      next.set('page', String(newPage))
    } else {
      next.delete('page')
    }
    setSearchParams(next)
  }

  const handleClearFilter = () => {
    setSearchParams({})
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">All Orders</h1>

      {/* Active filter banner with Clear Filter button */}
      {status && (
        <div className="flex items-center justify-between p-3.5 mb-4 rounded-[var(--radius)] bg-amber-50/90 border border-amber-200/90 text-amber-900 text-sm">
          <div className="flex items-center gap-2.5">
            <div className="p-1 rounded-full bg-amber-100 text-amber-800">
              <AlertTriangle size={15} />
            </div>
            <div>
              <span className="font-semibold">Filtered View:</span>{' '}
              <span>
                Showing only <strong>{status}</strong> orders
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearFilter}
            className="h-7 text-xs px-2.5 bg-white hover:bg-amber-100/50 border-amber-300 text-amber-900 cursor-pointer"
          >
            <X size={13} className="mr-1" />
            Clear Filter
          </Button>
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'].map(s => (
          <button
            key={s}
            onClick={() => handleStatusChange(s)}
            className={`px-3 py-1 text-sm rounded cursor-pointer transition-colors ${status === s ? 'bg-[var(--primary)] text-white font-medium' : 'bg-zinc-100 hover:bg-zinc-200'}`}
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
            <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={handlePageChange} />
          )}
        </div>
      )}
    </div>
  )
}
