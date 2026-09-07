import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { sellerService } from '@/services/seller.service'
import { formatPrice } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error' | 'secondary'> = {
  PENDING: 'warning', PROCESSING: 'secondary', PAID: 'success', FAILED: 'error', CANCELLED: 'default',
}

export function SellerSettlementPage() {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState(currentMonth)

  const { data: settlement } = useQuery({
    queryKey: ['seller-settlement', month],
    queryFn: () => sellerService.getSettlement(month),
  })

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">My Settlement</h1>
      <Input label="Month (YYYY-MM)" value={month} onChange={e => setMonth(e.target.value)} />

      {!settlement ? (
        <div className="text-center py-12 text-[var(--muted)]">No settlement found for this period.</div>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{settlement.periodKey}</CardTitle>
            <Badge variant={statusColors[settlement.status]}>{settlement.status}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-sm text-[var(--muted)]">Total Sales</p><p className="text-xl font-bold">{formatPrice(settlement.totalSales)}</p></div>
              <div><p className="text-sm text-[var(--muted)]">Total Orders</p><p className="text-xl font-bold">{settlement.orders?.length ?? 0}</p></div>
              <div><p className="text-sm text-[var(--muted)]">Commission ({settlement.commissionRate}%)</p><p className="text-lg font-semibold text-red-600">{formatPrice(settlement.totalCommission)}</p></div>
              <div><p className="text-sm text-[var(--muted)]">Net Payout</p><p className="text-lg font-semibold text-green-600">{formatPrice(settlement.totalPayable)}</p></div>
            </div>
            {settlement.paidAt && <p className="text-sm text-[var(--muted)]">Paid on: {new Date(settlement.paidAt).toLocaleDateString()}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
