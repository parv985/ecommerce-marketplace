import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { CustomerInfo } from '@/types/api'

/*
 * Seller Customers → Broadcast notification.
 *
 * The dialog is the single entry point for messaging buyers (the per-row
 * "Notify" button is gone, "View" stays), and it must:
 *   - list the seller's buyers as checkboxes,
 *   - let the seller pick one, several, or all of them,
 *   - send only the selected buyer ids, plus title and message,
 *   - validate before sending, show a loading state, and report failures
 *     with a retry that cannot duplicate a delivery (stable requestId),
 *   - keep working when the buyer list itself fails to load.
 */

const getCustomers = vi.hoisted(() => vi.fn())
const orderList = vi.hoisted(() => vi.fn())
const sendAsSeller = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())
const toastPlain = vi.hoisted(() => vi.fn())

vi.mock('@/services/seller.service', () => ({
  sellerService: { getCustomers: (...args: unknown[]) => getCustomers(...args) },
}))

vi.mock('@/services/order.service', () => ({
  orderService: { list: (...args: unknown[]) => orderList(...args) },
}))

vi.mock('@/services/notification.service', () => ({
  notificationService: {
    sendAsSeller: (data: unknown) => sendAsSeller(data),
  },
}))

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn((message: string) => toastPlain(message)), {
    success: toastSuccess,
    error: toastError,
  })
  return { toast, default: toast }
})

import { SellerCustomersPage } from './SellerCustomersPage'

const customers: CustomerInfo[] = [
  {
    customerId: '64a0000000000000000000c1',
    name: 'Priya Sharma',
    email: 'priya@example.com',
    orderCount: 3,
    totalSpent: 5400,
  },
  {
    customerId: '64a0000000000000000000c2',
    name: 'Rahul Verma',
    email: 'rahul@example.com',
    orderCount: 1,
    totalSpent: 999,
  },
  {
    customerId: '64a0000000000000000000c3',
    name: 'Aisha Khan',
    email: 'aisha@example.com',
    orderCount: 7,
    totalSpent: 15200,
  },
]

const TITLE = 'Notification title'
const MESSAGE = 'Write a short message for the buyer...'

const pageOfCustomers = (items: CustomerInfo[]) => ({
  items,
  total: items.length,
  page: 1,
  limit: 100,
  totalPages: 1,
})

const successBody = {
  deliveredTo: 2,
  duplicates: 0,
  emailsQueued: 2,
  emailsInvalidAddress: 0,
  suppressed: 0,
  requested: 2,
  notFoundBuyerIds: [],
}

const successResult = {
  status: 201,
  success: true,
  message: 'Notification sent to 2 buyers',
  data: successBody,
}

const renderPage = async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SellerCustomersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return { queryClient, invalidate }
}

/** Opens the dialog and drops the buyer checkbox panel. */
const openBroadcast = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /broadcast notification/i }))
  await user.click(screen.getByRole('button', { name: /select buyers/i }))
}

const tickBuyer = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) => {
  await user.click(await screen.findByRole('checkbox', { name }))
}

const writeMessage = async (
  user: ReturnType<typeof userEvent.setup>,
  title = 'Diwali sale is live',
  message = 'Flat 20% off every item in our store this week.',
) => {
  await user.type(await screen.findByPlaceholderText(TITLE), title)
  await user.type(screen.getByPlaceholderText(MESSAGE), message)
}

beforeEach(() => {
  vi.clearAllMocks()
  getCustomers.mockResolvedValue(pageOfCustomers(customers))
  orderList.mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 1 })
  sendAsSeller.mockResolvedValue(successResult)
})

