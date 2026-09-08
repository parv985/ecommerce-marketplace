import { Link } from 'react-router-dom'
import { APP_NAME, APP_DESCRIPTION, APP_COPYRIGHT } from '@/config/brand'

export function Footer() {
  return (
    <footer className="bg-[#191816] text-[#9e9b94] mt-auto border-t border-neutral-800">
      <div className="container-app py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
          <div>
            <h3 className="text-lg font-bold text-white mb-3 tracking-tight">
              {APP_NAME}<span className="text-[var(--primary)] font-black">.</span>
            </h3>
            <p className="text-sm text-[#9e9b94] leading-relaxed">
              {APP_DESCRIPTION}
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-xs uppercase tracking-wider text-neutral-300 mb-4">Shop</h4>
            <ul className="space-y-2.5">
              <li><Link to="/products" className="text-sm text-[#9e9b94] hover:text-white transition-colors">All Products</Link></li>
              <li><Link to="/products?sort=newest" className="text-sm text-[#9e9b94] hover:text-white transition-colors">New Arrivals</Link></li>
              <li><Link to="/products?sort=price_asc" className="text-sm text-[#9e9b94] hover:text-white transition-colors">Best Deals</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-xs uppercase tracking-wider text-neutral-300 mb-4">Account</h4>
            <ul className="space-y-2.5">
              <li><Link to="/orders" className="text-sm text-[#9e9b94] hover:text-white transition-colors">My Orders</Link></li>
              <li><Link to="/cart" className="text-sm text-[#9e9b94] hover:text-white transition-colors">Cart</Link></li>
              <li><Link to="/wishlist" className="text-sm text-[#9e9b94] hover:text-white transition-colors">Wishlist</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-xs uppercase tracking-wider text-neutral-300 mb-4">Seller</h4>
            <ul className="space-y-2.5">
              <li><Link to="/seller/register" className="text-sm text-[#9e9b94] hover:text-white transition-colors">Become a Seller</Link></li>
              <li><Link to="/seller/dashboard" className="text-sm text-[#9e9b94] hover:text-white transition-colors">Seller Dashboard</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-neutral-800 text-center text-xs text-neutral-500">
          <p>{APP_COPYRIGHT}</p>
        </div>
      </div>
    </footer>
  )
}
