import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminService } from '@/services/admin.service'
import { formatPrice } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Dialog } from '@/components/ui/Dialog'
import { Pagination } from '@/components/ui/Pagination'
import { toast } from 'react-hot-toast'

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error' | 'secondary'> = {
  PENDING: 'warning', PROCESSING: 'secondary', PAID: 'success', FAILED: 'error', CANCELLED: 'default',
}

export function AdminSettlementsPage() {
  const [page, setPage] = useState(1)
  const [showGenerate, setShowGenerate] = useState(false)
  const [month, setMonth] = useState('')
  const [showCommission, setShowCommission] = useState(false)
  const [commissionRate, setCommissionRate] = useState(10)
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['admin-settlements', page],
    queryFn: () => adminService.getSettlements({ page }),
  })

  const { data: commission } = useQuery({
    queryKey: ['commission'],
    queryFn: adminService.getCommission,
  })

  const generate = useMutation({
    mutationFn: (m: string) => adminService.generateSettlement(m),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-settlements'] }); setShowGenerate(false); setMonth(''); toast.success('Settlements generated') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const updateCommission = useMutation({
    mutationFn: (rate: number) => adminService.updateCommission(rate),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['commission'] }); setShowCommission(false); toast.success('Commission updated') },
  })

  const processSettlement = useMutation({
    mutationFn: (id: string) => adminService.processSettlement(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-settlements'] }); toast.success('Processing started') },
  })

  const markPaid = useMutation({
    mutationFn: (id: string) => adminService.markSettlementPaid(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-settlements'] }); toast.success('Marked as paid') },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Settlements</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setCommissionRate(commission?.rate || 10); setShowCommission(true); }}>
            Commission: {commission?.rate ?? 0}%
          </Button>
          <Button onClick={() => setShowGenerate(true)}>Generate Settlements</Button>
        </div>
      </div>

      <div className="space-y-3">
        {data?.items?.map(s => (
          <div key={s.id} className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="font-medium">{s.sellerId}</span>
                <span className="text-xs text-[var(--muted)] ml-2">{s.periodKey}</span>
              </div>
              <Badge variant={statusColors[s.status]}>{s.status}</Badge>
            </div>
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div><span className="text-[var(--muted)]">Sales</span><p className="font-medium">{formatPrice(s.totalSales)}</p></div>
              <div><span className="text-[var(--muted)]">Commission ({s.commissionRate}%)</span><p className="font-medium">{formatPrice(s.totalCommission)}</p></div>
              <div><span className="text-[var(--muted)]">Net Payout</span><p className="font-bold">{formatPrice(s.totalPayable)}</p></div>
              <div className="flex gap-1 justify-end items-start">
                {s.status === 'PENDING' && <Button size="sm" variant="outline" onClick={() => processSettlement.mutate(s.id)}>Process</Button>}
                {s.status === 'PROCESSING' && <Button size="sm" onClick={() => markPaid.mutate(s.id)}>Mark Paid</Button>}
              </div>
            </div>
          </div>
        ))}
        {data?.items?.length === 0 && (
          <div className="text-center py-12 text-[var(--muted)]">
            <p className="text-lg font-medium">No settlements found</p>
            <p className="text-sm mt-1">Generate settlements for a month to get started.</p>
          </div>
        )}
        {data && <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} />}
      </div>

      <Dialog open={showGenerate} onClose={() => setShowGenerate(false)} title="Generate Settlements">
        <div className="space-y-3">
          <Input label="Month (YYYY-MM)" placeholder="2026-08" value={month} onChange={e => setMonth(e.target.value)} />
          <Button className="w-full" onClick={() => generate.mutate(month)} disabled={!month}>Generate</Button>
        </div>
      </Dialog>

      <Dialog open={showCommission} onClose={() => setShowCommission(false)} title="Commission Rate">
        <div className="space-y-3">
          <Input label="Commission %" type="number" value={commissionRate} onChange={e => setCommissionRate(Number(e.target.value))} />
          <Button className="w-full" onClick={() => updateCommission.mutate(commissionRate)}>Update</Button>
        </div>
      </Dialog>
    </div>
  )
}
