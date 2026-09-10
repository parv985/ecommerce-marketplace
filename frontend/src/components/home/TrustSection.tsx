import { BadgeCheck, Headset, LockKeyhole } from 'lucide-react'
import { SectionHeader } from './SectionHeader'

/**
 * "Why NexCart" trust band — light theme.
 *
 * Three platform guarantees presented as subtle white cards on a soft-gray
 * band. Copy reflects real platform behaviour: sellers are admin-approved
 * before listing, Razorpay-protected checkout with COD, and a 7-day
 * return window.
 */
const TRUST_ITEMS = [
  {
    icon: BadgeCheck,
    title: 'Verified Sellers',
    desc: 'Every merchant is reviewed and approved before they can list a single item.',
  },
  {
    icon: LockKeyhole,
    title: 'Secure Checkout',
    desc: 'Razorpay-protected payments — UPI, cards, net-banking or cash on delivery.',
  },
  {
    icon: Headset,
    title: 'Dedicated Support',
    desc: 'A 7-days-a-week resolution desk for orders, returns and refunds.',
  },
] as const

export function TrustSection() {
  return (
    <section
      aria-labelledby="home-trust-title"
      className="border-y border-[var(--border)] bg-[var(--surface-gray)] py-9 md:py-12"
    >
      <div className="container-app">
        <SectionHeader
          eyebrow="Why NexCart"
          title="A marketplace you can rely on"
          titleId="home-trust-title"
          subtitle="Platform promises backed by real policies — every guarantee below is enforced end-to-end."
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4">
          {TRUST_ITEMS.map((item) => (
            <div
              key={item.title}
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4 transition-colors duration-200 hover:border-[var(--border-strong)] md:p-5"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] border border-[var(--primary)]/15 bg-[var(--primary-subtle)] text-[var(--primary)]">
                <item.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <h3 className="mt-3.5 text-sm font-semibold tracking-tight text-[var(--fg)]">
                {item.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
