import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminService } from '@/services/admin.service'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { TextArea } from '@/components/ui/TextArea'
import { Dialog } from '@/components/ui/Dialog'
import { Pagination } from '@/components/ui/Pagination'
import { notifyNoChanges } from '@/lib/formChanges'
import { toast } from 'react-hot-toast'

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  APPROVED: 'success', PENDING: 'warning', REJECTED: 'error', PAUSED: 'default', SUSPENDED: 'error',
}

export function AdminSellersPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [actionDialog, setActionDialog] = useState<{ id: string; action: string; name: string } | null>(null)
  const [reason, setReason] = useState('')
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['admin-sellers', page, statusFilter],
    queryFn: () => adminService.getSellers({ page, status: statusFilter || undefined }),
  })

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
      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'SUSPENDED'].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1 text-sm rounded ${statusFilter === s ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {data?.items?.map(s => (
          <div key={s.id} className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="font-medium">{s.businessName || 'N/A'}</span>
                <span className="text-xs text-[var(--muted)] ml-2">GSTIN: {s.gstin}</span>
              </div>
              <Badge variant={statusColors[s.status]}>{s.status}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-[var(--muted)]">
                <span>{typeof s.user === 'object' ? s.user.name : ''}</span> • {formatDate(s.createdAt)}
              </div>
              <div className="flex gap-1">
                {s.status !== 'APPROVED' && <Button size="sm" variant="outline" onClick={() => setActionDialog({ id: s.id, action: 'APPROVED', name: s.businessName })}>Approve</Button>}
                {s.status === 'PENDING' && <Button size="sm" variant="outline" onClick={() => setActionDialog({ id: s.id, action: 'REJECTED', name: s.businessName })}>Reject</Button>}
                {s.status === 'APPROVED' && <Button size="sm" variant="outline" onClick={() => setActionDialog({ id: s.id, action: 'PAUSED', name: s.businessName })}>Pause</Button>}
                {(s.status === 'APPROVED' || s.status === 'PAUSED') && <Button size="sm" variant="destructive" onClick={() => setActionDialog({ id: s.id, action: 'SUSPENDED', name: s.businessName })}>Suspend</Button>}
              </div>
            </div>
            {s.statusReason && <p className="text-xs text-red-600 mt-1">Reason: {s.statusReason}</p>}
          </div>
        ))}
        {data && <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} />}
      </div>

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
