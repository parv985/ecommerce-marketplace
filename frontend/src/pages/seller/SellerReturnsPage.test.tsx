import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { SellerReturnsPage } from './SellerReturnsPage'
import type { ReturnRequest } from '@/types/api'

/*
 * Approving a return is the money + stock event of the seller panel: the
 * backend refunds the buyer (revenue drops), marks the order RETURNED,
 * restores inventory and reverses the settlement. The page must therefore
 * invalidate the full derived dataset — including the product/inventory
 * caches — so no section keeps showing pre-return numbers.
 */

const list = vi.hoisted(() => vi.fn())
const updateStatus = vi.hoisted(() => vi.fn())

vi.mock('@/services/return.service', () => ({
  returnService: {
    list: (...args: unknown[]) => list(...args),
    updateStatus: (...args: unknown[]) => updateStatus(...args),
  },
}))

const pendingReturn: ReturnRequest = {
  id: '64d0000000000000000000r1',
  orderId: '64a000000000000000000001',
  userId: '64b0000000000000000000b1',
  sellerId: '64b0000000000000000000s1',
  reason: 'Damaged or defective product',
  status: 'PENDING',
  statusReason: null,
  approvedAt: null,
  decidedBy: null,
  decidedRole: null,
  stockRestoredAt: null,
  refund: null,
  createdAt: '2026-03-02T10:00:00.000Z',
  updatedAt: '2026-03-02T10:00:00.000Z',
}

let confirmSpy: ReturnType<typeof vi.spyOn>

const setup = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
  const spy = vi.spyOn(queryClient, 'invalidateQueries')

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SellerReturnsPage />
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
    items: [pendingReturn],
    page: 1,
    limit: 10,
    total: 1,
    totalPages: 1,
  })
  updateStatus.mockResolvedValue({
    data: { ...pendingReturn, status: 'APPROVED' },
    message: 'Return approved',
  })
  // The page guards approval with window.confirm ("the buyer is refunded…").
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  confirmSpy.mockRestore()
})

describe('SellerReturnsPage approval', () => {
  it('invalidates all derived seller data AND the stock caches', async () => {
    const user = userEvent.setup()
    const { rootKeys } = setup()

    await user.click(await screen.findByRole('button', { name: 'Approve' }))

    await waitFor(() =>
      expect(updateStatus).toHaveBeenCalledWith(pendingReturn.id, {
        status: 'APPROVED',
        reason: undefined,
      }),
    )

    await waitFor(() => expect(rootKeys()).toContain('seller-dashboard'))

    const keys = rootKeys()
    // Refund + RETURNED order ripple through every derived section…
    expect(keys).toEqual(
      expect.arrayContaining([
        'seller-dashboard',
        'orders',
        'order',
        'seller-returns',
        'returns',
        'sales',
        'revenue',
        'top-products',
        'category-performance',
        'customers',
        'seller-settlement',
        'coupons',
      ]),
    )
    // …and the restored stock must refresh product/inventory caches too.
    expect(keys).toEqual(
      expect.arrayContaining(['my-products', 'products', 'product', 'inventory']),
    )
  })
})
