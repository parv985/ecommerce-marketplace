import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminService } from '@/services/admin.service'
import { formatPrice } from '@/lib/utils'
import { notifyNoChanges } from '@/lib/formChanges'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { toast } from 'react-hot-toast'

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error'> = { ACTIVE: 'success', DRAFT: 'warning', INACTIVE: 'error' }

export function AdminProductsPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['admin-products', page, status],
    queryFn: () => adminService.getProducts({ page, status: status || undefined }),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => adminService.updateProductStatus(id, status),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-products'] }); toast.success('Status updated') },
  })

  /*
   * Same rule as the edit forms: applying the status a product already has is
   * not an update, so it never reaches the API (the cached list can lag behind
   * the server, and a repeated click would otherwise re-send the same value).
   */
  const changeStatus = (targetId: string, nextStatus: string) => {
    if (updateStatus.isPending) return
    const live = data?.items?.find(p => p.id === targetId)
    if (live && live.status === nextStatus) {
      notifyNoChanges()
      return
    }
    updateStatus.mutate({ id: targetId, status: nextStatus })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Products</h1>
      <div className="flex gap-2 mb-4">
        {['', 'ACTIVE', 'DRAFT', 'INACTIVE'].map(s => (
          <button key={s} onClick={() => { setStatus(s); setPage(1); }}
            className={`px-3 py-1 text-sm rounded ${status === s ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {data?.items?.map(p => (
          <div key={p.id} className="border rounded-lg p-4 flex items-center justify-between">
            <div>
              <span className="font-medium">{p.name}</span>
              <span className="text-sm text-[var(--muted)] ml-2">{formatPrice(p.price)}</span>
              <Badge variant={statusColors[p.status]} className="ml-2">{p.status}</Badge>
            </div>
            <div className="flex gap-1">
              {['ACTIVE', 'DRAFT', 'INACTIVE'].filter(s => s !== p.status).map(s => (
                <Button key={s} size="sm" variant="outline" disabled={updateStatus.isPending} onClick={() => changeStatus(p.id, s)}>{s}</Button>
              ))}
            </div>
          </div>
        ))}
        {data && <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} />}
      </div>
    </div>
  )
}
