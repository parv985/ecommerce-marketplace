import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Searchable combobox (type-to-filter dropdown) matching the visual
 * language of `Input`: same label, border, focus ring and error styles.
 *
 * Fully keyboard accessible (↑/↓/Enter/Escape/Tab), ARIA-labelled as a
 * combobox + listbox, and it renders explicit loading / empty /
 * no-results states.
 *
 * The component is controlled: it reports the picked `ComboboxOption`
 * (not just the string) so callers can use extra metadata — e.g. the
 * StateCityFields hook reads `option.state` to auto-resolve a State
 * from a City selection.
 */

export interface ComboboxOption {
  /** Canonical value committed to the form when the option is picked. */
  value: string
  /** Primary text shown in the input and the dropdown row. */
  label: string
  /** Secondary text on the right of a dropdown row (e.g. the state). */
  hint?: string
  /** Owning state of this option — used to auto-select State from City. */
  state?: string
}

interface ComboboxProps {
  label?: string
  value: string
  options: ComboboxOption[]
  onChange: (option: ComboboxOption | null) => void
  placeholder?: string
  /** Validation error shown under the input (same markup as `Input`). */
  error?: string
  /** Muted helper text under the input, shown alongside any error. */
  hint?: string
  disabled?: boolean
  /** Shows a spinner inside the input while options load. */
  loading?: boolean
  /** Message for an empty result set (default: "No matches found"). */
  emptyMessage?: string
  id?: string
}

/** Case-insensitive substring match against label + optional hint. */
const matches = (
  label: string,
  hint: string | undefined,
  query: string,
): boolean => {
  if (!query) return true
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (label.toLowerCase().includes(q)) return true
  return hint ? hint.toLowerCase().includes(q) : false
}

/**
 * Cap on how many rows render at once. The no-state City list holds
 * ~4.2k (city, state) pairs; rendering them all — and re-rendering on
 * every keystroke — makes the flat list sluggish. Matches beyond the
 * cap are still reachable by typing a narrower query.
 */
const MAX_VISIBLE_OPTIONS = 200

