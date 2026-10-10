import React from 'react'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Themed checkbox for the marketplace's own UI (no browser default, which
 * would render a system-blue box inside a warm-neutral design).
 *
 * Supports the indeterminate state used by "select all" rows: when
 * `checked` is the string 'indeterminate' the box shows a dash, which keeps
 * a partially filtered selection honest instead of implying "all".
 *
 * The input is a real checkbox (visually replaced by the box), so it stays
 * keyboard operable, is announced by screen readers, and works with
 * `<label htmlFor>` — exactly what the buyer multi-select needs.
 */
interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked'> {
  label?: string
  checked: boolean | 'indeterminate'
  onCheckedChange?: (checked: boolean) => void
  /** Secondary text on the right of the row (e.g. an email address). */
  description?: string
  /**
   * Extra content pinned to the far right of the row. It lives inside the
   * label (never in a wrapping one) so a row is exactly one clickable
   * label — nested labels are invalid HTML and double-fire the toggle.
   */
  trailing?: React.ReactNode
}

export function Checkbox({
  label,
  checked,
  onCheckedChange,
  description,
  trailing,
  className,
  id,
  disabled,
  ...props
}: CheckboxProps) {
  /*
   * The input is always associated with its own label. Without an explicit
   * `id` one is generated — a label pointing at nothing would leave the
   * row unannounced and the empty space outside the box unclickable.
   */
  const reactId = React.useId()
  const inputId = id ?? `checkbox-${reactId}`
  const isIndeterminate = checked === 'indeterminate'

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex cursor-pointer items-start gap-2 select-none',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center pt-0.5">
        <input
          id={inputId}
          type="checkbox"
          checked={checked === true}
          disabled={disabled}
          aria-checked={isIndeterminate ? 'mixed' : checked}
          onChange={event => onCheckedChange?.(event.target.checked)}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          {...props}
        />
        <span
          aria-hidden
          className={cn(
            'flex h-4 w-4 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-white text-[var(--primary-fg)] transition-all duration-150 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--primary)]',
            (checked === true || isIndeterminate) &&
              'border-[var(--primary)] bg-[var(--primary)]'
          )}
        >
          {isIndeterminate ? (
            <Minus size={12} strokeWidth={3} />
          ) : checked === true ? (
            <Check size={12} strokeWidth={3} />
          ) : null}
        </span>
      </span>
      {(label || description) && (
        <span className="min-w-0 flex-1">
          {label && (
            <span className="block truncate text-sm text-[var(--fg)]">{label}</span>
          )}
          {description && (
            <span className="block truncate text-xs text-[var(--muted)]">
              {description}
            </span>
          )}
        </span>
      )}
      {trailing}
    </label>
  )
}
