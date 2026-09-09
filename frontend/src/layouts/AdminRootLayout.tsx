import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/services/auth.service'
import { useAccountStatus } from '@/hooks/useAccountStatus'

/**
 * Root layout for admin routes.
 * Handles the same auth initialization as MainLayout
 * but without the marketplace header, footer, or hero.
 */
export function AdminRootLayout() {
  const { isAuthenticated, isLoading, setLoading, logout } = useAuthStore()

  // Keep the account status fresh — deactivations are enforced without a
  // page refresh.
  useAccountStatus()

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false)
      return
    }

    authApi.getMe()
      .then((user) => {
        useAuthStore.getState().setUser(user)
      })
      .catch(() => {
        authApi.refresh()
          .then(async () => {
            try {
              const user = await authApi.getMe()
              useAuthStore.getState().setUser(user)
            } catch {
              logout()
            }
          })
          .catch(() => {
            logout()
          })
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  // While auth is loading, show a minimal spinner (not marketplace skeleton)
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <Outlet />
    </div>
  )
}
