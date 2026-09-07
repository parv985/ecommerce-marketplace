import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { ShoppingCart, Heart, User, Search, Menu, X, Bell, LogOut, Package, LayoutDashboard, Shield } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import { authApi } from '@/services/auth.service'
import { toast } from 'react-hot-toast'
import { useCart } from '@/hooks/useCart'
import { Button } from '@/components/ui/Button'

export function Header() {
  const { user, isAuthenticated, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: cart } = useCart()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`)
      setSearchQuery('')
      setMobileOpen(false)
    }
  }

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
    <header className="sticky top-0 z-50 bg-white border-b">
      {/* Top bar */}
      <div className="hidden md:block bg-[var(--primary)] text-[var(--primary-fg)] text-xs py-1.5">
        <div className="container-app flex justify-between items-center">
          <span>Free Shipping on Orders Over ₹999</span>
          <span>India's #1 Multi-Vendor Marketplace</span>
        </div>
      </div>

      {/* Main header */}
      <div className="container-app">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo */}
          <Link to={isAdmin ? '/admin/dashboard' : isSeller ? '/seller/dashboard' : '/'} className="text-xl font-bold tracking-tight shrink-0">
            ECOM
          </Link>

          {/* Search - Desktop */}
          <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-xl">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-9 pr-4 py-2 border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
          </form>

          {/* Nav links - Desktop */}
          <nav className="hidden md:flex items-center gap-1">
            {!isSeller && !isAdmin && (
              <Link
                to="/products"
                className={cn('px-3 py-2 text-sm font-medium rounded-md hover:bg-[var(--accent)] transition-colors',
                  isActive('/products') && 'bg-[var(--accent)]'
                )}
              >
                Shop
              </Link>
            )}

            {isAuthenticated ? (
              <>
                {/* Buyer-only nav items (visible to buyers and sellers) */}
                {!isAdmin && !isSeller && (
                  <>
                    <Link to="/cart" className="p-2 rounded-full hover:bg-[var(--accent)] transition-colors relative" title="Cart">
                      <ShoppingCart size={20} />
                      {cart && cart.items && cart.items.length > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-[var(--primary)] text-white text-[10px] rounded-full flex items-center justify-center">
                          {cart.items.length}
                        </span>
                      )}
                    </Link>
                    <Link to="/notifications" className="p-2 rounded-full hover:bg-[var(--accent)] transition-colors relative" title="Notifications">
                      <Bell size={20} />
                    </Link>
                  </>
                )}

                {/* Admin-only nav items */}
                {isAdmin && (
                  <Link to="/admin/notifications" className="p-2 rounded-full hover:bg-[var(--accent)] transition-colors relative" title="Notifications">
                    <Bell size={20} />
                  </Link>
                )}

                {/* User dropdown */}
                <div className="relative ml-1">
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-full hover:bg-[var(--accent)] transition-colors"
                  >
                    <div className="h-7 w-7 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-xs font-medium">
                      {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white border rounded-lg shadow-lg py-1 z-50">
                      <div className="px-4 py-2 border-b">
                        <p className="font-medium text-sm">{user?.name}</p>
                        <p className="text-xs text-[var(--muted)]">{user?.email}</p>
                        <span className="inline-block mt-1 text-[10px] font-medium bg-[var(--accent)] px-2 py-0.5 rounded">
                          {user?.role === 'SUPER_ADMIN' ? 'Admin' : user?.role === 'SELLER' ? 'Seller' : 'Buyer'}
                        </span>
                      </div>

                      {/* Buyer menu items */}
                      {!isAdmin && !isSeller && (
                        <>
                          <Link to="/account" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-[var(--accent)]">
                            <User size={16} /> My Account
                          </Link>
                          <Link to="/orders" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-[var(--accent)]">
                            <Package size={16} /> My Orders
                          </Link>
                        </>
                      )}

                      {/* Seller menu items */}
                      {isSeller && (
                        <Link to="/seller/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-[var(--accent)]">
                          <LayoutDashboard size={16} /> Seller Dashboard
                        </Link>
                      )}

                      {/* Admin menu items */}
                      {isAdmin && (
                        <Link to="/admin/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-[var(--accent)]">
                          <Shield size={16} /> Admin Panel
                        </Link>
                      )}

                      <hr className="my-1" />
                      <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--destructive)] hover:bg-red-50 w-full">
                        <LogOut size={16} /> Logout
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login">
                  <Button size="sm">Sign In</Button>
                </Link>
              </div>
            )}
          </nav>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-md hover:bg-[var(--accent)]"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-white">
          <div className="p-4 space-y-3">
            <form onSubmit={handleSearch}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products..."
                  className="w-full pl-9 pr-4 py-2 border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
            </form>
            {!isSeller && !isAdmin && <Link to="/products" className="block py-2 text-sm font-medium" onClick={() => setMobileOpen(false)}>Shop</Link>}
            {isAuthenticated ? (
              <>
                {!isAdmin && !isSeller && (
                  <>
                    <Link to="/cart" className="block py-2 text-sm" onClick={() => setMobileOpen(false)}>Cart {cart?.items?.length ? `(${cart.items.length})` : ''}</Link>
                    <Link to="/orders" className="block py-2 text-sm" onClick={() => setMobileOpen(false)}>Orders</Link>
                    <Link to="/notifications" className="block py-2 text-sm" onClick={() => setMobileOpen(false)}>Notifications</Link>
                  </>
                )}
                {isSeller && <Link to="/seller/dashboard" className="block py-2 text-sm" onClick={() => setMobileOpen(false)}>Seller Dashboard</Link>}
                {isAdmin && (
                  <>
                    <Link to="/admin/dashboard" className="block py-2 text-sm" onClick={() => setMobileOpen(false)}>Admin Panel</Link>
                    <Link to="/admin/notifications" className="block py-2 text-sm" onClick={() => setMobileOpen(false)}>Notifications</Link>
                  </>
                )}
                <button onClick={handleLogout} className="block py-2 text-sm text-[var(--destructive)]">Logout</button>
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
