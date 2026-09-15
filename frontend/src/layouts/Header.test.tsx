import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Header } from './Header'
import { useAuthStore } from '@/stores/authStore'

/*
 * The Seller Panel must not render the generic marketplace
 * "Search products…" bar in the header — sellers search their own
 * catalog with the dedicated "Search your products…" bar on the
 * Products page. Everywhere else in the marketplace (home, catalog,
 * product pages) the header search stays intact for every role.
 *
 * ProductSearchBar is stubbed with the same placeholder the real
 * component uses so these tests assert the Header's conditional
 * rendering, not the suggestion widget internals.
 */

vi.mock('@/components/ProductSearchBar', () => ({
  ProductSearchBar: ({ onNavigate }: { onNavigate?: () => void }) => (
    <input
      placeholder="Search products..."
      data-variant={onNavigate ? 'mobile' : 'desktop'}
      readOnly
    />
  ),
}))

vi.mock('@/hooks/useCart', () => ({
  useCart: () => ({ data: null }),
}))

vi.mock('@/services/auth.service', () => ({
  authApi: { logout: vi.fn().mockResolvedValue(undefined) },
}))

const setUser = (role: 'BUYER' | 'SELLER' | 'SUPER_ADMIN') => {
  useAuthStore.setState({
    user: { id: 'u1', name: 'Test User', email: 'user@nexcart.test', role },
    isAuthenticated: true,
    isLoading: false,
    accountInactive: false,
  })
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
    </MemoryRouter>,
  )

beforeEach(() => {
  setUser('SELLER')
})

/*
 * jsdom renders desktop and mobile markup simultaneously (responsive CSS
 * does not apply), so the stub tags each instance with data-variant and
 * the assertions target the variant under test through the container.
 */
type Container = HTMLElement
const desktopSearch = (container: Container) =>
  container.querySelector('input[data-variant="desktop"][placeholder="Search products..."]')
const mobileSearch = (container: Container) =>
  container.querySelector('input[data-variant="mobile"][placeholder="Search products..."]')
const anySearch = (container: Container) =>
  container.querySelector('input[placeholder="Search products..."]')

describe('Header search bar', () => {
  it('shows the marketplace search on public catalog routes', () => {
    const { container } = renderAt('/')
    expect(desktopSearch(container)).not.toBeNull()
  })

  it('keeps the marketplace search for a seller browsing the shop', () => {
    setUser('SELLER')
    const { container } = renderAt('/products')
    expect(desktopSearch(container)).not.toBeNull()
  })

  it('hides the search bar on the seller dashboard', () => {
    const { container } = renderAt('/seller/dashboard')
    expect(anySearch(container)).toBeNull()
  })

  it('hides the search bar across the whole seller panel', () => {
    for (const path of ['/seller/products', '/seller/orders', '/seller/returns', '/seller/settlement']) {
      const { container, unmount } = renderAt(path)
      expect(anySearch(container)).toBeNull()
      unmount()
    }
  })

  it('hides the search bar in the mobile menu inside the seller panel', () => {
    const { container } = renderAt('/seller/dashboard')
    const hamburger = container.querySelector('button.md\\:hidden')
    expect(hamburger).not.toBeNull()
    fireEvent.click(hamburger!)
    // The mobile menu opened (its dashboard link is visible) but no search bar rendered.
    expect(screen.getByText('Seller Dashboard')).toBeInTheDocument()
    expect(anySearch(container)).toBeNull()
  })

  it('keeps the search bar in the mobile menu on marketplace routes', () => {
    setUser('BUYER')
    const { container } = renderAt('/')
    const hamburger = container.querySelector('button.md\\:hidden')
    fireEvent.click(hamburger!)
    expect(mobileSearch(container)).not.toBeNull()
  })
})
