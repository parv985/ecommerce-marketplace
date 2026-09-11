import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { orderService } from '@/services/order.service'
import { formatPrice, formatDate } from '@/lib/utils'
import { notifyNoChanges } from '@/lib/formChanges'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { toast } from 'react-hot-toast'
import { Pagination } from '@/components/ui/Pagination'

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error' | 'secondary' | 'brand'> = {
  PENDING: 'warning', CONFIRMED: 'secondary', SHIPPED: 'secondary', DELIVERED: 'success', CANCELLED: 'error', RETURNED: 'brand',
}

export function SellerOrdersPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['orders', { page, status }],
    queryFn: () => orderService.list({ page, limit: 10, status: status || undefined }),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => orderService.updateStatus(id, status),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['orders'] }); toast.success('Status updated') },
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
          <button key={s} onClick={() => { setStatus(s); setPage(1); }}
            className={`px-3 py-1 text-sm rounded ${status === s ? 'bg-[var(--primary)] text-white' : 'bg-zinc-100 hover:bg-zinc-200'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {data?.items?.map(order => (
          <div key={order.id} className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <Link to={`/orders/${order.id}`} className="font-medium text-sm hover:underline">#{order.orderNumber}</Link>
                <span className="text-xs text-[var(--muted)] ml-2">{formatDate(order.createdAt)}</span>
              </div>
              <Badge variant={statusColors[order.status]}>{order.status}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--muted)]">{order.items.length} item(s) • {formatPrice(order.total)}</span>
              <div className="flex gap-1">
                {order.status === 'PENDING' && <Button size="sm" variant="outline" disabled={updateStatus.isPending} onClick={() => changeStatus(order.id, 'CONFIRMED')}>Confirm</Button>}
                {order.status === 'CONFIRMED' && <Button size="sm" variant="outline" disabled={updateStatus.isPending} onClick={() => changeStatus(order.id, 'SHIPPED')}>Ship</Button>}
                {order.status === 'SHIPPED' && <Button size="sm" variant="outline" disabled={updateStatus.isPending} onClick={() => changeStatus(order.id, 'DELIVERED')}>Deliver</Button>}
              </div>
            </div>
          </div>
        ))}
        {data && <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} />}
      </div>
    </div>
  )
}
