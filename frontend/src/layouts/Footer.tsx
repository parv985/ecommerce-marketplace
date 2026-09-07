import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="border-t bg-white mt-auto">
      <div className="container-app py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-lg font-bold mb-4">ECOM</h3>
            <p className="text-sm text-[var(--muted)]">
              India's leading multi-vendor marketplace connecting sellers and buyers across the country.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-3">Shop</h4>
            <ul className="space-y-2">
              <li><Link to="/products" className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">All Products</Link></li>
              <li><Link to="/products?sort=newest" className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">New Arrivals</Link></li>
              <li><Link to="/products?sort=price_asc" className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">Best Deals</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-3">Account</h4>
            <ul className="space-y-2">
              <li><Link to="/orders" className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">My Orders</Link></li>
              <li><Link to="/cart" className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">Cart</Link></li>
              <li><Link to="/wishlist" className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">Wishlist</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-3">Seller</h4>
            <ul className="space-y-2">
              <li><Link to="/seller/register" className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">Become a Seller</Link></li>
              <li><Link to="/seller/dashboard" className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">Seller Dashboard</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t text-center text-sm text-[var(--muted)]">
          <p>&copy; {new Date().getFullYear()} ECOM Marketplace. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
