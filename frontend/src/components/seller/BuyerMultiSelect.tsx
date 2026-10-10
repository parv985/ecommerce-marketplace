import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Check, ChevronDown, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Multi-select dropdown of the buyers a seller can notify.
 *
 * One checkbox per buyer, a "select all" checkbox for the whole list, live
 * filtering over name/email, and removable chips for the current
 * selection — so a seller can target one buyer, several, or every buyer
 * they have, with a single control.
 *
 * The value is a list of buyer ids in the order they were picked; the
 * parent owns it, because it is the request body of the send. Filtering is
 * local (the parent loads the seller's customers once when the dialog
 * opens), so ticking buyers never triggers a refetch that could reset a
 * half-made selection.
 *
 * Accessibility: the trigger is a button with `aria-expanded`, the panel is
 * a labelled group, and each row is a real checkbox, so the list is fully
 * operable with Tab / Space and is announced correctly. Escape closes the
 * panel without clearing the selection.
 */

export interface BuyerOption {
  id: string
  name: string
  email: string
  /** Shown on the right of the row so the choice has some context. */
  orderCount?: number
}

interface BuyerMultiSelectProps {
  buyers: BuyerOption[]
  selectedIds: string[]
  onChange: (buyerIds: string[]) => void
  /** Buyers available server-side; when larger than `buyers`, list is a page. */
  total?: number
  loading?: boolean
  /** Load failure for the buyer list, with a way to try again. */
  loadError?: string | null
  onRetry?: () => void
  /** Validation message shown under the trigger (same markup as `Input`). */
  error?: string
  disabled?: boolean
  label?: string
  id?: string
}

/** Rows rendered at once; further matches stay reachable by filtering. */
const MAX_VISIBLE_BUYERS = 200

const matchesQuery = (buyer: BuyerOption, query: string): boolean => {
  if (!query) return true
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    buyer.name.toLowerCase().includes(q) || buyer.email.toLowerCase().includes(q)
  )
}

