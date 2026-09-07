import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { inventoryService } from '@/services/inventory.service'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Dialog } from '@/components/ui/Dialog'
import { Pagination } from '@/components/ui/Pagination'
import { toast } from 'react-hot-toast'

export function SellerInventoryPage() {
  const [page, setPage] = useState(1)
  const [adjustProductId, setAdjustProductId] = useState('')
  const [adjustQty, setAdjustQty] = useState(0)
  const [adjustReason, setAdjustReason] = useState('')
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['inventory', page],
    queryFn: () => inventoryService.list({ page, limit: 20 }),
  })

  const adjust = useMutation({
    mutationFn: () => inventoryService.adjustStock(adjustProductId, { quantity: adjustQty, reason: adjustReason }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['inventory'] }); setAdjustProductId(''); toast.success('Stock adjusted') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Inventory</h1>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b">
            <tr>
              <th className="text-left p-3 font-medium">Product</th>
              <th className="text-left p-3 font-medium">Type</th>
              <th className="text-left p-3 font-medium">Quantity</th>
              <th className="text-left p-3 font-medium">Reason</th>
              <th className="text-left p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {data?.items?.map(t => (
              <tr key={t.id} className="border-b">
                <td className="p-3">{typeof t.product === 'object' ? t.product.name : t.product}</td>
                <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${t.quantity > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{t.type}</span></td>
                <td className="p-3 font-medium">{t.quantity > 0 ? '+' : ''}{t.quantity}</td>
                <td className="p-3 text-[var(--muted)]">{t.reason}</td>
                <td className="p-3 text-[var(--muted)]">{formatDate(t.createdAt)}</td>
                <td className="p-3 text-center">
                  <Button size="sm" variant="ghost" onClick={() => { setAdjustProductId(typeof t.product === 'object' ? t.product.id : t.product); setAdjustQty(0); setAdjustReason(''); }}>
                    Adjust
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && <div className="p-4"><Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} /></div>}
      </div>

      <Dialog open={!!adjustProductId} onClose={() => setAdjustProductId('')} title="Adjust Stock">
        <div className="space-y-3">
          <Input label="Quantity (+ to add, - to subtract)" type="number" value={adjustQty} onChange={e => setAdjustQty(Number(e.target.value))} />
          <Input label="Reason" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} />
          <Button className="w-full" onClick={() => adjust.mutate()} disabled={!adjustReason || adjustQty === 0}>Apply</Button>
        </div>
      </Dialog>
    </div>
  )
}
