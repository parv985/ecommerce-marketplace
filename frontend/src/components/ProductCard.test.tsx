import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { ProductCard } from './ProductCard'
import { useAuthStore } from '@/stores/authStore'

vi.mock('react-hot-toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const mockProduct = {
  id: 'prod-456',
  name: 'Wireless Headphones',
  slug: 'wireless-headphones',
  description: 'Noise cancelling headphones',
  price: 4999,
  stock: 5,
  isActive: true,
  images: [{ id: 'img-1', url: 'https://example.com/headphones.jpg' }],
  category: { id: 'cat-1', name: 'Electronics' },
  ratings: { average: 4.8, count: 25 },
}

const renderWithProviders = (product = mockProduct) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProductCard product={product as any} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProductCard component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      accountInactive: false,
      isLoading: false,
    })
  })

  it('renders wishlist button for unauthenticated users and toasts on click without redirect', () => {
    renderWithProviders()

    const wishlistBtn = screen.getByRole('button', { name: /wishlist/i })
    expect(wishlistBtn).toBeInTheDocument()

    fireEvent.click(wishlistBtn)

    expect(toast.error).toHaveBeenCalledWith('Sign in to add products to wishlist')
    expect(toast.error).not.toHaveBeenCalledWith(
      expect.stringContaining('inactive'),
      expect.anything()
    )
  })
})
