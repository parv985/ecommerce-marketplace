import { create } from 'zustand'
import type { UserSummary } from '@/types/api'
import { setAccessToken, getAccessToken } from '@/services/api'

interface AuthState {
  user: UserSummary | null
  isAuthenticated: boolean
  isLoading: boolean
  setAuth: (user: UserSummary, token: string) => void
  setUser: (user: UserSummary) => void
  /** Merge a partial update (e.g. a new/removed avatarUrl) into the stored user. */
  updateUser: (partial: Partial<UserSummary>) => void
  setLoading: (loading: boolean) => void
  logout: () => void
}

function loadStoredUser(): UserSummary | null {
  try {
    const stored = sessionStorage.getItem('user')
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: loadStoredUser(),
  isAuthenticated: !!getAccessToken(),
  isLoading: true,

  setAuth: (user, token) => {
    sessionStorage.setItem('user', JSON.stringify(user))
    setAccessToken(token)
    set({ user, isAuthenticated: true, isLoading: false })
  },

  setUser: (user) => {
    sessionStorage.setItem('user', JSON.stringify(user))
    set({ user })
  },

  updateUser: (partial) => {
    set((state) => {
      if (!state.user) return state
      const user = { ...state.user, ...partial }
      sessionStorage.setItem('user', JSON.stringify(user))
      return { user }
    })
  },

  setLoading: (loading) => set({ isLoading: loading }),

  logout: () => {
    sessionStorage.removeItem('user')
    setAccessToken(null)
    set({ user: null, isAuthenticated: false, isLoading: false })
  },
}))
