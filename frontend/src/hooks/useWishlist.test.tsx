import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { toast } from 'react-hot-toast'
import { useWishlist } from './useWishlist'
import { useAuthStore } from '@/stores/authStore'
import { wishlistService } from '@/services/wishlist.service'

vi.mock('react-hot-toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/services/wishlist.service', () => ({
  wishlistService: {
    get: vi.fn().mockResolvedValue({ items: [] }),
    addItem: vi.fn().mockResolvedValue({ id: 'w1', productId: 'p1' }),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useWishlist hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      accountInactive: false,
      isLoading: false,
    })
  })

  it('shows toast "Sign in to add products to wishlist" and does not call API when unauthenticated', async () => {
    const { result } = renderHook(() => useWishlist(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.toggle.mutateAsync('p123')
    })

    expect(wishlistService.addItem).not.toHaveBeenCalled()
    expect(wishlistService.removeItem).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Sign in to add products to wishlist')
  })

  it('shows toast "Your account is inactive" when authenticated but inactive', async () => {
    useAuthStore.setState({
      user: { id: 'u1', name: 'Inactive User', email: 'inactive@test.com', role: 'BUYER', isActive: false },
      isAuthenticated: true,
      accountInactive: true,
      isLoading: false,
    })

    const { result } = renderHook(() => useWishlist(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.toggle.mutateAsync('p123')
    })

    expect(wishlistService.addItem).not.toHaveBeenCalled()
    expect(wishlistService.removeItem).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Your account is inactive')
  })

  it('calls wishlistService.addItem when authenticated and product is not in wishlist', async () => {
    useAuthStore.setState({
      user: { id: 'u1', name: 'Active User', email: 'active@test.com', role: 'BUYER', isActive: true },
      isAuthenticated: true,
      accountInactive: false,
      isLoading: false,
    })

    const { result } = renderHook(() => useWishlist(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.toggle.mutateAsync('p123')
    })

    expect(wishlistService.addItem).toHaveBeenCalledWith('p123')
  })
})
