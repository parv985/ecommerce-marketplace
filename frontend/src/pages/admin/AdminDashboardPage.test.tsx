import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminDashboardPage } from './AdminDashboardPage'
import type { AdminDashboardResponse } from '@/types/api'

// Mock Recharts to avoid ResizeObserver / SVG layout issues in jsdom
vi.mock('recharts', async () => {
  const original = await vi.importActual<any>('recharts')
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  }
})

const getDashboardMock = vi.hoisted(() => vi.fn())

vi.mock('@/services/admin.service', () => ({
  adminService: {
    getDashboard: (...args: unknown[]) => getDashboardMock(...args),
  },
}))

const mockDashboardData: AdminDashboardResponse = {
  stats: {
    totalUsers: 25,
    totalSellers: 10,
    totalProducts: 18,
    totalOrders: 42,
    totalSales: 125000,
    platformRevenue: 12500,
    pendingOrders: 3,
    pendingSettlements: 2,
    cancelledOrders: 1,
    lowStockProducts: 4,
  },
  salesOverview: [
    { date: '2026-09-20', label: 'Sep 20', sales: 15000, commission: 1500, orders: 4 },
    { date: '2026-09-21', label: 'Sep 21', sales: 20000, commission: 2000, orders: 6 },
  ],
  salesOverviewByRange: {
    '7d': [
      { date: '2026-09-20', label: 'Sep 20', sales: 15000, commission: 1500, orders: 4 },
      { date: '2026-09-21', label: 'Sep 21', sales: 20000, commission: 2000, orders: 6 },
    ],
    '30d': [
      { date: '2026-09-01', label: 'Sep 01', sales: 10000, commission: 1000, orders: 2 },
      { date: '2026-09-21', label: 'Sep 21', sales: 20000, commission: 2000, orders: 6 },
    ],
  },
  orderStatus: {
    pending: 3,
    processing: 4,
    confirmed: 4,
    shipped: 5,
    delivered: 28,
    cancelled: 1,
    returned: 1,
    total: 42,
  },
  recentOrders: [
    {
      id: 'ord1',
      orderNumber: 'ORD-987654',
      customerName: 'Alice Johnson',
      customerEmail: 'alice@example.com',
      sellerName: 'Apex Electronics',
      amount: 4500,
      status: 'DELIVERED',
      createdAt: '2026-09-24T12:00:00Z',
      itemCount: 2,
    },
  ],
  topProducts: [
    {
      id: 'prod1',
      name: 'Noise Cancelling Headphones',
      unitsSold: 55,
      revenue: 82500,
      sellerName: 'Apex Electronics',
    },
  ],
  topSellers: [
    {
      sellerId: 'sell1',
      sellerName: 'Apex Electronics',
      orders: 22,
      sales: 98000,
      commission: 9800,
      status: 'APPROVED',
    },
  ],
  needsAttention: {
    lowStockProducts: 4,
    pendingSellers: 2,
    pendingOrders: 3,
    pendingSettlements: 2,
    reportedProducts: 1,
  },
  sellerActivity: {
    newSellersThisMonth: 3,
    activeSellers: 8,
    pendingApprovals: 2,
    suspendedSellers: 0,
    growth: [
      { period: '2026-08', month: 'Aug', count: 2 },
      { period: '2026-09', month: 'Sep', count: 3 },
    ],
  },
  userGrowth: [
    { period: '2026-08', month: 'Aug', count: 12 },
    { period: '2026-09', month: 'Sep', count: 15 },
  ],
  revenue: {
    commissionRate: 10,
    totalGmv: 125000,
    commissionEarned: 12500,
    pendingSettlement: 18500,
    pendingSettlementCount: 2,
    paidSettlement: 89000,
  },
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDashboardMock.mockResolvedValue(mockDashboardData)
  })

  it('renders all sections and KPI cards from the single dashboard API', async () => {
    renderDashboard()

    // Title
    expect(await screen.findByText('Super Admin Dashboard')).toBeInTheDocument()

    // KPIs Row 1
    expect(screen.getByText('Total Users')).toBeInTheDocument()
    expect(screen.getAllByText('25').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Total Sellers')).toBeInTheDocument()
    expect(screen.getByText('Total Products')).toBeInTheDocument()
    expect(screen.getByText('Total Orders')).toBeInTheDocument()
    expect(screen.getByText('Total Sales / GMV')).toBeInTheDocument()

    // KPIs Row 2
    expect(screen.getByText('Platform Revenue')).toBeInTheDocument()
    expect(screen.getAllByText('Pending Orders').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Pending Settlements').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Cancelled Orders')).toBeInTheDocument()
    expect(screen.getAllByText('Low Stock Products').length).toBeGreaterThanOrEqual(1)

    // Section 2: Sales Overview
    expect(screen.getByText('Sales Overview')).toBeInTheDocument()
    expect(screen.getByText('7 Days')).toBeInTheDocument()
    expect(screen.getByText('30 Days')).toBeInTheDocument()
    expect(screen.getByText('3 Months')).toBeInTheDocument()
    expect(screen.getByText('1 Year')).toBeInTheDocument()

    // Section 3: Order Status Overview
    expect(screen.getByText('Order Status Overview')).toBeInTheDocument()
    expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Delivered').length).toBeGreaterThanOrEqual(1)

    // Section 4: Recent Orders
    expect(screen.getByText('Recent Orders')).toBeInTheDocument()
    expect(screen.getByText('ORD-987654')).toBeInTheDocument()
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
    expect(screen.getByText('View All Orders')).toBeInTheDocument()

    // Section 5: Top Products
    expect(screen.getByText('Top Products')).toBeInTheDocument()
    expect(screen.getByText('Noise Cancelling Headphones')).toBeInTheDocument()
    expect(screen.getByText('55 units sold')).toBeInTheDocument()

    // Section 6: Top Sellers
    expect(screen.getByText('Top Sellers')).toBeInTheDocument()
    expect(screen.getAllByText('Apex Electronics').length).toBeGreaterThanOrEqual(1)

    // Section 7: Needs Attention
    expect(screen.getByText('Needs Attention')).toBeInTheDocument()
    expect(screen.getByText('Low-Stock Products')).toBeInTheDocument()
    expect(screen.getByText('Pending Seller Approvals')).toBeInTheDocument()

    // Section 8: Seller Activity
    expect(screen.getByText('Seller Activity')).toBeInTheDocument()

    // Section 9: User Growth
    expect(screen.getByText('User Growth')).toBeInTheDocument()

    // Section 10: Marketplace Revenue
    expect(screen.getByText('Marketplace Revenue Summary')).toBeInTheDocument()
    expect(screen.getByText('Take Rate: 10%')).toBeInTheDocument()
  })

  it('allows switching sales overview filter ranges', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await screen.findByText('Super Admin Dashboard')
    const sevenDaysBtn = screen.getByText('7 Days')
    await user.click(sevenDaysBtn)

    await waitFor(() => {
      expect(getDashboardMock).toHaveBeenCalledWith({ range: '7d' })
    })
  })
})
