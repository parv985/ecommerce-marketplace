import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { sellerService } from '@/services/seller.service'
import { formatPrice } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export function SellerAnalyticsPage() {
  const [groupBy, setGroupBy] = useState<'day' | 'month'>('day')

  const { data: sales, isLoading: salesLoading } = useQuery({
    queryKey: ['sales', groupBy],
    queryFn: () => sellerService.getSales({ groupBy }),
  })
  const { data: topProducts, isLoading: topLoading } = useQuery({
    queryKey: ['top-products'],
    queryFn: () => sellerService.getTopProducts(5),
  })
  const { data: categories, isLoading: catLoading } = useQuery({
    queryKey: ['category-performance'],
    queryFn: sellerService.getCategoryPerformance,
  })
  const { data: revenue } = useQuery({
    queryKey: ['revenue'],
    queryFn: () => sellerService.getRevenue(),
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Analytics</h1>

      {/* Stats */}
      {revenue && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card><CardContent><p className="text-xs text-[var(--muted)]">Total Revenue</p><p className="text-xl font-bold">{formatPrice(revenue.totalRevenue)}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs text-[var(--muted)]">Delivered Orders</p><p className="text-xl font-bold">{revenue.deliveredOrders}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs text-[var(--muted)]">Cancelled</p><p className="text-xl font-bold">{revenue.cancelledOrders}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs text-[var(--muted)]">Returned</p><p className="text-xl font-bold">{revenue.returnedOrders}</p></CardContent></Card>
        </div>
      )}

      {/* Sales Chart — always rendered so an empty seller sees an explicit
          empty state instead of a blank section. Backend buckets are keyed by
          `period` (YYYY-MM-DD / YYYY-MM), with PAID revenue + order counts. */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Sales Over Time</CardTitle>
          <div className="flex gap-1">
            {(['day', 'month'] as const).map(g => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`px-3 py-1 text-xs rounded capitalize ${groupBy === g ? 'bg-[var(--primary)] text-white' : 'bg-zinc-100 hover:bg-zinc-200'}`}
              >
                {g === 'day' ? 'Daily' : 'Monthly'}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {salesLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : !sales?.length ? (
            <p className="text-sm text-[var(--muted)] py-8 text-center">No sales data yet. Orders you receive will appear here.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sales}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  formatter={(value, name) =>
                    name === 'revenue' ? formatPrice(Number(value)) : Number(value)
                  }
                  labelFormatter={(label) => `Period: ${label}`}
                />
                <Bar yAxisId="left" dataKey="revenue" name="revenue" fill="#b83e20" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="orders" name="orders" fill="#f4a261" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Products */}
        <Card>
          <CardHeader><CardTitle>Top Products</CardTitle></CardHeader>
          <CardContent>
            {topLoading ? (
              <div className="space-y-3">
                {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !topProducts?.length ? <p className="text-sm text-[var(--muted)]">No data yet</p> : (
              <div className="space-y-3">
                {topProducts.map((p) => (
                  <div key={p.productId} className="flex justify-between items-center gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.name || 'Unnamed product'}</p>
                      <p className="text-xs text-[var(--muted)]">{p.quantity} sold • {p.orders} order{p.orders === 1 ? '' : 's'}</p>
                    </div>
                    <span className="text-sm font-semibold shrink-0">{formatPrice(p.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Performance */}
        <Card>
          <CardHeader><CardTitle>Top Categories</CardTitle></CardHeader>
          <CardContent>
            {catLoading ? (
              <div className="space-y-3">
                {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !categories?.length ? <p className="text-sm text-[var(--muted)]">No data yet</p> : (
              <div className="space-y-3">
                {categories.map((c) => (
                  <div key={c.categoryId} className="flex justify-between items-center gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.categoryName ?? 'Uncategorized'}</p>
                      <p className="text-xs text-[var(--muted)]">{c.quantity} sold</p>
                    </div>
                    <span className="text-sm font-semibold shrink-0">{formatPrice(c.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
