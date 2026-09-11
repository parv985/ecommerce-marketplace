import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MainLayout } from '@/layouts/MainLayout'
import { AdminRootLayout } from '@/layouts/AdminRootLayout'
import { SellerLayout } from '@/layouts/SellerLayout'
import { AdminLayout } from '@/layouts/AdminLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'

/* ── Lazy-loaded route components ── */

// Auth
const AuthPage = lazy(() => import('@/pages/auth/AuthPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })))

// Buyer
const HomePage = lazy(() => import('@/pages/HomePage').then(m => ({ default: m.HomePage })))
const ProductListPage = lazy(() => import('@/pages/ProductListPage').then(m => ({ default: m.ProductListPage })))
const ProductDetailPage = lazy(() => import('@/pages/ProductDetailPage').then(m => ({ default: m.ProductDetailPage })))
const CartPage = lazy(() => import('@/pages/CartPage').then(m => ({ default: m.CartPage })))
const CheckoutPage = lazy(() => import('@/pages/CheckoutPage').then(m => ({ default: m.CheckoutPage })))
const OrderListPage = lazy(() => import('@/pages/OrderListPage').then(m => ({ default: m.OrderListPage })))
const OrderDetailPage = lazy(() => import('@/pages/OrderDetailPage').then(m => ({ default: m.OrderDetailPage })))
const ReturnListPage = lazy(() => import('@/pages/ReturnListPage').then(m => ({ default: m.ReturnListPage })))
const ReturnDetailPage = lazy(() => import('@/pages/ReturnDetailPage').then(m => ({ default: m.ReturnDetailPage })))
const PaymentPage = lazy(() => import('@/pages/PaymentPage').then(m => ({ default: m.PaymentPage })))
const AccountPage = lazy(() => import('@/pages/AccountPage').then(m => ({ default: m.AccountPage })))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })))
const WishlistPage = lazy(() => import('@/pages/WishlistPage').then(m => ({ default: m.WishlistPage })))

// Seller
const RegisterSellerPage = lazy(() => import('@/pages/seller/RegisterSellerPage').then(m => ({ default: m.RegisterSellerPage })))
const PendingApprovalPage = lazy(() => import('@/pages/seller/PendingApprovalPage').then(m => ({ default: m.PendingApprovalPage })))
const SellerDashboardPage = lazy(() => import('@/pages/seller/SellerDashboardPage').then(m => ({ default: m.SellerDashboardPage })))
const SellerProductsPage = lazy(() => import('@/pages/seller/SellerProductsPage').then(m => ({ default: m.SellerProductsPage })))
const SellerOrdersPage = lazy(() => import('@/pages/seller/SellerOrdersPage').then(m => ({ default: m.SellerOrdersPage })))
const SellerReturnsPage = lazy(() => import('@/pages/seller/SellerReturnsPage').then(m => ({ default: m.SellerReturnsPage })))
const SellerInventoryPage = lazy(() => import('@/pages/seller/SellerInventoryPage').then(m => ({ default: m.SellerInventoryPage })))
const SellerDiscountsPage = lazy(() => import('@/pages/seller/SellerDiscountsPage').then(m => ({ default: m.SellerDiscountsPage })))
const SellerCouponsPage = lazy(() => import('@/pages/seller/SellerCouponsPage').then(m => ({ default: m.SellerCouponsPage })))
const SellerCustomersPage = lazy(() => import('@/pages/seller/SellerCustomersPage').then(m => ({ default: m.SellerCustomersPage })))
const SellerAnalyticsPage = lazy(() => import('@/pages/seller/SellerAnalyticsPage').then(m => ({ default: m.SellerAnalyticsPage })))
const SellerProfilePage = lazy(() => import('@/pages/seller/SellerProfilePage').then(m => ({ default: m.SellerProfilePage })))
const SellerSettlementPage = lazy(() => import('@/pages/seller/SellerSettlementPage').then(m => ({ default: m.SellerSettlementPage })))
const SellerTwoFactorSetupPage = lazy(() => import('@/pages/seller/SellerTwoFactorSetupPage').then(m => ({ default: m.SellerTwoFactorSetupPage })))

