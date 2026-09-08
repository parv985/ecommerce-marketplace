import { useState, useRef, useEffect } from 'react'
import { NavLink, Outlet, Navigate, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Store, Tags, Package, ShoppingCart,
  Wallet, Bell, ScrollText, User, LogOut, ChevronDown,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/services/auth.service'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/sellers', label: 'Sellers', icon: Store },
  { to: '/admin/categories', label: 'Categories', icon: Tags },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/admin/settlements', label: 'Settlements', icon: Wallet },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell },
  { to: '/admin/audit', label: 'Audit Log', icon: ScrollText },
]

export function AdminLayout() {
  const { user, isLoading, logout } = useAuthStore()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      // Ignore errors — clear client state regardless
    } finally {
      logout()
      navigate('/login', { replace: true })
    }
  }

  if (isLoading) {
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

  if (user && user.role !== 'SUPER_ADMIN') return <Navigate to="/" replace />

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* ── Sidebar ── */}
      <aside className="hidden lg:flex lg:flex-col w-64 border-r border-[var(--border)] bg-[#f8f7f4] shrink-0">
        {/* Profile area — clickable */}
        <div className="p-4 border-b border-[var(--border)] relative" ref={menuRef}>
          <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">Admin Panel</p>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="mt-1 flex items-center gap-2 text-sm font-semibold text-[var(--fg)] hover:opacity-80 transition-opacity w-full text-left group"
          >
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-6 h-6 rounded-[var(--radius-sm)] object-cover shrink-0"
              />
            ) : (
              <span className="w-6 h-6 rounded-[var(--radius-sm)] bg-[#191816] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate flex-1">{user?.name}</span>
            <ChevronDown
              size={14}
              className={cn(
                'text-[var(--muted)] transition-transform shrink-0',
                menuOpen && 'rotate-180'
              )}
            />
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 mx-4 bg-white border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] z-50 overflow-hidden">
              <button
                onClick={() => {
                  setMenuOpen(false)
                  navigate('/admin/profile')
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[var(--fg)] hover:bg-[var(--accent)] transition-colors"
              >
                <User size={15} className="text-[var(--muted)]" />
                Admin Profile
              </button>
              <div className="border-t border-[var(--border-subtle)]" />
              <button
                onClick={() => {
                  setMenuOpen(false)
                  handleLogout()
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-700 hover:bg-red-50 transition-colors font-medium"
              >
                <LogOut size={15} className="text-red-600" />
                Logout
              </button>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="p-2.5 space-y-1 flex-1">
          {navItems.map(({ to, label, icon: Icon }) => (
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

      {/* ── Mobile bottom nav ── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--border)] z-40">
        <div className="flex overflow-x-auto">
          {navItems.slice(0, 5).map(({ to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                'flex flex-col items-center gap-1 px-4 py-2 text-[10px] shrink-0',
                isActive ? 'text-[var(--primary)] font-semibold' : 'text-[var(--muted)]'
              )}
            >
              <Icon size={18} strokeWidth={1.75} />
              <span>{navItems.find(i => i.to === to)?.label}</span>
            </NavLink>
          ))}
        </div>
      </div>

      {/* ── Main content ── */}
      <main className="flex-1 p-6 pb-20 lg:pb-6 bg-[var(--bg)]">
        <Outlet />
      </main>
    </div>
  )
}
