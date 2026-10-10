import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sellerService } from '@/services/seller.service'
import { orderService } from '@/services/order.service'
import { notificationService } from '@/services/notification.service'
import { formatPrice, formatDate } from '@/lib/utils'
import { Pagination } from '@/components/ui/Pagination'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { TextArea } from '@/components/ui/TextArea'
import { Skeleton } from '@/components/ui/Skeleton'
import { BuyerMultiSelect } from '@/components/seller/BuyerMultiSelect'
import type { SellerNotificationResult } from '@/types/api'
import type { CustomerInfo, Order } from '@/types/api'
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCcw,
  Search,
  Send,
  Users,
} from 'lucide-react'
import { toast } from 'react-hot-toast'

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error' | 'secondary' | 'brand'> = {
  PENDING: 'warning', CONFIRMED: 'secondary', SHIPPED: 'secondary', DELIVERED: 'success', CANCELLED: 'error', RETURNED: 'brand',
}

/* Same bounds the backend enforces (notification.schema.ts), so the form
   rejects what the API would refuse instead of round-tripping an error. */
const TITLE_MIN = 3
const TITLE_MAX = 200
const MESSAGE_MIN = 5
const MESSAGE_MAX = 2000

/**
 * The broadcast dialog can target up to this many buyers at once — the
 * cap of POST /sellers/notifications (500 ids per request).
 */
const MAX_RECIPIENTS = 500

/**
 * Fetches this seller's orders (GET /orders is already seller-scoped on the
 * backend) across pages and returns only the given buyer's orders. The backend
 * has no per-customer filter, so the seller scope comes from the API and the
 * buyer scope is applied client-side — no hardcoded data.
 */
async function fetchCustomerOrders(customerId: string): Promise<Order[]> {
  const limit = 100
  let page = 1
  let totalPages = 1
  const matched: Order[] = []

  do {
    const res = await orderService.list({ page, limit })
    totalPages = res.totalPages || 1
    for (const order of res.items) {
      if (order.userId === customerId) matched.push(order)
    }
    page += 1
    // Safety cap: 50 pages = up to 5000 seller orders scanned.
    if (page > 50) break
  } while (page <= totalPages)

  return matched
}

/**
 * Every customer of this seller, for the notification multi-select.
 * GET /sellers/customers is paginated (100 per page) and capped at 500
 * recipients per send, so at most 5 pages are read; the buyer count and the
 * "showing X of Y" hint keep the truncation honest instead of silently
 * selecting a partial audience.
 */
async function fetchAllCustomers(): Promise<{
  items: CustomerInfo[]
  total: number
  capped: boolean
}> {
  const limit = 100
  const items: CustomerInfo[] = []
  let total = 0

  for (let page = 1; page <= MAX_RECIPIENTS / limit; page += 1) {
    const res = await sellerService.getCustomers({ page, limit })
    total = res.total
    items.push(...res.items)

    if (res.items.length === 0 || items.length >= total) break
  }

  return { items, total, capped: total > items.length }
}

/**
 * Idempotency token for one composed message. Generated when the dialog is
 * opened (not per click), so pressing "Send" again after a timeout or a
 * failed request reuses it: the backend then replays only the email copies
 * that failed and never creates a second in-app notification for a buyer.
 */
