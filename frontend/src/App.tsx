import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MainLayout } from '@/layouts/MainLayout'
import { AdminRootLayout } from '@/layouts/AdminRootLayout'
import { SellerLayout } from '@/layouts/SellerLayout'
import { AdminLayout } from '@/layouts/AdminLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'

// Auth
import AuthPage from '@/pages/auth/AuthPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'

// Buyer
import { HomePage } from '@/pages/HomePage'
import { ProductListPage } from '@/pages/ProductListPage'
import { ProductDetailPage } from '@/pages/ProductDetailPage'
import { CartPage } from '@/pages/CartPage'
import { CheckoutPage } from '@/pages/CheckoutPage'
import { OrderListPage } from '@/pages/OrderListPage'
import { OrderDetailPage } from '@/pages/OrderDetailPage'
import { PaymentPage } from '@/pages/PaymentPage'
import { AccountPage } from '@/pages/AccountPage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { WishlistPage } from '@/pages/WishlistPage'

// Seller
import { RegisterSellerPage } from '@/pages/seller/RegisterSellerPage'
import { PendingApprovalPage } from '@/pages/seller/PendingApprovalPage'
import { SellerDashboardPage } from '@/pages/seller/SellerDashboardPage'
import { SellerProductsPage } from '@/pages/seller/SellerProductsPage'
import { SellerOrdersPage } from '@/pages/seller/SellerOrdersPage'
import { SellerInventoryPage } from '@/pages/seller/SellerInventoryPage'
import { SellerDiscountsPage } from '@/pages/seller/SellerDiscountsPage'
import { SellerCouponsPage } from '@/pages/seller/SellerCouponsPage'
import { SellerCustomersPage } from '@/pages/seller/SellerCustomersPage'
import { SellerAnalyticsPage } from '@/pages/seller/SellerAnalyticsPage'
import { SellerProfilePage } from '@/pages/seller/SellerProfilePage'
import { SellerSettlementPage } from '@/pages/seller/SellerSettlementPage'
import { SellerTwoFactorSetupPage } from '@/pages/seller/SellerTwoFactorSetupPage'

// Admin
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage'
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage'
import { AdminSellersPage } from '@/pages/admin/AdminSellersPage'
import { AdminCategoriesPage } from '@/pages/admin/AdminCategoriesPage'
import { AdminProductsPage } from '@/pages/admin/AdminProductsPage'
import { AdminOrdersPage } from '@/pages/admin/AdminOrdersPage'
import { AdminSettlementsPage } from '@/pages/admin/AdminSettlementsPage'
import { AdminNotificationsPage } from '@/pages/admin/AdminNotificationsPage'
import { AdminAuditPage } from '@/pages/admin/AdminAuditPage'
import AdminProfilePage from '@/pages/admin/AdminProfilePage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
      </BrowserRouter>
    </QueryClientProvider>
  )
}
