import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, RefreshCw, ShoppingCart } from 'lucide-react'
import { orderService } from '@/services/order.service'
import { extractErrorMessage } from '@/services/api'
import { formatPrice, formatDate } from '@/lib/utils'
import { invalidateSellerData } from '@/lib/sellerData'
import { notifyNoChanges } from '@/lib/formChanges'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { toast } from 'react-hot-toast'
import { Pagination } from '@/components/ui/Pagination'
import { Skeleton } from '@/components/ui/Skeleton'

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error' | 'secondary' | 'brand'> = {
  PENDING: 'warning', CONFIRMED: 'secondary', SHIPPED: 'secondary', DELIVERED: 'success', CANCELLED: 'error', RETURNED: 'brand',
}

export function SellerOrdersPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['orders', { page, status }],
    queryFn: () => orderService.list({ page, limit: 10, status: status || undefined }),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => orderService.updateStatus(id, status),
    /*
     * A status change moves derived data beyond the order list: delivering
     * a COD order flips its payment to PAID (revenue, analytics, customers,
     * settlement) and cancelling restores stock + refunds online payments.
     * `invalidateSellerData` refreshes every affected section from the API;
     * the stock caches are included when the transition cancels the order.
     */
    onSuccess: (_res, vars) => {
      invalidateSellerData(queryClient, { inventory: vars.status === 'CANCELLED' })
      toast.success('Status updated')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  /* Status updates are updates too: skip the request when the order already
     carries the target status (stale list or a second click). */
  const changeStatus = (orderId: string, nextStatus: string) => {
    if (updateStatus.isPending) return
    const live = data?.items?.find(o => o.id === orderId)
    if (live && live.status === nextStatus) {
      notifyNoChanges()
      return
    }
    updateStatus.mutate({ id: orderId, status: nextStatus })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Orders</h1>
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
            <Skeleton key={i} className="h-24 rounded-[var(--radius)]" />
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
            <div key={order.id} className="border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <Link to={`/seller/orders/${order.id}`} className="font-medium text-sm hover:underline">#{order.orderNumber}</Link>
                  <span className="text-xs text-[var(--muted)] ml-2">{formatDate(order.createdAt)}</span>
                </div>
                <Badge variant={statusColors[order.status] ?? 'default'}>{order.status}</Badge>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-sm text-[var(--muted)]">{order.items.length} item(s) • {formatPrice(order.total)}</span>
                <div className="flex gap-1 self-end sm:self-auto">
                  {order.status === 'PENDING' && <Button size="sm" variant="outline" disabled={updateStatus.isPending} onClick={() => changeStatus(order.id, 'CONFIRMED')}>Confirm</Button>}
                  {order.status === 'CONFIRMED' && <Button size="sm" variant="outline" disabled={updateStatus.isPending} onClick={() => changeStatus(order.id, 'SHIPPED')}>Ship</Button>}
                  {order.status === 'SHIPPED' && <Button size="sm" variant="outline" disabled={updateStatus.isPending} onClick={() => changeStatus(order.id, 'DELIVERED')}>Deliver</Button>}
                </div>
              </div>
            </div>
          ))}
          {(!data?.items || data.items.length === 0) && (
            <EmptyState
              icon={<ShoppingCart size={44} strokeWidth={1.5} />}
              title="No orders found"
              description={status ? `No orders found with status "${status}".` : 'Orders from buyers will appear here as soon as they are placed.'}
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
