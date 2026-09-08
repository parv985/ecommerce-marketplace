/**
 * Runtime verification for the Seller + Super Admin settlement UI.
 *
 * Renders the real page components (server-side) with payloads shaped
 * EXACTLY like the backend responses (SettlementResponse / PaginatedSettlements)
 * and asserts that:
 *   - totals / commission / payout / paid date render from backend data,
 *   - status badges and lifecycle actions appear for the right statuses,
 *   - the "no settlement for the selected month" state renders when the API
 *     returns null,
 *   - no "NaN"/"undefined"/"null" leaks into any settlement UI.
 *
 * Run: node scripts/verify-settlement-ui.mjs
 */
import { createServer } from 'vite'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url).pathname

const vite = await createServer({
  root,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
})

const React = (await import('react')).default
const { renderToString } = await import('react-dom/server')
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
const { MemoryRouter, Routes, Route } = await import('react-router-dom')

const { SellerSettlementPage } = await vite.ssrLoadModule('/src/pages/seller/SellerSettlementPage.tsx')
const { AdminSettlementsPage } = await vite.ssrLoadModule('/src/pages/admin/AdminSettlementsPage.tsx')

/* ------------------------------------------------------------------ */
/* Payloads mirroring the backend serializers                          */
/* (src/modules/settlements/settlement.types.ts)                       */
/* ------------------------------------------------------------------ */

const now = new Date()
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

// Two delivered+paid orders at a 10% platform commission.
const settlementProcessing = {
  id: 'sett-1',
  sellerId: 'u-seller123',
  periodKey: '2026-08',
  periodStart: '2026-08-01T00:00:00.000Z',
  periodEnd: '2026-08-31T23:59:59.999Z',
  status: 'PROCESSING',
  orders: [
    { orderId: 'o-1', orderNumber: 'ORD-2026-0001', total: 1000, commissionRate: 10, commissionAmount: 100, sellerPayable: 900, deliveredAt: '2026-08-05T10:00:00.000Z' },
    { orderId: 'o-2', orderNumber: 'ORD-2026-0002', total: 2500, commissionRate: 10, commissionAmount: 250, sellerPayable: 2250, deliveredAt: '2026-08-21T14:30:00.000Z' },
  ],
  totalSales: 3500,
  totalCommission: 350,
  totalPayable: 3150,
  commissionRate: 10,
  paidAt: null,
  reminderSentAt: null,
  createdAt: '2026-09-01T05:00:00.000Z',
  updatedAt: '2026-09-01T05:00:00.000Z',
}

// A paid settlement — paidAt must surface.
const settlementPaid = {
  ...settlementProcessing,
  id: 'sett-2',
  status: 'PAID',
  paidAt: '2026-09-05T11:30:00.000Z',
}

const adminListPayload = {
  items: [
    { ...settlementPaid },
    {
      ...settlementProcessing,
      id: 'sett-3',
      sellerId: 'u-seller456',
    },
    {
      ...settlementProcessing,
      id: 'sett-4',
      sellerId: 'u-seller789',
      status: 'FAILED',
    },
    {
      ...settlementProcessing,
      id: 'sett-5',
      sellerId: 'u-seller111',
      status: 'PENDING',
    },
  ],
  page: 1, limit: 20, total: 4, totalPages: 1,
}

/* ------------------------------------------------------------------ */

function render(element) {
  // Strip React SSR text-node separators so literal text assertions work.
  return renderToString(element).replace(/<!-- -->/g, '')
}

function clientWith(entries) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  for (const [key, data] of entries) qc.setQueryData(key, data)
  return qc
}

function providers(qc, path, routePath, Page) {
  return React.createElement(
    QueryClientProvider,
    { client: qc },
    React.createElement(
      MemoryRouter,
      { initialEntries: [path] },
      React.createElement(Routes, null, React.createElement(Route, { path: routePath, element: React.createElement(Page) })),
    ),
  )
}

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (err) {
    failures++
    console.error(`FAIL ${name}: ${err.message}`)
  }
}

