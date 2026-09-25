import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, CalendarDays, Loader2, ReceiptText, RefreshCw, Wallet, X } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import { extractErrorMessage } from '@/services/api'
import { formatDate, formatDateFull, formatPrice } from '@/lib/utils'
import { isSameValue, notifyNoChanges } from '@/lib/formChanges'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { Skeleton } from '@/components/ui/Skeleton'
import type { Settlement } from '@/types/api'
import { toast } from 'react-hot-toast'

/* Single status badge resolution to avoid duplicates like "PAID Paid" */
const getSettlementBadge = (
  s: Settlement,
): { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'secondary' } => {
  if (s.status === 'CANCELLED') {
    return { label: 'Cancelled', variant: 'default' }
  }
  if (s.status === 'PAID' || s.paymentStatus === 'PAID') {
    return { label: 'Paid', variant: 'success' }
  }
  if (s.paymentStatus === 'FAILED') {
    return { label: 'Payment Failed', variant: 'error' }
  }
  if (s.status === 'PROCESSING') {
    return { label: 'Processing', variant: 'secondary' }
  }
  return { label: 'Pending', variant: 'warning' }
}

/* The backend only accepts YYYY-MM months (see settlement.schema.ts). */
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

const currentMonthKey = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const shortSellerId = (id: string): string => (id.length > 10 ? `${id.slice(0, 10)}…` : id)