function createRequestId(): string {
  const cryptoRef = globalThis.crypto as Crypto | undefined

  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID()

  return `bcast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function CustomerOrdersDialog({
  customer,
  open,
  onClose,
}: {
  customer: CustomerInfo | null
  open: boolean
  onClose: () => void
}) {
  const { data: orders, isLoading, isError } = useQuery({
    queryKey: ['customer-orders', customer?.customerId],
    queryFn: () => fetchCustomerOrders(customer!.customerId),
    enabled: open && !!customer,
  })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={customer ? `Orders by ${customer.name}` : 'Customer orders'}
      className="max-w-2xl"
    >
      {customer && (
        <p className="text-xs text-[var(--muted)] mb-4 -mt-1">
          {customer.email} • {customer.orderCount} order{customer.orderCount === 1 ? '' : 's'} • {formatPrice(customer.totalSpent)} spent
        </p>
      )}
      {isLoading ? (
        <div className="space-y-3">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : isError ? (
        <p className="text-sm text-red-600 py-6 text-center">Failed to load orders. Please try again.</p>
      ) : !orders?.length ? (
        <p className="text-sm text-[var(--muted)] py-6 text-center">No orders found for this customer.</p>
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
          {orders.map(order => (
            <div key={order.id} className="border rounded-lg p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">#{order.orderNumber}</p>
                  <p className="text-xs text-[var(--muted)]">{formatDate(order.createdAt)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="default">{order.paymentStatus}</Badge>
                  <Badge variant={statusColors[order.status] ?? 'default'}>{order.status}</Badge>
                </div>
              </div>
              <div className="text-xs text-[var(--muted)] space-y-0.5 mt-2">
                {order.items.map(item => (
                  <p key={item.productId} className="truncate">
                    {item.name} <span className="text-[var(--fg)] font-medium">× {item.quantity}</span>
                  </p>
                ))}
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t">
                <span className="text-xs text-[var(--muted)]">
                  {order.items.length} item{order.items.length === 1 ? '' : 's'} • {order.paymentMethod}
                </span>
                <span className="text-sm font-semibold">{formatPrice(order.total)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}

/**
 * Compose dialog for seller-sent notifications.
 *
 * The audience is chosen here with a checkbox multi-select over the seller's
 * buyers: tick one, several, or every buyer listed — or switch to "All
 * buyers" to reach every registered buyer in the marketplace. Only the
 * selected buyers are notified: the request carries exactly their ids, and
 * the backend re-checks each one against active BUYER accounts before
 * writing anything.
 *
 * A message is always delivered twice on purpose: once as the in-app
 * notification behind the buyer's bell, and once as an email to the address
 * registered on their account (the backend's configured provider does the
 * send — no mail settings are involved on this side). Because the in-app copy
 * is written first and keyed by `requestId`, a failed email can be retried
 * from this dialog without ever duplicating the notification.
 */
function SendNotificationDialog({ onClose }: { onClose: () => void }) {
  /*
   * The dialog is mounted per compose (see SellerCustomersPage), so every
   * open starts from an empty form and a fresh idempotency token — while
   * retrying the *same* compose (the Try again button) deliberately keeps
   * that token, which is what stops a retry from creating a second
   * notification for a buyer who already received one.
   */
  const [requestId] = useState(createRequestId)
  const [audience, setAudience] = useState<'SELECTED' | 'ALL'>('SELECTED')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  /** Errors appear once the seller has tried to send, not while typing. */
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState<SellerNotificationResult | null>(null)
  const queryClient = useQueryClient()

  const buyersQuery = useQuery({
    queryKey: ['customers', 'broadcast'],
    queryFn: fetchAllCustomers,
    staleTime: 60_000,
    /* No automatic retry: the panel offers an explicit Retry button, and a
       background retry would silently duplicate the buyer fetch. */
    retry: 0,
  })

  const buyers = useMemo(
    () =>
      (buyersQuery.data?.items ?? []).map(customer => ({
        id: customer.customerId,
        name: customer.name,
        email: customer.email,
        orderCount: customer.orderCount,
      })),
    [buyersQuery.data],
  )

  const trimmedTitle = title.trim()
  const trimmedMessage = message.trim()

  const errors = useMemo(() => {
    const found: Record<string, string> = {}

    if (trimmedTitle.length < TITLE_MIN) {
      found.title = `Title must be at least ${TITLE_MIN} characters`
    } else if (trimmedTitle.length > TITLE_MAX) {
      found.title = `Title cannot exceed ${TITLE_MAX} characters`
    }

    if (trimmedMessage.length < MESSAGE_MIN) {
      found.message = `Message must be at least ${MESSAGE_MIN} characters`
    } else if (trimmedMessage.length > MESSAGE_MAX) {
      found.message = `Message cannot exceed ${MESSAGE_MAX} characters`
    }

    if (audience === 'SELECTED' && selectedIds.length === 0) {
      found.buyers = 'Select at least one buyer (or switch to all buyers)'
    } else if (selectedIds.length > MAX_RECIPIENTS) {
      found.buyers = `At most ${MAX_RECIPIENTS} buyers per notification`
    }

    return found
  }, [trimmedTitle, trimmedMessage, audience, selectedIds.length])

  const isValid = Object.keys(errors).length === 0

  const send = useMutation({
    mutationFn: () =>
      notificationService.sendAsSeller({
        title: trimmedTitle,
        message: trimmedMessage,
        channel: 'BOTH',
        requestId,
        ...(audience === 'ALL'
          ? { audience: 'ALL_BUYERS' as const }
          : { buyerIds: selectedIds }),
      }),
    onSuccess: res => {
      const summary = res.data
      const deliveredTo = summary?.deliveredTo ?? 0
      const notFound = summary?.notFoundBuyerIds?.length ?? 0
      const invalidEmails = summary?.emailsInvalidAddress ?? 0

      queryClient.invalidateQueries({ queryKey: ['notifications'] })

      /*
       * Nothing new was created: this exact requestId had already been
       * delivered (double click, or a retry after a lost response). Say so
       * instead of claiming a second send.
       */
      if (deliveredTo === 0) {
        setResult(summary ?? null)
        toast(res.message || 'This message was already sent to those buyers', {
          icon: <Mail size={16} />,
        })

        return
      }

      if (notFound > 0 || invalidEmails > 0) {
        /* Keep the dialog open so the partial delivery can be read. */
        setResult(summary ?? null)
        toast.error(
          `Sent to ${deliveredTo} ${deliveredTo === 1 ? 'buyer' : 'buyers'}, but ${
            notFound > 0 ? `${notFound} could not be reached` : ''
          }${notFound > 0 && invalidEmails > 0 ? ' and ' : ''}${
            invalidEmails > 0 ? `${invalidEmails} had no valid email on file` : ''
          }`,
        )

        return
      }

      toast.success(
        `Notification sent to ${deliveredTo} ${deliveredTo === 1 ? 'buyer' : 'buyers'} (in-app + email)`,
      )
      onClose()
    },
    onError: (e: any) => {
      setResult(null)
      toast.error(e?.response?.data?.message || 'Failed to send notification. Please try again.')
    },
  })

  const handleSend = () => {
    setSubmitted(true)

    if (!isValid) return

    send.mutate()
  }

  const showErrors = submitted
  const recipientsLabel =
    audience === 'ALL'
      ? 'All registered buyers in the marketplace'
      : selectedIds.length === 0
        ? 'No buyers selected yet'
        : `${selectedIds.length} selected ${selectedIds.length === 1 ? 'buyer' : 'buyers'}`

  return (
    <Dialog open onClose={onClose} title="Broadcast notification" className="max-w-lg">
      <div className="space-y-4">
        <div>
          <span className="block text-sm font-medium text-[var(--fg)] mb-1.5">Send to</span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Notification audience">
            {(
              [
                { value: 'SELECTED', label: 'Selected buyers', hint: 'Pick buyers below' },
                { value: 'ALL', label: 'All buyers', hint: 'Every registered buyer' },
              ] as const
            ).map(option => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={audience === option.value}
                onClick={() => setAudience(option.value)}
                className={
                  audience === option.value
                    ? 'rounded-[var(--radius)] border border-[var(--primary)] bg-[var(--primary-subtle)] px-3 py-2 text-left'
                    : 'rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 text-left hover:bg-[var(--bg-subtle)]'
                }
              >
                <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--fg)]">
                  <Users size={14} className="shrink-0" />
                  {option.label}
                </span>
                <span className="block text-xs text-[var(--muted)]">{option.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {audience === 'SELECTED' ? (
          <BuyerMultiSelect
            buyers={buyers}
            selectedIds={selectedIds}
            onChange={setSelectedIds}
            total={buyersQuery.data?.total}
            loading={buyersQuery.isLoading}
            loadError={
              buyersQuery.isError
                ? 'Could not load your buyers. Please try again.'
                : null
            }
            onRetry={() => buyersQuery.refetch()}
            disabled={send.isPending}
            error={showErrors ? errors.buyers : undefined}
          />
        ) : (
          <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--muted)]">
            This reaches every registered buyer{buyersQuery.data ? ` — ${buyersQuery.data.total} of your customers are listed on the Customers page` : ''}.
            Use “Selected buyers” to notify only part of them.
          </p>
        )}

        <Input
          label="Title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Notification title"
          maxLength={TITLE_MAX + 20}
          error={showErrors ? errors.title : undefined}
          disabled={send.isPending}
        />
        <TextArea
          label="Message"
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Write a short message for the buyer..."
          rows={4}
          maxLength={MESSAGE_MAX + 200}
          error={showErrors ? errors.message : undefined}
          disabled={send.isPending}
        />
        <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
          <span>Recipients: {recipientsLabel}</span>
          <span>
            {trimmedTitle.length}/{TITLE_MAX} · {trimmedMessage.length}/{MESSAGE_MAX}
          </span>
        </div>

        {buyersQuery.data?.capped && audience === 'SELECTED' && (
          <p className="text-[11px] text-[var(--muted)]">
            Showing the first {MAX_RECIPIENTS} of {buyersQuery.data.total} buyers — the per-request
            recipient limit.
          </p>
        )}

        <p className="flex items-start gap-1.5 text-xs text-[var(--muted)]">
          <Mail size={13} className="mt-0.5 shrink-0" />
          Buyers see this in their Notifications section and receive a copy by email at their
          registered address, even when offline.
        </p>

        {/* Partial / idempotent outcomes are reported here, not just in a
            transient toast, because they need the seller's attention. */}
        {result && (
          <div
            role="status"
            className={
              result.notFoundBuyerIds?.length || result.emailsInvalidAddress
                ? 'rounded-[var(--radius)] border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900'
                : 'rounded-[var(--radius)] border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900'
            }
          >
            <p className="flex items-center gap-1.5 font-medium">
              {result.notFoundBuyerIds?.length || result.emailsInvalidAddress ? (
                <AlertCircle size={13} />
              ) : (
                <CheckCircle2 size={13} />
              )}
              Delivery summary
            </p>
            <ul className="mt-1 space-y-0.5">
              <li>In-app notifications created: {result.deliveredTo}</li>
              <li>Email copies queued: {result.emailsQueued}</li>
              {result.duplicates > 0 && (
                <li>Already sent to {result.duplicates} buyer(s) — skipped, not duplicated</li>
              )}
              {result.notFoundBuyerIds?.length > 0 && (
                <li>
                  {result.notFoundBuyerIds.length} selected buyer(s) are no longer active buyers and
                  were not notified
                </li>
              )}
              {result.emailsInvalidAddress > 0 && (
                <li>
                  {result.emailsInvalidAddress} buyer(s) have no valid email address on file, so only
                  the in-app copy was delivered
                </li>
              )}
              {result.suppressed > 0 && (
                <li>{result.suppressed} buyer(s) turned these notifications off in their preferences</li>
              )}
            </ul>
          </div>
        )}

        {send.isError && (
          <div
            role="alert"
            className="flex items-start justify-between gap-2 rounded-[var(--radius)] border border-[var(--destructive)]/20 bg-[var(--destructive-subtle)] p-3 text-xs text-[var(--destructive)]"
          >
            <span className="flex items-start gap-1.5">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              {send.error?.response?.data?.message ||
                'Sending failed. Your message is unchanged — retrying re-sends only what did not arrive.'}
            </span>
            <Button size="sm" variant="outline" onClick={() => send.mutate()}>
              <RefreshCcw size={12} className="mr-1" />
              Try again
            </Button>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={send.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={send.isPending || (showErrors && !isValid)}>
            {send.isPending ? (
              <Loader2 size={14} className="mr-1 animate-spin" />
            ) : (
              <Send size={14} className="mr-1" />
            )}
            {send.isPending
              ? 'Sending...'
              : audience === 'ALL'
                ? 'Send to all buyers'
                : `Send to ${selectedIds.length || 0} ${selectedIds.length === 1 ? 'buyer' : 'buyers'}`}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

export function SellerCustomersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<CustomerInfo | null>(null)
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  /* Bumped on every open: it keys the dialog, so a new compose is a new
     component instance (empty form, new idempotency token) rather than the
     previous one with its state patched back to defaults. */
  const [composeId, setComposeId] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search],
    queryFn: () => sellerService.getCustomers({ page, limit: 20, search: search || undefined }),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Customers</h1>
        {/*
          One entry point for messaging: the dialog opens a checkbox list of
          buyers, so a seller chooses exactly who receives the notification —
          one buyer, several, or all of them. Per-row notify buttons are gone
          by design; "View" stays for order history.
        */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setComposeId(id => id + 1)
            setBroadcastOpen(true)
          }}
        >
          <Send size={14} className="mr-1" /> Broadcast notification
        </Button>
      </div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted)]" />
        <input type="text" placeholder="Search by name or email..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="w-full pl-9 pr-4 py-2 border rounded-md text-sm" />
      </div>
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead className="bg-zinc-50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">Customer</th>
                <th className="text-left p-3 font-medium">Orders</th>
                <th className="text-left p-3 font-medium">Spent</th>
                <th className="text-left p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="p-3"><Skeleton className="h-10 w-full" /></td></tr>
              ) : !data?.items?.length ? (
                <tr><td colSpan={4} className="p-6 text-center text-[var(--muted)]">No customers yet. Buyers who order from you will appear here.</td></tr>
              ) : (
                data.items.map((c) => (
                  <tr key={c.customerId} className="border-b last:border-0">
                    <td className="p-3">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-[var(--muted)]">{c.email}</p>
                    </td>
                    <td className="p-3">{c.orderCount}</td>
                    <td className="p-3 font-medium">{formatPrice(c.totalSpent)}</td>
                    <td className="p-3">
                      <Button size="sm" variant="outline" onClick={() => setSelected(c)}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && data.totalPages > 1 && <div className="p-4"><Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} /></div>}
      </div>

      <CustomerOrdersDialog
        customer={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
      {broadcastOpen && (
        <SendNotificationDialog
          key={composeId}
          onClose={() => setBroadcastOpen(false)}
        />
      )}
    </div>
  )
}
