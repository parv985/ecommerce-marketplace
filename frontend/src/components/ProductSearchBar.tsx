import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Search } from 'lucide-react'
import { productService } from '@/services/product.service'
import { cn, formatPrice } from '@/lib/utils'
import type { Product } from '@/types/api'

/*
 * Navbar product search.
 *
 * Searches PRODUCTS ONLY (the public catalog endpoint matches product
 * name/description — categories and brands are not searched) and offers
 * live suggestions while the user types. Selecting a suggestion goes
 * straight to that product's detail page; pressing Enter without picking
 * a suggestion opens the full results page.
 */
const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2
const MAX_SUGGESTIONS = 5
/** Below this many units left the suggestion shows the remaining count. */
const LOW_STOCK_THRESHOLD = 5

interface ProductSearchBarProps {
  /** Called after a navigation (used by the mobile menu to close itself). */
  onNavigate?: () => void
  className?: string
}

export function ProductSearchBar({ onNavigate, className }: ProductSearchBarProps) {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  /*
   * Debounce so a request is not fired for every keystroke. Committing a new
   * debounced term also clears the highlighted suggestion, so the keyboard
   * selection never points at a row from the previous result set.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim())
      setActiveIndex(-1)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const enabled = debouncedQuery.length >= MIN_QUERY_LENGTH

  const { data, isFetching } = useQuery({
    queryKey: ['product-search', debouncedQuery],
    queryFn: () => productService.browse({ search: debouncedQuery, limit: 8 }),
    enabled,
    staleTime: 30_000,
  })

  /*
   * Only *available* products are suggested: the catalog endpoint already
   * returns ACTIVE listings, and sold-out ones (stock 0) are dropped here
   * because a suggestion you cannot buy is a dead end.
   */
  const suggestions: Product[] = (data?.items ?? [])
    .filter((product) => product.stock > 0)
    .slice(0, MAX_SUGGESTIONS)

  const showDropdown = open && enabled

  const close = () => {
    setOpen(false)
    setActiveIndex(-1)
  }

  /* Click/tap outside the search closes the suggestion list. */
  useEffect(() => {
    if (!showDropdown) return

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        close()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showDropdown])

  const goToProduct = (product: Product) => {
    close()
    setQuery('')
    setDebouncedQuery('')
    onNavigate?.()
    navigate(`/products/${product.id}`)
  }

  /* Full results page for the current term. */
  const goToResults = () => {
    const term = query.trim()
    if (!term) return

    close()
    setQuery('')
    setDebouncedQuery('')
    onNavigate?.()
    navigate(`/products?search=${encodeURIComponent(term)}`)
  }

  /* Enter with no highlighted suggestion falls back to the results page. */
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const selected = activeIndex >= 0 ? suggestions[activeIndex] : undefined
    if (selected) {
      goToProduct(selected)
      return
    }
    goToResults()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      close()
      return
    }

    if (!showDropdown || suggestions.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((prev) => (prev + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1))
    }
  }

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <form onSubmit={handleSubmit} role="search">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted)] pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search products..."
          aria-label="Search products"
          aria-autocomplete="list"
          aria-controls="product-search-suggestions"
          aria-expanded={showDropdown}
          autoComplete="off"
          className="w-full pl-9 pr-9 py-2 bg-[#f6f5f2] border border-[var(--border)] rounded-[var(--radius)] text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] focus:bg-white transition-all"
        />
        {isFetching && enabled && (
          <Loader2
            size={15}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] animate-spin"
          />
        )}
      </form>

      {showDropdown && (
        <div
          id="product-search-suggestions"
          role="listbox"
          className="absolute left-0 right-0 mt-1.5 bg-white border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden z-50"
        >
          {suggestions.length > 0 ? (
            <ul>
              {suggestions.map((product, index) => (
                <li key={product.id} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    /* onMouseDown fires before the input blurs, so the click
                       is never lost to the outside-click handler. */
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => goToProduct(product)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                      index === activeIndex ? 'bg-[var(--accent)]' : 'hover:bg-[var(--accent)]',
                    )}
                  >
                    {product.images?.[0]?.url ? (
                      <img
                        src={product.images[0].url}
                        alt=""
                        className="h-10 w-10 rounded-[var(--radius-sm)] object-cover bg-[#f6f5f2] shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-[var(--radius-sm)] bg-[#f6f5f2] shrink-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[var(--fg)] truncate">
                        {product.name}
                      </span>
                      <span className="block text-xs text-[var(--muted)]">
                        {product.category?.name ? `${product.category.name} · ` : ''}
                        {formatPrice(product.activeDiscount?.discountedPrice ?? product.price)}
                      </span>
                    </span>
                    {product.stock < LOW_STOCK_THRESHOLD && (
                      <span className="shrink-0 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-[var(--radius-sm)] px-1.5 py-0.5">
                        Only {product.stock} left
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-sm text-[var(--muted)]">
              {isFetching ? 'Searching products…' : `No products found for “${debouncedQuery}”`}
            </p>
          )}

          {suggestions.length > 0 && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={goToResults}
              className="w-full border-t border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--fg-secondary)] hover:bg-[var(--accent)] transition-colors text-left"
            >
              See all results for “{debouncedQuery}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}