export function AdminSettlementsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = (searchParams.get('status') || '').toUpperCase()
  const monthFilter = searchParams.get('month') || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const [showGenerate, setShowGenerate] = useState(false)
  const [generateMonth, setGenerateMonth] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
  const [showCommission, setShowCommission] = useState(false)
  const [commissionRate, setCommissionRate] = useState(10)
  const queryClient = useQueryClient()

  const handleStatusFilterChange = (s: string) => {
    const next = new URLSearchParams(searchParams)
    if (s) {
      next.set('status', s.toLowerCase())
    } else {
      next.delete('status')
    }
    next.delete('page')
    setSearchParams(next)
  }

  const handleMonthFilterChange = (m: string) => {
    const next = new URLSearchParams(searchParams)
    if (m) {
      next.set('month', m)
    } else {
      next.delete('month')
    }
    next.delete('page')
    setSearchParams(next)
  }

  const handlePageChange = (newPage: number) => {
    const next = new URLSearchParams(searchParams)
    if (newPage > 1) {
      next.set('page', String(newPage))
    } else {
      next.delete('page')
    }
    setSearchParams(next)
  }

  const handleClearFilter = () => {
    setSearchParams({})
  }

  const monthFilterValid = monthFilter === '' || MONTH_RE.test(monthFilter)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-settlements', page, statusFilter, monthFilter],
    queryFn: () =>
      adminService.getSettlements({
        page,
        status: statusFilter || undefined,
        month: monthFilter || undefined,
      }),
    enabled: monthFilterValid,
  })

  const { data: commission } = useQuery({
    queryKey: ['commission'],
    queryFn: adminService.getCommission,
  })

  const generate = useMutation({
    mutationFn: (m: string) => adminService.generateSettlement(m),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-settlements'] })
      setShowGenerate(false)
      setGenerateMonth('')
      if (res.message) {
        toast.success(res.message)
      } else {
        const count = res.data?.length ?? 0
        if (count === 0) {
          toast.success('No settlements found')
        } else {
          toast.success(`Generated ${count} settlement(s)`)
        }
      }
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.message || extractErrorMessage(e) || 'Failed to generate settlements'),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => adminService.cancelSettlement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settlements'] })
      queryClient.invalidateQueries({ queryKey: ['admin-settlement-detail'] })
      setConfirmCancelId(null)
      toast.success('Settlement cancelled')
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.message || extractErrorMessage(e) || 'Failed to cancel settlement'),
  })

  const remindMutation = useMutation({
    mutationFn: (id: string) => adminService.remindSettlement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settlements'] })
      queryClient.invalidateQueries({ queryKey: ['admin-settlement-detail'] })
      toast.success('Reminder sent to seller')
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.message || extractErrorMessage(e) || 'Failed to send reminder'),
  })

  const submitGenerate = () => {
    if (generate.isPending) return
    if (!MONTH_RE.test(generateMonth)) {
      toast.error('Enter a valid month in YYYY-MM format')
    } else {
      generate.mutate(generateMonth)
    }
  }

  const updateCommission = useMutation({
    mutationFn: (rate: number) => adminService.updateCommission(rate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission'] })
      setShowCommission(false)
      toast.success('Commission updated')
    },
    onError: (e: any) => toast.error(extractErrorMessage(e) || 'Failed to update commission'),
  })

  const storedCommissionRate = typeof commission?.rate === 'number' ? commission.rate : null
  const submitCommission = () => {
    if (updateCommission.isPending) return
    if (storedCommissionRate === null) {
      toast.error('Commission rate is still loading. Please try again in a moment.')
      return
    }
    if (isSameValue(commissionRate, storedCommissionRate)) {
      notifyNoChanges()
      return
    }
    updateCommission.mutate(commissionRate)
  }

  const openFilters = statusFilter !== '' || monthFilter !== ''

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">Settlements</h1>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => {
              setCommissionRate(commission?.rate ?? 0)
              setShowCommission(true)
            }}
          >
            Commission: {commission?.rate ?? 0}%
          </Button>
          <Button
            onClick={() => {
              setGenerateMonth(monthFilter || currentMonthKey())
              setShowGenerate(true)
            }}
          >
            Generate Settlements
          </Button>
        </div>
      </div>

      {/* Active filter banner with Clear Filter button */}
      {openFilters && (
        <div className="flex items-center justify-between p-3.5 mb-4 rounded-[var(--radius)] bg-amber-50/90 border border-amber-200/90 text-amber-900 text-sm">
          <div className="flex items-center gap-2.5">
            <div className="p-1 rounded-full bg-amber-100 text-amber-800">
              <AlertTriangle size={15} />
            </div>
            <div>
              <span className="font-semibold">Filtered View:</span>{' '}
              <span>
                Showing{' '}
                {statusFilter ? <strong>{statusFilter}</strong> : null}
                {statusFilter && monthFilter ? ' settlements for ' : ''}
                {!statusFilter && monthFilter ? 'settlements for ' : ''}
                {monthFilter ? <strong>{monthFilter}</strong> : ' settlements'}
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearFilter}
            className="h-7 text-xs px-2.5 bg-white hover:bg-amber-100/50 border-amber-300 text-amber-900 cursor-pointer"
          >
            <X size={13} className="mr-1" />
            Clear Filter
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-end">
        {['', 'PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED'].map((s) => (
          <button
            key={s}
            onClick={() => handleStatusFilterChange(s)}
            className={`px-3 py-1 text-sm rounded cursor-pointer transition-colors ${
              statusFilter === s ? 'bg-[var(--primary)] text-white font-medium' : 'bg-zinc-100 hover:bg-zinc-200'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
        <div className="ml-auto flex gap-2 items-end">
          {monthFilter && (
            <Button size="sm" variant="ghost" onClick={() => handleMonthFilterChange('')}>
              Clear month
            </Button>
          )}
          <Input
            type="month"
            aria-label="Filter by month"
            max={currentMonthKey()}
            value={monthFilter}
            onChange={(e) => handleMonthFilterChange(e.target.value)}
            className="w-44"
          />
        </div>
      </div>

      {!monthFilterValid ? (
        <div className="border rounded-lg p-6 text-sm text-[var(--muted)] text-center">
          Enter a valid month (YYYY-MM) to filter.
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {Array(4)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-[var(--radius)]" />
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
      ) : (
        <div className="space-y-3">
          {data?.items?.length === 0 && (
            <EmptyState
              icon={<Wallet size={44} strokeWidth={1.5} />}
              title="No settlements found"
              description={
                openFilters
                  ? 'No settlements found for the selected status or month filter.'
                  : 'Generate settlements for a month to get started.'
              }
            />
          )}
          {data?.items?.map((s) => {
            const badge = getSettlementBadge(s)
            const isPaid = s.status === 'PAID' || s.paymentStatus === 'PAID'
            const isCancelled = s.status === 'CANCELLED'

            return (
              <div key={s.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="font-medium" title={s.sellerId}>
                      Seller {shortSellerId(s.sellerId)}
                    </span>
                    <Badge variant="default">{s.periodKey}</Badge>
                    {/* Single status badge */}
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setDetailId(s.id)}>
                      <ReceiptText size={14} className="mr-1" /> Details
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
                  <div>
                    <span className="text-[var(--muted)]">Total Sales</span>
                    <p className="font-medium">{formatPrice(s.totalSales)}</p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)]">Orders</span>
                    <p className="font-medium">{s.orders?.length ?? 0}</p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)]">Commission Rate</span>
                    <p className="font-medium">{s.commissionRate}%</p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)]">Commission Amount</span>
                    <p className="font-medium text-red-600">{formatPrice(s.totalCommission)}</p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)]" title="Amount seller pays to platform">
                      Settlement Amount
                    </span>
                    <p className="font-bold text-amber-600">{formatPrice(s.totalCommission)}</p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)]">Payment Date</span>
                    <p className="font-medium">{s.paidAt ? formatDate(s.paidAt) : '—'}</p>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-[var(--border)] items-center">
                  {isPaid && s.paidAt ? (
                    <span className="text-xs text-green-700 font-medium">
                      Paid on {formatDateFull(s.paidAt)}
                    </span>
                  ) : isCancelled ? (
                    <span className="text-xs text-[var(--muted)]">Settlement Cancelled</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--muted)]">
                        Awaiting seller payment via Razorpay
                      </span>
                      {!s.reminderSentAt && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={remindMutation.isPending}
                          onClick={() => remindMutation.mutate(s.id)}
                        >
                          {remindMutation.isPending && remindMutation.variables === s.id ? (
                            <Loader2 size={13} className="animate-spin mr-1" />
                          ) : null}
                          Remind
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                        disabled={cancelMutation.isPending}
                        onClick={() => setConfirmCancelId(s.id)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {data && data.total > 0 && (
            <p className="text-xs text-[var(--muted)]">
              {data.total} settlement{data.total === 1 ? '' : 's'}
            </p>
          )}
          {data && <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={handlePageChange} />}
        </div>
      )}

      {/* Generate settlements dialog */}
      <Dialog open={showGenerate} onClose={() => setShowGenerate(false)} title="Generate Settlements">
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            Creates a PENDING settlement for every seller with delivered &amp; paid orders in the selected month.
            Regenerating the same month is safe — existing settlements are kept.
          </p>
          <Input
            label="Month (YYYY-MM)"
            type="month"
            max={currentMonthKey()}
            placeholder="2026-08"
            value={generateMonth}
            onChange={(e) => setGenerateMonth(e.target.value)}
          />
          <Button
            className="w-full"
            onClick={submitGenerate}
            disabled={generate.isPending || !MONTH_RE.test(generateMonth)}
          >
            {generate.isPending ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
            {generate.isPending ? 'Generating...' : 'Generate Settlements'}
          </Button>
        </div>
      </Dialog>

      {/* Commission rate */}
      <Dialog open={showCommission} onClose={() => setShowCommission(false)} title="Commission Rate">
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            Applied to future settlements only — existing settlements keep the rate they were generated with.
          </p>
          <Input
            label="Commission %"
            type="number"
            min={0}
            max={100}
            value={commissionRate}
            onChange={(e) => setCommissionRate(Number(e.target.value))}
          />
          <Button
            className="w-full"
            onClick={submitCommission}
            disabled={updateCommission.isPending || storedCommissionRate === null}
          >
            {updateCommission.isPending ? 'Updating...' : 'Update'}
          </Button>
        </div>
      </Dialog>

      {/* Confirmation for cancel */}
      <Dialog open={!!confirmCancelId} onClose={() => setConfirmCancelId(null)} title="Cancel Settlement">
        <div className="space-y-3">
          <p className="text-sm">
            Are you sure you want to cancel this settlement? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmCancelId(null)}>
              Close
            </Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={() => confirmCancelId && cancelMutation.mutate(confirmCancelId)}
            >
              {cancelMutation.isPending ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
              {cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancel'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Settlement Details Dialog */}
      <SettlementDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </div>
  )
}

function SettlementDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: settlement, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-settlement-detail', id],
    queryFn: () => adminService.getSettlement(id!),
    enabled: !!id,
  })

  const badge = settlement ? getSettlementBadge(settlement) : null

  return (
    <Dialog
      open={!!id}
      onClose={onClose}
      title={settlement ? `Settlement — ${settlement.periodKey}` : 'Settlement details'}
      className="max-w-3xl"
    >
      {isLoading ? (
        <div className="space-y-3">
          {Array(4)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
        </div>
      ) : isError || !settlement ? (
        <div className="text-center py-6">
          <p className="text-sm text-red-600 mb-3">
            {extractErrorMessage(error) || 'Failed to load settlement details.'}
          </p>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className="mr-2" /> Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm" title={settlement.sellerId}>
              Seller {shortSellerId(settlement.sellerId)}
            </span>
            <Badge variant="default">{settlement.periodKey}</Badge>
            {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
            <span className="text-xs text-[var(--muted)] ml-auto">
              {formatDate(settlement.periodStart)} – {formatDate(settlement.periodEnd)}
            </span>
          </div>

          {/* Settlement Information */}
          <div className="rounded-lg border p-4 bg-zinc-50/50 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Settlement Information
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
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
                <span className="text-[var(--muted)] text-xs" title="Amount seller needs to pay to platform">
                  Settlement Amount
                </span>
                <p className="font-bold text-amber-600">{formatPrice(settlement.totalCommission)}</p>
                <span className="text-[10px] text-[var(--muted)] block">Payable by seller</span>
              </div>
              <div>
                <span className="text-[var(--muted)] text-xs">Settlement Status</span>
                <p className="font-semibold">{badge?.label ?? settlement.status}</p>
              </div>
            </div>
          </div>

          {/* Payment Information */}
          <div className="rounded-lg border p-4 bg-zinc-50/50 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Payment Information
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
              <div>
                <span className="text-[var(--muted)] text-xs">Payment Status</span>
                <p className="font-semibold">{badge?.label ?? 'Pending'}</p>
              </div>
              <div>
                <span className="text-[var(--muted)] text-xs">Razorpay Order ID</span>
                <p className="font-mono text-xs font-medium break-all">{settlement.razorpayOrderId || '—'}</p>
              </div>
              <div>
                <span className="text-[var(--muted)] text-xs">Razorpay Payment ID</span>
                <p className="font-mono text-xs font-medium break-all">{settlement.razorpayPaymentId || '—'}</p>
              </div>
              <div>
                <span className="text-[var(--muted)] text-xs">Payment Method</span>
                <p className="font-medium">
                  {settlement.paymentMethod || (settlement.status === 'PAID' ? 'MANUAL' : '—')}
                </p>
              </div>
              <div>
                <span className="text-[var(--muted)] text-xs">Payment Date</span>
                <p className="font-semibold">
                  {settlement.paidAt ? formatDateFull(settlement.paidAt) : '—'}
                </p>
              </div>
            </div>
          </div>

          <div className="text-xs text-[var(--muted)] space-y-1">
            <p className="flex items-center gap-1.5">
              <CalendarDays size={13} />
              Generated on <span className="font-medium text-[var(--fg)]">{formatDate(settlement.createdAt)}</span>
            </p>
            {settlement.reminderSentAt && (
              <p className="flex items-center gap-1.5">
                <CalendarDays size={13} />
                <span>
                  Last reminder sent on{' '}
                  <span className="font-medium text-[var(--fg)]">{formatDate(settlement.reminderSentAt)}</span>
                </span>
              </p>
            )}
          </div>

          {!settlement.orders?.length ? (
            <p className="text-sm text-[var(--muted)] py-6 text-center">No orders are part of this settlement.</p>
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
                      <td className="p-3 text-[var(--muted)]">{order.deliveredAt ? formatDate(order.deliveredAt) : '—'}</td>
                      <td className="p-3 text-right font-medium">{formatPrice(order.total)}</td>
                      <td className="p-3 text-right text-[var(--muted)]">{order.commissionRate}%</td>
                      <td className="p-3 text-right font-semibold text-red-600">{formatPrice(order.commissionAmount)}</td>
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
                    <td className="p-3 text-right text-amber-600 font-bold">{formatPrice(settlement.totalCommission)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
