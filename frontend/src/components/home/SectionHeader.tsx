import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

interface SectionHeaderProps {
  /** Small uppercase terracotta eyebrow rendered above the title. */
  eyebrow: string
  title: string
  /** Optional id for the title element (lets sections use aria-labelledby). */
  titleId?: string
  subtitle?: string
  /** Optional "view all" link rendered on the right. */
  linkTo?: string
  linkLabel?: string
}

/**
 * Consistent homepage section header: eyebrow + title + optional subtitle,
 * with an optional right-aligned "view all" affordance. Used by every
 * homepage product/category section so spacing and hierarchy stay aligned.
 */
export function SectionHeader({ eyebrow, title, titleId, subtitle, linkTo, linkLabel }: SectionHeaderProps) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 md:mb-7">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">
          <span className="h-px w-5 bg-[var(--primary)]" aria-hidden />
          {eyebrow}
        </p>
        <h2 id={titleId} className="mt-1.5 text-xl font-semibold tracking-tight text-[var(--fg)] md:text-2xl">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 hidden text-sm text-[var(--muted)] sm:block">{subtitle}</p>
        )}
      </div>
      {linkTo && (
        <Link
          to={linkTo}
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] text-sm font-semibold text-[var(--fg-secondary)] transition-colors hover:text-[var(--primary)]"
        >
          {linkLabel ?? 'View all'}
          <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  )
}
