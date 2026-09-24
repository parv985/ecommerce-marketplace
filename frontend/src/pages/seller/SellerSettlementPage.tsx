import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  ReceiptText,
  RefreshCw,
  Wallet,
} from 'lucide-react'
import { sellerService } from '@/services/seller.service'
import { extractErrorMessage } from '@/services/api'
import { formatDate, formatDateFull, formatPrice } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Pagination } from '@/components/ui/Pagination'
import { Skeleton } from '@/components/ui/Skeleton'
import type { Settlement } from '@/types/api'
import { toast } from 'react-hot-toast'

declare global {
  interface Window {
    Razorpay: any
  }
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number)
  if (!year || !m) return month
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(year, m - 1, 1))
}

const currentMonthKey = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/* Helper to compute the exact 7-day deadline and remaining time from settlement generation */
const getDeadlineInfo = (s: Settlement) => {
  const createdAt = s.createdAt ? new Date(s.createdAt) : new Date()
  const deadline = s.paymentDeadline
    ? new Date(s.paymentDeadline)
    : new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000)

  const now = Date.now()
  const diffMs = deadline.getTime() - now
  const isExpired = diffMs <= 0

  let remainingText = ''
  if (isExpired) {
    remainingText = 'Payment window expired'
  } else {
    const totalMinutes = Math.floor(diffMs / (1000 * 60))
    const totalHours = Math.floor(totalMinutes / 60)
    const days = Math.floor(totalHours / 24)
    const hours = totalHours % 24
    const minutes = totalMinutes % 60

    if (days > 0) {
      remainingText = `${days} day${days === 1 ? '' : 's'}, ${hours} hr${hours === 1 ? '' : 's'} remaining`
    } else if (hours > 0) {
      remainingText = `${hours} hr${hours === 1 ? '' : 's'}, ${minutes} min remaining`
    } else {
      remainingText = `${minutes} min remaining`
    }
  }

  return {
    createdAt,
    deadline,
    isExpired,
    remainingText,
  }
}

/* Single status badge resolution to avoid duplicates */
const getSellerSettlementBadge = (
  s: Settlement,
): { label: string; variant: 'default' | 'success' | 'warning' | 'error' } => {
  if (s.status === 'CANCELLED') {
    return { label: 'Cancelled', variant: 'default' }
  }
  if (s.paymentStatus === 'PAID' || s.status === 'PAID') {
    return { label: 'Paid', variant: 'success' }
  }
  const { isExpired } = getDeadlineInfo(s)
  if (isExpired) {
    return { label: 'Payment window expired', variant: 'error' }
  }
  // Failed payment remains PENDING and can be retried within the 7-day window
  return { label: 'Pending', variant: 'warning' }
}

