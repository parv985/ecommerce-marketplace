import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Search, X } from 'lucide-react'
import { productService } from '@/services/product.service'
import { cn, formatPrice } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import type { Product } from '@/types/api'

/*
 * Seller Panel product search.
 *
 * Lives ONLY inside Seller Panel → Products. Suggestions and results are
 * fetched from `GET /products/my`, which the backend scopes to the
 * authenticated seller's own products — another seller's products can
 * never appear, even if the client tried to tamper with the request.
 * Picking a suggestion opens that product's edit dialog; pressing Enter
 * filters the displayed list (also server-side).
 */
const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2
const MAX_SUGGESTIONS = 5

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  ACTIVE: 'success', DRAFT: 'warning', INACTIVE: 'error',
}

interface SellerProductSearchProps {
  /** Currently applied list filter term (what the product list shows). */
  value: string
  /** Called when the applied list filter should change (Enter / clear). */
  onApply: (term: string) => void
  /** Called when the seller picks a product from the suggestions. */
  onSelect: (product: Product) => void
}

export function SellerProductSearch({ value, onApply, onSelect }: SellerProductSearchProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState(value)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  /* Keep the input in sync with the applied filter (e.g. cleared elsewhere). */
  useEffect(() => {
    setQuery(value)
  }, [value])

  /* Debounce so a request is not fired for every keystroke. */
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim())
      setActiveIndex(-1)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const enabled = debouncedQuery.length >= MIN_QUERY_LENGTH

  const { data, isFetching } = useQuery({
    queryKey: ['my-product-search', debouncedQuery],
    queryFn: () => productService.getMyProducts(debouncedQuery),
    enabled,
    staleTime: 30_000,
  })

  const suggestions: Product[] = (data ?? []).slice(0, MAX_SUGGESTIONS)

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

  const pickProduct = (product: Product) => {
    close()
    setQuery('')
    setDebouncedQuery('')
    onSelect(product)
  }

  /* Filter the displayed product list server-side for the current term. */
  const applyFilter = () => {
    const term = query.trim()
    close()
    onApply(term)
  }

  const clearSearch = () => {
    setQuery('')
    setDebouncedQuery('')
    close()
    onApply('')
  }

  /* Enter with no highlighted suggestion filters the list instead. */
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const selected = activeIndex >= 0 ? suggestions[activeIndex] : undefined
    if (selected) {
      pickProduct(selected)
      return
    }
    applyFilter()
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

  const hasAppliedFilter = value.length > 0

  return (
    <div ref={containerRef} className="relative w-full">
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
          placeholder="Search your products..."
          aria-label="Search your products"
          aria-autocomplete="list"
          aria-controls="seller-product-search-suggestions"
          aria-expanded={showDropdown}
          autoComplete="off"
          className="w-full pl-9 pr-16 py-2 bg-[#f6f5f2] border border-[var(--border)] rounded-[var(--radius)] text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] focus:bg-white transition-all"
        />
        {isFetching && enabled && (
          <Loader2
            size={15}
            className="absolute right-9 top-1/2 -translate-y-1/2 text-[var(--muted)] animate-spin"
          />
        )}
        {(query.length > 0 || hasAppliedFilter) && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear product search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--accent)] transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </form>

      {showDropdown && (
        <div
          id="seller-product-search-suggestions"
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
                    onClick={() => pickProduct(product)}
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
                        {formatPrice(product.price)} · Stock: {product.stock}
                        {product.sku ? ` · SKU: ${product.sku}` : ''}
                      </span>
                    </span>
                    <Badge variant={statusColors[product.status] ?? 'default'}>{product.status}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-sm text-[var(--muted)]">
              {isFetching ? 'Searching your products…' : `No products of yours match “${debouncedQuery}”`}
            </p>
          )}

          {suggestions.length > 0 && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={applyFilter}
              className="w-full border-t border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--fg-secondary)] hover:bg-[var(--accent)] transition-colors text-left"
            >
              Show all your products matching “{debouncedQuery}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}
