import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AdminSettlementsPage } from './admin/AdminSettlementsPage'
import { SellerSettlementPage } from './seller/SellerSettlementPage'
import type { Settlement } from '@/types/api'

const mockAdminGetSettlements = vi.hoisted(() => vi.fn())
const mockAdminGetSettlement = vi.hoisted(() => vi.fn())
const mockAdminGetCommission = vi.hoisted(() => vi.fn())
const mockAdminGenerateSettlement = vi.hoisted(() => vi.fn())

vi.mock('@/services/admin.service', () => ({
  adminService: {
    getSettlements: (...args: unknown[]) => mockAdminGetSettlements(...args),
    getSettlement: (...args: unknown[]) => mockAdminGetSettlement(...args),
    getCommission: (...args: unknown[]) => mockAdminGetCommission(...args),
    generateSettlement: (...args: unknown[]) => mockAdminGenerateSettlement(...args),
  },
}))

const mockSellerGetSettlements = vi.hoisted(() => vi.fn())
const mockSellerCreatePaymentOrder = vi.hoisted(() => vi.fn())
const mockSellerVerifyPayment = vi.hoisted(() => vi.fn())

vi.mock('@/services/seller.service', () => ({
  sellerService: {
    getSettlements: (...args: unknown[]) => mockSellerGetSettlements(...args),
    createSettlementPaymentOrder: (...args: unknown[]) => mockSellerCreatePaymentOrder(...args),
    verifySettlementPayment: (...args: unknown[]) => mockSellerVerifyPayment(...args),
  },
}))

const mockPendingSettlement: Settlement = {
  id: '64d0000000000000000000s1',
  sellerId: '64b0000000000000000000s1',
  periodKey: '2026-09',
  periodStart: '2026-09-01T00:00:00.000Z',
  periodEnd: '2026-09-30T23:59:59.999Z',
  status: 'PENDING',
  orders: [
    {
      orderId: '64a000000000000000000001',
      orderNumber: 'ORD-1001',
      total: 50000,
      commissionRate: 10,
      commissionAmount: 5000,
      sellerPayable: 45000,
      deliveredAt: '2026-09-15T12:00:00.000Z',
    },
  ],
  totalSales: 50000,
  totalCommission: 5000,
  totalPayable: 45000,
  commissionRate: 10,
  paidAt: null,
  reminderSentAt: null,
  razorpayOrderId: 'order_test_123',
  razorpayPaymentId: null,
  paymentStatus: 'PENDING',
  paymentMethod: 'RAZORPAY',
  paymentDeadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
}

const mockPaidSettlement: Settlement = {
  ...mockPendingSettlement,
  id: '64d0000000000000000000s2',
  periodKey: '2026-08',
  status: 'PAID',
  paymentStatus: 'PAID',
  paidAt: '2026-09-05T14:30:00.000Z',
  razorpayPaymentId: 'pay_test_456',
}

const mockExpiredSettlement: Settlement = {
  ...mockPendingSettlement,
  id: '64d0000000000000000000s3',
  periodKey: '2026-07',
  status: 'PENDING',
  paymentStatus: 'PENDING',
  createdAt: '2026-07-01T00:00:00.000Z',
  paymentDeadline: '2026-07-08T00:00:00.000Z',
}

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Super Admin Settlement UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminGetCommission.mockResolvedValue({ rate: 10 })
    mockAdminGetSettlements.mockResolvedValue({
      items: [mockPendingSettlement, mockPaidSettlement],
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
    })
    mockAdminGetSettlement.mockResolvedValue(mockPendingSettlement)
  })

  it('renders single status badge without duplicate status text and no Mark Paid/Fail buttons', async () => {
    renderWithProviders(<AdminSettlementsPage />)

    const sellerHeaders = await screen.findAllByText(/Seller 64b0000000/i)
    expect(sellerHeaders.length).toBeGreaterThan(0)

    // Verifies "Settlement Amount" is displayed, old Net Payout is NOT present
    const settlementAmountLabels = screen.getAllByText('Settlement Amount')
    expect(settlementAmountLabels.length).toBeGreaterThan(0)
    expect(screen.queryByText(/Net Payout/i)).not.toBeInTheDocument()

    // Verifies single status badge ("Pending" and "Paid"), NOT "PAID Paid"
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.queryByText('PAID Paid')).not.toBeInTheDocument()
    expect(screen.queryByText('Payment Pending')).not.toBeInTheDocument()

    // Super Admin Mark Paid and Fail action buttons must NOT exist in the flow
    expect(screen.queryByRole('button', { name: /^Mark Paid$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Fail$/i })).not.toBeInTheDocument()
  })

  it('displays payment details in the details dialog without exposing secret information', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AdminSettlementsPage />)

    const detailButtons = await screen.findAllByRole('button', { name: /Details/i })
    await user.click(detailButtons[0]!)

    expect(await screen.findByText('Payment Information')).toBeInTheDocument()
    expect(screen.getByText('order_test_123')).toBeInTheDocument()
    expect(screen.getByText('RAZORPAY')).toBeInTheDocument()
  })
})

