import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Package, AlertCircle, RefreshCw, AlertTriangle, X } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import { extractErrorMessage } from '@/services/api'
import { formatPrice } from '@/lib/utils'
import { notifyNoChanges } from '@/lib/formChanges'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from 'react-hot-toast'

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  ACTIVE: 'success',
  DRAFT: 'warning',
  INACTIVE: 'error',
  PENDING: 'warning',
}

const statusActionStyles: Record<string, string> = {
  ACTIVE: 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600',
  DRAFT: 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500',
  INACTIVE: 'bg-rose-600 hover:bg-rose-700 text-white border-rose-600',
}

function getFilterButtonClass(s: string, currentStatus: string): string {
  const isSelected = currentStatus === s
  if (!s) {
    return isSelected
      ? 'bg-slate-900 text-white font-medium shadow-xs'
      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
  }
  if (s === 'ACTIVE') {
    return isSelected
      ? 'bg-emerald-600 text-white font-medium shadow-xs'
      : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
  }
  if (s === 'DRAFT') {
    return isSelected
      ? 'bg-amber-500 text-white font-medium shadow-xs'
      : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
  }
  if (s === 'INACTIVE') {
    return isSelected
      ? 'bg-rose-600 text-white font-medium shadow-xs'
      : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
  }
  return ''
}

export function AdminProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = searchParams.get('filter') || ''
  const status = (searchParams.get('status') || '').toUpperCase()
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-products', page, status, filter],
    queryFn: () =>
      adminService.getProducts({
        page,
        status: status || undefined,
        filter: filter || undefined,
      }),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminService.updateProductStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      toast.success('Status updated')
    },
  })

  const handleStatusChange = (newStatus: string) => {
    const next = new URLSearchParams(searchParams)
    if (newStatus) {
      next.set('status', newStatus.toLowerCase())
    } else {
      next.delete('status')
    }
    if (filter === 'reported') {
      next.delete('filter')
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

  /*
   * Same rule as the edit forms: applying the status a product already has is
   * not an update, so it never reaches the API (the cached list can lag behind
   * the server, and a repeated click would otherwise re-send the same value).
   */
  const changeStatus = (targetId: string, nextStatus: string) => {
    if (updateStatus.isPending) return
    const live = data?.items?.find((p) => p.id === targetId)
    if (live && live.status === nextStatus) {
      notifyNoChanges()
      return
    }
    updateStatus.mutate({ id: targetId, status: nextStatus })
  }

  const isFiltered = Boolean(filter || status)

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">Products</h1>
      </div>

      {/* Active filter banner with Clear Filter button */}
      {isFiltered && (
        <div className="flex items-center justify-between p-3.5 mb-4 rounded-[var(--radius)] bg-amber-50/90 border border-amber-200/90 text-amber-900 text-sm">
          <div className="flex items-center gap-2.5">
            <div className="p-1 rounded-full bg-amber-100 text-amber-800">
              <AlertTriangle size={15} />
            </div>
            <div>
              <span className="font-semibold">Filtered View:</span>{' '}
              <span>
                {filter === 'low-stock'
                  ? 'Low-Stock Products (Stock ≤ 5 units)'
                  : filter === 'reported'
                  ? 'Reported / Moderation Products (Pending Review)'
                  : `Status: ${status}`}
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

      {/* Status filter buttons */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'ACTIVE', 'DRAFT', 'INACTIVE'].map((s) => (
          <button
            key={s}
            onClick={() => handleStatusChange(s)}
            className={`px-3 py-1 text-sm rounded cursor-pointer transition-colors ${getFilterButtonClass(
              s,
              status
            )}`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array(4)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-[var(--radius)]" />
            ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="p-3 rounded-full bg-[var(--destructive-subtle)] text-[var(--destructive)] mb-4">
            <AlertCircle size={28} strokeWidth={1.75} />
          </div>
          <h3 className="text-lg font-medium mb-1">Could not load products</h3>
          <p className="text-sm text-[var(--muted)] max-w-sm mb-4">
            {extractErrorMessage(error)}
          </p>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              size={14}
              className={`mr-2 ${isFetching ? 'animate-spin' : ''}`}
            />
            Try again
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.items?.map((p) => (
            <div
              key={p.id}
              className="border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{p.name}</span>
                  <span className="text-sm text-[var(--muted)]">
                    {formatPrice(p.price)}
                  </span>
                  <Badge variant={statusColors[p.status] || 'default'}>
                    {p.status}
                  </Badge>
                  {typeof p.stock === 'number' && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${
                        p.stock <= 5
                          ? 'bg-amber-100 text-amber-900 font-semibold border border-amber-300'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      Stock: {p.stock}
                    </span>
                  )}
                </div>
                {p.sellerName && (
                  <p className="text-xs text-[var(--muted)] mt-1">
                    Seller:{' '}
                    <span className="font-medium text-slate-800">
                      {p.sellerName}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex gap-1 self-end sm:self-auto shrink-0 flex-wrap">
                {['ACTIVE', 'DRAFT', 'INACTIVE']
                  .filter((s) => s !== p.status)
                  .map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      disabled={updateStatus.isPending}
                      onClick={() => changeStatus(p.id, s)}
                      className={statusActionStyles[s]}
                    >
                      {s}
                    </Button>
                  ))}
              </div>
            </div>
          ))}
          {(!data?.items || data.items.length === 0) && (
            <EmptyState
              icon={<Package size={44} strokeWidth={1.5} />}
              title="No products found"
              description={
                filter === 'low-stock'
                  ? 'No low-stock products found (all products have stock > 5).'
                  : filter === 'reported'
                  ? 'No products are currently under review or reported.'
                  : status
                  ? `No products found with status "${status}".`
                  : 'No products have been added yet.'
              }
            />
          )}
          {data && data.totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={data.totalPages}
              onPageChange={handlePageChange}
            />
          )}
        </div>
      )}
    </div>
  )
}
