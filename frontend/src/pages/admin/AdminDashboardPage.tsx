import { useQuery } from '@tanstack/react-query'
import { Users, Store, Package, ShoppingCart } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import { Card, CardContent } from '@/components/ui/Card'

export function AdminDashboardPage() {
  const { data: users } = useQuery({ queryKey: ['admin-users'], queryFn: () => adminService.getUsers({ limit: 1 }) })
  const { data: sellers } = useQuery({ queryKey: ['admin-sellers'], queryFn: () => adminService.getSellers({ limit: 1 }) })
  const { data: products } = useQuery({ queryKey: ['admin-products'], queryFn: () => adminService.getProducts({ limit: 1 }) })
  const { data: orders } = useQuery({ queryKey: ['admin-orders'], queryFn: () => adminService.getOrders({ limit: 1 }) })
  const { data: commission } = useQuery({ queryKey: ['commission'], queryFn: adminService.getCommission })

  const stats = [
    { label: 'Total Users', value: users?.total || 0, icon: Users },
    { label: 'Total Sellers', value: sellers?.total || 0, icon: Store },
    { label: 'Total Products', value: products?.total || 0, icon: Package },
    { label: 'Total Orders', value: orders?.total || 0, icon: ShoppingCart },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)] mb-6 pb-4 border-b border-[var(--border)]">
        Admin Dashboard
      </h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3.5 p-4.5">
              <div className="p-2.5 rounded-[var(--radius)] bg-[#f6f5f2] border border-[var(--border)] shrink-0 text-[var(--fg)]">
                <s.icon size={18} strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--muted)] truncate">{s.label}</p>
                <p className="text-xl font-bold tracking-tight text-[var(--fg)] truncate mt-0.5">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-5">
          <h2 className="font-semibold text-sm text-[var(--muted)] uppercase tracking-wider mb-1">Marketplace Platform Commission</h2>
          <p className="text-2xl font-bold tracking-tight text-[var(--fg)]">{commission?.rate ?? 0}%</p>
        </CardContent>
      </Card>
    </div>
  )
}
