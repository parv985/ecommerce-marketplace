import { create } from 'zustand'
import type { UserSummary } from '@/types/api'
import { setAccessToken, getAccessToken, setAccountInactiveHandler, setSessionExpiredHandler } from '@/services/api'
import { authApi } from '@/services/auth.service'

interface AuthState {
  user: UserSummary | null
  isAuthenticated: boolean
  isLoading: boolean
  /**
   * True when this browser session has learned (from the API) that the
   * account is deactivated. Kept in storage so the login page can
   * explain why access is blocked. Cleared on the next successful login.
   */
  accountInactive: boolean
  setAuth: (user: UserSummary, token: string) => void
  setUser: (user: UserSummary) => void
  /** Merge a partial update (e.g. a new/removed avatarUrl) into the stored user. */
  updateUser: (partial: Partial<UserSummary>) => void
  setLoading: (loading: boolean) => void
  /**
   * Marks the session as deactivated: clears credentials but remembers
   * that the account is inactive so restricted-action attempts and the
   * login page can show "Your account is inactive".
   */
  markAccountInactive: () => void
  logout: () => void
}

const USER_KEY = 'user'
const INACTIVE_KEY = 'account_inactive'

function loadStoredUser(): UserSummary | null {
  try {
    const stored = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

function loadStoredInactiveFlag(): boolean {
  try {
    return (
      localStorage.getItem(INACTIVE_KEY) === 'true' ||
      sessionStorage.getItem(INACTIVE_KEY) === 'true'
    )
  } catch {
    return false
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: loadStoredUser(),
  isAuthenticated: !!getAccessToken(),
  isLoading: true,
  accountInactive: loadStoredInactiveFlag(),

  setAuth: (user, token) => {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user))
      sessionStorage.setItem(USER_KEY, JSON.stringify(user))
      localStorage.removeItem(INACTIVE_KEY)
      sessionStorage.removeItem(INACTIVE_KEY)
    } catch { /* ignore */ }

    setAccessToken(token)
    set({ user, isAuthenticated: true, isLoading: false, accountInactive: false })

    // Hydrate the full profile (avatar, account status) in the background
    // so a profile photo uploaded earlier is visible right after login,
    // even if the login response ever omits it.
    authApi
      .getMe()
      .then((profile) => {
        if (get().isAuthenticated) get().setUser(profile)
      })
      .catch(() => { /* profile refresh is best-effort */ })
  },

  setUser: (user) => {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user))
      sessionStorage.setItem(USER_KEY, JSON.stringify(user))
    } catch { /* ignore */ }
    set({ user })
  },

  updateUser: (partial) => {
    set((state) => {
      if (!state.user) return state
      const user = { ...state.user, ...partial }
      try {
        localStorage.setItem(USER_KEY, JSON.stringify(user))
        sessionStorage.setItem(USER_KEY, JSON.stringify(user))
      } catch { /* ignore */ }
      return { user }
    })
  },

  setLoading: (loading) => set({ isLoading: loading }),

  markAccountInactive: () => {
    try {
      localStorage.setItem(INACTIVE_KEY, 'true')
      sessionStorage.setItem(INACTIVE_KEY, 'true')
      localStorage.removeItem(USER_KEY)
      sessionStorage.removeItem(USER_KEY)
    } catch { /* ignore */ }
    setAccessToken(null)
    set({ user: null, isAuthenticated: false, isLoading: false, accountInactive: true })
  },

  logout: () => {
    try {
      localStorage.removeItem(USER_KEY)
      sessionStorage.removeItem(USER_KEY)
      localStorage.removeItem(INACTIVE_KEY)
      sessionStorage.removeItem(INACTIVE_KEY)
    } catch { /* ignore */ }
    setAccessToken(null)
    set({ user: null, isAuthenticated: false, isLoading: false, accountInactive: false })
  },
}))

/*
 * Wire the axios layer to the store without creating an import cycle:
 * when any API call answers 403 ACCOUNT_INACTIVE (deactivated while the
 * tab was open), the session is marked inactive immediately — guards and
 * protected routes then restrict the UI without a page refresh.
 */
setAccountInactiveHandler(() => {
  useAuthStore.getState().markAccountInactive()
})

setSessionExpiredHandler(() => {
  useAuthStore.getState().logout()
})

// Cross-tab sync: sync auth state across browser tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === 'access_token') {
      if (!event.newValue) {
        useAuthStore.getState().logout()
      } else {
        setAccessToken(event.newValue)
        const user = loadStoredUser()
        useAuthStore.setState({ isAuthenticated: true, user })
      }
    } else if (event.key === USER_KEY) {
      if (event.newValue) {
        try {
          useAuthStore.setState({ user: JSON.parse(event.newValue) })
        } catch { /* ignore */ }
      }
    }
  })
}
