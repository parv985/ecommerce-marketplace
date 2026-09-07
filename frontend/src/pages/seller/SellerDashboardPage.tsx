import { useQuery } from '@tanstack/react-query'
import { ShoppingCart, Package, DollarSign, TrendingDown, Percent, Ticket } from 'lucide-react'
import { sellerService } from '@/services/seller.service'
import { formatPrice } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export function SellerDashboardPage() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['seller-dashboard'],
    queryFn: sellerService.getDashboard,
  })

  const stats = dashboard ? [
    { label: 'Total Orders', value: dashboard.totalOrders, icon: ShoppingCart },
    { label: 'Revenue', value: formatPrice(dashboard.totalRevenue), icon: DollarSign },
    { label: 'Active Products', value: dashboard.activeProducts, icon: Package },
    { label: 'Pending Orders', value: dashboard.pendingOrders, icon: ShoppingCart },
    { label: 'Delivered', value: dashboard.deliveredOrders, icon: Package },
    { label: 'Cancelled', value: dashboard.cancelledOrders, icon: TrendingDown },
    { label: 'Low Stock', value: dashboard.lowStockProducts, icon: Package },
    { label: 'Pending Returns', value: dashboard.pendingReturns, icon: TrendingDown },
  ] : []

  if (isLoading) return <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-zinc-100">
                <s.icon size={20} className="text-[var(--muted)]" />
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