describe('Seller Settlement UI & 7-Day Payment Window', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSellerGetSettlements.mockResolvedValue({
      items: [mockPendingSettlement, mockPaidSettlement, mockExpiredSettlement],
      total: 3,
      page: 1,
      limit: 10,
      totalPages: 1,
    })
  })

  it('shows generated date, payment deadline, remaining time, and single badge', async () => {
    renderWithProviders(<SellerSettlementPage />)

    expect(await screen.findByText('September 2026')).toBeInTheDocument()
    expect(screen.getByText('August 2026')).toBeInTheDocument()
    expect(screen.getByText('July 2026')).toBeInTheDocument()

    // 7-day deadline details
    const generatedLabels = screen.getAllByText(/Generated:/i)
    expect(generatedLabels.length).toBeGreaterThan(0)

    const deadlineLabels = screen.getAllByText(/Payment Deadline:/i)
    expect(deadlineLabels.length).toBeGreaterThan(0)

    // Pending has "Pay Settlement" button
    expect(screen.getByRole('button', { name: /Pay Settlement/i })).toBeInTheDocument()

    // Paid settlement shows Paid on date
    expect(screen.getByText(/Paid on/i)).toBeInTheDocument()

    // Expired settlement shows "Payment window expired" and disables payment
    const expiredBadges = screen.getAllByText(/Payment window expired/i)
    expect(expiredBadges.length).toBeGreaterThan(0)
  })

  it('initiates Razorpay checkout and sends verification on success', async () => {
    const user = userEvent.setup()
    mockSellerCreatePaymentOrder.mockResolvedValue({
      success: true,
      data: {
        razorpayOrderId: 'order_test_123',
        amount: 5000,
        currency: 'INR',
        keyId: 'rzp_test_123',
      },
    })
    mockSellerVerifyPayment.mockResolvedValue({
      success: true,
      data: {
        ...mockPendingSettlement,
        status: 'PAID',
        paymentStatus: 'PAID',
        paidAt: new Date().toISOString(),
      },
    })

    const openMock = vi.fn()
    window.Razorpay = vi.fn().mockImplementation(function (this: any, options: any) {
      this.open = () => {
        openMock()
        // Simulate successful checkout response
        options.handler({
          razorpay_payment_id: 'pay_test_789',
          razorpay_signature: 'sig_test_789',
        })
      }
      this.on = vi.fn()
    })

    renderWithProviders(<SellerSettlementPage />)

    const payBtn = await screen.findByRole('button', { name: /Pay Settlement/i })
    await user.click(payBtn)

    await waitFor(() => {
      expect(mockSellerCreatePaymentOrder).toHaveBeenCalledWith('64d0000000000000000000s1')
      expect(openMock).toHaveBeenCalled()
      expect(mockSellerVerifyPayment).toHaveBeenCalledWith('64d0000000000000000000s1', {
        paymentId: 'pay_test_789',
        signature: 'sig_test_789',
      })
    })
  })
})
