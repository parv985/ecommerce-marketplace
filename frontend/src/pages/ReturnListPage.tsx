import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { returnService } from '@/services/return.service'
import { extractErrorMessage } from '@/services/api'
import { formatDate, formatPrice } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  isReturnRefunded,
  returnStatusColors,
  returnStatusLabels,
} from '@/lib/returnStatus'
import type { ReturnStatus } from '@/types/api'

const STATUS_FILTERS: Array<{ value: '' | ReturnStatus; label: string }> = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'COMPLETED', label: 'Completed' },
]

export function ReturnListPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<'' | ReturnStatus>('')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['returns', { page, status }],
    queryFn: () =>
      returnService.list({
        page,
        limit: 10,
        status: status || undefined,
      }),
  })

  if (isLoading) {
    return (
      <div className="container-app py-8 space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-[var(--radius-lg)]" />
        ))}
      </div>
    )
  }

  return (
    <div className="container-app py-8">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">My Returns</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Track return requests for your delivered orders
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.value || 'all'}
            onClick={() => {
              setStatus(s.value)
              setPage(1)
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[var(--radius)] transition-all ${
              status === s.value
                ? 'bg-[var(--primary)] text-white shadow-sm'
                : 'bg-white border border-[var(--border)] text-[var(--fg-secondary)] hover:bg-[var(--accent)] hover:text-[var(--fg)]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {isError ? (
        <div className="text-center py-16">
          <p className="text-sm text-red-700">
            {extractErrorMessage(error) || 'Failed to load return requests'}
          </p>
        </div>
      ) : !data?.items?.length ? (
        <EmptyState
          icon={<RotateCcw size={48} strokeWidth={1.5} />}
          title="No return requests"
          description={
            status
              ? `No returns with status ${returnStatusLabels[status]}`
              : "You haven't requested any returns yet"
          }
          action={{ label: 'View Orders', onClick: () => navigate('/orders') }}
        />
      ) : (
        <div className="space-y-3.5">
          {data.items.map((ret) => (
            <Link
              to={`/returns/${ret.id}`}
              key={ret.id}
              className="block border border-[var(--border)] rounded-[var(--radius-lg)] p-4.5 bg-white hover:border-neutral-400 hover:shadow-[var(--shadow-sm)] transition-all"
            >
              <div className="flex items-center justify-between mb-2 gap-3">
                <div className="min-w-0">
                  <span className="font-semibold text-sm text-[var(--fg)]">
                    Return #{ret.id.slice(-8).toUpperCase()}
                  </span>
                  <span className="text-xs text-[var(--muted)] ml-2.5">
                    {formatDate(ret.createdAt)}
                  </span>
                </div>
                <Badge variant={returnStatusColors[ret.status]}>
                  {returnStatusLabels[ret.status]}
                </Badge>
              </div>
              <p className="text-xs text-[var(--fg-secondary)] line-clamp-2">{ret.reason}</p>
              <div className="flex items-center justify-between gap-3 mt-2">
                <p className="text-[11px] text-[var(--muted)]">
                  Order ID: {ret.orderId.slice(-8).toUpperCase()}
                </p>
                {ret.refund && (
                  <p
                    className={`text-[11px] font-semibold ${
                      isReturnRefunded(ret)
                        ? 'text-emerald-700'
                        : 'text-[var(--muted)]'
                    }`}
                  >
                    {isReturnRefunded(ret)
                      ? `Refunded ${formatPrice(ret.refund.amount)}`
                      : `Refund of ${formatPrice(ret.refund.amount)} in progress`}
                  </p>
                )}
              </div>
            </Link>
          ))}
          <Pagination
            currentPage={page}
            totalPages={data.totalPages}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  )
}
