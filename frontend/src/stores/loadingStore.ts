import { create } from 'zustand'

interface LoadingState {
  activeRequests: number
  isLoading: boolean
  startRequest: () => void
  endRequest: () => void
}

export const useLoadingStore = create<LoadingState>((set) => ({
  activeRequests: 0,
  isLoading: false,
  startRequest: () =>
    set((state) => {
      const next = state.activeRequests + 1
      return { activeRequests: next, isLoading: next > 0 }
    }),
  endRequest: () =>
    set((state) => {
      const next = Math.max(0, state.activeRequests - 1)
      return { activeRequests: next, isLoading: next > 0 }
    }),
}))
