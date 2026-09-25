import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Users,
  Store,
  Package,
  ShoppingCart,
  TrendingUp,
  Wallet,
  Clock,
  ArrowUpRight,
  XCircle,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  ShieldAlert,
  ChevronRight,
  Landmark,
  Percent,
  ArrowRight,
} from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
} from 'recharts'
import { adminService } from '@/services/admin.service'
import { formatPrice, formatDate, cn } from '@/lib/utils'
import { extractErrorMessage } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'

type RangeFilter = '7d' | '30d' | '3m' | '1y'

const RANGE_OPTIONS: { key: RangeFilter; label: string }[] = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '3m', label: '3 Months' },
  { key: '1y', label: '1 Year' },
]

const ORDER_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; badgeVariant: 'default' | 'success' | 'warning' | 'error' | 'secondary' | 'brand' }
> = {
  PENDING: { label: 'Pending', color: '#f59e0b', badgeVariant: 'warning' },
  CONFIRMED: { label: 'Processing', color: '#0284c7', badgeVariant: 'secondary' },
  SHIPPED: { label: 'Shipped', color: '#6366f1', badgeVariant: 'secondary' },
  DELIVERED: { label: 'Delivered', color: '#10b981', badgeVariant: 'success' },
  CANCELLED: { label: 'Cancelled', color: '#ef4444', badgeVariant: 'error' },
  RETURNED: { label: 'Returned', color: '#b83e20', badgeVariant: 'brand' },
}