export function SellerSettlementPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [payingId, setPayingId] = useState<string | null>(null)
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null)

  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['seller-settlements', page, statusFilter, monthFilter],
    queryFn: () =>
      sellerService.getSettlements({
        status: statusFilter || undefined,
        month: monthFilter || undefined,
        page,
        limit: 10,
      }),
  })

  const openRazorpay = (options: any) => {
    if (!window.Razorpay || !options) {
      setPayingId(null)
      return
    }
    try {
      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', (response: any) => {
        toast.error(response.error?.description || 'Payment failed')
        // Failed payment remains PENDING so seller can retry within the 7-day window
        setPayingId(null)
        queryClient.invalidateQueries({ queryKey: ['seller-settlements'] })
      })
      rzp.open()
    } catch (e: any) {
      console.error('Error opening Razorpay checkout:', e)
      toast.error('Failed to open Razorpay checkout')
      setPayingId(null)
    }
  }

  const loadRazorpayScript = (options: any) => {
    if (window.Razorpay) {
      openRazorpay(options)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => openRazorpay(options)
    script.onerror = () => {
      toast.error('Failed to load Razorpay checkout. Please check your internet connection.')
      setPayingId(null)
    }
    document.body.appendChild(script)
  }

  const verifyMutation = useMutation({
    mutationFn: ({ settlementId, data }: { settlementId: string; data: { paymentId: string; signature: string } }) =>
      sellerService.verifySettlementPayment(settlementId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-settlements'] })
      queryClient.invalidateQueries({ queryKey: ['admin-settlements'] })
      setPayingId(null)
      setSelectedSettlement(null)
      toast.success('Settlement payment successful')
    },
    onError: (err: any) => {
      // Failed verification leaves settlement PENDING to allow retry
      queryClient.invalidateQueries({ queryKey: ['seller-settlements'] })
      setPayingId(null)
      toast.error(err?.response?.data?.message || extractErrorMessage(err) || 'Payment verification failed')
    },
  })

  const payMutation = useMutation({
    mutationFn: (settlementId: string) => sellerService.createSettlementPaymentOrder(settlementId),
    onSuccess: (res, settlementId) => {
      const payment = res.data
      if (!payment?.keyId) {
        toast.error('Razorpay payment gateway is not configured on the server')
        setPayingId(null)
        return
      }

      const settlement = data?.items?.find((s) => s.id === settlementId) || selectedSettlement
      const amountInPaise = Math.round(payment.amount * 100)

      const options = {
        key: payment.keyId,
        amount: amountInPaise,
        currency: payment.currency || 'INR',
        name: 'NexCart Marketplace',
        description: `Settlement for ${settlement ? formatMonthLabel(settlement.periodKey) : 'Monthly Commission'}`,
        order_id: payment.razorpayOrderId,
        handler: async (response: any) => {
          await verifyMutation.mutateAsync({
            settlementId,
            data: {
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            },
          })
        },
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
        },
        theme: {
          color: '#191816',
        },
        modal: {
          ondismiss: () => {
            setPayingId(null)
            toast.error('Payment cancelled')
          },
        },
      }

      loadRazorpayScript(options)
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || extractErrorMessage(err) || 'Failed to initiate payment')
      setPayingId(null)
    },
  })

  const handlePay = (settlement: Settlement) => {
    if (payingId || payMutation.isPending || verifyMutation.isPending) return
    if (settlement.paymentStatus === 'PAID' || settlement.status === 'PAID') {
      toast.error('This settlement is already paid')
      return
    }
    if (settlement.status === 'CANCELLED') {
      toast.error('Cannot pay a cancelled settlement')
      return
    }

    const { isExpired } = getDeadlineInfo(settlement)
    if (isExpired) {
      toast.error('Payment window expired for this settlement')
      return
    }

    setPayingId(settlement.id)
    payMutation.mutate(settlement.id)
  }

  const isFilterActive = statusFilter !== '' || monthFilter !== ''

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">Settlements</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Review monthly sales and pay platform commission settlements within the 7-day payment window.
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap items-end">
        {[
          { label: 'All', value: '' },
          { label: 'Pending', value: 'PENDING' },
          { label: 'Paid', value: 'PAID' },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => {
              setStatusFilter(f.value)
              setPage(1)
            }}
            className={`px-3 py-1.5 text-sm rounded ${
              statusFilter === f.value ? 'bg-[var(--primary)] text-white' : 'bg-zinc-100 hover:bg-zinc-200'
            }`}
          >
            {f.label}
          </button>
        ))}

        <div className="ml-auto flex gap-2 items-end">
          {monthFilter && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setMonthFilter('')
                setPage(1)
              }}
            >
              Clear month
            </Button>
          )}
          <Input
            type="month"
            aria-label="Filter by month"
            max={currentMonthKey()}
            value={monthFilter}
            onChange={(e) => {
              setMonthFilter(e.target.value)
              setPage(1)
            }}
            className="w-44"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array(3)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-[var(--radius-lg)]" />
            ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="p-3 rounded-full bg-[var(--destructive-subtle)] text-[var(--destructive)] mb-4">
            <AlertCircle size={28} strokeWidth={1.75} />
          </div>
          <h3 className="text-lg font-medium mb-1">Unable to load settlements.</h3>
          <p className="text-sm text-[var(--muted)] max-w-sm mb-4">{extractErrorMessage(error)}</p>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 size={14} className="animate-spin mr-2" /> : <RefreshCw size={14} className="mr-2" />}
            Retry
          </Button>
        </div>
      ) : data?.items?.length === 0 ? (
        <EmptyState
          icon={<Wallet size={44} strokeWidth={1.5} />}
          title="No settlements found"
          description={
            isFilterActive
              ? 'No settlements match the selected filter criteria.'
              : 'Settlements are generated monthly once orders are delivered and paid.'
          }
        />
      ) : (
        <div className="space-y-4">
          {data?.items?.map((s) => {
            const isPaid = s.paymentStatus === 'PAID' || s.status === 'PAID'
            const isCancelled = s.status === 'CANCELLED'
            const deadlineInfo = getDeadlineInfo(s)
            const badge = getSellerSettlementBadge(s)
            const isProcessingThis = payingId === s.id
            const canPay = !isPaid && !isCancelled && !deadlineInfo.isExpired

            return (
              <Card key={s.id} className="overflow-hidden">
                <CardContent className="p-5">
                  {/* Top row: month, dates, single badge, details button */}
                  <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-bold text-[var(--fg)]">
                        {formatMonthLabel(s.periodKey)}
                      </h3>
                      <Badge variant="default">{s.periodKey}</Badge>
                      {/* Single status badge */}
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setSelectedSettlement(s)}>
                      <ReceiptText size={14} className="mr-1.5" /> Details
                    </Button>
                  </div>

                  {/* Financial metrics grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 py-3 border-y border-[var(--border)] text-sm">
                    <div>
                      <p className="text-xs text-[var(--muted)]">Total Sales</p>
                      <p className="text-base font-semibold">{formatPrice(s.totalSales)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--muted)]">Orders</p>
                      <p className="text-base font-semibold">{s.orders?.length ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--muted)]">Commission Rate</p>
                      <p className="text-base font-semibold">{s.commissionRate}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--muted)]">Commission Amount</p>
                      <p className="text-base font-semibold text-red-600">{formatPrice(s.totalCommission)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--muted)] font-medium">Settlement Amount</p>
                      <p className="text-lg font-bold text-amber-600">{formatPrice(s.totalCommission)}</p>
                      <span className="text-[10px] text-[var(--muted)]">Amount to pay</span>
                    </div>
                  </div>

                  {/* 7-Day Deadline Details Row */}
                  <div className="mt-3 pt-1 flex items-center justify-between gap-3 flex-wrap text-xs text-[var(--muted)]">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span>
                        Generated:{' '}
                        <strong className="text-[var(--fg)] font-medium">
                          {formatDate(deadlineInfo.createdAt)}
                        </strong>
                      </span>
                      <span>
                        Payment Deadline:{' '}
                        <strong className="text-[var(--fg)] font-medium">
                          {formatDate(deadlineInfo.deadline)}
                        </strong>
                      </span>
                    </div>

                    <div>
                      {isPaid && s.paidAt ? (
                        <span className="flex items-center gap-1.5 text-green-700 font-medium">
                          <CheckCircle2 size={14} />
                          Paid on {formatDateFull(s.paidAt)}
                        </span>
                      ) : isCancelled ? (
                        <span>Settlement cancelled</span>
                      ) : deadlineInfo.isExpired ? (
                        <span className="font-semibold text-red-600">
                          Payment window expired
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-700 font-medium">
                          <Clock size={13} />
                          {deadlineInfo.remainingText}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action row */}
                  <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-xs text-[var(--muted)]">
                      {isPaid
                        ? 'Payment completed and verified via Razorpay'
                        : deadlineInfo.isExpired
                        ? 'The 7-day payment window for this settlement has ended'
                        : 'Commission owed for delivered orders in this cycle'}
                    </span>

                    <div className="flex items-center gap-2">
                      {canPay && (
                        <Button
                          size="sm"
                          disabled={!!payingId}
                          onClick={() => handlePay(s)}
                          className="bg-black hover:bg-zinc-800 text-white"
                        >
                          {isProcessingThis ? (
                            <Loader2 size={14} className="animate-spin mr-1.5" />
                          ) : (
                            <CreditCard size={14} className="mr-1.5" />
                          )}
                          {isProcessingThis ? 'Processing...' : 'Pay Settlement'}
                        </Button>
                      )}

                      {!isPaid && !isCancelled && deadlineInfo.isExpired && (
                        <Button size="sm" variant="outline" disabled className="opacity-60 cursor-not-allowed">
                          Payment window expired
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {data && data.total > 0 && (
            <p className="text-xs text-[var(--muted)]">
              {data.total} settlement{data.total === 1 ? '' : 's'}
            </p>
          )}

          {data && <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} />}
        </div>
      )}

      {/* Details Dialog */}
      <SellerSettlementDetailDialog
        settlement={selectedSettlement}
        onClose={() => setSelectedSettlement(null)}
        onPay={handlePay}
        isPaying={payingId === selectedSettlement?.id}
      />
    </div>
  )
}

function SellerSettlementDetailDialog({
  settlement,
  onClose,
  onPay,
  isPaying,
}: {
  settlement: Settlement | null
  onClose: () => void
  onPay: (s: Settlement) => void
  isPaying: boolean
}) {
  if (!settlement) return null

  const isPaid = settlement.paymentStatus === 'PAID' || settlement.status === 'PAID'
  const isCancelled = settlement.status === 'CANCELLED'
  const deadlineInfo = getDeadlineInfo(settlement)
  const badge = getSellerSettlementBadge(settlement)
  const canPay = !isPaid && !isCancelled && !deadlineInfo.isExpired

  return (
    <Dialog
      open={!!settlement}
      onClose={onClose}
      title={`Settlement — ${formatMonthLabel(settlement.periodKey)}`}
      className="max-w-3xl"
    >
      <div className="space-y-5">
        {/* Top bar with single badge */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="default">{settlement.periodKey}</Badge>
          <Badge variant={badge.variant}>{badge.label}</Badge>
          <span className="text-xs text-[var(--muted)] ml-auto">
            {formatDate(settlement.periodStart)} – {formatDate(settlement.periodEnd)}
          </span>
        </div>

        {/* 7-Day Payment Window Details */}
        <div className="rounded-lg border p-3.5 bg-zinc-50/50 space-y-2 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <span className="text-[var(--muted)] block">Generated Date</span>
              <span className="font-semibold text-sm text-[var(--fg)]">
                {formatDateFull(deadlineInfo.createdAt)}
              </span>
            </div>
            <div>
              <span className="text-[var(--muted)] block">Payment Deadline (7 days)</span>
              <span className="font-semibold text-sm text-[var(--fg)]">
                {formatDateFull(deadlineInfo.deadline)}
              </span>
            </div>
            <div>
              <span className="text-[var(--muted)] block">Remaining Time</span>
              <span
                className={`font-semibold text-sm ${
                  isPaid ? 'text-green-700' : deadlineInfo.isExpired ? 'text-red-600' : 'text-amber-700'
                }`}
              >
                {isPaid
                  ? settlement.paidAt
                    ? `Paid on ${formatDateFull(settlement.paidAt)}`
                    : 'Paid'
                  : deadlineInfo.remainingText}
              </span>
            </div>
          </div>
        </div>

        {/* Settlement Information */}
        <div className="rounded-lg border p-4 bg-zinc-50/50 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Settlement Information
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
            <div>
              <span className="text-[var(--muted)] text-xs">Total Sales</span>
              <p className="font-semibold">{formatPrice(settlement.totalSales)}</p>
            </div>
            <div>
              <span className="text-[var(--muted)] text-xs">Number of Orders</span>
              <p className="font-semibold">{settlement.orders?.length ?? 0}</p>
            </div>
            <div>
              <span className="text-[var(--muted)] text-xs">Commission Rate</span>
              <p className="font-semibold">{settlement.commissionRate}%</p>
            </div>
            <div>
              <span className="text-[var(--muted)] text-xs">Commission Amount</span>
              <p className="font-semibold text-red-600">{formatPrice(settlement.totalCommission)}</p>
            </div>
            <div>
              <span className="text-[var(--muted)] text-xs">Amount to Pay</span>
              <p className="font-bold text-amber-600">{formatPrice(settlement.totalCommission)}</p>
            </div>
          </div>
        </div>

        {/* Payment Information */}
        <div className="rounded-lg border p-4 bg-zinc-50/50 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Payment Information
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-[var(--muted)] text-xs">Payment Status</span>
              <p className="font-semibold">{badge.label}</p>
            </div>
            <div>
              <span className="text-[var(--muted)] text-xs">Payment Date</span>
              <p className="font-semibold">
                {settlement.paidAt ? formatDateFull(settlement.paidAt) : '—'}
              </p>
            </div>
            <div>
              <span className="text-[var(--muted)] text-xs">Payment Method</span>
              <p className="font-medium">
                {settlement.paymentMethod || (settlement.status === 'PAID' ? 'MANUAL' : '—')}
              </p>
            </div>
            <div>
              <span className="text-[var(--muted)] text-xs">Razorpay Order ID</span>
              <p className="font-mono text-xs font-medium break-all">{settlement.razorpayOrderId || '—'}</p>
            </div>
          </div>
          {settlement.razorpayPaymentId && (
            <div className="pt-2 border-t text-sm">
              <span className="text-[var(--muted)] text-xs">Razorpay Payment ID: </span>
              <span className="font-mono text-xs font-medium">{settlement.razorpayPaymentId}</span>
            </div>
          )}
        </div>

        {/* Order Breakdown */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-[var(--fg)]">Order Breakdown</h4>
          {!settlement.orders?.length ? (
            <p className="text-sm text-[var(--muted)] py-6 text-center border rounded-lg">
              No orders are part of this settlement.
            </p>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[540px]">
                <thead className="bg-zinc-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium">Order</th>
                    <th className="text-left p-3 font-medium">Delivered</th>
                    <th className="text-right p-3 font-medium">Order Total</th>
                    <th className="text-right p-3 font-medium">Commission Rate</th>
                    <th className="text-right p-3 font-medium">Commission Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {settlement.orders.map((order) => (
                    <tr key={order.orderId} className="border-b">
                      <td className="p-3 font-medium text-[var(--fg)]">#{order.orderNumber}</td>
                      <td className="p-3 text-[var(--muted)]">
                        {order.deliveredAt ? formatDate(order.deliveredAt) : '—'}
                      </td>
                      <td className="p-3 text-right font-medium">{formatPrice(order.total)}</td>
                      <td className="p-3 text-right text-[var(--muted)]">{order.commissionRate}%</td>
                      <td className="p-3 text-right font-semibold text-red-600">
                        {formatPrice(order.commissionAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-zinc-50/70 font-semibold">
                    <td className="p-3 font-medium" colSpan={2}>
                      Total ({settlement.orders.length} order{settlement.orders.length === 1 ? '' : 's'})
                    </td>
                    <td className="p-3 text-right">{formatPrice(settlement.totalSales)}</td>
                    <td className="p-3 text-right text-[var(--muted)]">{settlement.commissionRate}% avg</td>
                    <td className="p-3 text-right text-amber-600 font-bold">
                      {formatPrice(settlement.totalCommission)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Modal footer / pay button */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {canPay && (
            <Button
              disabled={isPaying}
              onClick={() => onPay(settlement)}
              className="bg-black hover:bg-zinc-800 text-white"
            >
              {isPaying ? (
                <Loader2 size={14} className="animate-spin mr-1.5" />
              ) : (
                <CreditCard size={14} className="mr-1.5" />
              )}
              {isPaying ? 'Processing...' : `Pay ${formatPrice(settlement.totalCommission)}`}
            </Button>
          )}
          {!isPaid && !isCancelled && deadlineInfo.isExpired && (
            <Button variant="outline" disabled className="opacity-60 cursor-not-allowed">
              Payment window expired
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
}
