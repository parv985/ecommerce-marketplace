import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Package } from 'lucide-react'
import { orderService } from '@/services/order.service'
import { formatPrice, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
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

  if (isLoading) return <div className="container-app py-8 space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>

  return (
    <div className="container-app py-8">
      <h1 className="text-2xl font-bold mb-6">My Orders</h1>
      <div className="flex gap-2 mb-6 flex-wrap">
        {['', 'PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map(s => (
          <button key={s} onClick={() => { setStatus(s); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-md ${status === s ? 'bg-[var(--primary)] text-white' : 'bg-zinc-100 hover:bg-zinc-200'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>
      {!data?.items?.length ? (
        <EmptyState icon={<Package size={48} />} title="No orders found" description="You haven't placed any orders yet" action={{ label: 'Browse Products', onClick: () => window.location.href = '/products' }} />
      ) : (
        <div className="space-y-4">
          {data.items.map(order => (
            <Link to={`/orders/${order._id}`} key={order._id} className="block border rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-medium text-sm">#{order.orderNumber}</span>
                  <span className="text-xs text-[var(--muted)] ml-2">{formatDate(order.createdAt)}</span>
                </div>
                <Badge variant={statusColors[order.status]}>{order.status}</Badge>
              </div>
              <div className="text-sm text-[var(--muted)]">
                {order.items.length} item(s) • {formatPrice(order.total)}
              </div>
            </Link>
          ))}
          <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
