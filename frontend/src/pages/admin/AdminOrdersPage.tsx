import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { adminService } from '@/services/admin.service'
import { formatPrice, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error' | 'secondary' | 'brand'> = {
  PENDING: 'warning', CONFIRMED: 'secondary', SHIPPED: 'secondary', DELIVERED: 'success', CANCELLED: 'error', RETURNED: 'brand',
}

export function AdminOrdersPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')

  const { data } = useQuery({
    queryKey: ['admin-orders', page, status],
    queryFn: () => adminService.getOrders({ page, status: status || undefined }),
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">All Orders</h1>
      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'].map(s => (
          <button key={s} onClick={() => { setStatus(s); setPage(1); }}
            className={`px-3 py-1 text-sm rounded ${status === s ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {data?.items?.map(order => (
          <Link to={`/admin/orders/${order.id}`} key={order.id} className="block border rounded-lg p-4 hover:shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">#{order.orderNumber}</span>
                <span className="text-xs text-[var(--muted)] ml-2">{formatDate(order.createdAt)}</span>
              </div>
              <Badge variant={statusColors[order.status]}>{order.status}</Badge>
            </div>
            <p className="text-sm text-[var(--muted)] mt-1">{order.itemCount} item(s) • {formatPrice(order.total)} • {order.paymentStatus}</p>
          </Link>
        ))}
        {data?.items?.length === 0 && (
          <div className="text-center py-12 text-[var(--muted)]">
            <p className="text-lg font-medium">No orders found</p>
            <p className="text-sm mt-1">Orders will appear here once customers start placing them.</p>
          </div>
        )}
        {data && <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} />}
      </div>
    </div>
  )
}
