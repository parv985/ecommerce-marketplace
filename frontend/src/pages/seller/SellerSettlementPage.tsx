import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, AlertCircle, CalendarDays, Loader2, RefreshCw, Wallet } from 'lucide-react'
import { sellerService } from '@/services/seller.service'
import { extractErrorMessage } from '@/services/api'
import { formatDate, formatPrice } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error' | 'secondary'> = {
  PENDING: 'warning', PROCESSING: 'secondary', PAID: 'success', FAILED: 'error', CANCELLED: 'default',
}

/* The backend only accepts YYYY-MM months (see settlement.schema.ts). */
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

const monthKey = (offset: number): string => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number)
  if (!year || !m) return month
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(year, m - 1, 1))
}

export function SellerSettlementPage() {
  const [month, setMonth] = useState(monthKey(0))
  const monthValid = MONTH_RE.test(month)

  const { data: settlement, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['seller-settlement', month],
    queryFn: () => sellerService.getSettlement(month),
    enabled: monthValid,
  })

  const shiftMonth = (delta: number) => {
    if (!monthValid) { setMonth(monthKey(0)); return }
    const [year, m] = month.split('-').map(Number)
    const d = new Date(year, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">Settlement</h1>

      {/* Month selector */}
      <Card>
        <CardContent className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 min-w-0">
            <Input
              label="Month"
              type="month"
              value={monthValid ? month : ''}
              max={monthKey(0)}
              onChange={e => setMonth(e.target.value)}
              placeholder="YYYY-MM"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="lg" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={18} />
            </Button>
            <Button variant="outline" size="lg" onClick={() => shiftMonth(1)} aria-label="Next month">
              <ChevronRight size={18} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {!monthValid ? (
        <EmptyState
          icon={<CalendarDays size={44} strokeWidth={1.5} />}
          title="Select a month"
          description="Choose a month (YYYY-MM) to view your settlement for that period."
        />
      ) : isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-44 rounded-[var(--radius-lg)]" />
          <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="p-3 rounded-full bg-[var(--destructive-subtle)] text-[var(--destructive)] mb-4">
            <AlertCircle size={28} strokeWidth={1.75} />
          </div>
          <h3 className="text-lg font-medium mb-1">Unable to load your settlement.</h3>
          <p className="text-sm text-[var(--muted)] max-w-sm mb-4">{extractErrorMessage(error)}</p>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 size={14} className="animate-spin mr-2" /> : <RefreshCw size={14} className="mr-2" />}
            Retry
          </Button>
        </div>
      ) : !settlement ? (
        <EmptyState
          icon={<Wallet size={44} strokeWidth={1.5} />}
          title={`No settlement for ${formatMonthLabel(month)}`}
          description="Settlements are generated each month after the payout cycle. If you had delivered, paid orders in this period, your settlement will appear here once it has been generated."
        />
      ) : (
        <>
          {/* Summary */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle>{formatMonthLabel(settlement.periodKey)}</CardTitle>
                <p className="text-xs text-[var(--muted)] mt-1">
                  Period {settlement.periodKey} • {formatDate(settlement.periodStart)} – {formatDate(settlement.periodEnd)}
                </p>
              </div>
              <Badge variant={statusColors[settlement.status] ?? 'default'}>{settlement.status}</Badge>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-[var(--muted)]">Total Sales</p>
                  <p className="text-xl font-bold tracking-tight">{formatPrice(settlement.totalSales)}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Total Orders</p>
                  <p className="text-xl font-bold tracking-tight">{settlement.orders?.length ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Commission ({settlement.commissionRate}%)</p>
                  <p className="text-lg font-semibold text-red-600">{formatPrice(settlement.totalCommission)}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Net Payout</p>
                  <p className="text-lg font-semibold text-green-600">{formatPrice(settlement.totalPayable)}</p>
                </div>
              </div>
              {settlement.paidAt && (
                <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center gap-2 text-sm">
                  <CalendarDays size={15} className="text-[var(--muted)]" />
                  <span className="text-[var(--muted)]">Paid on:</span>
                  <span className="font-medium">{formatDate(settlement.paidAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order-level breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Order Breakdown</CardTitle>
            </CardHeader>
            {!settlement.orders?.length ? (
              <CardContent>
                <p className="text-sm text-[var(--muted)] py-6 text-center">No orders are part of this settlement.</p>
              </CardContent>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 border-b">
                    <tr>
                      <th className="text-left p-3 font-medium">Order</th>
                      <th className="text-left p-3 font-medium">Delivered</th>
                      <th className="text-right p-3 font-medium">Order Total</th>
                      <th className="text-right p-3 font-medium">Commission</th>
                      <th className="text-right p-3 font-medium">Seller Payable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlement.orders.map(order => (
                      <tr key={order.orderId} className="border-b">
                        <td className="p-3 font-medium text-[var(--fg)]">#{order.orderNumber}</td>
                        <td className="p-3 text-[var(--muted)]">{order.deliveredAt ? formatDate(order.deliveredAt) : '—'}</td>
                        <td className="p-3 text-right font-medium">{formatPrice(order.total)}</td>
                        <td className="p-3 text-right text-red-600">
                          {formatPrice(order.commissionAmount)}
                          <span className="text-xs text-[var(--muted)]"> ({order.commissionRate}%)</span>
                        </td>
                        <td className="p-3 text-right font-semibold text-green-600">{formatPrice(order.sellerPayable)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-zinc-50/70">
                      <td className="p-3 font-medium" colSpan={2}>Total ({settlement.orders.length} order{settlement.orders.length === 1 ? '' : 's'})</td>
                      <td className="p-3 text-right font-semibold">{formatPrice(settlement.totalSales)}</td>
                      <td className="p-3 text-right font-semibold text-red-600">{formatPrice(settlement.totalCommission)}</td>
                      <td className="p-3 text-right font-bold text-green-600">{formatPrice(settlement.totalPayable)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
