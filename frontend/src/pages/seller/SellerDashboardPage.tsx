import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ShoppingCart, Package, DollarSign, TrendingDown, RotateCcw } from 'lucide-react'
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
    { label: 'Total Orders', value: dashboard.orders.total, icon: ShoppingCart },
    { label: 'Revenue', value: formatPrice(dashboard.revenue.total), icon: DollarSign },
    { label: 'Active Products', value: dashboard.products.active, icon: Package },
    { label: 'Pending Orders', value: dashboard.orders.pending, icon: ShoppingCart },
    { label: 'Delivered', value: dashboard.orders.delivered, icon: Package },
    { label: 'Cancelled', value: dashboard.orders.cancelled, icon: TrendingDown },
    { label: 'Low Stock', value: dashboard.products.lowStock, icon: Package },
    { label: 'Pending Returns', value: dashboard.returns.pending, icon: RotateCcw, href: '/seller/returns' },
  ] : []

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array(8).fill(0).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-[var(--radius-lg)]" />
        ))}
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)] mb-6 pb-4 border-b border-[var(--border)]">
        Seller Dashboard
      </h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => {
          const content = (
            <CardContent className="flex items-center gap-3.5 p-4.5">
              <div className="p-2.5 rounded-[var(--radius)] bg-[#f6f5f2] border border-[var(--border)] shrink-0 text-[var(--fg)]">
                <s.icon size={18} strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--muted)] truncate">{s.label}</p>
                <p className="text-xl font-bold tracking-tight text-[var(--fg)] truncate mt-0.5">{s.value}</p>
              </div>
            </CardContent>
          )
          return (
            <Card key={s.label}>
              {'href' in s && s.href ? (
                <Link to={s.href} className="block hover:opacity-90 transition-opacity">
                  {content}
                </Link>
              ) : (
                content
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