export function BuyerMultiSelect({
  buyers,
  selectedIds,
  onChange,
  total,
  loading = false,
  loadError = null,
  onRetry,
  error,
  disabled = false,
  label = 'Buyers',
  id,
}: BuyerMultiSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  const filtered = useMemo(
    () => buyers.filter(buyer => matchesQuery(buyer, query)),
    [buyers, query],
  )

  const visible = useMemo(
    () => filtered.slice(0, MAX_VISIBLE_BUYERS),
    [filtered],
  )

  const selectedBuyers = useMemo(
    () =>
      selectedIds
        .map(buyerId => buyers.find(buyer => buyer.id === buyerId))
        .filter((buyer): buyer is BuyerOption => Boolean(buyer)),
    [selectedIds, buyers],
  )

  /* Ids selected while another search was active stay selected even though
     they are not in the visible list, so "all filtered rows ticked" and
     "every known buyer ticked" are different states. */
  const visibleSelectedCount = visible.filter(buyer => selected.has(buyer.id)).length
  const allVisibleSelected = visible.length > 0 && visibleSelectedCount === visible.length
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected

  const toggle = (buyerId: string, next: boolean) => {
    if (next) {
      if (selected.has(buyerId)) return
      onChange([...selectedIds, buyerId])
      return
    }

    onChange(selectedIds.filter(id => id !== buyerId))
  }

  /*
   * "Select all" only ever touches the rows currently listed: ticking them
   * adds them to the existing selection (a filter can be applied on top of
   * an earlier pick), unticking removes exactly those.
   */
  const toggleAllVisible = (next: boolean) => {
    if (next) {
      const missing = visible.filter(buyer => !selected.has(buyer.id))

      if (missing.length === 0) return

      onChange([...selectedIds, ...missing.map(buyer => buyer.id)])

      return
    }

    const visibleIds = new Set(visible.map(buyer => buyer.id))

    onChange(selectedIds.filter(buyerId => !visibleIds.has(buyerId)))
  }

  // Close when a click lands outside the component (same rule as Combobox).
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const summary = loading
    ? 'Loading buyers…'
    : selectedIds.length === 0
      ? buyers.length === 0 && total === 0
        ? 'No buyers yet'
        : 'Select buyers'
      : `${selectedIds.length} ${selectedIds.length === 1 ? 'buyer' : 'buyers'} selected`

  return (
    <div className="w-full" ref={containerRef}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        {label && (
          <span className="block text-sm font-medium text-[var(--fg)]">{label}</span>
        )}
        {selectedIds.length > 0 && !disabled && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs text-[var(--muted)] underline-offset-2 hover:text-[var(--fg)] hover:underline"
          >
            Clear selection
          </button>
        )}
      </div>

      <button
        type="button"
        id={id}
        disabled={disabled || loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 text-left text-sm transition-all duration-150 focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] disabled:cursor-not-allowed disabled:bg-[var(--bg-subtle)] disabled:opacity-70',
          error &&
            'border-[var(--destructive)] focus:border-[var(--destructive)] focus:ring-[var(--destructive)]',
          !selectedIds.length && !loading && 'text-[var(--muted)]'
        )}
      >
        <span className="truncate">{summary}</span>
        <span className="flex shrink-0 items-center gap-1">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-[var(--muted)]" />}
          <ChevronDown
            aria-hidden
            className={cn(
              'h-4 w-4 text-[var(--muted)] transition-transform duration-150',
              open && 'rotate-180'
            )}
          />
        </span>
      </button>

      {/* Selected buyers, so the seller can eyeball and drop a name. */}
      {selectedBuyers.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedBuyers.slice(0, 8).map(buyer => (
            <span
              key={buyer.id}
              className="inline-flex max-w-full items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] py-0.5 pl-2 pr-1 text-xs text-[var(--fg-secondary)]"
            >
              <span className="truncate">{buyer.name}</span>
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${buyer.name} from the selection`}
                  onClick={() => toggle(buyer.id, false)}
                  className="rounded p-0.5 text-[var(--muted)] hover:bg-white hover:text-[var(--fg)]"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
          {selectedBuyers.length > 8 && (
            <span className="inline-flex items-center text-xs text-[var(--muted)]">
              +{selectedBuyers.length - 8} more
            </span>
          )}
        </div>
      )}

      {open && (
        <div
          role="group"
          aria-label="Buyer list"
          className="relative z-20 mt-1 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white shadow-lg"
        >
          <div className="border-b border-[var(--border)] p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
              <input
                type="text"
                value={query}
                autoFocus
                placeholder="Filter by name or email"
                aria-label="Filter buyers"
                onChange={event => setQuery(event.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] py-1.5 pl-8 pr-7 text-sm placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear buyer filter"
                  onClick={() => setQuery('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--muted)] hover:text-[var(--fg)]"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 px-1">
              <Checkbox
                id={id ? `${id}-select-all` : 'buyer-select-all'}
                label={
                  query
                    ? `Select all filtered (${visible.length})`
                    : `Select all buyers (${buyers.length})`
                }
                checked={
                  allVisibleSelected
                    ? true
                    : someVisibleSelected
                      ? 'indeterminate'
                      : false
                }
                disabled={disabled || visible.length === 0}
                onCheckedChange={toggleAllVisible}
              />
              {filtered.length > visible.length && (
                <span className="shrink-0 text-[11px] text-[var(--muted)]">
                  Showing {visible.length} of {filtered.length}
                </span>
              )}
            </div>
          </div>

          <div
            role="listbox"
            aria-multiselectable
            aria-label="Buyers to notify"
            className="max-h-56 overflow-auto py-1"
          >
            {loadError ? (
              <div className="flex items-center justify-between gap-3 px-3 py-4">
                <p className="flex items-center gap-1.5 text-sm text-[var(--destructive)]">
                  <AlertCircle size={14} className="shrink-0" />
                  {loadError}
                </p>
                {onRetry && (
                  <Button size="sm" variant="outline" onClick={onRetry}>
                    Retry
                  </Button>
                )}
              </div>
            ) : loading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-6 w-full" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <p className="px-3 py-4 text-sm text-[var(--muted)]">
                {buyers.length === 0
                  ? 'No buyers to notify yet. Buyers who order from you appear here.'
                  : 'No buyer matches this filter.'}
              </p>
            ) : (
              visible.map(buyer => {
                const isSelected = selected.has(buyer.id)

                return (
                  <Checkbox
                    key={buyer.id}
                    id={`buyer-${buyer.id}`}
                    className={cn(
                      'items-center px-3 py-1.5 hover:bg-[var(--bg-subtle)]',
                      isSelected && 'bg-[var(--primary-subtle)]'
                    )}
                    label={buyer.name}
                    description={buyer.email}
                    checked={isSelected}
                    disabled={disabled}
                    onCheckedChange={next => toggle(buyer.id, next)}
                    trailing={
                      <span className="flex shrink-0 items-center gap-1 pl-2 text-[11px] text-[var(--muted)]">
                        {isSelected && (
                          <Check size={12} className="text-[var(--primary)]" />
                        )}
                        {typeof buyer.orderCount === 'number'
                          ? `${buyer.orderCount} order${buyer.orderCount === 1 ? '' : 's'}`
                          : null}
                      </span>
                    }
                  />
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2">
            <p className="text-[11px] text-[var(--muted)]">
              {typeof total === 'number' && total > buyers.length
                ? `Showing ${buyers.length} of ${total} buyers — filter to reach the rest`
                : `${selectedIds.length} of ${buyers.length} selected`}
            </p>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-[var(--destructive)]">{error}</p>}
    </div>
  )
}
