import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { sellerService } from '@/services/seller.service'
import { formatPrice } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

export function SellerAnalyticsPage() {
  const { data: sales } = useQuery({ queryKey: ['sales'], queryFn: () => sellerService.getSales({ groupBy: 'day' }) })
  const { data: topProducts } = useQuery({ queryKey: ['top-products'], queryFn: () => sellerService.getTopProducts(5) })
  const { data: categories } = useQuery({ queryKey: ['category-performance'], queryFn: sellerService.getCategoryPerformance })
  const { data: revenue } = useQuery({ queryKey: ['revenue'], queryFn: () => sellerService.getRevenue() })

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

      {/* Sales Chart */}
      {sales && sales.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Sales Over Time</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sales}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => formatPrice(value)} />
                <Bar dataKey="revenue" fill="#b83e20" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Products */}
        <Card>
          <CardHeader><CardTitle>Top Products</CardTitle></CardHeader>
          <CardContent>
            {!topProducts?.length ? <p className="text-sm text-[var(--muted)]">No data yet</p> : (
              <div className="space-y-3">
                {topProducts.map((p, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium">{typeof p.product === 'object' ? p.product.name : 'Product'}</p>
                      <p className="text-xs text-[var(--muted)]">{p.totalSold} sold</p>
                    </div>
                    <span className="text-sm font-semibold">{formatPrice(p.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Performance */}
        <Card>
          <CardHeader><CardTitle>Category Performance</CardTitle></CardHeader>
          <CardContent>
            {!categories?.length ? <p className="text-sm text-[var(--muted)]">No data yet</p> : (
              <div className="space-y-3">
                {categories.map((c, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <span className="text-sm font-medium">{typeof c.category === 'object' ? c.category.name : 'Category'}</span>
                    <span className="text-sm font-semibold">{formatPrice(c.revenue)}</span>
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
