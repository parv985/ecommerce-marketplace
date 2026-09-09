import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { LayoutDashboard, Package, ShoppingCart, Truck, Percent, Ticket, Users, BarChart3, Bell, User, DollarSign } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { authApi } from '@/services/auth.service'

const navItems = [
  { to: '/seller/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/seller/products', label: 'Products', icon: Package },
  { to: '/seller/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/seller/inventory', label: 'Inventory', icon: Truck },
  { to: '/seller/discounts', label: 'Discounts', icon: Percent },
  { to: '/seller/coupons', label: 'Coupons', icon: Ticket },
  { to: '/seller/customers', label: 'Customers', icon: Users },
  { to: '/seller/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/seller/settlement', label: 'Settlement', icon: DollarSign },
  { to: '/seller/notifications', label: 'Notifications', icon: Bell },
  { to: '/seller/profile', label: 'Profile', icon: User },
]

// For pending sellers, only show these items
const pendingNavItems = [
  { to: '/seller/profile', label: 'Profile & Documents', icon: User },
]

export function SellerLayout() {
  const { user } = useAuthStore()
  const [sellerStatus, setSellerStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.role !== 'SELLER') return
    authApi.getSellerProfile()
      .then(profile => setSellerStatus(profile.status))
      .catch(() => setSellerStatus('UNKNOWN'))
      .finally(() => setLoading(false))
  }, [user])

  if (user && user.role !== 'SELLER') return <Navigate to="/" replace />

  const isPending = sellerStatus === 'PENDING' || sellerStatus === 'REJECTED' || sellerStatus === 'SUSPENDED'
  const activeNavItems = isPending ? pendingNavItems : navItems

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside className="hidden lg:block w-64 border-r border-[var(--border)] bg-[#f8f7f4] shrink-0 p-4">
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 bg-neutral-200 rounded-[var(--radius)] animate-pulse" />
            ))}
          </div>
        </aside>
        <main className="flex-1 p-6 bg-[var(--bg)]" />
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <aside className="hidden lg:block w-64 border-r border-[var(--border)] bg-[#f8f7f4] shrink-0">
        <div className="p-4 border-b border-[var(--border)]">
          <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">Seller Panel</p>
          <div className="mt-1 flex items-center gap-2">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-6 h-6 rounded-[var(--radius-sm)] object-cover shrink-0"
              />
            ) : (
              <span className="w-6 h-6 rounded-[var(--radius-sm)] bg-[#191816] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            )}
            <p className="text-sm font-semibold text-[var(--fg)] truncate">{user?.name}</p>
          </div>
          {isPending && (
            <span className={cn(
              'inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-[var(--radius-sm)] border',
              sellerStatus === 'PENDING' && 'bg-amber-50 text-amber-800 border-amber-200',
              sellerStatus === 'REJECTED' && 'bg-rose-50 text-rose-800 border-rose-200',
              sellerStatus === 'SUSPENDED' && 'bg-orange-50 text-orange-800 border-orange-200',
            )}>
              {sellerStatus === 'PENDING' && 'Awaiting Approval'}
              {sellerStatus === 'REJECTED' && 'Application Rejected'}
              {sellerStatus === 'SUSPENDED' && 'Account Suspended'}
            </span>
          )}
        </div>
        <nav className="p-2.5 space-y-1">
          {activeNavItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius)] text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-[var(--primary)] text-white shadow-sm'
                  : 'text-[var(--fg-secondary)] hover:text-[var(--fg)] hover:bg-[var(--accent)]'
              )}
            >
              <Icon size={16} strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Mobile nav */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--border)] z-40">
        <div className="flex overflow-x-auto">
          {(isPending ? pendingNavItems : navItems.slice(0, 5)).map(({ to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                'flex flex-col items-center gap-1 px-4 py-2 text-[10px] shrink-0',
                isActive ? 'text-[var(--primary)] font-semibold' : 'text-[var(--muted)]'
              )}
            >
              <Icon size={18} strokeWidth={1.75} />
              <span>{(isPending ? pendingNavItems : navItems).find(i => i.to === to)?.label}</span>
            </NavLink>
          ))}
        </div>
      </div>

      <main className="flex-1 p-6 pb-20 lg:pb-6 bg-[var(--bg)]">
        <Outlet />
      </main>
    </div>
  )
}
