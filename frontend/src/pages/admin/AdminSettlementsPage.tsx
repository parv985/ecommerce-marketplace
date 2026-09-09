import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CalendarDays, Loader2, ReceiptText, RefreshCw, Wallet } from 'lucide-react'
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
import type { Settlement, SettlementStatus } from '@/types/api'
import { toast } from 'react-hot-toast'

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error' | 'secondary'> = {
  PENDING: 'warning', PROCESSING: 'secondary', PAID: 'success', FAILED: 'error', CANCELLED: 'default',
}

/* The backend only accepts YYYY-MM months (see settlement.schema.ts). */
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

type SettlementAction = 'process' | 'retry' | 'markPaid' | 'fail' | 'cancel' | 'remind'

const currentMonthKey = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const shortSellerId = (id: string): string => (id.length > 10 ? `${id.slice(0, 10)}…` : id)

/*
 * Allowed status transitions mirror the backend lifecycle exactly
 * (settlement.service.ts TRANSITIONS): PENDING → PROCESSING | CANCELLED,
 * PROCESSING → PAID | FAILED, FAILED → PROCESSING | CANCELLED.
 */
const actionConfig: Record<SettlementAction, { label: string; nextStatus: SettlementStatus | null; confirm?: boolean; variant?: 'default' | 'outline' | 'destructive' | 'ghost' }> = {
  process: { label: 'Process', nextStatus: 'PROCESSING' },
  retry: { label: 'Retry', nextStatus: 'PROCESSING' },
  markPaid: { label: 'Mark Paid', nextStatus: 'PAID' },
  fail: { label: 'Fail', nextStatus: 'FAILED', confirm: true, variant: 'destructive' },
  cancel: { label: 'Cancel', nextStatus: 'CANCELLED', confirm: true, variant: 'outline' },
  remind: { label: 'Remind', nextStatus: null, variant: 'ghost' },
}

const successMessages: Record<SettlementAction, string> = {
  process: 'Processing started',
  retry: 'Retry started',
  markPaid: 'Marked as paid',
  fail: 'Marked as failed',
  cancel: 'Settlement cancelled',
  remind: 'Reminder sent to seller',
}

const actionsForStatus = (status: SettlementStatus): SettlementAction[] => {
  switch (status) {
    case 'PENDING': return ['process', 'cancel']
    case 'PROCESSING': return ['markPaid', 'fail']
    case 'FAILED': return ['retry', 'cancel']
    default: return []
  }
}

