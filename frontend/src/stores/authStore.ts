import { create } from 'zustand'
import type { UserSummary } from '@/types/api'
import { setAccessToken, getAccessToken, setAccountInactiveHandler } from '@/services/api'
import { authApi } from '@/services/auth.service'

interface AuthState {
  user: UserSummary | null
  isAuthenticated: boolean
  isLoading: boolean
  /**
   * True when this browser session has learned (from the API) that the
   * account is deactivated. Kept in sessionStorage so the login page can
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
    const stored = sessionStorage.getItem(USER_KEY)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

function loadStoredInactiveFlag(): boolean {
  try {
    return sessionStorage.getItem(INACTIVE_KEY) === 'true'
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
    sessionStorage.setItem(USER_KEY, JSON.stringify(user))
    // A fresh login means the account is active again — clear any stale
    // "account inactive" notice from a previous session.
    sessionStorage.removeItem(INACTIVE_KEY)
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
    sessionStorage.setItem(USER_KEY, JSON.stringify(user))
    set({ user })
  },

  updateUser: (partial) => {
    set((state) => {
      if (!state.user) return state
      const user = { ...state.user, ...partial }
      sessionStorage.setItem(USER_KEY, JSON.stringify(user))
      return { user }
    })
  },

  setLoading: (loading) => set({ isLoading: loading }),

  markAccountInactive: () => {
    sessionStorage.setItem(INACTIVE_KEY, 'true')
    sessionStorage.removeItem(USER_KEY)
    sessionStorage.removeItem('access_token')
    setAccessToken(null)
    set({ user: null, isAuthenticated: false, isLoading: false, accountInactive: true })
  },

  logout: () => {
    sessionStorage.removeItem(USER_KEY)
    setAccessToken(null)
    set({ user: null, isAuthenticated: false, isLoading: false })
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
