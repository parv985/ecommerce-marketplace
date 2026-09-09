import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { APP_NAME } from '@/config/brand'
import './footer.css'

export type FooterPolicy = 'shipping' | 'returns' | 'privacy' | 'terms'

interface PolicySection {
  heading: string
  body: string
}

interface PolicyDefinition {
  title: string
  intro: string
  sections: PolicySection[]
}

/*
 * Short, plain-language policy summaries surfaced from the footer.
 *
 * The application has no dedicated legal pages (and routes must not be
 * added by the homepage/footer redesign), so these summaries live inside
 * the footer component itself. Copy reflects real platform behaviour —
 * admin-approved sellers, ₹999 free-shipping threshold, Razorpay checkout
 * with COD, and the 7-day return window enforced by the returns module.
 * They are summaries, not legal advice — swap in reviewed legal copy when
 * the business finalises it.
 */
const POLICIES: Record<FooterPolicy, PolicyDefinition> = {
  shipping: {
    title: 'Shipping & Delivery',
    intro:
      `${APP_NAME} connects you with multiple verified sellers, so each order is packed and dispatched by the seller you bought from.`,
    sections: [
      {
        heading: 'Free shipping over ₹999',
        body: 'Orders above ₹999 ship free. A shipping fee may apply to smaller orders and certain remote pin codes, and is always shown before you pay.',
      },
      {
        heading: 'Dispatch & delivery',
        body: 'Sellers dispatch within a few working days of order confirmation. Delivery timelines vary by pin code — typical metro deliveries land in 2–5 business days, other regions within about a week.',
      },
      {
        heading: 'Cash on delivery',
        body: 'Cash on delivery is available on eligible orders alongside online payment. You can track every shipment from the Orders section of your account.',
      },
    ],
  },
  returns: {
    title: 'Returns & Refunds',
    intro:
      `If something is not right with your order, ${APP_NAME} makes returns and refunds straightforward.`,
    sections: [
      {
        heading: '7-day return window',
        body: 'You can raise a return within 7 days of delivery from the order page in your account. Items must be unused and in their original packaging with tags intact.',
      },
      {
        heading: 'Refunds to the original payment method',
        body: 'Once a return is approved and completed, refunds are issued to the original payment method. Online payments are refunded through the payment gateway; cash-on-delivery orders are refunded after the return is completed.',
      },
      {
        heading: 'Cancellations',
        body: 'Cancellable orders can be cancelled before dispatch. Any amount paid is refunded automatically, and stock is restored to the seller.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro:
      `This is a short summary of how ${APP_NAME} handles your data. It is provided for convenience and does not replace reviewed legal copy.`,
    sections: [
      {
        heading: 'What we collect',
        body: 'Account details (name, contact information), shipping addresses, and order history — only what is needed to operate your account and deliver your orders.',
      },
      {
        heading: 'How payments are handled',
        body: 'Online payments are processed by Razorpay. Your full card details go to the payment gateway and are not stored on our servers. Login sessions use signed, short-lived access tokens with rotating refresh cookies.',
      },
      {
        heading: 'Your choices',
        body: 'We do not sell your personal data. Seller partners receive only the details required to fulfil your order. For data access or deletion requests, reach out through the support desk.',
      },
    ],
  },
  terms: {
    title: 'Terms & Conditions',
    intro:
      `This is a short summary of the terms that govern your use of the ${APP_NAME} marketplace. It is provided for convenience and does not replace reviewed legal copy.`,
    sections: [
      {
        heading: 'A marketplace, not the seller',
        body: `${APP_NAME} is a multi-vendor marketplace: independent, admin-verified sellers list and sell their own products. Each seller is responsible for their listings, pricing, quality and dispatch.`,
      },
      {
        heading: 'Buyer protections',
        body: 'Purchases are protected by our return and refund policies. Product prices and discounts are set by sellers; live discounts are applied at checkout exactly as displayed on the product page.',
      },
      {
        heading: 'Fair use',
        body: 'Accounts must be used lawfully and in line with platform rules. We may suspend accounts that abuse the marketplace, other users, or our sellers.',
      },
    ],
  },
}

interface PolicyModalProps {
  policy: FooterPolicy
  onClose: () => void
}

/**
 * Modal dialog presenting a footer policy summary. Self-contained within
 * the footer (no new routes): closes on Escape, backdrop click, or the
 * close button, and locks body scroll while open.
 */
export function PolicyModal({ policy, onClose }: PolicyModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const definition = POLICIES[policy]

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return (
    <div
      className="nc-footer-overlay fixed inset-0 z-[100] flex items-end justify-center bg-[#191816]/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="footer-policy-title"
        className="nc-footer-panel flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[var(--radius-xl)] border border-[var(--border)] bg-white shadow-[var(--shadow-lg)] sm:rounded-[var(--radius-xl)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4 md:px-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">
              {APP_NAME} Marketplace
            </p>
            <h2 id="footer-policy-title" className="mt-0.5 text-lg font-semibold tracking-tight text-[var(--fg)]">
              {definition.title}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] text-[var(--fg-secondary)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--fg)]"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 md:px-6">
          <p className="text-sm leading-relaxed text-[var(--fg-secondary)]">{definition.intro}</p>
          <div className="mt-5 space-y-5">
            {definition.sections.map((section) => (
              <section key={section.heading}>
                <h3 className="text-sm font-semibold text-[var(--fg)]">{section.heading}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{section.body}</p>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
