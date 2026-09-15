import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { ProductDetailPage } from './ProductDetailPage'
import { useAuthStore } from '@/stores/authStore'
import { productService } from '@/services/product.service'

vi.mock('react-hot-toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/services/product.service', () => ({
  productService: {
    getById: vi.fn(),
  },
}))

vi.mock('@/services/review.service', () => ({
  reviewService: {
    getProductReviews: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  },
}))

vi.mock('@/services/order.service', () => ({
  orderService: {
    list: vi.fn().mockResolvedValue({ items: [] }),
  },
}))

const mockProduct = {
  id: 'prod-123',
  name: 'Awesome Sneakers',
  slug: 'awesome-sneakers',
  description: 'High quality sneakers for daily wear',
  price: 2999,
  stock: 10,
  isActive: true,
  images: [{ id: 'img-1', url: 'https://example.com/sneakers.jpg' }],
  category: { id: 'cat-1', name: 'Footwear' },
  seller: { id: 'seller-1', businessName: 'Shoe Haven' },
  ratings: { average: 4.5, count: 12 },
}

const renderWithProviders = (id = 'prod-123') => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/products/${id}`]}>
        <Routes>
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/login" element={<div>Sign In Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProductDetailPage auth flows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(productService.getById).mockResolvedValue(mockProduct as any)
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      accountInactive: false,
      isLoading: false,
    })
  })

  it('renders "Sign in to Buy" button for unauthenticated users and redirects on click without inactive toast', async () => {
    renderWithProviders()

    const signInBtn = await screen.findByRole('button', { name: /sign in to buy/i })
    expect(signInBtn).toBeInTheDocument()

    fireEvent.click(signInBtn)

    expect(toast.error).not.toHaveBeenCalled()
    expect(await screen.findByText('Sign In Page')).toBeInTheDocument()
  })

  it('shows toast "Sign in to add products to wishlist" on unauthenticated wishlist click without inactive toast', async () => {
    renderWithProviders()

    const wishlistBtn = await screen.findByTitle(/sign in to add to wishlist/i)
    expect(wishlistBtn).toBeInTheDocument()

    fireEvent.click(wishlistBtn)

    expect(toast.error).toHaveBeenCalledWith('Sign in to add products to wishlist')
    expect(toast.error).not.toHaveBeenCalledWith(
      expect.stringContaining('inactive'),
      expect.anything()
    )
  })

  it('renders "Add to Cart" for authenticated active buyers', async () => {
    useAuthStore.setState({
      user: { id: 'u1', name: 'Buyer User', email: 'buyer@test.com', role: 'BUYER', isActive: true },
      isAuthenticated: true,
      accountInactive: false,
      isLoading: false,
    })

    renderWithProviders()

    expect(await screen.findByRole('button', { name: /add to cart/i })).toBeInTheDocument()
  })
})
