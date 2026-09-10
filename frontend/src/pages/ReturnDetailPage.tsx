import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, RotateCcw, Package } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { returnService } from '@/services/return.service'
import { orderService } from '@/services/order.service'
import { extractErrorMessage } from '@/services/api'
import { formatDateFull, formatPrice } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  returnStatusColors,
  returnStatusLabels,
  isReturnCancellable,
} from '@/lib/returnStatus'

export function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const {
    data: returnRequest,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['return', id],
    queryFn: () => returnService.getById(id!),
    enabled: !!id,
  })

  const { data: order } = useQuery({
    queryKey: ['order', returnRequest?.orderId],
    queryFn: () => orderService.getById(returnRequest!.orderId),
    enabled: !!returnRequest?.orderId,
  })

  const cancelReturn = useMutation({
    mutationFn: () => returnService.cancel(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['return', id] })
      queryClient.invalidateQueries({ queryKey: ['returns'] })
      toast.success('Return request cancelled')
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err)),
  })

  if (isLoading) {
    return (
      <div className="container-app py-8 space-y-4">
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )
  }

  if (isError || !returnRequest) {
    return (
      <div className="container-app py-20 text-center">
        <p className="text-sm text-red-700 mb-4">
          {extractErrorMessage(error) || 'Return request not found'}
        </p>
        <Link to="/returns" className="text-sm text-[var(--primary)] hover:underline">
          Back to returns
        </Link>
      </div>
    )
  }

  const canCancel = isReturnCancellable(returnRequest.status)

  return (
    <div className="container-app py-8">
      <Link
        to="/returns"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)] mb-6 font-medium transition-colors"
      >
        <ArrowLeft size={16} /> Back to returns
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Return #{returnRequest.id.slice(-8).toUpperCase()}
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Requested on {formatDateFull(returnRequest.createdAt)}
          </p>
        </div>
        <Badge variant={returnStatusColors[returnRequest.status]} className="self-start sm:self-auto">
          {returnStatusLabels[returnRequest.status]}
        </Badge>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Reason */}
          <div className="border border-[var(--border)] rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2 mb-3">
              <RotateCcw size={16} className="text-[var(--primary)]" />
              <h2 className="font-semibold">Return Reason</h2>
            </div>
            <p className="text-sm text-[var(--fg)] whitespace-pre-wrap">{returnRequest.reason}</p>
            {returnRequest.statusReason && (
              <div className="mt-4 p-3 rounded-[var(--radius)] bg-rose-50 border border-rose-200">
                <p className="text-xs font-semibold text-rose-800 uppercase tracking-wider mb-1">
                  Seller response
                </p>
                <p className="text-sm text-rose-900">{returnRequest.statusReason}</p>
              </div>
            )}
          </div>

          {/* Linked order items */}
          {order && (
            <div className="border border-[var(--border)] rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-sm)]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-[var(--primary)]" />
                  <h2 className="font-semibold">Order Items</h2>
                </div>
                <Link
                  to={`/orders/${order.id}`}
                  className="text-xs font-medium text-[var(--primary)] hover:underline"
                >
                  View order #{order.orderNumber}
                </Link>
              </div>
              {order.items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 py-3 border-b last:border-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {item.image && (
                      <img
                        src={item.image}
                        alt=""
                        loading="lazy"
                        className="w-12 h-12 rounded object-cover border border-[var(--border)]"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        Qty: {item.quantity} · {formatPrice(item.subtotal)}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-medium shrink-0">{formatPrice(item.subtotal)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Lifecycle info */}
          <div className="border border-[var(--border)] rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-sm)]">
            <h2 className="font-semibold mb-3">Status Timeline</h2>
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-[var(--primary)] mt-1.5 shrink-0" />
                <div>
                  <p className="font-medium">Requested</p>
                  <p className="text-xs text-[var(--muted)]">
                    {formatDateFull(returnRequest.createdAt)}
                  </p>
                </div>
              </div>
              {returnRequest.status !== 'PENDING' && (
                <div className="flex gap-3">
                  <div
                    className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      returnRequest.status === 'REJECTED' || returnRequest.status === 'CANCELLED'
                        ? 'bg-rose-500'
                        : 'bg-emerald-500'
                    }`}
                  />
                  <div>
                    <p className="font-medium">{returnStatusLabels[returnRequest.status]}</p>
                    <p className="text-xs text-[var(--muted)]">
                      Updated {formatDateFull(returnRequest.updatedAt)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="border border-[var(--border)] rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-sm)]">
            <h2 className="font-semibold mb-3">Details</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Status</dt>
                <dd>
                  <Badge variant={returnStatusColors[returnRequest.status]}>
                    {returnStatusLabels[returnRequest.status]}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Order</dt>
                <dd className="font-medium truncate">
                  {order ? (
                    <Link to={`/orders/${order.id}`} className="text-[var(--primary)] hover:underline">
                      #{order.orderNumber}
                    </Link>
                  ) : (
                    returnRequest.orderId.slice(-8).toUpperCase()
                  )}
                </dd>
              </div>
              {order && (
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--muted)]">Order total</dt>
                  <dd className="font-medium">{formatPrice(order.total)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Last updated</dt>
                <dd className="text-right text-xs">
                  {formatDateFull(returnRequest.updatedAt)}
                </dd>
              </div>
            </dl>
          </div>

          {canCancel && (
            <div className="space-y-2">
              <Button
                variant="destructive"
                className="w-full"
                disabled={cancelReturn.isPending}
                onClick={() => {
                  if (window.confirm('Cancel this return request? You can request again within the return window.')) {
                    cancelReturn.mutate()
                  }
                }}
              >
                {cancelReturn.isPending ? 'Cancelling…' : 'Cancel Return'}
              </Button>
              <p className="text-[11px] text-[var(--muted)] text-center">
                You can only cancel while the request is still pending.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
