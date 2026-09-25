import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminProductsPage } from './AdminProductsPage'
import { AdminSellersPage } from './AdminSellersPage'
import { AdminOrdersPage } from './AdminOrdersPage'
import { AdminSettlementsPage } from './AdminSettlementsPage'
import { adminService } from '@/services/admin.service'

vi.mock('@/services/admin.service', () => ({
  adminService: {
    getProducts: vi.fn(),
    updateProductStatus: vi.fn(),
    getSellers: vi.fn(),
    updateSellerStatus: vi.fn(),
    getOrders: vi.fn(),
    getSettlements: vi.fn(),
    getCommission: vi.fn(),
  },
}))

function createWrapper(initialUrl: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

describe('Needs Attention URL query filters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adminService.getCommission).mockResolvedValue({ rate: 10 })
  })

  it('AdminProductsPage loads with filter=low-stock, queries API, and shows active filter banner', async () => {
    vi.mocked(adminService.getProducts).mockResolvedValue({
      items: [
        {
          id: 'p1',
          name: 'Wireless Mouse',
          description: '',
          price: 500,
          stock: 3,
          status: 'ACTIVE',
          category: null,
          sellerId: 's1',
          images: [],
          specifications: [],
          createdAt: '',
          updatedAt: '',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    })

    const Wrapper = createWrapper('/admin/products?filter=low-stock')
    render(<AdminProductsPage />, { wrapper: Wrapper })

    expect(adminService.getProducts).toHaveBeenCalledWith({
      page: 1,
      status: undefined,
      filter: 'low-stock',
    })

    expect(await screen.findByText('Low-Stock Products (Stock ≤ 5 units)')).toBeInTheDocument()
    expect(screen.getByText('Clear Filter')).toBeInTheDocument()
    expect(await screen.findByText('Stock: 3')).toBeInTheDocument()
  })

  it('AdminProductsPage loads with filter=reported, queries API, and shows active filter banner', async () => {
    vi.mocked(adminService.getProducts).mockResolvedValue({
      items: [
        {
          id: 'p2',
          name: 'Suspicious Gadget',
          description: '',
          price: 1500,
          stock: 10,
          status: 'PENDING',
          category: null,
          sellerId: 's2',
          images: [],
          specifications: [],
          createdAt: '',
          updatedAt: '',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    })

    const Wrapper = createWrapper('/admin/products?filter=reported')
    render(<AdminProductsPage />, { wrapper: Wrapper })

    expect(adminService.getProducts).toHaveBeenCalledWith({
      page: 1,
      status: undefined,
      filter: 'reported',
    })

    expect(await screen.findByText('Reported / Moderation Products (Pending Review)')).toBeInTheDocument()
    expect(screen.getByText('Clear Filter')).toBeInTheDocument()
  })

  it('AdminSellersPage loads with status=pending, queries API, and shows active filter banner', async () => {
    vi.mocked(adminService.getSellers).mockResolvedValue({
      items: [
        {
          id: 'seller1',
          businessName: 'Fresh Mart',
          gstin: '29ABCDE1234F1Z5',
          pan: 'ABCDE1234F',
          status: 'PENDING',
          createdAt: '2026-09-20T10:00:00Z',
          updatedAt: '2026-09-20T10:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    })

    const Wrapper = createWrapper('/admin/sellers?status=pending')
    render(<AdminSellersPage />, { wrapper: Wrapper })

    expect(adminService.getSellers).toHaveBeenCalledWith({
      page: 1,
      status: 'PENDING',
    })

    expect(await screen.findByText(/Showing only/i)).toBeInTheDocument()
    expect(screen.getAllByText('PENDING').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Clear Filter')).toBeInTheDocument()
    expect(await screen.findByText('Fresh Mart')).toBeInTheDocument()
  })

  it('AdminOrdersPage loads with status=pending, queries API, and shows active filter banner', async () => {
    vi.mocked(adminService.getOrders).mockResolvedValue({
      items: [
        {
          id: 'ord1',
          orderNumber: 'ORD-12345',
          userId: 'u1',
          sellerId: 's1',
          itemCount: 2,
          total: 1200,
          paymentStatus: 'PENDING',
          status: 'PENDING',
          createdAt: '2026-09-24T10:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    })

    const Wrapper = createWrapper('/admin/orders?status=pending')
    render(<AdminOrdersPage />, { wrapper: Wrapper })

    expect(adminService.getOrders).toHaveBeenCalledWith({
      page: 1,
      status: 'PENDING',
    })

    expect(await screen.findByText(/Showing only/i)).toBeInTheDocument()
    expect(screen.getByText('Clear Filter')).toBeInTheDocument()
    expect(await screen.findByText('#ORD-12345')).toBeInTheDocument()
  })

  it('AdminSettlementsPage loads with status=pending, queries API, and shows active filter banner', async () => {
    vi.mocked(adminService.getSettlements).mockResolvedValue({
      items: [
        {
          id: 'set1',
          sellerId: 'seller123456789',
          periodKey: '2026-08',
          periodStart: '2026-08-01T00:00:00Z',
          periodEnd: '2026-08-31T23:59:59Z',
          status: 'PENDING',
          orders: [],
          totalSales: 50000,
          totalCommission: 5000,
          totalPayable: 45000,
          commissionRate: 10,
          paidAt: null,
          reminderSentAt: null,
          razorpayOrderId: null,
          razorpayPaymentId: null,
          paymentStatus: 'PENDING',
          paymentMethod: null,
          createdAt: '2026-09-01T00:00:00Z',
          updatedAt: '2026-09-01T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    })

    const Wrapper = createWrapper('/admin/settlements?status=pending')
    render(<AdminSettlementsPage />, { wrapper: Wrapper })

    expect(adminService.getSettlements).toHaveBeenCalledWith({
      page: 1,
      status: 'PENDING',
      month: undefined,
    })

    expect(await screen.findByText(/Filtered View:/i)).toBeInTheDocument()
    expect(screen.getByText('Clear Filter')).toBeInTheDocument()
  })

  it('clicking Clear Filter removes the query params and updates the API request', async () => {
    const user = userEvent.setup()
    vi.mocked(adminService.getProducts).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    })

    const Wrapper = createWrapper('/admin/products?filter=low-stock')
    render(<AdminProductsPage />, { wrapper: Wrapper })

    const clearBtn = await screen.findByText('Clear Filter')
    await user.click(clearBtn)

    expect(screen.queryByText('Low-Stock Products (Stock ≤ 5 units)')).not.toBeInTheDocument()
    expect(adminService.getProducts).toHaveBeenLastCalledWith({
      page: 1,
      status: undefined,
      filter: undefined,
    })
  })
})
