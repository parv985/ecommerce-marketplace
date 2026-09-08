/**
 * Runtime verification for order/money UI.
 *
 * Renders the real page components (server-side) with payloads shaped
 * EXACTLY like the backend responses (OrderResponse / InvoiceData /
 * AdminOrderResponse / CartResponse) and asserts that every monetary
 * value renders correctly and that no "NaN"/"undefined"/"null" leaks
 * into any order-related UI.
 *
 * Run: node scripts/verify-money-ui.mjs
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

const { OrderDetailPage } = await vite.ssrLoadModule('/src/pages/OrderDetailPage.tsx')
const { OrderListPage } = await vite.ssrLoadModule('/src/pages/OrderListPage.tsx')
const { SellerOrdersPage } = await vite.ssrLoadModule('/src/pages/seller/SellerOrdersPage.tsx')
const { AdminOrdersPage } = await vite.ssrLoadModule('/src/pages/admin/AdminOrdersPage.tsx')
const { CheckoutPage } = await vite.ssrLoadModule('/src/pages/CheckoutPage.tsx')
const { CartPage } = await vite.ssrLoadModule('/src/pages/CartPage.tsx')

/* ------------------------------------------------------------------ */
/* Payloads mirroring the backend serializers (src/modules/orders)     */
/* ------------------------------------------------------------------ */

// Order with 2 items, a sale discount on item 1 and a coupon:
// itemsTotal = 3200 + 1500 = 4700, discountTotal = 640, coupon = 300
// total = 4700 - 640 - 300 = 3760
const orderWithCoupon = {
  id: 'ord-1',
  orderNumber: 'ORD-TEST-0001',
  userId: 'u-1',
  sellerId: 's-1',
  sellerBusinessName: 'TrimCorp',
  items: [
    { productId: 'p-1', name: 'trimmer', price: 800, quantity: 4, subtotal: 3200, discountAmount: 640 },
    { productId: 'p-2', name: 'guard kit', price: 500, quantity: 3, subtotal: 1500, discountAmount: 0 },
  ],
  shippingAddress: {
    recipientName: 'Dev Patel', phone: '9876543210',
    addressLine1: 'pragatinagar main road', addressLine2: null,
    city: 'Ahmedabad', state: 'GUJARAT', pincode: '380056',
  },
  itemsTotal: 4700,
  discountTotal: 640,
  couponId: 'c-1',
  couponCode: 'SAVE300',
  couponDiscount: 300,
  total: 3760,
  paymentMethod: 'ONLINE',
  paymentStatus: 'PAID',
  paymentId: 'pay-1',
  status: 'DELIVERED',
  createdAt: '2026-09-07T06:51:00.000Z',
  updatedAt: '2026-09-08T06:56:00.000Z',
}

// Invoice: GST 18% on itemsTotal (4700) = 846; total = 3760 + 846 = 4606
const invoice = {
  invoiceNumber: 'INV-TEST-0001',
  orderNumber: 'ORD-TEST-0001',
  orderId: 'ord-1',
  orderDate: '2026-09-07T06:51:00.000Z',
  buyer: { name: 'Dev Patel', email: 'dev@example.com' },
  seller: {
    businessName: 'TrimCorp', gstin: '24ABCDE1234F1Z5', pan: 'ABCDE1234F',
    address: { addressLine1: '1 Market Yard', addressLine2: null, city: 'Ahmedabad', state: 'GUJARAT', pincode: '380001' },
  },
  items: orderWithCoupon.items,
  shippingAddress: orderWithCoupon.shippingAddress,
  itemsTotal: 4700,
  discountTotal: 640,
  couponDiscount: 300,
  taxRate: 18,
  taxAmount: 846,
  total: 4606,
  paymentMethod: 'ONLINE',
  paymentStatus: 'PAID',
  status: 'DELIVERED',
  deliveredAt: '2026-09-08T06:56:00.000Z',
  createdAt: '2026-09-07T06:51:00.000Z',
}

// Single item, no coupon, no discount: total must equal itemsTotal.
const orderNoCoupon = {
  ...orderWithCoupon,
  id: 'ord-2',
  orderNumber: 'ORD-TEST-0002',
  items: [{ productId: 'p-3', name: 'shaver', price: 1200, quantity: 1, subtotal: 1200, discountAmount: 0 }],
  itemsTotal: 1200,
  discountTotal: 0,
  couponId: null,
  couponCode: null,
  couponDiscount: 0,
  total: 1200,
  status: 'PENDING',
  paymentMethod: 'COD',
  paymentStatus: 'UNPAID',
}

const cart = {
  id: 'cart-1',
  items: [
    { productId: 'p-1', quantity: 4, subtotal: 3200, product: { id: 'p-1', sellerId: 's-1', name: 'trimmer', price: 800, stock: 10, images: [], status: 'ACTIVE' } },
    { productId: 'p-2', quantity: 3, subtotal: 1500, product: { id: 'p-2', sellerId: 's-1', name: 'guard kit', price: 500, stock: 5, images: [], status: 'ACTIVE' } },
  ],
  totalItems: 2,
  totalQuantity: 7,
  totalPrice: 4700,
}

