import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { ShoppingCart, User, Menu, X, Bell, LogOut, Package, LayoutDashboard, Shield } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import { authApi } from '@/services/auth.service'
import { toast } from 'react-hot-toast'
import { useCart } from '@/hooks/useCart'
import { ProductSearchBar } from '@/components/ProductSearchBar'
import { Button } from '@/components/ui/Button'
import { APP_NAME, APP_TAGLINE } from '@/config/brand'

export function Header() {
  const { user, isAuthenticated, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: cart } = useCart()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch { /* ignore */ }
    logout()
    toast.success('Logged out successfully')
    navigate('/')
    setMenuOpen(false)
  }

  const isActive = (path: string) => location.pathname === path
  const isAdmin = user?.role === 'SUPER_ADMIN'
  const isSeller = user?.role === 'SELLER'

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[var(--border)] shadow-[var(--shadow-sm)]">
      {/* Top bar */}
      <div className="hidden md:block bg-[#191816] text-[#c7c4bc] text-xs font-normal border-b border-neutral-800">
        <div className="container-app flex justify-between items-center py-2">
          <span>Free Shipping on Orders Over ₹999</span>
          <span className="text-neutral-400">{APP_TAGLINE}</span>
        </div>
      </div>

      {/* Main header */}
      <div className="container-app">
        <div className="flex items-center justify-between h-15 gap-4">
          {/* Logo with signature terracotta mark */}
          <Link
            to={isAdmin ? '/admin/dashboard' : isSeller ? '/seller/dashboard' : '/'}
            className="text-xl font-bold tracking-tight shrink-0 text-[var(--fg)] hover:opacity-90 transition-opacity"
          >
            {APP_NAME}<span className="text-[var(--primary)] font-black">.</span>
          </Link>

          {/* Search - Desktop (products only, with live suggestions) */}
          <div className="hidden md:block flex-1 max-w-xl">
            <ProductSearchBar />
          </div>

          {/* Nav links - Desktop */}
          <nav className="hidden md:flex items-center gap-1.5">
            {!isSeller && !isAdmin && (
              <Link
                to="/products"
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-[var(--radius)] transition-colors',
                  isActive('/products')
                    ? 'text-[var(--primary)] bg-[var(--primary-subtle)]'
                    : 'text-[var(--fg-secondary)] hover:text-[var(--fg)] hover:bg-[var(--accent)]'
                )}
              >
                Shop
              </Link>
            )}

            {isAuthenticated ? (
              <>
                {/* Buyer-only nav items */}
                {!isAdmin && !isSeller && (
                  <>
                    <Link
                      to="/cart"
                      className="p-2 rounded-[var(--radius)] hover:bg-[var(--accent)] transition-colors relative text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                      title="Cart"
                    >
                      <ShoppingCart size={19} strokeWidth={1.75} />
                      {cart && cart.items && cart.items.length > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] bg-[var(--primary)] text-white text-[10px] font-semibold rounded-[var(--radius-sm)] flex items-center justify-center px-1">
                          {cart.items.length}
                        </span>
                      )}
                    </Link>
                    <Link
                      to="/notifications"
                      className="p-2 rounded-[var(--radius)] hover:bg-[var(--accent)] transition-colors relative text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                      title="Notifications"
                    >
                      <Bell size={19} strokeWidth={1.75} />
                    </Link>
                  </>
                )}

                {/* Admin-only nav items */}
                {isAdmin && (
                  <Link
                    to="/admin/notifications"
                    className="p-2 rounded-[var(--radius)] hover:bg-[var(--accent)] transition-colors relative text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                    title="Notifications"
                  >
                    <Bell size={19} strokeWidth={1.75} />
                  </Link>
                )}

                {/* User dropdown */}
                <div className="relative ml-1">
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex items-center gap-2 p-1 rounded-[var(--radius)] hover:bg-[var(--accent)] transition-colors"
                  >
                    {user?.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.name}
                        className="h-8 w-8 rounded-[var(--radius)] object-cover"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-[var(--radius)] bg-[#191816] text-white flex items-center justify-center text-xs font-semibold">
                        {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </button>
                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                      <div className="absolute right-0 mt-2 w-56 bg-white border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] py-1.5 z-50">
                        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
                          <p className="font-semibold text-sm text-[var(--fg)] truncate">{user?.name}</p>
                          <p className="text-xs text-[var(--muted)] truncate mt-0.5">{user?.email}</p>
                          <span className={cn(
                            'inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-[var(--radius-sm)]',
                            user?.role === 'SUPER_ADMIN' ? 'bg-indigo-50 text-indigo-800 border border-indigo-200' :
                            user?.role === 'SELLER' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                            'bg-[var(--bg-subtle)] text-[var(--fg-secondary)] border border-[var(--border)]'
                          )}>
                            {user?.role === 'SUPER_ADMIN' ? 'Admin' : user?.role === 'SELLER' ? 'Seller' : 'Buyer'}
                          </span>
                        </div>

                        {/* Buyer menu items */}
                        {!isAdmin && !isSeller && (
                          <>
                            <Link to="/account" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--fg-secondary)] hover:text-[var(--fg)] hover:bg-[var(--accent)] transition-colors">
                              <User size={15} strokeWidth={1.75} /> My Account
                            </Link>
                            <Link to="/orders" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--fg-secondary)] hover:text-[var(--fg)] hover:bg-[var(--accent)] transition-colors">
                              <Package size={15} strokeWidth={1.75} /> My Orders
                            </Link>
                          </>
                        )}

                        {/* Seller menu items */}
                        {isSeller && (
                          <Link to="/seller/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--fg-secondary)] hover:text-[var(--fg)] hover:bg-[var(--accent)] transition-colors">
                            <LayoutDashboard size={15} strokeWidth={1.75} /> Seller Dashboard
                          </Link>
                        )}

                        {/* Admin menu items */}
                        {isAdmin && (
                          <Link to="/admin/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--fg-secondary)] hover:text-[var(--fg)] hover:bg-[var(--accent)] transition-colors">
                            <Shield size={15} strokeWidth={1.75} /> Admin Panel
                          </Link>
                        )}

                        <div className="border-t border-[var(--border-subtle)] my-1" />
                        <button
                          onClick={handleLogout}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-700 hover:bg-red-50 w-full transition-colors font-medium"
                        >
                          <LogOut size={15} strokeWidth={1.75} /> Logout
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 ml-1">
                <Link to="/login">
                  <Button size="sm" variant="primary">Sign In</Button>
                </Link>
              </div>
            )}
          </nav>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-[var(--radius)] hover:bg-[var(--accent)] transition-colors text-[var(--fg-secondary)]"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[var(--border)] bg-white">
          <div className="p-4 space-y-3">
            <ProductSearchBar onNavigate={() => setMobileOpen(false)} />
            {!isSeller && !isAdmin && (
              <Link to="/products" className="block py-2 text-sm font-medium text-[var(--fg-secondary)] hover:text-[var(--fg)]" onClick={() => setMobileOpen(false)}>Shop</Link>
            )}
            {isAuthenticated ? (
              <>
                {!isAdmin && !isSeller && (
                  <>
                    <Link to="/cart" className="flex items-center justify-between py-2 text-sm text-[var(--fg-secondary)]" onClick={() => setMobileOpen(false)}>
                      <span>Cart</span>
                      {cart?.items?.length ? <span className="bg-[var(--primary)] text-white text-xs px-2 py-0.5 rounded-[var(--radius-sm)] font-medium">{cart.items.length}</span> : null}
                    </Link>
                    <Link to="/orders" className="block py-2 text-sm text-[var(--fg-secondary)]" onClick={() => setMobileOpen(false)}>My Orders</Link>
                    <Link to="/notifications" className="block py-2 text-sm text-[var(--fg-secondary)]" onClick={() => setMobileOpen(false)}>Notifications</Link>
                  </>
                )}
                {isSeller && <Link to="/seller/dashboard" className="block py-2 text-sm text-[var(--fg-secondary)]" onClick={() => setMobileOpen(false)}>Seller Dashboard</Link>}
                {isAdmin && (
                  <>
                    <Link to="/admin/dashboard" className="block py-2 text-sm text-[var(--fg-secondary)]" onClick={() => setMobileOpen(false)}>Admin Panel</Link>
                    <Link to="/admin/notifications" className="block py-2 text-sm text-[var(--fg-secondary)]" onClick={() => setMobileOpen(false)}>Notifications</Link>
                  </>
                )}
                <div className="border-t border-[var(--border-subtle)] pt-2 mt-2">
                  <button onClick={handleLogout} className="block py-2 text-sm text-red-700 font-medium">Logout</button>
                </div>
              </>
            ) : (
              <Link to="/login" onClick={() => setMobileOpen(false)}>
                <Button className="w-full">Sign In</Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
