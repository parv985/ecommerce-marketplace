import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { MouseEvent, ReactNode } from 'react'
import { toast } from 'react-hot-toast'
import { BadgeCheck, LockKeyhole } from 'lucide-react'
import { APP_NAME, APP_DESCRIPTION, APP_TAGLINE, APP_COPYRIGHT } from '@/config/brand'
import { useAuthStore } from '@/stores/authStore'
import { PolicyModal, type FooterPolicy } from './footer/PolicyModal'
import './footer/footer.css'

/*
 * Marketplace footer — light NexCart styling with a structured link system:
 * brand summary, Shop, Account, Sellers, Customer Support and Legal (policy
 * summaries open in a self-contained modal so no new routes are introduced).
 * Dark ink is used for text only; the terracotta brand color is the hover
 * and heading accent.
 */

/** A footer link is either an internal route or a policy-summary action. */
type FooterItem =
  | { label: string; to: string }
  | { label: string; policy: FooterPolicy }

const SHOP_LINKS: FooterItem[] = [
  { label: 'Products', to: '/products' },
  { label: 'Categories', to: '/products' },
  { label: 'New Arrivals', to: '/products?sort=newest' },
  { label: 'Best Deals', to: '/products?sort=price_asc' },
]

const ACCOUNT_LINKS: FooterItem[] = [
  { label: 'My Account', to: '/account' },
  { label: 'My Orders', to: '/orders' },
  { label: 'Cart', to: '/cart' },
  { label: 'Wishlist', to: '/wishlist' },
  { label: 'Notifications', to: '/notifications' },
]

const SELLER_LINKS: FooterItem[] = [
  { label: 'Become a Seller', to: '/seller/register' },
  { label: 'Seller Dashboard', to: '/seller/dashboard' },
]

const SUPPORT_LINKS: FooterItem[] = [
  { label: 'Shipping & Delivery', policy: 'shipping' },
  { label: 'Returns & Refunds', policy: 'returns' },
]

const LEGAL_LINKS: FooterItem[] = [
  { label: 'Privacy Policy', policy: 'privacy' },
  { label: 'Terms & Conditions', policy: 'terms' },
]

const BRAND_MARKS = [
  { icon: BadgeCheck, text: 'Admin-verified sellers' },
  { icon: LockKeyhole, text: 'Secure Razorpay checkout' },
] as const

export function Footer() {
  const [policy, setPolicy] = useState<FooterPolicy | null>(null)

  const { isAuthenticated, user } = useAuthStore()
  const isBuyer = isAuthenticated && user?.role === 'BUYER'

  /*
   * Sellers and buyers cannot use the seller registration funnel. Show
   * exactly one role-appropriate toast and stay on the page; the fixed
   * toast ids also de-duplicate any StrictMode double-invocation.
   */
  const handleBecomeSeller = (event: MouseEvent<HTMLAnchorElement>) => {
    const { isAuthenticated, user } = useAuthStore.getState()

    if (!isAuthenticated || !user) return

    if (user.role === 'SELLER') {
      event.preventDefault()
      toast.error('You are already registered as a seller.', { id: 'become-seller-already-registered' })
    } else if (user.role === 'BUYER') {
      event.preventDefault()
      toast.error('Buyers cannot sell products.', { id: 'become-seller-buyer' })
    }
  }

  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--surface-warm)] text-[var(--fg-secondary)]">
      <div className="container-app py-10 lg:py-12">
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-3 lg:grid-cols-6 lg:gap-x-8">
          {/* ── Brand ── */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <h3 className="text-lg font-bold tracking-tight text-[var(--fg)]">
              {APP_NAME}
              <span className="font-black text-[var(--primary)]">.</span>
            </h3>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--fg-secondary)] lg:max-w-none">
              {APP_DESCRIPTION}
            </p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              {APP_TAGLINE}
            </p>
            <ul className="mt-5 space-y-2">
              {BRAND_MARKS.map((mark) => (
                <li key={mark.text} className="flex items-center gap-2 text-xs text-[var(--fg-secondary)]">
                  <mark.icon size={14} className="shrink-0 text-[var(--primary)]" aria-hidden />
                  {mark.text}
                </li>
              ))}
            </ul>
          </div>

          <FooterColumn title="Shop" items={SHOP_LINKS} />
          <FooterColumn title="Account" items={ACCOUNT_LINKS} />
          {!isBuyer && (
            <FooterColumn title="For Sellers" items={SELLER_LINKS} onLinkClick={handleBecomeSeller} />
          )}
          <FooterColumn title="Customer Support" items={SUPPORT_LINKS} onPolicyOpen={setPolicy} />
          <FooterColumn title="Legal" items={LEGAL_LINKS} onPolicyOpen={setPolicy} />
        </div>

        {/* ── Bottom bar ── */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-[var(--border)] pt-6 sm:flex-row">
          <p className="text-xs text-[var(--muted)]">{APP_COPYRIGHT}</p>
          <div className="flex items-center gap-1.5">
            {(['privacy', 'terms', 'returns'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPolicy(key)}
                className="rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[var(--muted)] transition-colors hover:text-[var(--primary)]"
              >
                {POLICY_SHORT_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {policy && <PolicyModal policy={policy} onClose={() => setPolicy(null)} />}
    </footer>
  )
}

/* ── Building blocks ── */

const POLICY_SHORT_LABELS: Record<FooterPolicy, string> = {
  shipping: 'Shipping',
  returns: 'Refunds',
  privacy: 'Privacy',
  terms: 'Terms',
}

interface FooterColumnProps {
  title: string
  items: FooterItem[]
  /** Wrap internal links (used for the guarded Become-a-Seller funnel). */
  onLinkClick?: (event: MouseEvent<HTMLAnchorElement>) => void
  /** Open a policy summary (Support + Legal columns and bottom-bar shortcuts). */
  onPolicyOpen?: (policy: FooterPolicy) => void
}

function FooterColumn({ title, items, onLinkClick, onPolicyOpen }: FooterColumnProps): ReactNode {
  return (
    <nav aria-label={title}>
      <h4 className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--fg)]">
        {title}
      </h4>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.label}>
            {'to' in item ? (
              <Link
                to={item.to}
                onClick={onLinkClick}
                className="inline-block rounded-[var(--radius-sm)] py-1 text-sm text-[var(--fg-secondary)] transition-colors duration-150 hover:text-[var(--primary)]"
              >
                {item.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onPolicyOpen?.(item.policy)}
                className="inline-block rounded-[var(--radius-sm)] py-1 text-left text-sm text-[var(--fg-secondary)] transition-colors duration-150 hover:text-[var(--primary)]"
              >
                {item.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
