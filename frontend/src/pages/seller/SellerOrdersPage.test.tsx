import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { SellerOrdersPage } from './SellerOrdersPage'
import type { Order } from '@/types/api'

/*
 * Regression coverage for stale seller data: after a lifecycle status
 * change the whole derived dataset (dashboard stats, analytics,
 * customers, settlement, returns, coupons) must be invalidated so every
 * section refetches the current database state — not just the order list
 * the button was clicked from.
 */

const list = vi.hoisted(() => vi.fn())
const updateStatus = vi.hoisted(() => vi.fn())

vi.mock('@/services/order.service', () => ({
  orderService: {
    list: (...args: unknown[]) => list(...args),
    updateStatus: (...args: unknown[]) => updateStatus(...args),
  },
}))

const pendingOrder: Order = {
  id: '64a000000000000000000001',
  orderNumber: 'ORD-1001',
  userId: '64b0000000000000000000b1',
  sellerId: '64b0000000000000000000s1',
  sellerBusinessName: 'Acme Traders',
  items: [
    {
      productId: '64c0000000000000000000p1',
      name: 'Wireless Mouse',
      price: 2000,
      quantity: 1,
      subtotal: 2000,
      discountAmount: 0,
    },
  ],
  shippingAddress: {
    recipientName: 'Riya Sharma',
    phone: '9876543210',
    addressLine1: '12 MG Road',
    addressLine2: null,
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411001',
  },
  itemsTotal: 2000,
  discountTotal: 0,
  couponId: null,
  couponCode: null,
  couponDiscount: 0,
  total: 2000,
  paymentMethod: 'CASH_ON_DELIVERY',
  paymentStatus: 'PENDING',
  paymentId: null,
  status: 'PENDING',
  deliveredAt: null,
  returnedAt: null,
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
}

const setup = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
  const spy = vi.spyOn(queryClient, 'invalidateQueries')

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SellerOrdersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )

  const rootKeys = () =>
    spy.mock.calls.map(
      (call) => ((call[0] as { queryKey: string[] }).queryKey[0] ?? '') as string,
    )

  return { ...utils, rootKeys }
}

beforeEach(() => {
  list.mockReset()
  updateStatus.mockReset()
  list.mockResolvedValue({
    items: [pendingOrder],
    page: 1,
    limit: 10,
    total: 1,
    totalPages: 1,
  })
  updateStatus.mockResolvedValue({
    data: { ...pendingOrder, status: 'CONFIRMED' },
    message: 'Order status updated',
  })
})

describe('SellerOrdersPage status update', () => {
  it('sends the transition to the API', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(updateStatus).toHaveBeenCalledWith(pendingOrder.id, 'CONFIRMED'),
    )
  })

  it('invalidates every derived seller cache after a status change', async () => {
    const user = userEvent.setup()
    const { rootKeys } = setup()

    await user.click(await screen.findByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(rootKeys()).toContain('seller-dashboard'))

    const keys = rootKeys()
    // Money + counts derived from the order status/payment change.
    expect(keys).toEqual(
      expect.arrayContaining([
        'seller-dashboard',
        'orders',
        'order',
        'sales',
        'revenue',
        'top-products',
        'category-performance',
        'customers',
        'customer-orders',
        'seller-settlement',
        'seller-returns',
        'coupons',
      ]),
    )
    // Confirming does not move stock, so product/inventory caches stay put.
    expect(keys).not.toContain('my-products')
    expect(keys).not.toContain('inventory')
  })
})
