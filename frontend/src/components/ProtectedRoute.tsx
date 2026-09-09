import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import type { UserSummary } from '@/types/api'
import { Skeleton } from '@/components/ui/Skeleton'

interface ProtectedRouteProps {
  children: React.ReactNode
  roles?: UserSummary['role'][]
  requireAuth?: boolean
}

export function ProtectedRoute({ children, roles, requireAuth = true }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user, accountInactive } = useAuthStore()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  // Deactivated accounts are treated like signed-out users: they lose
  // access to every protected (seller/buyer) route immediately — no page
  // refresh needed, because the account status is polled dynamically.
  const accountBlocked = accountInactive || user?.isActive === false

  if (requireAuth && (!isAuthenticated || accountBlocked)) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (roles && user && !roles.includes(user.role)) {
    // Redirect to the appropriate dashboard for the user's role
    if (user.role === 'SELLER') {
      return <Navigate to="/seller/dashboard" replace />
    }
    if (user.role === 'SUPER_ADMIN') {
      return <Navigate to="/admin/dashboard" replace />
    }
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
