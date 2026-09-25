import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Store, AlertCircle, RefreshCw, AlertTriangle, X } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import { formatDate } from '@/lib/utils'
import { extractErrorMessage } from '@/services/api'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { TextArea } from '@/components/ui/TextArea'
import { Dialog } from '@/components/ui/Dialog'
import { Pagination } from '@/components/ui/Pagination'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { notifyNoChanges } from '@/lib/formChanges'
import { toast } from 'react-hot-toast'

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  APPROVED: 'success', PENDING: 'warning', REJECTED: 'error', PAUSED: 'default', SUSPENDED: 'error',
}

export function AdminSellersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = (searchParams.get('status') || '').toUpperCase()
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const [actionDialog, setActionDialog] = useState<{ id: string; action: string; name: string } | null>(null)
  const [reason, setReason] = useState('')
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-sellers', page, statusFilter],
    queryFn: () => adminService.getSellers({ page, status: statusFilter || undefined }),
  })

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

  const updateStatus = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) => adminService.updateSellerStatus(id, status, reason),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-sellers'] })
      setActionDialog(null)
      setReason('')
      const labels: Record<string, string> = {
        APPROVED: 'Seller approved successfully',
        REJECTED: 'Seller rejected successfully',
        PAUSED: 'Seller paused successfully',
        SUSPENDED: 'Seller suspended successfully',
      }
      toast.success(labels[variables.status] || 'Seller status updated')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to update seller status'),
  })

  /*
   * Status decisions follow the same rule as every other update flow: when the
   * seller already has the status being confirmed (the list can be stale while
   * the dialog is open, or the button was clicked twice), nothing would change,
   * so the request is skipped and the user is told so.
   */
  const confirmAction = () => {
    if (!actionDialog?.id) {
      toast.error('Unable to identify this seller. Please refresh and try again.')
      return
    }
    if (updateStatus.isPending) return
    if (actionDialog.action === 'REJECTED' && !reason.trim()) {
      toast.error('Rejection reason is required')
      return
    }
    const live = data?.items?.find(s => s.id === actionDialog.id)
    if (live && live.status === actionDialog.action) {
      notifyNoChanges()
      return
    }
    updateStatus.mutate({ id: actionDialog.id, status: actionDialog.action, reason: reason || undefined })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Manage Sellers</h1>

      {/* Active filter banner with Clear Filter button */}
      {statusFilter && (
        <div className="flex items-center justify-between p-3.5 mb-4 rounded-[var(--radius)] bg-amber-50/90 border border-amber-200/90 text-amber-900 text-sm">
          <div className="flex items-center gap-2.5">
            <div className="p-1 rounded-full bg-amber-100 text-amber-800">
              <AlertTriangle size={15} />
            </div>
            <div>
              <span className="font-semibold">Filtered View:</span>{' '}
              <span>
                Showing only <strong>{statusFilter}</strong> sellers
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

      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'SUSPENDED'].map(s => (
          <button
            key={s}
            onClick={() => handleStatusFilterChange(s)}
            className={`px-3 py-1 text-sm rounded cursor-pointer transition-colors ${statusFilter === s ? 'bg-slate-900 text-white font-medium' : 'bg-slate-100 hover:bg-slate-200'}`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {Array(4).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[var(--radius)]" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="p-3 rounded-full bg-[var(--destructive-subtle)] text-[var(--destructive)] mb-4">
            <AlertCircle size={28} strokeWidth={1.75} />
          </div>
          <h3 className="text-lg font-medium mb-1">Could not load sellers</h3>
          <p className="text-sm text-[var(--muted)] max-w-sm mb-4">{extractErrorMessage(error)}</p>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={`mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Try again
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.items?.map(s => (
            <div key={s.id} className="border rounded-lg p-4 bg-white">
              <div className="flex items-center justify-between mb-2 gap-2">
                <div className="min-w-0">
                  <span className="font-medium">{s.businessName || 'N/A'}</span>
                  <span className="text-xs text-[var(--muted)] ml-2 font-mono">GSTIN: {s.gstin}</span>
                </div>
                <Badge variant={statusColors[s.status]}>{s.status}</Badge>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-sm text-[var(--muted)]">
                  <span>{typeof s.user === 'object' ? s.user.name : ''}</span> • {formatDate(s.createdAt)}
                </div>
                <div className="flex gap-1 self-end sm:self-auto flex-wrap">
                  {s.status !== 'APPROVED' && <Button size="sm" variant="outline" onClick={() => setActionDialog({ id: s.id, action: 'APPROVED', name: s.businessName })}>Approve</Button>}
                  {s.status === 'PENDING' && <Button size="sm" variant="outline" onClick={() => setActionDialog({ id: s.id, action: 'REJECTED', name: s.businessName })}>Reject</Button>}
                  {s.status === 'APPROVED' && <Button size="sm" variant="outline" onClick={() => setActionDialog({ id: s.id, action: 'PAUSED', name: s.businessName })}>Pause</Button>}
                  {(s.status === 'APPROVED' || s.status === 'PAUSED') && <Button size="sm" variant="destructive" onClick={() => setActionDialog({ id: s.id, action: 'SUSPENDED', name: s.businessName })}>Suspend</Button>}
                </div>
              </div>
            </div>
          ))}

          {(!data?.items || data.items.length === 0) && (
            <EmptyState
              icon={<Store size={44} strokeWidth={1.5} />}
              title="No seller found"
              description={statusFilter ? `No sellers found with status "${statusFilter}".` : 'No sellers have registered yet.'}
            />
          )}

          {data && data.totalPages > 1 && (
            <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={handlePageChange} />
          )}
        </div>
      )}

      <Dialog open={!!actionDialog} onClose={() => { setActionDialog(null); setReason(''); }} title={`${actionDialog?.action} Seller`}>
        <p className="text-sm mb-3">Are you sure you want to <strong>{actionDialog?.action?.toLowerCase()}</strong> "{actionDialog?.name}"?</p>
        {actionDialog?.action === 'REJECTED' && (
          <TextArea label="Rejection reason" placeholder="Enter reason..." value={reason} onChange={e => setReason(e.target.value)} />
        )}
        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={() => { setActionDialog(null); setReason(''); }}>Cancel</Button>
          <Button
            variant={actionDialog?.action === 'SUSPEND' ? 'destructive' : 'default'}
            disabled={(actionDialog?.action === 'REJECTED' && !reason.trim()) || updateStatus.isPending}
            onClick={confirmAction}
          >
            {updateStatus.isPending ? 'Saving...' : 'Confirm'}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
