import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Package } from 'lucide-react'
import { orderService } from '@/services/order.service'
import { formatPrice, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error' | 'secondary'> = {
  PENDING: 'warning',
  CONFIRMED: 'secondary',
  SHIPPED: 'secondary',
  DELIVERED: 'success',
  CANCELLED: 'error',
}

export function OrderListPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['orders', { page, status }],
    queryFn: () => orderService.list({ page, limit: 10, status: status || undefined }),
  })

  if (isLoading) {
    return (
      <div className="container-app py-8 space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-[var(--radius-lg)]" />)}
      </div>
    )
  }

  return (
    <div className="container-app py-8">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--border)] gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">
          My Orders
        </h1>
        <Link
          to="/returns"
          className="text-sm font-medium text-[var(--primary)] hover:underline shrink-0"
        >
          My Returns
        </Link>
      </div>
      <div className="flex gap-2 mb-6 flex-wrap">
        {['', 'PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map(s => (
          <button
            key={s}
            onClick={() => { setStatus(s); setPage(1); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[var(--radius)] transition-all ${
              status === s
                ? 'bg-[var(--primary)] text-white shadow-sm'
                : 'bg-white border border-[var(--border)] text-[var(--fg-secondary)] hover:bg-[var(--accent)] hover:text-[var(--fg)]'
            }`}
          >
            {s || 'All Orders'}
          </button>
        ))}
      </div>
      {!data?.items?.length ? (
        <EmptyState
          icon={<Package size={48} strokeWidth={1.5} />}
          title="No orders found"
          description="You haven't placed any orders yet"
          action={{ label: 'Browse Products', onClick: () => window.location.href = '/products' }}
        />
      ) : (
        <div className="space-y-3.5">
          {data.items.map(order => (
            <Link
              to={`/orders/${order.id}`}
              key={order.id}
              className="block border border-[var(--border)] rounded-[var(--radius-lg)] p-4.5 bg-white hover:border-neutral-400 hover:shadow-[var(--shadow-sm)] transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-semibold text-sm text-[var(--fg)]">Order #{order.orderNumber}</span>
                  <span className="text-xs text-[var(--muted)] ml-2.5">{formatDate(order.createdAt)}</span>
                </div>
                <Badge variant={statusColors[order.status]}>{order.status}</Badge>
              </div>
              <div className="text-xs text-[var(--fg-secondary)]">
                {order.items.length} item{order.items.length === 1 ? '' : 's'} • <span className="font-semibold text-[var(--fg)]">{formatPrice(order.total)}</span>
              </div>
            </Link>
          ))}
          <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