function assertMoneyClean(html, name) {
  assert.ok(!html.includes('NaN'), `${name}: output contains NaN`)
  assert.ok(!/>undefined</.test(html), `${name}: output contains undefined`)
  assert.ok(!/>null</.test(html), `${name}: output contains null`)
}

/* Seller: PROCESSING settlement with a two-order breakdown */
check('SellerSettlementPage (summary + order breakdown)', () => {
  const qc = clientWith([[[`seller-settlement`, currentMonth], settlementProcessing]])
  const html = render(providers(qc, '/seller/settlement', '/seller/settlement', SellerSettlementPage))
  assertMoneyClean(html, 'seller')
  assert.ok(html.includes('PROCESSING'), 'status badge shown')
  assert.ok(html.includes('₹3,500'), 'total sales 3500')
  assert.ok(html.includes('₹350'), 'total commission 350')
  assert.ok(html.includes('₹3,150'), 'net payout 3150')
  assert.ok(html.includes('₹900'), 'order 1 seller payable 900')
  assert.ok(html.includes('₹2,250'), 'order 2 seller payable 2250')
  assert.ok(html.includes('#ORD-2026-0001'), 'order number shown')
  assert.ok(html.includes('#ORD-2026-0002'), 'order number shown')
})

/* Seller: PAID settlement — paid date renders */
check('SellerSettlementPage (paid date)', () => {
  const qc = clientWith([[[`seller-settlement`, currentMonth], settlementPaid]])
  const html = render(providers(qc, '/seller/settlement', '/seller/settlement', SellerSettlementPage))
  assertMoneyClean(html, 'seller-paid')
  assert.ok(html.includes('PAID'), 'status badge shown')
  assert.ok(html.includes('Paid on:'), 'paid date section renders')
})

/* Seller: backend returned null → explicit empty state */
check('SellerSettlementPage (no settlement for month)', () => {
  const qc = clientWith([[[`seller-settlement`, currentMonth], null]])
  const html = render(providers(qc, '/seller/settlement', '/seller/settlement', SellerSettlementPage))
  assertMoneyClean(html, 'seller-empty')
  assert.ok(html.includes('No settlement for'), 'empty-state title shown')
})

/* Admin: list renders per-status actions and payout data from the API */
check('AdminSettlementsPage (list + lifecycle actions)', () => {
  const qc = clientWith([
    [['admin-settlements', 1, '', ''], adminListPayload],
    [['commission'], { rate: 10 }],
  ])
  const html = render(providers(qc, '/admin/settlements', '/admin/settlements', AdminSettlementsPage))
  assertMoneyClean(html, 'admin-list')
  assert.ok(html.includes('₹3,500'), 'total sales 3500')
  assert.ok(html.includes('₹350'), 'total commission 350')
  assert.ok(html.includes('₹3,150'), 'net payout 3150')
  assert.ok(html.includes('PAID'), 'PAID badge shown')
  assert.ok(html.includes('PROCESSING'), 'PROCESSING badge shown')
  assert.ok(html.includes('Mark Paid'), 'PROCESSING action shown')
  assert.ok(html.includes('Retry'), 'FAILED retry action shown')
  assert.ok(html.includes('Process'), 'PENDING process action shown')
  assert.ok(html.includes('Cancel'), 'cancel action shown')
  assert.ok(html.includes('Details'), 'details action shown')
  // paid date must be the API paidAt value rendered through formatDate (never raw ISO)
  assert.ok(/\d{1,2} [A-Z][a-z]{2,4} \d{4}/.test(html), 'paidAt formatted for display')
  assert.ok(!html.includes('2026-09-05T'), 'raw ISO paidAt never rendered')
})

await vite.close()

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('\nAll settlement UI checks passed — real API data renders with no NaN/undefined/null.')
