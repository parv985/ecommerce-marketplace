import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'

/**
 * Guard for role-specific actions (selling for sellers; buying / adding to
 * cart / wishlist etc. for buyers).
 *
 * Returns a `guard()` function to call before performing a restricted
 * action. It returns true when the action may proceed. Unauthenticated and
 * inactive users get a "Your account is inactive" toast and the action is
 * blocked — unauthenticated visitors are also sent to the login page.
 *
 * The backend enforces the same rule independently (403 ACCOUNT_INACTIVE),
 * so the restriction cannot be bypassed by calling the API directly.
 */
export function useRestrictedAction() {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback((): boolean => {
    const { isAuthenticated, user, accountInactive } = useAuthStore.getState()

    if (accountInactive || user?.isActive === false) {
      toast.error('Your account is inactive')
      return false
    }

    if (!isAuthenticated) {
      toast.error('Your account is inactive')
      navigate('/login', { state: { from: location } })
      return false
    }

    return true
  }, [navigate, location])
}
