import { useQuery } from '@tanstack/react-query'
import { Users, Store, Package, ShoppingCart } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import { Card, CardContent } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

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
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-slate-100"><s.icon size={20} className="text-slate-600" /></div>
              <div>
                <p className="text-xs text-[var(--muted)]">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent>
          <h2 className="font-semibold mb-2">Commission Rate</h2>
          <p className="text-2xl font-bold">{commission?.rate ?? 0}%</p>
        </CardContent>
      </Card>
    </div>
  )
}
