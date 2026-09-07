import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { sellerService } from '@/services/seller.service'
import { formatPrice, formatDate } from '@/lib/utils'
import { Pagination } from '@/components/ui/Pagination'
import { Search } from 'lucide-react'

export function SellerCustomersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const { data } = useQuery({
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
              <th className="text-left p-3 font-medium">Last Order</th>
            </tr>
          </thead>
          <tbody>
            {data?.items?.map((c, i) => (
              <tr key={i} className="border-b">
                <td className="p-3">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-[var(--muted)]">{c.email}</p>
                </td>
                <td className="p-3">{c.orderCount}</td>
                <td className="p-3 font-medium">{formatPrice(c.totalSpent)}</td>
                <td className="p-3 text-[var(--muted)]">{c.lastOrderDate ? formatDate(c.lastOrderDate) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && <div className="p-4"><Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} /></div>}
      </div>
    </div>
  )
}