export const Combobox = React.forwardRef<HTMLInputElement, ComboboxProps>(
  (
    {
      label,
      value,
      options,
      onChange,
      placeholder,
      error,
      hint,
      disabled,
      loading,
      emptyMessage,
      id,
    },
    ref,
  ) => {
    const reactId = useId()
    const inputId = id ?? `combobox-${reactId}`
    const listId = `${inputId}-list`
    const containerRef = useRef<HTMLDivElement>(null)

    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [highlight, setHighlight] = useState(0)

    const selected = useMemo(
      () => options.find((opt) => opt.value === value) ?? null,
      [options, value],
    )

    const filtered = useMemo(
      () => options.filter((opt) => matches(opt.label, opt.hint, query)),
      [options, query],
    )

    // Rows actually rendered (and what keyboard navigation moves over).
    const visible = useMemo(
      () =>
        filtered.length > MAX_VISIBLE_OPTIONS
          ? filtered.slice(0, MAX_VISIBLE_OPTIONS)
          : filtered,
      [filtered],
    )

    // Closed → show the selected label; open → show what the user types.
    const displayValue = open ? query : (selected?.label ?? value)

    // Keep the highlighted row visible while arrowing through the list.
    useEffect(() => {
      if (!open) return
      const el = document.getElementById(`${listId}-${highlight}`)
      el?.scrollIntoView?.({ block: 'nearest' })
    }, [open, highlight, listId, visible.length])

    const close = () => {
      setOpen(false)
      setQuery('')
      setHighlight(0)
    }

    // Close when a click lands outside the component.
    useEffect(() => {
      if (!open) return
      const onPointerDown = (event: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        )
          close()
      }
      document.addEventListener('mousedown', onPointerDown)
      return () => document.removeEventListener('mousedown', onPointerDown)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const select = (option: ComboboxOption) => {
      onChange(option)
      close()
    }

    const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value)
      setOpen(true)
      setHighlight(0)
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        if (!open) setOpen(true)
        else
          setHighlight((h) =>
            visible.length ? Math.min(h + 1, visible.length - 1) : 0,
          )
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlight((h) => Math.max(h - 1, 0))
      } else if (event.key === 'Enter') {
        if (open) {
          event.preventDefault()
          const option = visible[highlight]
          if (option) select(option)
        }
      } else if (event.key === 'Escape') {
        if (open) {
          event.preventDefault()
          close()
        }
      } else if (event.key === 'Tab') {
        close()
      }
    }

    const clear = (event: React.MouseEvent) => {
      event.stopPropagation()
      onChange(null)
      close()
    }

    const activeOptionId =
      open && visible.length > 0 ? `${listId}-${highlight}` : undefined

    const hiddenMatches = filtered.length - visible.length

    return (
      <div className="w-full" ref={containerRef}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-[var(--fg)] mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            role="combobox"
            type="text"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            placeholder={placeholder}
            value={displayValue}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            aria-invalid={error ? true : undefined}
            onChange={handleInput}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            className={cn(
              'w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] transition-all duration-150 focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--bg-subtle)]',
              error &&
                'border-[var(--destructive)] focus:border-[var(--destructive)] focus:ring-[var(--destructive)]',
              loading ? 'pr-9' : value && !disabled ? 'pr-14' : 'pr-8',
            )}
          />
          <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 pr-2">
            {loading && (
              <Loader2
                aria-label="Loading options"
                className="h-4 w-4 animate-spin text-[var(--muted)]"
              />
            )}
            {!loading && value && !disabled && (
              <button
                type="button"
                aria-label={label ? `Clear ${label}` : 'Clear selection'}
                onClick={clear}
                className="rounded p-0.5 text-[var(--muted)] hover:text-[var(--fg)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {!loading && (
              <ChevronDown
                aria-hidden
                className="h-4 w-4 text-[var(--muted)]"
              />
            )}
          </div>

          {open && (
            <ul
              id={listId}
              role="listbox"
              aria-label={label}
              className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-[var(--radius)] border border-[var(--border)] bg-white py-1 shadow-lg"
            >
              {visible.length === 0 ? (
                <li
                  className="px-3 py-2 text-sm text-[var(--muted)]"
                  role="presentation"
                >
                  {loading ? 'Loading…' : (emptyMessage ?? 'No matches found')}
                </li>
              ) : (
                visible.map((option, index) => {
                  const isSelected = option.value === value
                  return (
                    <li
                      key={`${option.value}|${option.state ?? ''}|${option.hint ?? ''}`}
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={isSelected}
                      // mousedown keeps focus in the input (no blur-close race)
                      onMouseDown={(event) => {
                        event.preventDefault()
                        select(option)
                      }}
                      onMouseEnter={() => setHighlight(index)}
                      className={cn(
                        'flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm text-[var(--fg)]',
                        index === highlight && 'bg-[var(--bg-subtle)]',
                      )}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <Check
                          className={cn(
                            'h-3.5 w-3.5 shrink-0 text-[var(--primary)]',
                            isSelected ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="truncate">{option.label}</span>
                      </span>
                      {option.hint && (
                        <span className="shrink-0 text-xs text-[var(--muted)]">
                          {option.hint}
                        </span>
                      )}
                    </li>
                  )
                })
              )}
              {hiddenMatches > 0 && (
                <li
                  className="border-t border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)]"
                  role="presentation"
                >
                  Showing {visible.length} of {filtered.length} — keep typing to
                  narrow down
                </li>
              )}
            </ul>
          )}
        </div>
        {error && (
          <p className="mt-1 text-xs text-[var(--destructive)]">{error}</p>
        )}
        {/* The hint stays visible alongside an error — e.g. the "city was
            cleared because it is not in {state}" context must not be
            masked by the "City is required" message it caused. */}
        {hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
      </div>
    )
  },
)
Combobox.displayName = 'Combobox'
