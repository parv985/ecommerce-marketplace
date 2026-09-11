import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { returnService } from '@/services/return.service'
import { extractErrorMessage } from '@/services/api'
import { formatDate, formatDateFull } from '@/lib/utils'
import { invalidateSellerData } from '@/lib/sellerData'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Dialog } from '@/components/ui/Dialog'
import { TextArea } from '@/components/ui/TextArea'
import {
  refundMethodLabels,
  refundStatusLabels,
  returnStatusColors,
  returnStatusLabels,
  getSellerReturnActions,
} from '@/lib/returnStatus'
import { formatPrice } from '@/lib/utils'
import type { ReturnRequest, ReturnStatus } from '@/types/api'

const STATUS_FILTERS: Array<{ value: '' | ReturnStatus; label: string }> = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'COMPLETED', label: 'Completed' },
]

export function SellerReturnsPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<'' | ReturnStatus>('')
  const [selected, setSelected] = useState<ReturnRequest | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['seller-returns', { page, status }],
    queryFn: () =>
      returnService.list({
        page,
        limit: 10,
        status: status || undefined,
      }),
  })

  const updateStatus = useMutation({
    mutationFn: ({
      id,
      nextStatus,
      reason,
    }: {
      id: string
      nextStatus: 'APPROVED' | 'REJECTED' | 'COMPLETED'
      reason?: string
    }) => returnService.updateStatus(id, { status: nextStatus, reason }),
    onSuccess: (res) => {
      /*
       * A return decision moves far more than the returns list: approving
       * refunds the buyer (revenue drops), marks the order RETURNED,
       * restores stock and reverses the settlement; completing can also
       * credit stock. Invalidate every derived cache so dashboard,
       * orders, analytics, customers, settlement and inventory all show
       * the post-return database state.
       */
      invalidateSellerData(queryClient, { inventory: true })
      toast.success(res.message || 'Return updated')
      setSelected((prev) => (prev && res.data ? res.data : prev))
      setRejectOpen(false)
      setRejectReason('')
      setRejectError(null)
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err)),
  })

  const handleAction = (
    ret: ReturnRequest,
    nextStatus: 'APPROVED' | 'REJECTED' | 'COMPLETED',
    requiresReason?: boolean,
  ) => {
    /*
     * Approving is the money event: the buyer is refunded, the stock
     * comes back and the order leaves the seller's settlement. Ask
     * before doing it.
     */
    if (nextStatus === 'APPROVED') {
      const confirmed = window.confirm(
        'Approve this return? The buyer is refunded the full paid amount, the stock returns to your inventory and the order is reversed out of your settlement.',
      )
      if (!confirmed) return
      updateStatus.mutate({ id: ret.id, nextStatus })
      return
    }

    if (requiresReason) {
      setSelected(ret)
      setRejectOpen(true)
      setRejectReason('')
      setRejectError(null)
      return
    }
    updateStatus.mutate({ id: ret.id, nextStatus })
  }

  const submitReject = () => {
    if (!selected) return
    const reason = rejectReason.trim()
    if (!reason) {
      setRejectError('A reason is required when rejecting a return')
      return
    }
    if (reason.length > 500) {
      setRejectError('Reason cannot exceed 500 characters')
      return
    }
    updateStatus.mutate({
      id: selected.id,
      nextStatus: 'REJECTED',
      reason,
    })
  }

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-[var(--border)]">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">Returns</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Review and process return requests from buyers
        </p>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.value || 'all'}
            onClick={() => {
              setStatus(s.value)
              setPage(1)
            }}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              status === s.value
                ? 'bg-[var(--primary)] text-white'
                : 'bg-zinc-100 hover:bg-zinc-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12">
          <p className="text-sm text-red-700">
            {extractErrorMessage(error) || 'Failed to load returns'}
          </p>
        </div>
      ) : !data?.items?.length ? (
        <EmptyState
          icon={<RotateCcw size={48} strokeWidth={1.5} />}
          title="No return requests"
          description={
            status
              ? `No returns with status ${returnStatusLabels[status]}`
              : "Buyers haven't requested any returns yet"
          }
        />
      ) : (
        <div className="space-y-3">
          {data.items.map((ret) => {
            const actions = getSellerReturnActions(ret.status)
            return (
              <div
                key={ret.id}
                className="border border-[var(--border)] rounded-lg p-4 bg-white"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelected(ret)}
                      className="font-medium text-sm hover:underline text-left"
                    >
                      Return #{ret.id.slice(-8).toUpperCase()}
                    </button>
                    <span className="text-xs text-[var(--muted)] ml-2">
                      {formatDate(ret.createdAt)}
                    </span>
                    <p className="text-xs text-[var(--muted)] mt-1">
                      Order: {ret.orderId.slice(-8).toUpperCase()}
                    </p>
                  </div>
                  <Badge variant={returnStatusColors[ret.status]}>
                    {returnStatusLabels[ret.status]}
                  </Badge>
                </div>
                <p className="text-sm text-[var(--fg-secondary)] line-clamp-2 mb-3">
                  {ret.reason}
                </p>
                {ret.statusReason && (
                  <p className="text-xs text-rose-700 mb-3">
                    Rejection reason: {ret.statusReason}
                  </p>
                )}
                {actions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {actions.map((action) => (
                      <Button
                        key={action.status}
                        size="sm"
                        variant={action.variant ?? 'outline'}
                        disabled={updateStatus.isPending}
                        onClick={() =>
                          handleAction(ret, action.status, action.requiresReason)
                        }
                      >
                        {updateStatus.isPending ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          action.label
                        )}
                      </Button>
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => setSelected(ret)}>
                      Details
                    </Button>
                  </div>
                )}
                {actions.length === 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setSelected(ret)}>
                    View details
                  </Button>
                )}
              </div>
            )
          })}
          <Pagination
            currentPage={page}
            totalPages={data.totalPages}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Detail dialog */}
      <Dialog
        open={!!selected && !rejectOpen}
        onClose={() => setSelected(null)}
        title={
          selected
            ? `Return #${selected.id.slice(-8).toUpperCase()}`
            : 'Return details'
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--muted)]">
                {formatDateFull(selected.createdAt)}
              </span>
              <Badge variant={returnStatusColors[selected.status]}>
                {returnStatusLabels[selected.status]}
              </Badge>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">
                Buyer reason
              </p>
              <p className="text-sm whitespace-pre-wrap">{selected.reason}</p>
            </div>
            {selected.statusReason && (
              <div className="p-3 rounded-[var(--radius)] bg-rose-50 border border-rose-200">
                <p className="text-xs font-semibold text-rose-800 uppercase tracking-wider mb-1">
                  Rejection reason
                </p>
                <p className="text-sm text-rose-900">{selected.statusReason}</p>
              </div>
            )}
            {selected.refund && (
              <div className="p-3 rounded-[var(--radius)] bg-emerald-50 border border-emerald-200">
                <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider mb-1">
                  Refund
                </p>
                <p className="text-sm text-emerald-900">
                  {formatPrice(selected.refund.amount)} ·{' '}
                  {refundStatusLabels[selected.refund.status]}
                </p>
                <p className="text-xs text-emerald-800 mt-1">
                  {refundMethodLabels[selected.refund.method]}
                </p>
              </div>
            )}
            <dl className="grid grid-cols-2 gap-2 text-sm border-t border-[var(--border)] pt-3">
              <div>
                <dt className="text-xs text-[var(--muted)]">Order ID</dt>
                <dd className="font-medium text-xs break-all">{selected.orderId}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Last updated</dt>
                <dd className="text-xs">{formatDateFull(selected.updatedAt)}</dd>
              </div>
            </dl>
            {getSellerReturnActions(selected.status).length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]">
                {getSellerReturnActions(selected.status).map((action) => (
                  <Button
                    key={action.status}
                    size="sm"
                    variant={action.variant ?? 'outline'}
                    disabled={updateStatus.isPending}
                    onClick={() =>
                      handleAction(selected, action.status, action.requiresReason)
                    }
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* Reject reason dialog */}
      <Dialog
        open={rejectOpen}
        onClose={() => {
          if (updateStatus.isPending) return
          setRejectOpen(false)
          setRejectReason('')
          setRejectError(null)
        }}
        title="Reject return request"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--muted)]">
            Please provide a reason for rejecting this return. The buyer will see this message.
          </p>
          <TextArea
            label="Rejection reason *"
            placeholder="Explain why this return cannot be accepted…"
            value={rejectReason}
            onChange={(e) => {
              setRejectReason(e.target.value)
              setRejectError(null)
            }}
            maxLength={500}
            rows={4}
            error={rejectError ?? undefined}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={updateStatus.isPending}
              onClick={() => {
                setRejectOpen(false)
                setRejectReason('')
                setRejectError(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={updateStatus.isPending}
              onClick={submitReject}
            >
              {updateStatus.isPending ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  Rejecting…
                </>
              ) : (
                'Reject Return'
              )}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