export function AdminSettlementsPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [showGenerate, setShowGenerate] = useState(false)
  const [generateMonth, setGenerateMonth] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ id: string; action: 'fail' | 'cancel' } | null>(null)
  const [showCommission, setShowCommission] = useState(false)
  const [commissionRate, setCommissionRate] = useState(10)
  const queryClient = useQueryClient()

  const monthFilterValid = monthFilter === '' || MONTH_RE.test(monthFilter)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-settlements', page, statusFilter, monthFilter],
    queryFn: () => adminService.getSettlements({
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
      if (!res?.data?.length) {
        toast('No eligible delivered & paid orders found for this month. Nothing was generated.')
      } else {
        toast.success(`Settlements generated for ${res.data.length} seller${res.data.length === 1 ? '' : 's'}`)
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.message || extractErrorMessage(e) || 'Failed to generate settlements'),
  })

  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: SettlementAction }) => {
      switch (action) {
        case 'process':
        case 'retry': return adminService.processSettlement(id)
        case 'markPaid': return adminService.markSettlementPaid(id)
        case 'fail': return adminService.failSettlement(id)
        case 'cancel': return adminService.cancelSettlement(id)
        case 'remind': return adminService.remindSettlement(id)
      }
    },
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-settlements'] })
      queryClient.invalidateQueries({ queryKey: ['admin-settlement-detail'] })
      setConfirm(null)
      toast.success(successMessages[variables.action])
    },
    onError: (e: any) => toast.error(e.response?.data?.message || extractErrorMessage(e) || 'Action failed'),
  })

  /* Status updates are updates too: when the settlement already carries the
     target status (stale list or a double click), show the shared message and
     skip the request instead of re-POSTing the same transition. */
  const runAction = (settlement: Settlement, action: SettlementAction) => {
    if (transition.isPending) return
    const config = actionConfig[action]
    const live = data?.items?.find(s => s.id === settlement.id)
    if (config.nextStatus) {
      if (live && live.status === config.nextStatus) {
        notifyNoChanges()
        return
      }
    } else if (action === 'remind' && live?.reminderSentAt) {
      /* Reminder was already sent for this settlement — don't re-notify. */
      notifyNoChanges()
      return
    }
    if (config.confirm) {
      setConfirm({ id: settlement.id, action: action as 'fail' | 'cancel' })
      return
    }
    transition.mutate({ id: settlement.id, action })
  }

  const submitGenerate = () => {
    if (generate.isPending) return
    if (!MONTH_RE.test(generateMonth)) {
      toast.error('Enter a valid month in YYYY-MM format')
      return
    }
    generate.mutate(generateMonth)
  }

  const updateCommission = useMutation({
    mutationFn: (rate: number) => adminService.updateCommission(rate),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['commission'] }); setShowCommission(false); toast.success('Commission updated') },
  })

  /*
   * The dialog is pre-filled with the stored rate, so submitting it untouched is
   * a no-op: show "No changes to update." and skip the PATCH entirely.
   */
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
          <Button variant="outline" onClick={() => { setCommissionRate(commission?.rate ?? 0); setShowCommission(true); }}>
            Commission: {commission?.rate ?? 0}%
          </Button>
          <Button onClick={() => setShowGenerate(true)}>Generate Settlements</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-end">
        {['', 'PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED'].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1 text-sm rounded ${statusFilter === s ? 'bg-[var(--primary)] text-white' : 'bg-zinc-100 hover:bg-zinc-200'}`}>
            {s || 'All'}
          </button>
        ))}
        <div className="ml-auto flex gap-2 items-end">
          {monthFilter && (
            <Button size="sm" variant="ghost" onClick={() => setMonthFilter('')}>Clear month</Button>
          )}
          <Input
            type="month"
            aria-label="Filter by month"
            max={currentMonthKey()}
            value={monthFilter}
            onChange={e => { setMonthFilter(e.target.value); setPage(1) }}
            className="w-44"
          />
        </div>
      </div>

      {!monthFilterValid ? (
        <div className="border rounded-lg p-6 text-sm text-[var(--muted)] text-center">Enter a valid month (YYYY-MM) to filter.</div>
      ) : isLoading ? (
        <div className="space-y-3">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-28 rounded-[var(--radius)]" />)}
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
              title={openFilters ? 'No settlements match these filters' : 'No settlements found'}
              description={openFilters
                ? 'Try clearing the status or month filter to see more settlements.'
                : 'Generate settlements for a month to get started.'}
            />
          )}
          {data?.items?.map(s => (
            <div key={s.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-medium" title={s.sellerId}>Seller {shortSellerId(s.sellerId)}</span>
                  <Badge variant="default">{s.periodKey}</Badge>
                  <Badge variant={statusColors[s.status] ?? 'default'}>{s.status}</Badge>
                </div>
                <div className="flex gap-1">
                  {!['PAID', 'CANCELLED'].includes(s.status) && (
                    <Button size="sm" variant="ghost" disabled={transition.isPending} onClick={() => runAction(s, 'remind')}>
                      Remind
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setDetailId(s.id)}>
                    <ReceiptText size={14} className="mr-1" /> Details
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
                <div>
                  <span className="text-[var(--muted)]">Sales</span>
                  <p className="font-medium">{formatPrice(s.totalSales)}</p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">Orders</span>
                  <p className="font-medium">{s.orders?.length ?? 0}</p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">Commission ({s.commissionRate}%)</span>
                  <p className="font-medium text-red-600">{formatPrice(s.totalCommission)}</p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">Net Payout</span>
                  <p className="font-bold">{formatPrice(s.totalPayable)}</p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">Paid Date</span>
                  <p className="font-medium">{s.paidAt ? formatDate(s.paidAt) : '—'}</p>
                </div>
              </div>
              <div className="flex justify-end gap-1 mt-3 pt-3 border-t border-[var(--border)]">
                {actionsForStatus(s.status).length === 0 ? (
                  <span className="text-xs text-[var(--muted)] self-center">
                    {s.status === 'PAID' && s.paidAt ? `Paid on ${formatDateFull(s.paidAt)}` : 'No further actions available'}
                  </span>
                ) : actionsForStatus(s.status).map(action => {
                  const cfg = actionConfig[action]
                  return (
                    <Button key={action} size="sm" variant={cfg.variant || 'default'} disabled={transition.isPending} onClick={() => runAction(s, action)}>
                      {transition.isPending && transition.variables?.id === s.id && transition.variables?.action === action && (
                        <Loader2 size={14} className="animate-spin mr-1" />
                      )}
                      {cfg.label}
                    </Button>
                  )
                })}
              </div>
            </div>
          ))}
          {data && data.total > 0 && (
            <p className="text-xs text-[var(--muted)]">{data.total} settlement{data.total === 1 ? '' : 's'}</p>
          )}
          {data && <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} />}
        </div>
      )}

      {/* Generate settlements */}
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
            onChange={e => setGenerateMonth(e.target.value)}
          />
          <Button className="w-full" onClick={submitGenerate} disabled={generate.isPending || !MONTH_RE.test(generateMonth)}>
            {generate.isPending ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
            {generate.isPending ? 'Generating...' : 'Generate'}
          </Button>
        </div>
      </Dialog>

      {/* Commission rate */}
      <Dialog open={showCommission} onClose={() => setShowCommission(false)} title="Commission Rate">
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            Applied to future settlements only — existing settlements keep the rate they were generated with.
          </p>
          <Input label="Commission %" type="number" min={0} max={100} value={commissionRate} onChange={e => setCommissionRate(Number(e.target.value))} />
          <Button className="w-full" onClick={submitCommission} disabled={updateCommission.isPending || storedCommissionRate === null}>
            {updateCommission.isPending ? 'Updating...' : 'Update'}
          </Button>
        </div>
      </Dialog>

      {/* Confirmation for fail/cancel */}
      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.action === 'fail' ? 'Fail Settlement' : 'Cancel Settlement'}>
        <div className="space-y-3">
          <p className="text-sm">
            {confirm?.action === 'fail'
              ? 'Mark this settlement as FAILED? A failed settlement can be retried back to PROCESSING later.'
              : 'Cancel this settlement? This is permanent — a cancelled settlement cannot be processed.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)}>Close</Button>
            <Button
              variant={confirm?.action === 'cancel' ? 'destructive' : 'default'}
              disabled={transition.isPending}
              onClick={() => confirm && transition.mutate({ id: confirm.id, action: confirm.action })}
            >
              {transition.isPending ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
              {transition.isPending ? 'Updating...' : 'Confirm'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Settlement / order breakdown */}
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

  return (
    <Dialog open={!!id} onClose={onClose} title={settlement ? `Settlement — ${settlement.periodKey}` : 'Settlement details'} className="max-w-3xl">
      {isLoading ? (
        <div className="space-y-3">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : isError || !settlement ? (
        <div className="text-center py-6">
          <p className="text-sm text-red-600 mb-3">{extractErrorMessage(error) || 'Failed to load settlement details.'}</p>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className="mr-2" /> Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={statusColors[settlement.status] ?? 'default'}>{settlement.status}</Badge>
            <span className="text-xs text-[var(--muted)]" title={settlement.sellerId}>Seller {shortSellerId(settlement.sellerId)}</span>
            <span className="text-xs text-[var(--muted)] ml-auto">
              {formatDate(settlement.periodStart)} – {formatDate(settlement.periodEnd)}
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
            <div><span className="text-[var(--muted)]">Total Sales</span><p className="font-semibold">{formatPrice(settlement.totalSales)}</p></div>
            <div><span className="text-[var(--muted)]">Total Orders</span><p className="font-semibold">{settlement.orders?.length ?? 0}</p></div>
            <div><span className="text-[var(--muted)]">Commission ({settlement.commissionRate}%)</span><p className="font-semibold text-red-600">{formatPrice(settlement.totalCommission)}</p></div>
            <div><span className="text-[var(--muted)]">Net Payout</span><p className="font-bold">{formatPrice(settlement.totalPayable)}</p></div>
            <div>
              <span className="text-[var(--muted)]">Paid Date</span>
              <p className="font-semibold">{settlement.paidAt ? formatDate(settlement.paidAt) : '—'}</p>
            </div>
          </div>

          <div className="text-xs text-[var(--muted)] space-y-1">
            <p className="flex items-center gap-1.5">
              <CalendarDays size={13} />
              Generated on <span className="font-medium text-[var(--fg)]">{formatDate(settlement.createdAt)}</span>
            </p>
            <p className="flex items-center gap-1.5">
              <CalendarDays size={13} />
              {settlement.paidAt
                ? <>Paid on <span className="font-medium text-[var(--fg)]">{formatDateFull(settlement.paidAt)}</span></>
                : 'Not yet paid'}
              {settlement.reminderSentAt && (
                <span className="text-[var(--muted)]">• Last reminder {formatDate(settlement.reminderSentAt)}</span>
              )}
            </p>
          </div>

          {!settlement.orders?.length ? (
            <p className="text-sm text-[var(--muted)] py-6 text-center">No orders are part of this settlement.</p>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium">Order</th>
                    <th className="text-left p-3 font-medium">Delivered</th>
                    <th className="text-right p-3 font-medium">Order Total</th>
                    <th className="text-right p-3 font-medium">Commission</th>
                    <th className="text-right p-3 font-medium">Seller Payable</th>
                  </tr>
                </thead>
                <tbody>
                  {settlement.orders.map(order => (
                    <tr key={order.orderId} className="border-b">
                      <td className="p-3 font-medium text-[var(--fg)]">#{order.orderNumber}</td>
                      <td className="p-3 text-[var(--muted)]">{order.deliveredAt ? formatDate(order.deliveredAt) : '—'}</td>
                      <td className="p-3 text-right font-medium">{formatPrice(order.total)}</td>
                      <td className="p-3 text-right text-red-600">
                        {formatPrice(order.commissionAmount)}
                        <span className="text-xs text-[var(--muted)]"> ({order.commissionRate}%)</span>
                      </td>
                      <td className="p-3 text-right font-semibold text-green-600">{formatPrice(order.sellerPayable)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-zinc-50/70">
                    <td className="p-3 font-medium" colSpan={2}>Total ({settlement.orders.length} order{settlement.orders.length === 1 ? '' : 's'})</td>
                    <td className="p-3 text-right font-semibold">{formatPrice(settlement.totalSales)}</td>
                    <td className="p-3 text-right font-semibold text-red-600">{formatPrice(settlement.totalCommission)}</td>
                    <td className="p-3 text-right font-bold text-green-600">{formatPrice(settlement.totalPayable)}</td>
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
