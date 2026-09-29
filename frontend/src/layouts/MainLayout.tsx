import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Header } from './Header'
import { Footer } from './Footer'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/services/auth.service'
import { useAccountStatus } from '@/hooks/useAccountStatus'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

import { NexCartAIChat } from '@/components/ai/NexCartAIChat'

export function MainLayout() {
  const { isAuthenticated, isLoading, user, setLoading, logout } = useAuthStore()
  const location = useLocation()
  const isSeller = isAuthenticated && user?.role === 'SELLER'

  // Re-check the account status on an interval and on window focus, so a
  // Super Admin deactivation is enforced without a page refresh.
  useAccountStatus()

  useEffect(() => {
    const storedUser = useAuthStore.getState().user
    if (!isAuthenticated && !storedUser) {
      setLoading(false)
      return
    }

    // Verify token and fetch user data on mount (interceptor automatically refreshes if needed)
    authApi
      .getMe()
      .then((user) => {
        useAuthStore.getState().setUser(user)
      })
      .catch((err) => {
        // Interceptor already attempted refresh. If it returned 401, session is truly expired.
        if (err?.response?.status === 401) {
          logout()
        }
      })
      .finally(() => {
        setLoading(false)
      })
  }, []) // Run once on mount

  // ── SUPER_ADMIN guard: redirect away from customer-facing pages ──
  // After hooks are called, safe to conditionally redirect
  const publicAdminPaths = ['/login', '/forgot-password', '/reset-password']
  if (!isLoading && isAuthenticated && user?.role === 'SUPER_ADMIN' && !publicAdminPaths.includes(location.pathname)) {
    return <Navigate to="/admin/dashboard" replace />
  }

  // ── SELLER guard: redirect away from buyer-facing pages ──
  const sellerAllowedPaths = ['/login', '/forgot-password', '/reset-password', '/seller/register', '/seller/pending', '/notifications']
  if (!isLoading && isAuthenticated && user?.role === 'SELLER' && !sellerAllowedPaths.includes(location.pathname) && !location.pathname.startsWith('/seller/')) {
    return <Navigate to="/seller/dashboard" replace />
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        {/* Skeleton header */}
        <header className="sticky top-0 z-50 bg-white border-b">
          <div className="hidden md:block bg-[var(--surface-warm)] border-b border-[var(--border-subtle)] h-8" />
          <div className="container-app">
            <div className="flex items-center justify-between h-16 px-4">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-8 w-64 hidden md:block" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        </header>
        {/* Skeleton content */}
        <main className="flex-1">
          <div className="bg-[var(--surface-warm-deep)] h-72" />
          <div className="container-app py-12 px-4">
            <Skeleton className="h-8 w-48 mb-6" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={`skeleton-${i}`} className="border rounded-lg overflow-hidden">
                  <Skeleton className="h-48 w-full rounded-none" />
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  const isSellerPanel =
    location.pathname.startsWith('/seller') &&
    !['/seller/register', '/seller/pending'].includes(location.pathname)

  return (
    <div className={cn("min-h-screen flex flex-col", isSellerPanel && "h-screen overflow-hidden")}>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <Header />
      <main className={cn("flex-1", isSellerPanel && "min-h-0 overflow-hidden")}>
        <Outlet />
      </main>
      {!isSeller && !isSellerPanel && <Footer />}
      {!isSellerPanel && <NexCartAIChat />}
    </div>
  )
}