// Admin
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage').then(m => ({ default: m.AdminDashboardPage })))
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage').then(m => ({ default: m.AdminUsersPage })))
const AdminSellersPage = lazy(() => import('@/pages/admin/AdminSellersPage').then(m => ({ default: m.AdminSellersPage })))
const AdminCategoriesPage = lazy(() => import('@/pages/admin/AdminCategoriesPage').then(m => ({ default: m.AdminCategoriesPage })))
const AdminProductsPage = lazy(() => import('@/pages/admin/AdminProductsPage').then(m => ({ default: m.AdminProductsPage })))
const AdminOrdersPage = lazy(() => import('@/pages/admin/AdminOrdersPage').then(m => ({ default: m.AdminOrdersPage })))
const AdminOrderDetailPage = lazy(() => import('@/pages/admin/AdminOrderDetailPage').then(m => ({ default: m.AdminOrderDetailPage })))
const AdminSettlementsPage = lazy(() => import('@/pages/admin/AdminSettlementsPage').then(m => ({ default: m.AdminSettlementsPage })))
const AdminNotificationsPage = lazy(() => import('@/pages/admin/AdminNotificationsPage').then(m => ({ default: m.AdminNotificationsPage })))
const AdminAuditPage = lazy(() => import('@/pages/admin/AdminAuditPage').then(m => ({ default: m.AdminAuditPage })))
const AdminProfilePage = lazy(() => import('@/pages/admin/AdminProfilePage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

/** Full-page loading skeleton shown while a lazy route loads. */
function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
        <p className="text-xs font-medium text-[var(--muted)]">Loading…</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* ── Admin routes (separate layout, no marketplace header/footer) ── */}
            <Route element={<AdminRootLayout />}>
              <Route path="/admin" element={
                <ProtectedRoute roles={['SUPER_ADMIN']}>
                  <AdminLayout />
                </ProtectedRoute>
              }>
                <Route path="dashboard" element={<AdminDashboardPage />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="sellers" element={<AdminSellersPage />} />
                <Route path="categories" element={<AdminCategoriesPage />} />
                <Route path="products" element={<AdminProductsPage />} />
                <Route path="orders" element={<AdminOrdersPage />} />
                <Route path="orders/:id" element={<AdminOrderDetailPage />} />
                <Route path="settlements" element={<AdminSettlementsPage />} />
                <Route path="notifications" element={<AdminNotificationsPage />} />
                <Route path="audit" element={<AdminAuditPage />} />
                <Route path="profile" element={<AdminProfilePage />} />
              </Route>
            </Route>

            {/* ── Marketplace routes (buyer/seller/guest) ── */}
            <Route element={<MainLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/products" element={<ProductListPage />} />
              <Route path="/products/:id" element={<ProductDetailPage />} />
              <Route path="/login" element={<AuthPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              {/* Buyer-only protected routes */}
              <Route path="/cart" element={
                <ProtectedRoute roles={['BUYER']}>
                  <CartPage />
                </ProtectedRoute>
              } />
              <Route path="/checkout" element={
                <ProtectedRoute roles={['BUYER']}>
                  <CheckoutPage />
                </ProtectedRoute>
              } />
              <Route path="/orders" element={
                <ProtectedRoute roles={['BUYER']}>
                  <OrderListPage />
                </ProtectedRoute>
              } />
              <Route path="/orders/:id" element={
                <ProtectedRoute roles={['BUYER']}>
                  <OrderDetailPage />
                </ProtectedRoute>
              } />
              <Route path="/orders/:id/pay" element={
                <ProtectedRoute roles={['BUYER']}>
                  <PaymentPage />
                </ProtectedRoute>
              } />
              <Route path="/returns" element={
                <ProtectedRoute roles={['BUYER']}>
                  <ReturnListPage />
                </ProtectedRoute>
              } />
              <Route path="/returns/:id" element={
                <ProtectedRoute roles={['BUYER']}>
                  <ReturnDetailPage />
                </ProtectedRoute>
              } />
              <Route path="/account" element={
                <ProtectedRoute roles={['BUYER']}>
                  <AccountPage />
                </ProtectedRoute>
              } />
              <Route path="/notifications" element={
                <ProtectedRoute roles={['BUYER', 'SELLER']}>
                  <NotificationsPage />
                </ProtectedRoute>
              } />
              <Route path="/wishlist" element={
                <ProtectedRoute roles={['BUYER']}>
                  <WishlistPage />
                </ProtectedRoute>
              } />

              {/* Seller registration (public, guarded inside RegisterSellerPage) */}
              <Route path="/seller/register" element={<RegisterSellerPage />} />
              <Route path="/seller/pending" element={
                <ProtectedRoute roles={['SELLER']}>
                  <PendingApprovalPage />
                </ProtectedRoute>
              } />
              <Route path="/seller/2fa-setup" element={
                <ProtectedRoute roles={['SELLER']}>
                  <SellerTwoFactorSetupPage />
                </ProtectedRoute>
              } />

              {/* Seller layout routes */}
              <Route path="/seller" element={
                <ProtectedRoute roles={['SELLER']}>
                  <SellerLayout />
                </ProtectedRoute>
              }>
                <Route path="dashboard" element={<SellerDashboardPage />} />
                <Route path="products" element={<SellerProductsPage />} />
                <Route path="orders" element={<SellerOrdersPage />} />
                <Route path="returns" element={<SellerReturnsPage />} />
                <Route path="inventory" element={<SellerInventoryPage />} />
                <Route path="discounts" element={<SellerDiscountsPage />} />
                <Route path="coupons" element={<SellerCouponsPage />} />
                <Route path="customers" element={<SellerCustomersPage />} />
                <Route path="analytics" element={<SellerAnalyticsPage />} />
                <Route path="profile" element={<SellerProfilePage />} />
                <Route path="settlement" element={<SellerSettlementPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
              </Route>

              {/* Catch-all 404 */}
              <Route path="*" element={
                <div className="text-center py-20">
                  <h1 className="text-4xl font-bold">404</h1>
                  <p className="text-[var(--muted)] mt-2">Page not found</p>
                </div>
              } />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