const adminOrdersPage = {
  items: [
    { id: 'ord-1', orderNumber: 'ORD-TEST-0001', userId: 'u-1', sellerId: 's-1', itemCount: 2, total: 3760, paymentStatus: 'PAID', status: 'DELIVERED', createdAt: '2026-09-07T06:51:00.000Z' },
    { id: 'ord-2', orderNumber: 'ORD-TEST-0002', userId: 'u-1', sellerId: 's-1', itemCount: 1, total: 1200, paymentStatus: 'UNPAID', status: 'PENDING', createdAt: '2026-09-07T07:00:00.000Z' },
  ],
  page: 1, limit: 10, total: 2, totalPages: 1,
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

/* Order details — coupon + discount + multiple items */
check('OrderDetailPage (coupon, 2 items)', () => {
  const qc = clientWith([
    [['order', 'ord-1'], orderWithCoupon],
    [['tracking', 'ord-1'], { orderNumber: 'ORD-TEST-0001', status: 'DELIVERED', timeline: [], createdAt: orderWithCoupon.createdAt }],
    [['invoice', 'ord-1'], invoice],
  ])
  const html = render(providers(qc, '/orders/ord-1', '/orders/:id', OrderDetailPage))
  assertMoneyClean(html, 'detail')
  assert.ok(html.includes('₹3,200'), 'item 1 line total 3200')
  assert.ok(html.includes('₹1,500'), 'item 2 line total 1500')
  assert.ok(html.includes('₹4,700'), 'subtotal = itemsTotal 4700')
  assert.ok(html.includes('-₹640'), 'sale discount 640')
  assert.ok(html.includes('-₹300'), 'coupon 300')
  assert.ok(html.includes('SAVE300'), 'coupon code shown')
  assert.ok(html.includes('₹3,760'), 'order total 3760')
  assert.ok(html.includes('₹846'), 'invoice GST 846')
  assert.ok(html.includes('₹4,606'), 'invoice total 4606')
})

/* Order details — no coupon, single item */
check('OrderDetailPage (no coupon, 1 item)', () => {
  const qc = clientWith([
    [['order', 'ord-2'], orderNoCoupon],
    [['tracking', 'ord-2'], { orderNumber: 'ORD-TEST-0002', status: 'PENDING', timeline: [], createdAt: orderNoCoupon.createdAt }],
  ])
  const html = render(providers(qc, '/orders/ord-2', '/orders/:id', OrderDetailPage))
  assertMoneyClean(html, 'detail-nocoupon')
  assert.ok(html.includes('₹1,200'), 'subtotal/total 1200')
  assert.ok(!html.includes('Coupon'), 'no coupon row when couponDiscount is 0')
  assert.ok(!html.includes('Tax'), 'no tax row on order summary (invoice-only)')
})

// Buyer/seller order list endpoints return full OrderResponse objects.
const orderListPage = {
  items: [orderWithCoupon, orderNoCoupon],
  page: 1, limit: 10, total: 2, totalPages: 1,
}

/* Order list (buyer) */
check('OrderListPage', () => {
  const qc = clientWith([[['orders', { page: 1, status: '' }], orderListPage]])
  const html = render(providers(qc, '/orders', '/orders', OrderListPage))
  assertMoneyClean(html, 'order-list')
  assert.ok(html.includes('₹3,760'), 'list shows total 3760')
  assert.ok(html.includes('₹1,200'), 'list shows total 1200')
})

/* Seller orders */
check('SellerOrdersPage', () => {
  const qc = clientWith([[['orders', { page: 1, status: '' }], orderListPage]])
  const html = render(providers(qc, '/seller/orders', '/seller/orders', SellerOrdersPage))
  assertMoneyClean(html, 'seller-orders')
  assert.ok(html.includes('₹3,760'), 'seller list shows total 3760')
})

/* Admin orders (itemCount + total) */
check('AdminOrdersPage', () => {
  const qc = clientWith([[['admin-orders', 1, ''], adminOrdersPage]])
  const html = render(providers(qc, '/admin/orders', '/admin/orders', AdminOrdersPage))
  assertMoneyClean(html, 'admin-orders')
  assert.ok(html.includes('2 item(s)'), 'admin list shows itemCount 2')
  assert.ok(html.includes('₹3,760'), 'admin list shows total 3760')
})

/* Checkout summary from cart */
check('CheckoutPage', () => {
  const qc = clientWith([
    [['cart'], cart],
    [['addresses'], []],
  ])
  const html = render(providers(qc, '/checkout', '/checkout', CheckoutPage))
  assertMoneyClean(html, 'checkout')
  assert.ok(html.includes('₹3,200'), 'checkout line 1 subtotal')
  assert.ok(html.includes('₹1,500'), 'checkout line 2 subtotal')
  assert.ok(html.includes('₹4,700'), 'checkout total payable')
})

/* Cart page */
check('CartPage', () => {
  const qc = clientWith([[['cart'], cart]])
  const html = render(providers(qc, '/cart', '/cart', CartPage))
  assertMoneyClean(html, 'cart')
  assert.ok(html.includes('₹800'), 'cart unit price 800')
  assert.ok(html.includes('₹4,700'), 'cart total 4700')
})

await vite.close()

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('\nAll money UI checks passed — no NaN/undefined/null rendered.')