describe('SellerCustomersPage', () => {
  it('keeps View per row and drops the individual Notify button', async () => {
    await renderPage()

    await screen.findByText('Priya Sharma')

    expect(screen.getAllByRole('button', { name: 'View' })).toHaveLength(3)
    expect(screen.queryAllByRole('button', { name: /notify/i })).toHaveLength(0)

    // Messaging still exists, as one broadcast entry point.
    expect(screen.getByRole('button', { name: /broadcast notification/i })).toBeInTheDocument()
  })

  it('lists the seller buyers as checkboxes and notifies the selected ones only', async () => {
    const user = userEvent.setup()
    await renderPage()

    await openBroadcast(user)

    await tickBuyer(user, /Priya Sharma/)

    // One checkbox per buyer (plus "select all"), each showing the address
    // the email copy goes to.
    const boxes = await screen.findAllByRole('checkbox')
    expect(boxes).toHaveLength(customers.length + 1)
    expect(
      within(screen.getByRole('listbox', { name: 'Buyers to notify' })).getByText('priya@example.com'),
    ).toBeInTheDocument()

    await tickBuyer(user, /Aisha Khan/)
    await writeMessage(user)

    await user.click(screen.getByRole('button', { name: /Send to 2 buyers/i }))

    await waitFor(() => expect(sendAsSeller).toHaveBeenCalledTimes(1))

    const payload = sendAsSeller.mock.calls[0][0]
    expect(payload.buyerIds).toEqual([customers[0].customerId, customers[2].customerId])
    expect(payload.audience).toBeUndefined()
    expect(payload.title).toBe('Diwali sale is live')
    // In-app + email; the backend owns the provider configuration.
    expect(payload.channel).toBe('BOTH')
    expect(typeof payload.requestId).toBe('string')
  })

  it('delivers a validated message and refreshes the notification feed', async () => {
    const user = userEvent.setup()
    const { invalidate } = await renderPage()

    await openBroadcast(user)
    await tickBuyer(user, /Rahul Verma/)
    await writeMessage(user)

    await user.click(screen.getByRole('button', { name: /Send to 1 buyer$/i }))

    await waitFor(() => expect(sendAsSeller).toHaveBeenCalledTimes(1))
    expect(sendAsSeller.mock.calls[0][0]).toMatchObject({
      title: 'Diwali sale is live',
      message: 'Flat 20% off every item in our store this week.',
      buyerIds: [customers[1].customerId],
    })

    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('sent to 2 buyers'))
    // The bell / in-app list refetches so the new item shows up immediately.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications'] })
  })

  it('selects every listed buyer with one checkbox', async () => {
    const user = userEvent.setup()
    await renderPage()

    await openBroadcast(user)
    await screen.findByRole('checkbox', { name: /Priya Sharma/ })

    await user.click(screen.getByRole('checkbox', { name: /select all buyers/i }))
    await writeMessage(user)
    await user.click(screen.getByRole('button', { name: /Send to 3 buyers/i }))

    await waitFor(() => expect(sendAsSeller).toHaveBeenCalledTimes(1))

    const ids = sendAsSeller.mock.calls[0][0].buyerIds
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
  })

  it('reaches every registered buyer through the all-buyers audience', async () => {
    const user = userEvent.setup()
    await renderPage()

    await openBroadcast(user)
    await user.click(screen.getByRole('radio', { name: /all buyers/i }))
    await writeMessage(user)

    await user.click(screen.getByRole('button', { name: /Send to all buyers/i }))

    await waitFor(() => expect(sendAsSeller).toHaveBeenCalledTimes(1))

    const payload = sendAsSeller.mock.calls[0][0]
    expect(payload.audience).toBe('ALL_BUYERS')
    expect(payload.buyerIds).toBeUndefined()
  })

  it('blocks an empty send and explains what is missing', async () => {
    const user = userEvent.setup()
    await renderPage()

    await openBroadcast(user)
    await user.click(screen.getByRole('button', { name: /Send to 0 buyers/i }))

    expect(await screen.findByText(/select at least one buyer/i)).toBeInTheDocument()
    expect(screen.getByText(/title must be at least 3 characters/i)).toBeInTheDocument()
    expect(screen.getByText(/message must be at least 5 characters/i)).toBeInTheDocument()
    expect(sendAsSeller).not.toHaveBeenCalled()
  })

  it('shows a loading state while the buyer list is fetched', async () => {
    let resolveList: (value: unknown) => void = () => {}
    getCustomers.mockReturnValue(
      new Promise(resolve => {
        resolveList = resolve
      }),
    )

    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole('button', { name: /broadcast notification/i }))

    const trigger = screen.getByRole('button', { name: /loading buyers/i })
    expect(trigger).toBeDisabled()

    await act(async () => {
      resolveList(pageOfCustomers(customers))
    })

    await user.click(await screen.findByRole('button', { name: /select buyers/i }))
    expect(await screen.findByRole('checkbox', { name: /Priya Sharma/ })).toBeEnabled()
  })

  it('keeps the draft and replays the same requestId when the send fails', async () => {
    sendAsSeller
      .mockRejectedValueOnce({
        response: { data: { message: 'Email provider unreachable. Please try again.' } },
      })
      .mockResolvedValueOnce(successResult)

    const user = userEvent.setup()
    await renderPage()

    await openBroadcast(user)
    await tickBuyer(user, /Priya Sharma/)
    await writeMessage(user)

    await user.click(screen.getByRole('button', { name: /Send to 1 buyer$/i }))

    expect(await screen.findByText(/Email provider unreachable/i)).toBeInTheDocument()
    expect(toastError).toHaveBeenCalled()

    // Nothing is lost: the seller does not have to retype the message.
    expect(screen.getByPlaceholderText(TITLE)).toHaveValue('Diwali sale is live')
    const firstRequestId = sendAsSeller.mock.calls[0][0].requestId

    await user.click(screen.getByRole('button', { name: /try again/i }))

    await waitFor(() => expect(sendAsSeller).toHaveBeenCalledTimes(2))
    // The same token means the backend replays only what never arrived and
    // cannot create a second in-app notification for the buyer.
    expect(sendAsSeller.mock.calls[1][0].requestId).toBe(firstRequestId)
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('reports a partial delivery instead of claiming a clean send', async () => {
    sendAsSeller.mockResolvedValueOnce({
      ...successResult,
      data: {
        ...successBody,
        deliveredTo: 1,
        emailsQueued: 1,
        emailsInvalidAddress: 1,
        notFoundBuyerIds: ['64a0000000000000000000zz'],
        requested: 3,
      },
    })

    const user = userEvent.setup()
    await renderPage()

    await openBroadcast(user)
    await tickBuyer(user, /Priya Sharma/)
    await tickBuyer(user, /Rahul Verma/)
    await writeMessage(user)

    await user.click(screen.getByRole('button', { name: /Send to 2 buyers/i }))

    expect(await screen.findByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/1 selected buyer\(s\) are no longer active/i)).toBeInTheDocument()
    expect(screen.getByText(/no valid email address on file/i)).toBeInTheDocument()
    expect(toastError).toHaveBeenCalled()
    // The dialog stays open so the seller can act on it.
    expect(screen.getByRole('heading', { name: 'Broadcast notification' })).toBeInTheDocument()
  })

  it('explains an idempotent replay rather than double-notifying', async () => {
    sendAsSeller.mockResolvedValueOnce({
      status: 200,
      success: true,
      message: 'Notification was already sent to the selected buyers',
      data: { ...successBody, deliveredTo: 0, duplicates: 3, requested: 3 },
    })

    const user = userEvent.setup()
    await renderPage()

    await openBroadcast(user)
    await screen.findByRole('checkbox', { name: /Priya Sharma/ })
    await user.click(screen.getByRole('checkbox', { name: /select all buyers/i }))
    await writeMessage(user)

    await user.click(screen.getByRole('button', { name: /Send to 3 buyers/i }))

    expect(await screen.findByText(/already sent to 3 buyer/i)).toBeInTheDocument()
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastPlain).toHaveBeenCalledWith(
      'Notification was already sent to the selected buyers',
    )
  })

  it('surfaces a buyer-list failure with a retry, without breaking the table', async () => {
    // Only the dialog's fetch (limit 100) fails; the table's own page query
    // must keep working, so a broken buyer list cannot take the page down.
    let dialogFetches = 0
    getCustomers.mockImplementation(async (params?: { limit?: number }) => {
      if (params?.limit === 100) {
        dialogFetches += 1
        if (dialogFetches === 1) throw new Error('network down')
      }

      return pageOfCustomers(customers)
    })

    const user = userEvent.setup()
    await renderPage()

    await screen.findByText('Priya Sharma')

    await user.click(screen.getByRole('button', { name: /broadcast notification/i }))
    await user.click(screen.getByRole('button', { name: /select buyers/i }))

    expect(await screen.findByText(/could not load your buyers/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => expect(dialogFetches).toBe(2))
    // The table is unaffected by the failed buyer fetch.
    expect(screen.getAllByText('Priya Sharma').length).toBeGreaterThan(0)
    expect(await screen.findByRole('checkbox', { name: /Priya Sharma/ })).toBeInTheDocument()
  })
})
