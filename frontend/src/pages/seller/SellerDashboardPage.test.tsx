import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { SellerDashboardPage } from './SellerDashboardPage'
import { formatPrice } from '@/lib/utils'
import type { DashboardData } from '@/types/api'

/*
 * The seller dashboard must be a pure reflection of GET /sellers/dashboard
 * (which the backend aggregates live from the database): every card value
 * comes from the API payload, and the page refetches whenever the seller
 * returns to it or refocuses the tab — no stale, hardcoded numbers.
 */

const getDashboard = vi.hoisted(() => vi.fn())

vi.mock('@/services/seller.service', () => ({
  sellerService: { getDashboard: () => getDashboard() },
}))

const DASHBOARD: DashboardData = {
  orders: { total: 9, pending: 2, confirmed: 1, shipped: 1, delivered: 4, cancelled: 1 },
  revenue: { total: 2000, currentMonth: 1200 },
  products: { total: 6, active: 5, lowStock: 2 },
  returns: { pending: 3 },
  marketing: { coupons: 1, discounts: 2 },
}

/* Mirrors App.tsx defaults: window-focus refetch OFF globally, so the
   dashboard's own opt-in is what the focus test proves. */
const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })

const renderPage = (queryClient: QueryClient) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SellerDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )

beforeEach(() => {
  getDashboard.mockReset()
  getDashboard.mockResolvedValue(DASHBOARD)
})

describe('SellerDashboardPage', () => {
  it('renders every stat card from the API payload', async () => {
    renderPage(makeQueryClient())

    expect(await screen.findByText('Total Orders')).toBeInTheDocument()

    // Unambiguous values map 1:1 to the payload.
    expect(screen.getByText('9')).toBeInTheDocument() // orders.total
    expect(screen.getByText(formatPrice(DASHBOARD.revenue.total))).toBeInTheDocument() // revenue.total (₹2,000)
    expect(screen.getByText('5')).toBeInTheDocument() // products.active
    expect(screen.getByText('4')).toBeInTheDocument() // orders.delivered
    expect(screen.getByText('3')).toBeInTheDocument() // returns.pending

    // Values rendered by two cards / one card.
    expect(screen.getAllByText('2')).toHaveLength(2) // orders.pending + products.lowStock
    expect(screen.getAllByText('1')).toHaveLength(1) // orders.cancelled

    expect(getDashboard).toHaveBeenCalledTimes(1)
  })

  it('refetches the aggregates when the seller refocuses the tab', async () => {
    renderPage(makeQueryClient())
    await waitFor(() => expect(getDashboard).toHaveBeenCalledTimes(1))

    // React Query's focus manager listens to visibilitychange; jsdom keeps
    // document.visibilityState === 'visible', so this simulates the seller
    // returning to the dashboard tab.
    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(getDashboard).toHaveBeenCalledTimes(2))
  })

  it('refetches from the API when the seller navigates back to the dashboard', async () => {
    const queryClient = makeQueryClient()

    const first = renderPage(queryClient)
    await waitFor(() => expect(getDashboard).toHaveBeenCalledTimes(1))
    first.unmount()

    // Returning to the dashboard remounts the page; with staleTime 0 the
    // cached data is stale immediately, so the API is hit again.
    renderPage(queryClient)
    await waitFor(() => expect(getDashboard).toHaveBeenCalledTimes(2))
  })
})
