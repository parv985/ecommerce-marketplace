import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  DollarSign,
  Package,
  Percent,
} from 'lucide-react'
import type { MouseEvent } from 'react'
import { toast } from 'react-hot-toast'
import { APP_NAME } from '@/config/brand'
import { useAuthStore } from '@/stores/authStore'

/**
 * "Become a NexCart Seller" CTA — light theme.
 *
 * Sits between the trust band and the footer. The primary action routes to
 * the real seller-registration funnel (`/seller/register`); authenticated
 * sellers/buyers are blocked with the same role toasts the footer uses.
 * The perk list only describes real platform features (admin verification,
 * product/inventory tooling, discounts & coupons, analytics, settlements).
 */
const SELLER_PERKS = [
  {
    icon: Package,
    title: 'List & manage products',
    desc: 'Inventory, stock alerts and product controls from one dashboard.',
  },
  {
    icon: Percent,
    title: 'Discounts & coupons',
    desc: 'Run seller deals that buyers see live on product pages.',
  },
  {
    icon: BarChart3,
    title: 'Sales analytics',
    desc: 'Track revenue, orders and category performance over time.',
  },
  {
    icon: DollarSign,
    title: 'Transparent settlements',
    desc: 'Clear commission and scheduled payouts on completed orders.',
  },
] as const

export function SellerCtaSection() {
  /*
   * Sellers and buyers cannot use the seller registration funnel. Show
   * exactly one role-appropriate toast and stay on the page.
   */
  const handleBecomeSeller = (event: MouseEvent<HTMLAnchorElement>) => {
    const { isAuthenticated, user } = useAuthStore.getState()

    if (!isAuthenticated || !user) return

    if (user.role === 'SELLER') {
      event.preventDefault()
      toast.error('You are already registered as a seller.', { id: 'seller-cta-already-registered' })
    } else if (user.role === 'BUYER') {
      event.preventDefault()
      toast.error('Buyers cannot sell products.', { id: 'seller-cta-buyer' })
    }
  }

  return (
    <section className="bg-white py-9 md:py-12" aria-labelledby="home-seller-title">
      <div className="container-app">
        <div className="nc-home-seller-panel relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] px-5 py-8 shadow-[var(--shadow-sm)] sm:px-8 md:px-10 md:py-11">
          {/* Warm decorative accents */}
          <div className="nc-home-glow-soft absolute -bottom-24 -left-16 h-64 w-64 rounded-full opacity-90" aria-hidden />
          <div className="nc-home-dots absolute right-8 top-8 h-32 w-32 opacity-50" aria-hidden />
          <div className="nc-home-glow absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-50" aria-hidden />

          <div className="relative grid items-center gap-8 lg:grid-cols-[1.12fr_0.88fr] lg:gap-14">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">
                <span className="h-px w-5 bg-[var(--primary)]" aria-hidden />
                For sellers
              </p>
              <h2
                id="home-seller-title"
                className="mt-2 text-2xl font-semibold tracking-tight text-[var(--fg)] sm:text-[1.7rem]"
              >
                Turn your catalogue into a storefront on {APP_NAME}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--fg-secondary)] md:text-base">
                Join India&rsquo;s multi-vendor marketplace — get admin-verified, list your
                products and reach buyers who already shop with confidence here.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  to="/seller/register"
                  onClick={handleBecomeSeller}
                  className="inline-flex items-center gap-2 rounded-[var(--radius)] bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_10px_-2px_rgba(184,62,32,0.45)] transition-colors duration-150 hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)]"
                >
                  Become a Seller
                  <ArrowRight size={15} aria-hidden />
                </Link>
                <Link
                  to="/seller/dashboard"
                  onClick={handleBecomeSeller}
                  className="inline-flex items-center rounded-[var(--radius)] border border-[var(--border-strong)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--fg)] transition-colors duration-150 hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  Seller Dashboard
                </Link>
              </div>
            </div>

            {/* Real feature checklist (no invented numbers or screenshots) */}
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white/90 p-5 backdrop-blur-sm md:p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
                Everything included
              </p>
              <ul className="mt-4 space-y-4">
                {SELLER_PERKS.map((perk) => (
                  <li key={perk.title} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--primary)]/15 bg-[var(--primary-subtle)] text-[var(--primary)]">
                      <perk.icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold tracking-tight text-[var(--fg)]">
                        {perk.title}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-[var(--muted)]">
                        {perk.desc}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
