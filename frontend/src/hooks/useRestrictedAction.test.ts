import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { toast } from 'react-hot-toast'
import { useRestrictedAction } from './useRestrictedAction'
import { useAuthStore } from '@/stores/authStore'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/products/prod-123' }),
}))

vi.mock('react-hot-toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

describe('useRestrictedAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      accountInactive: false,
      isLoading: false,
    })
  })

  it('redirects unauthenticated users to /login with state without showing inactive toast and returns false', () => {
    const { result } = renderHook(() => useRestrictedAction())

    const allowed = result.current()

    expect(allowed).toBe(false)
    expect(toast.error).not.toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/login', {
      state: { from: { pathname: '/products/prod-123' } },
    })
  })

  it('allows action for authenticated active user without toast or redirect and returns true', () => {
    useAuthStore.setState({
      user: { id: 'u1', name: 'Buyer', email: 'buyer@example.com', role: 'BUYER', isActive: true },
      isAuthenticated: true,
      accountInactive: false,
      isLoading: false,
    })

    const { result } = renderHook(() => useRestrictedAction())

    const allowed = result.current()

    expect(allowed).toBe(true)
    expect(toast.error).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows inactive toast and blocks action for authenticated inactive user', () => {
    useAuthStore.setState({
      user: { id: 'u1', name: 'Inactive User', email: 'inactive@example.com', role: 'BUYER', isActive: false },
      isAuthenticated: true,
      accountInactive: true,
      isLoading: false,
    })

    const { result } = renderHook(() => useRestrictedAction())

    const allowed = result.current()

    expect(allowed).toBe(false)
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Your account is inactive')
  })

  it('shows inactive toast when authenticated user object has isActive === false even if accountInactive flag was false', () => {
    useAuthStore.setState({
      user: { id: 'u1', name: 'Inactive User', email: 'inactive@example.com', role: 'BUYER', isActive: false },
      isAuthenticated: true,
      accountInactive: false,
      isLoading: false,
    })

    const { result } = renderHook(() => useRestrictedAction())

    const allowed = result.current()

    expect(allowed).toBe(false)
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Your account is inactive')
  })
})
