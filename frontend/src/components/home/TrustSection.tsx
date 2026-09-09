import { BadgeCheck, Headset, LockKeyhole, Truck } from 'lucide-react'

/**
 * "Why NexCart" trust band.
 *
 * Four platform guarantees presented as a divided strip — a calmer, more
 * premium take on the previous icon row. Copy reflects real platform
 * behaviour: sellers are admin-approved before listing, free shipping over
 * ₹999, Razorpay-protected checkout with COD, and a 7-day return window.
 */
const TRUST_ITEMS = [
  {
    icon: BadgeCheck,
    title: 'Verified Sellers',
    desc: 'Every merchant is reviewed and approved before they can list a single item.',
  },
  {
    icon: Truck,
    title: 'Free Shipping',
    desc: 'Free delivery on orders over ₹999, shipped to pin codes across India.',
  },
  {
    icon: LockKeyhole,
    title: 'Secure Checkout',
    desc: 'Razorpay-protected payments — UPI, cards, net-banking or cash on delivery.',
  },
  {
    icon: Headset,
    title: 'Dedicated Support',
    desc: 'A 7-days-a-week resolution desk for orders, 7-day returns and refunds.',
  },
] as const

export function TrustSection() {
  return (
    <section aria-label="Why shop with NexCart" className="border-y border-[var(--border)] bg-white">
      <div className="container-app py-9 md:py-11">
        <div className="grid grid-cols-1 gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-4 lg:gap-y-0 lg:divide-x lg:divide-[var(--border)]">
          {TRUST_ITEMS.map((item) => (
            <div key={item.title} className="flex items-start gap-3.5 lg:px-6 lg:first:pl-0 lg:last:pr-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--primary)]/15 bg-[var(--primary-subtle)] text-[var(--primary)]">
                <item.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-[var(--fg)]">{item.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
