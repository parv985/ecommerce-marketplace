import { useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/services/auth.service'

/** How often the account status is re-checked while the tab is open. */
const CHECK_INTERVAL_MS = 30_000

/**
 * Keeps the logged-in user's account status fresh WITHOUT a page refresh.
 *
 * Every 30 seconds (and whenever the tab regains focus) the account
 * status is re-checked via GET /users/me. If the Super Admin deactivated
 * the account in the meantime:
 *
 *  - the backend answers 403 ACCOUNT_INACTIVE → the axios interceptor in
 *    services/api.ts shows the "Your account is inactive" toast and marks
 *    the session inactive, so protected routes and action guards restrict
 *    the user immediately;
 *  - if a payload ever comes back with isActive === false, the same
 *    handling runs here.
 *
 * The check deliberately does not overwrite the stored profile (e.g. the
 * avatar): that is synced at login, on layout mount and right after an
 * avatar upload, and a stale in-flight response must never remove a
 * freshly uploaded photo.
 */
export function useAccountStatus() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated) return

    let cancelled = false

    const handleInactive = () => {
      const state = useAuthStore.getState()
      if (state.accountInactive || !state.isAuthenticated) return
      toast.error('Your account is inactive')
      state.markAccountInactive()
    }

    const check = async () => {
      try {
        const profile = await authApi.getMe()
        if (cancelled) return
        if (profile && profile.isActive === false) {
          handleInactive()
        }
      } catch {
        // 403 ACCOUNT_INACTIVE is handled by the axios interceptor
        // (toast + markAccountInactive). 401 triggers the token-refresh
        // flow there. Nothing else to do here.
      }
    }

    const intervalId = setInterval(check, CHECK_INTERVAL_MS)

    const onWindowFocus = () => {
      if (document.visibilityState === 'visible') check()
    }
    window.addEventListener('focus', onWindowFocus)
    document.addEventListener('visibilitychange', onWindowFocus)

    return () => {
      cancelled = true
      clearInterval(intervalId)
      window.removeEventListener('focus', onWindowFocus)
      document.removeEventListener('visibilitychange', onWindowFocus)
    }
  }, [isAuthenticated])
}