export function AdminDashboardPage() {
  const navigate = useNavigate()
  const [range, setRange] = useState<RangeFilter>('30d')

  // Single API call aggregating the entire Super Admin Dashboard
  const {
    data: dashboard,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin-dashboard', range],
    queryFn: () => adminService.getDashboard({ range }),
    staleTime: 60 * 1000,
  })

  // Extract active sales overview series (client-side instantaneous fallback if present)
  const activeSalesSeries = useMemo(() => {
    if (!dashboard) return []
    if (dashboard.salesOverviewByRange?.[range]) {
      return dashboard.salesOverviewByRange[range]
    }
    return dashboard.salesOverview || []
  }, [dashboard, range])

  // Donut chart data for Order Status
  const orderStatusDonutData = useMemo(() => {
    if (!dashboard?.orderStatus) return []
    const os = dashboard.orderStatus
    const segments = [
      { name: 'Pending', value: os.pending, color: ORDER_STATUS_CONFIG.PENDING.color },
      { name: 'Processing', value: os.processing, color: ORDER_STATUS_CONFIG.CONFIRMED.color },
      { name: 'Shipped', value: os.shipped, color: ORDER_STATUS_CONFIG.SHIPPED.color },
      { name: 'Delivered', value: os.delivered, color: ORDER_STATUS_CONFIG.DELIVERED.color },
      { name: 'Cancelled', value: os.cancelled, color: ORDER_STATUS_CONFIG.CANCELLED.color },
    ]
    return segments.filter((s) => s.value > 0)
  }, [dashboard])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[var(--border)]">
          <Skeleton className="h-8 w-56 rounded-[var(--radius)]" />
          <Skeleton className="h-9 w-28 rounded-[var(--radius)]" />
        </div>

        {/* Skeleton Row 1 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {Array(5)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-[var(--radius-lg)]" />
            ))}
        </div>

        {/* Skeleton Row 2 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {Array(5)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-[var(--radius-lg)]" />
            ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-80 rounded-[var(--radius-lg)]" />
          <Skeleton className="h-80 rounded-[var(--radius-lg)]" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
          <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
        </div>
      </div>
    )
  }

  if (isError || !dashboard) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="p-3.5 rounded-full bg-[var(--destructive-subtle)] text-[var(--destructive)] mb-4">
          <AlertCircle size={32} strokeWidth={1.75} />
        </div>
        <h2 className="text-xl font-semibold mb-1 text-[var(--fg)]">Failed to load dashboard metrics</h2>
        <p className="text-sm text-[var(--muted)] max-w-md mb-5">
          {extractErrorMessage(error) || 'An unexpected error occurred while fetching aggregate data.'}
        </p>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={15} className={cn('mr-2', isFetching && 'animate-spin')} />
          Retry
        </Button>
      </div>
    )
  }

  const { stats, orderStatus, recentOrders, topProducts, topSellers, needsAttention, sellerActivity, userGrowth, revenue } =
    dashboard

  // KPI Row 1 & Row 2
  const kpiRow1 = [
    { label: 'Total Users', value: stats.totalUsers.toLocaleString(), icon: Users, subtext: `${userGrowth?.[userGrowth.length - 1]?.count ?? 0} new this mo.` },
    { label: 'Total Sellers', value: stats.totalSellers.toLocaleString(), icon: Store, subtext: `${sellerActivity.activeSellers} active` },
    { label: 'Total Products', value: stats.totalProducts.toLocaleString(), icon: Package, subtext: 'In marketplace' },
    { label: 'Total Orders', value: stats.totalOrders.toLocaleString(), icon: ShoppingCart, subtext: `${orderStatus.delivered} delivered` },
    { label: 'Total Sales / GMV', value: formatPrice(stats.totalSales), icon: TrendingUp, highlight: true },
  ]

  const kpiRow2 = [
    { label: 'Platform Revenue', value: formatPrice(stats.platformRevenue), icon: Wallet, highlight: true, subtext: `${revenue.commissionRate}% comm.` },
    { label: 'Pending Orders', value: stats.pendingOrders.toLocaleString(), icon: Clock, alert: stats.pendingOrders > 0, subtext: 'Awaiting process' },
    { label: 'Pending Settlements', value: stats.pendingSettlements.toLocaleString(), icon: ArrowUpRight, alert: stats.pendingSettlements > 0, subtext: formatPrice(revenue.pendingSettlement) },
    { label: 'Cancelled Orders', value: stats.cancelledOrders.toLocaleString(), icon: XCircle, subtext: 'Excl. from GMV' },
    { label: 'Low Stock Products', value: stats.lowStockProducts.toLocaleString(), icon: AlertTriangle, alert: stats.lowStockProducts > 0, subtext: 'Stock ≤ 5 units' },
  ]

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">Super Admin Dashboard</h1>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Production metrics, real-time sales overview, and platform operational alerts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs text-[var(--fg-secondary)]"
          >
            <RefreshCw size={13} className={cn('mr-1.5', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── 1. KPI Cards (Organized into Two Clean Rows) ── */}
      <div className="space-y-3.5">
        {/* Row 1 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {kpiRow1.map((item) => (
            <Card key={item.label} className="hover:border-[var(--border-strong)] transition-colors">
              <CardContent className="p-4 flex items-center gap-3">
                <div
                  className={cn(
                    'p-2.5 rounded-[var(--radius)] border shrink-0',
                    item.highlight
                      ? 'bg-[var(--primary-subtle)] border-[var(--primary)]/20 text-[var(--primary)]'
                      : 'bg-[#f6f5f2] border-[var(--border)] text-[var(--fg)]'
                  )}
                >
                  <item.icon size={18} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--muted)] truncate">{item.label}</p>
                  <p className="text-lg font-bold tracking-tight text-[var(--fg)] truncate mt-0.5">{item.value}</p>
                  {item.subtext && <p className="text-[11px] text-[var(--muted)] truncate mt-0.5">{item.subtext}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {kpiRow2.map((item) => (
            <Card key={item.label} className="hover:border-[var(--border-strong)] transition-colors">
              <CardContent className="p-4 flex items-center gap-3">
                <div
                  className={cn(
                    'p-2.5 rounded-[var(--radius)] border shrink-0',
                    item.alert
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : item.highlight
                      ? 'bg-[var(--primary-subtle)] border-[var(--primary)]/20 text-[var(--primary)]'
                      : 'bg-[#f6f5f2] border-[var(--border)] text-[var(--fg)]'
                  )}
                >
                  <item.icon size={18} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--muted)] truncate">{item.label}</p>
                  <p className="text-lg font-bold tracking-tight text-[var(--fg)] truncate mt-0.5">{item.value}</p>
                  {item.subtext && <p className="text-[11px] text-[var(--muted)] truncate mt-0.5">{item.subtext}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── 2. Sales Overview & 3. Order Status Overview ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 2. Sales Overview (2 Cols) */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3">
            <div>
              <CardTitle className="text-base font-semibold">Sales Overview</CardTitle>
              <p className="text-xs text-[var(--muted)] mt-0.5">Gross sales, platform commissions and order volume</p>
            </div>
            {/* Filter buttons */}
            <div className="inline-flex items-center rounded-[var(--radius)] border border-[var(--border)] bg-[#f6f5f2] p-0.5 self-start sm:self-auto">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setRange(opt.key)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded-[var(--radius-sm)] transition-all cursor-pointer',
                    range === opt.key
                      ? 'bg-white text-[var(--fg)] shadow-xs font-semibold'
                      : 'text-[var(--muted)] hover:text-[var(--fg)]'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {!activeSalesSeries.length ? (
              <div className="h-64 flex flex-col items-center justify-center text-center text-sm text-[var(--muted)]">
                <ShoppingCart className="w-8 h-8 text-[var(--muted)] mb-2 stroke-[1.5]" />
                <p>No order transactions recorded in this period.</p>
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={activeSalesSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#b83e20" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#b83e20" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eeedea" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#78756f' }}
                      axisLine={{ stroke: '#e5e3dc' }}
                      tickLine={false}
                      minTickGap={18}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11, fill: '#78756f' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(val) => (val >= 1000 ? `₹${(val / 1000).toFixed(0)}k` : `₹${val}`)}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11, fill: '#78756f' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      formatter={(val: any, name: any) => {
                        const num = Number(val)
                        if (name === 'Gross Sales' || name === 'Platform Commission') {
                          return [formatPrice(num), name]
                        }
                        return [`${num} orders`, name]
                      }}
                      labelFormatter={(lbl) => `Date: ${lbl}`}
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e5e3dc',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="sales"
                      name="Gross Sales"
                      stroke="#b83e20"
                      strokeWidth={2}
                      fill="url(#salesGrad)"
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="commission"
                      name="Platform Commission"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="orders"
                      name="Orders"
                      stroke="#0284c7"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. Order Status Overview (1 Col Donut) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Order Status Overview</CardTitle>
            <p className="text-xs text-[var(--muted)]">Lifecycle distribution across all orders</p>
          </CardHeader>
          <CardContent className="pt-2 flex flex-col justify-between h-[320px]">
            {stats.totalOrders === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-sm text-[var(--muted)]">
                <ShoppingCart className="w-8 h-8 text-[var(--muted)] mb-2 stroke-[1.5]" />
                <p>No orders in the database yet.</p>
              </div>
            ) : (
              <>
                <div className="h-44 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={orderStatusDonutData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={72}
                        paddingAngle={2}
                      >
                        {orderStatusDonutData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: any, name: any) => [
                          `${val} (${stats.totalOrders > 0 ? ((Number(val) / stats.totalOrders) * 100).toFixed(0) : 0}%)`,
                          name,
                        ]}
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #e5e3dc',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center metric */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-bold tracking-tight text-[var(--fg)]">{stats.totalOrders}</span>
                    <span className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider">Orders</span>
                  </div>
                </div>

                {/* Status Legend & Breakdown */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border)] text-xs">
                  <div className="flex items-center justify-between p-1.5 rounded-[var(--radius-sm)] bg-[#faf9f6]">
                    <span className="flex items-center gap-1.5 font-medium text-[var(--fg-secondary)]">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ORDER_STATUS_CONFIG.PENDING.color }} />
                      Pending
                    </span>
                    <span className="font-semibold text-[var(--fg)]">{orderStatus.pending}</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-[var(--radius-sm)] bg-[#faf9f6]">
                    <span className="flex items-center gap-1.5 font-medium text-[var(--fg-secondary)]">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ORDER_STATUS_CONFIG.CONFIRMED.color }} />
                      Processing
                    </span>
                    <span className="font-semibold text-[var(--fg)]">{orderStatus.processing}</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-[var(--radius-sm)] bg-[#faf9f6]">
                    <span className="flex items-center gap-1.5 font-medium text-[var(--fg-secondary)]">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ORDER_STATUS_CONFIG.SHIPPED.color }} />
                      Shipped
                    </span>
                    <span className="font-semibold text-[var(--fg)]">{orderStatus.shipped}</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-[var(--radius-sm)] bg-[#faf9f6]">
                    <span className="flex items-center gap-1.5 font-medium text-[var(--fg-secondary)]">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ORDER_STATUS_CONFIG.DELIVERED.color }} />
                      Delivered
                    </span>
                    <span className="font-semibold text-[var(--fg)]">{orderStatus.delivered}</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-[var(--radius-sm)] bg-[#faf9f6] col-span-2">
                    <span className="flex items-center gap-1.5 font-medium text-[var(--fg-secondary)]">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ORDER_STATUS_CONFIG.CANCELLED.color }} />
                      Cancelled
                    </span>
                    <span className="font-semibold text-[var(--fg)]">{orderStatus.cancelled}</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 7. Needs Attention & 10. Marketplace Revenue ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 7. Needs Attention (Actionable items linking to admin sub-pages) */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold">Needs Attention</CardTitle>
                {(needsAttention.lowStockProducts > 0 ||
                  needsAttention.pendingSellers > 0 ||
                  needsAttention.pendingOrders > 0 ||
                  needsAttention.pendingSettlements > 0 ||
                  needsAttention.reportedProducts > 0) && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--muted)] mt-0.5">Urgent operations requiring Super Admin review or action</p>
            </div>
            <ShieldAlert size={18} className="text-[var(--muted)] shrink-0" />
          </CardHeader>
          <CardContent className="space-y-2.5 flex-1">
            {/* Low stock */}
            <div
              onClick={() => navigate('/admin/products?filter=low-stock')}
              className="flex items-center justify-between p-3 rounded-[var(--radius)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[#faf9f6] transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    'p-2 rounded-[var(--radius-sm)] shrink-0',
                    needsAttention.lowStockProducts > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                  )}
                >
                  <AlertTriangle size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--fg)] truncate">Low-Stock Products</p>
                  <p className="text-xs text-[var(--muted)] truncate">Products with ≤ 5 units remaining</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={needsAttention.lowStockProducts > 0 ? 'warning' : 'success'}>
                  {needsAttention.lowStockProducts > 0 ? `${needsAttention.lowStockProducts} Low` : 'All Stocked'}
                </Badge>
                <ChevronRight size={14} className="text-[var(--muted)] group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Pending seller approvals */}
            <div
              onClick={() => navigate('/admin/sellers?status=pending')}
              className="flex items-center justify-between p-3 rounded-[var(--radius)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[#faf9f6] transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    'p-2 rounded-[var(--radius-sm)] shrink-0',
                    needsAttention.pendingSellers > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                  )}
                >
                  <Store size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--fg)] truncate">Pending Seller Approvals</p>
                  <p className="text-xs text-[var(--muted)] truncate">Onboarding verification and business docs</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={needsAttention.pendingSellers > 0 ? 'warning' : 'success'}>
                  {needsAttention.pendingSellers > 0 ? `${needsAttention.pendingSellers} Pending` : 'Up to Date'}
                </Badge>
                <ChevronRight size={14} className="text-[var(--muted)] group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Pending orders */}
            <div
              onClick={() => navigate('/admin/orders?status=pending')}
              className="flex items-center justify-between p-3 rounded-[var(--radius)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[#faf9f6] transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    'p-2 rounded-[var(--radius-sm)] shrink-0',
                    needsAttention.pendingOrders > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                  )}
                >
                  <Clock size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--fg)] truncate">Pending Orders</p>
                  <p className="text-xs text-[var(--muted)] truncate">Buyer orders waiting confirmation</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={needsAttention.pendingOrders > 0 ? 'warning' : 'success'}>
                  {needsAttention.pendingOrders > 0 ? `${needsAttention.pendingOrders} Pending` : 'None Pending'}
                </Badge>
                <ChevronRight size={14} className="text-[var(--muted)] group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Pending settlements */}
            <div
              onClick={() => navigate('/admin/settlements?status=pending')}
              className="flex items-center justify-between p-3 rounded-[var(--radius)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[#faf9f6] transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    'p-2 rounded-[var(--radius-sm)] shrink-0',
                    needsAttention.pendingSettlements > 0 ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'
                  )}
                >
                  <Landmark size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--fg)] truncate">Pending Settlements</p>
                  <p className="text-xs text-[var(--muted)] truncate">Seller period payouts to be disbursed</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={needsAttention.pendingSettlements > 0 ? 'secondary' : 'success'}>
                  {needsAttention.pendingSettlements > 0 ? `${needsAttention.pendingSettlements} Payouts` : 'Settled'}
                </Badge>
                <ChevronRight size={14} className="text-[var(--muted)] group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Reported / Pending moderation products */}
            <div
              onClick={() => navigate('/admin/products?filter=reported')}
              className="flex items-center justify-between p-3 rounded-[var(--radius)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[#faf9f6] transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    'p-2 rounded-[var(--radius-sm)] shrink-0',
                    needsAttention.reportedProducts > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                  )}
                >
                  <Package size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--fg)] truncate">Reported / Moderation Products</p>
                  <p className="text-xs text-[var(--muted)] truncate">Listings under review or reported</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={needsAttention.reportedProducts > 0 ? 'warning' : 'success'}>
                  {needsAttention.reportedProducts > 0 ? `${needsAttention.reportedProducts} Review` : 'Clear'}
                </Badge>
                <ChevronRight size={14} className="text-[var(--muted)] group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 10. Marketplace Revenue (Replaces old commission-only section) */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Marketplace Revenue Summary</CardTitle>
              <p className="text-xs text-[var(--muted)] mt-0.5">Platform economics, fee structure, and payout liability</p>
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--primary-subtle)] border border-[var(--primary)]/20 text-[var(--primary)] font-semibold text-xs">
              <Percent size={12} strokeWidth={2.5} />
              Take Rate: {revenue.commissionRate}%
            </div>
          </CardHeader>
          <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
            <div className="grid grid-cols-2 gap-3.5">
              <div className="p-3.5 rounded-[var(--radius)] bg-[#faf9f6] border border-[var(--border)]">
                <span className="text-xs text-[var(--muted)] font-medium block">Total GMV</span>
                <span className="text-xl font-bold tracking-tight text-[var(--fg)] mt-1 block">
                  {formatPrice(revenue.totalGmv)}
                </span>
                <span className="text-[11px] text-[var(--muted)] mt-0.5 block">Marketplace sales volume</span>
              </div>
              <div className="p-3.5 rounded-[var(--radius)] bg-[var(--primary-subtle)] border border-[var(--primary)]/20">
                <span className="text-xs text-[var(--primary)] font-medium block">Commission Earned</span>
                <span className="text-xl font-bold tracking-tight text-[var(--primary)] mt-1 block">
                  {formatPrice(revenue.commissionEarned)}
                </span>
                <span className="text-[11px] text-[var(--primary)]/80 mt-0.5 block">
                  {revenue.commissionRate}% of completed sales
                </span>
              </div>
              <div className="p-3.5 rounded-[var(--radius)] bg-[#faf9f6] border border-[var(--border)]">
                <span className="text-xs text-[var(--muted)] font-medium block">Pending Settlement</span>
                <span className="text-xl font-bold tracking-tight text-amber-700 mt-1 block">
                  {formatPrice(revenue.pendingSettlement)}
                </span>
                <span className="text-[11px] text-[var(--muted)] mt-0.5 block">
                  {revenue.pendingSettlementCount} batch(es) awaiting payout
                </span>
              </div>
              <div className="p-3.5 rounded-[var(--radius)] bg-[#faf9f6] border border-[var(--border)]">
                <span className="text-xs text-[var(--muted)] font-medium block">Settlements Disbursed</span>
                <span className="text-xl font-bold tracking-tight text-emerald-700 mt-1 block">
                  {formatPrice(revenue.paidSettlement)}
                </span>
                <span className="text-[11px] text-[var(--muted)] mt-0.5 block">Total paid out to sellers</span>
              </div>
            </div>

            {/* Quick Actions Footer inside card */}
            <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <span>Automated monthly settlement lifecycle</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/admin/settlements')}
                className="text-xs"
              >
                Manage Settlements
                <ArrowRight size={13} className="ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 8. Seller Activity & 9. User Growth ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 8. Seller Activity */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Seller Activity</CardTitle>
              <p className="text-xs text-[var(--muted)] mt-0.5">Merchant network status and onboarding velocity</p>
            </div>
            <Store size={18} className="text-[var(--muted)]" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="p-2.5 rounded-[var(--radius-sm)] bg-[#faf9f6] border border-[var(--border)]">
                <p className="text-xs text-[var(--muted)] font-medium truncate">New This Mo.</p>
                <p className="text-base font-bold text-[var(--fg)] mt-0.5">{sellerActivity.newSellersThisMonth}</p>
              </div>
              <div className="p-2.5 rounded-[var(--radius-sm)] bg-[#faf9f6] border border-[var(--border)]">
                <p className="text-xs text-[var(--muted)] font-medium truncate">Active</p>
                <p className="text-base font-bold text-emerald-700 mt-0.5">{sellerActivity.activeSellers}</p>
              </div>
              <div className="p-2.5 rounded-[var(--radius-sm)] bg-[#faf9f6] border border-[var(--border)]">
                <p className="text-xs text-[var(--muted)] font-medium truncate">Pending</p>
                <p className="text-base font-bold text-amber-700 mt-0.5">{sellerActivity.pendingApprovals}</p>
              </div>
              <div className="p-2.5 rounded-[var(--radius-sm)] bg-[#faf9f6] border border-[var(--border)]">
                <p className="text-xs text-[var(--muted)] font-medium truncate">Suspended</p>
                <p className="text-base font-bold text-rose-700 mt-0.5">{sellerActivity.suspendedSellers}</p>
              </div>
            </div>

            {/* Small Seller Growth Chart */}
            <div>
              <p className="text-xs font-semibold text-[var(--fg-secondary)] mb-2">Seller Growth (Past 6 Months)</p>
              <div className="h-28 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sellerActivity.growth} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="sellerGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d97706" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#d97706" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eeedea" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#78756f' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#78756f' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      formatter={(val) => [`${val} sellers registered`, 'New Sellers']}
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e5e3dc',
                        borderRadius: '6px',
                        fontSize: '11px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#d97706"
                      strokeWidth={2}
                      fill="url(#sellerGrowthGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 9. User Growth */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">User Growth</CardTitle>
              <p className="text-xs text-[var(--muted)] mt-0.5">Customer adoption and monthly account signups</p>
            </div>
            <Users size={18} className="text-[var(--muted)]" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-2.5 rounded-[var(--radius-sm)] bg-[#faf9f6] border border-[var(--border)]">
                <p className="text-xs text-[var(--muted)] font-medium">Total Registered Users</p>
                <p className="text-base font-bold text-[var(--fg)] mt-0.5">{stats.totalUsers.toLocaleString()}</p>
              </div>
              <div className="p-2.5 rounded-[var(--radius-sm)] bg-[#faf9f6] border border-[var(--border)]">
                <p className="text-xs text-[var(--muted)] font-medium">New Users This Month</p>
                <p className="text-base font-bold text-[var(--primary)] mt-0.5">
                  {userGrowth?.[userGrowth.length - 1]?.count ?? 0}
                </p>
              </div>
            </div>

            {/* Small User Growth Chart */}
            <div>
              <p className="text-xs font-semibold text-[var(--fg-secondary)] mb-2">User Registrations (Past 6 Months)</p>
              <div className="h-28 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={userGrowth} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="userGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0284c7" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eeedea" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#78756f' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#78756f' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      formatter={(val) => [`${val} users joined`, 'Signups']}
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e5e3dc',
                        borderRadius: '6px',
                        fontSize: '11px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#0284c7"
                      strokeWidth={2}
                      fill="url(#userGrowthGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 5. Top Products & 6. Top Sellers ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 5. Top Products */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Top Products</CardTitle>
              <p className="text-xs text-[var(--muted)] mt-0.5">Highest volume and revenue generating listings</p>
            </div>
            <Package size={18} className="text-[var(--muted)]" />
          </CardHeader>
          <CardContent className="p-0">
            {!topProducts?.length ? (
              <p className="text-sm text-[var(--muted)] py-10 text-center">No product sales recorded yet.</p>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {topProducts.map((p, index) => (
                  <div key={p.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-[#faf9f6] transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-5 text-center text-xs font-bold text-[var(--muted)]">#{index + 1}</span>
                      {p.image ? (
                        <img
                          src={p.image}
                          alt={p.name}
                          className="w-10 h-10 rounded-[var(--radius-sm)] object-cover border border-[var(--border)] shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[#f6f5f2] border border-[var(--border)] flex items-center justify-center shrink-0 text-[var(--muted)]">
                          <Package size={18} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--fg)] truncate">{p.name}</p>
                        <p className="text-xs text-[var(--muted)] truncate">By {p.sellerName}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-[var(--fg)]">{formatPrice(p.revenue)}</p>
                      <p className="text-xs text-[var(--muted)]">{p.unitsSold} units sold</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 6. Top Sellers */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Top Sellers</CardTitle>
              <p className="text-xs text-[var(--muted)] mt-0.5">Top-performing merchants by GMV and commission</p>
            </div>
            <Store size={18} className="text-[var(--muted)]" />
          </CardHeader>
          <CardContent className="p-0">
            {!topSellers?.length ? (
              <p className="text-sm text-[var(--muted)] py-10 text-center">No seller transactions recorded yet.</p>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {topSellers.map((s, index) => (
                  <div key={s.sellerId} className="p-3.5 flex items-center justify-between gap-3 hover:bg-[#faf9f6] transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-5 text-center text-xs font-bold text-[var(--muted)]">#{index + 1}</span>
                      <div className="w-9 h-9 rounded-full bg-[#f6f5f2] border border-[var(--border)] flex items-center justify-center shrink-0 font-bold text-xs text-[var(--fg)]">
                        {s.sellerName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[var(--fg)] truncate">{s.sellerName}</p>
                          <Badge variant={s.status === 'APPROVED' ? 'success' : 'default'} className="text-[10px] px-1.5 py-0">
                            {s.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-[var(--muted)]">{s.orders} completed order{s.orders === 1 ? '' : 's'}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-[var(--fg)]">{formatPrice(s.sales)}</p>
                      <p className="text-xs text-emerald-700 font-medium">+{formatPrice(s.commission)} fee</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 4. Recent Orders ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-semibold">Recent Orders</CardTitle>
            <p className="text-xs text-[var(--muted)] mt-0.5">Latest transactions processed through the marketplace</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/admin/orders')}
            className="text-xs"
          >
            View All Orders
            <ArrowRight size={13} className="ml-1.5" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {!recentOrders?.length ? (
            <p className="text-sm text-[var(--muted)] py-12 text-center">No orders placed yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[#faf9f6] text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                    <th className="py-3 px-4">Order ID</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Seller</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {recentOrders.map((order) => {
                    const statusCfg = ORDER_STATUS_CONFIG[order.status] || {
                      label: order.status,
                      badgeVariant: 'default',
                    }
                    return (
                      <tr
                        key={order.id}
                        className="hover:bg-[#faf9f6] transition-colors"
                      >
                        <td className="py-3.5 px-4 font-mono font-medium text-xs text-[var(--fg)]">
                          {order.orderNumber}
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-xs text-[var(--fg)]">{order.customerName}</p>
                          {order.customerEmail && (
                            <p className="text-[11px] text-[var(--muted)] truncate max-w-[160px]">
                              {order.customerEmail}
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-medium text-[var(--fg-secondary)]">
                          {order.sellerName}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-xs text-[var(--fg)]">
                          {formatPrice(order.amount)}
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge variant={statusCfg.badgeVariant}>
                            {statusCfg.label}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-[var(--muted)] whitespace-nowrap">
                          {formatDate(order.createdAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
