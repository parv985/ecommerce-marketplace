import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { SlidersHorizontal, X, Loader2, Sparkles, Search, RotateCcw } from 'lucide-react'
import { productService } from '@/services/product.service'
import { categoryService } from '@/services/category.service'
import { aiService } from '@/services/ai.service'
import { ProductCard } from '@/components/ProductCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

const sortOptions = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'name_asc', label: 'Name: A-Z' },
]

const SAMPLE_AI_QUERIES = [
  'Show me comfortable running shoes under ₹3,000',
  'Which laptops are good for programming under ₹60,000?',
  'I need a black casual shirt below ₹1,500',
]

export function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showFilters, setShowFilters] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const search = searchParams.get('search') || ''
  const category = searchParams.get('category') || ''
  const sort = searchParams.get('sort') || 'newest'
  const minPrice = searchParams.get('minPrice') || ''
  const maxPrice = searchParams.get('maxPrice') || ''
  const aiQuery = searchParams.get('aiQuery') || ''

  const [aiInput, setAiInput] = useState(aiQuery)

  useEffect(() => {
    setAiInput(aiQuery)
  }, [aiQuery])

  // AI Natural-Language Search query via Gemini
  const {
    data: aiData,
    isLoading: isAiLoading,
    isFetching: isAiFetching,
    isError: isAiError,
    error: aiError,
  } = useQuery({
    queryKey: ['ai-product-search', aiQuery],
    queryFn: () => aiService.searchProducts(aiQuery),
    enabled: !!aiQuery.trim(),
    staleTime: 60_000,
  })

  // Progressive scroll loading (infinite query for standard catalog)
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['products-browse-infinite', { search, category, sort, minPrice, maxPrice }],
    queryFn: ({ pageParam = 1 }) =>
      productService.browse({
        search: search || undefined,
        category: category || undefined,
        sort: sort as any,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        page: pageParam,
        limit: 12,
      }),
    initialPageParam: 1,
    enabled: !aiQuery.trim(),
    getNextPageParam: (lastPage) => {
      if (lastPage.page < lastPage.totalPages) {
        return lastPage.page + 1
      }
      return undefined
    },
  })

  // Fetch categories for sidebar filter
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryService.list,
  })

  // Set up IntersectionObserver for progressive scroll loading
  useEffect(() => {
    const sentinel = loadMoreRef.current
    if (!sentinel || !hasNextPage || isFetchingNextPage || !!aiQuery.trim()) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      {
        root: null,
        rootMargin: '350px',
        threshold: 0.1,
      }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, aiQuery])

  const updateFilter = (key: string, value: string) => {
    setSearchParams(
      (prev) => {
        if (value) prev.set(key, value)
        else prev.delete(key)
        return prev
      },
      { replace: true }
    )
  }

  const handleAiSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    const clean = aiInput.trim()
    if (!clean) return

    setSearchParams((prev) => {
      prev.set('aiQuery', clean)
      prev.delete('search')
      return prev
    }, { replace: true })
  }

  const clearAiSearch = () => {
    setAiInput('')
    setSearchParams((prev) => {
      prev.delete('aiQuery')
      prev.delete('ai')
      return prev
    }, { replace: true })
  }

  // Flatten products across all loaded pages
  const products = data?.pages.flatMap((page) => page.items) ?? []
  const totalProducts = data?.pages[0]?.total ?? 0

  return (
    <div className="container-app py-8">
      {/* AI Natural-Language Search Banner */}
      <div className="mb-8 p-5 bg-gradient-to-r from-amber-50/80 via-orange-50/50 to-amber-100/50 border border-amber-200/80 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-500 text-white rounded-[var(--radius-sm)]">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-[var(--fg)] flex items-center gap-2">
                AI Natural-Language Product Search
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900 border border-amber-300">
                  Gemini Powered
                </span>
              </h2>
              <p className="text-xs text-[var(--fg-secondary)]">
                Ask in plain English — Gemini extracts budget, categories, brands, and finds real matching products in our database.
              </p>
            </div>
          </div>
          {aiQuery && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearAiSearch}
              className="text-xs border-amber-300 hover:bg-amber-100/80 shrink-0 self-start md:self-auto"
            >
              <RotateCcw size={13} className="mr-1" />
              Reset to Catalog
            </Button>
          )}
        </div>

        <form onSubmit={handleAiSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted)] pointer-events-none" />
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="e.g. &ldquo;Show me comfortable running shoes under ₹3,000&rdquo;"
              className="w-full pl-9 pr-8 py-2.5 bg-white border border-amber-300 rounded-[var(--radius)] text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all shadow-[var(--shadow-xs)]"
            />
            {aiInput && (
              <button
                type="button"
                onClick={() => setAiInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--fg)] p-0.5"
                aria-label="Clear input"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <Button
            type="submit"
            disabled={!aiInput.trim() || isAiLoading || isAiFetching}
            className="bg-amber-600 hover:bg-amber-700 text-white font-medium shrink-0 px-4"
          >
            {isAiLoading || isAiFetching ? (
              <Loader2 size={16} className="animate-spin mr-1.5" />
            ) : (
              <Sparkles size={16} className="mr-1.5" />
            )}
            Search with AI
          </Button>
        </form>

        {/* Suggestion Chips */}
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-medium text-amber-900/70">Try asking:</span>
          {SAMPLE_AI_QUERIES.map((queryText) => (
            <button
              key={queryText}
              type="button"
              onClick={() => {
                setAiInput(queryText)
                setSearchParams((prev) => {
                  prev.set('aiQuery', queryText)
                  prev.delete('search')
                  return prev
                }, { replace: true })
              }}
              className="text-xs bg-white/90 hover:bg-white text-neutral-800 border border-amber-200/80 rounded-full px-2.5 py-1 transition-all hover:border-amber-400 shadow-[var(--shadow-xs)] text-left"
            >
              {queryText}
            </button>
          ))}
        </div>
      </div>

      {/* AI Search Results Mode */}
      {aiQuery ? (
        <div className="space-y-6">
          {/* AI Status / Criteria Display */}
          {isAiLoading || isAiFetching ? (
            <div className="p-8 border border-amber-200 bg-amber-50/40 rounded-[var(--radius-lg)] text-center space-y-3">
              <Loader2 size={28} className="animate-spin text-amber-600 mx-auto" />
              <p className="font-semibold text-sm text-[var(--fg)]">
                Gemini AI is analyzing &ldquo;{aiQuery}&rdquo;...
              </p>
              <p className="text-xs text-[var(--muted)] max-w-md mx-auto">
                Extracting specifications, budget constraints, and querying real catalog products from our database...
              </p>
            </div>
          ) : isAiError ? (
            <div className="p-6 border border-rose-200 bg-rose-50/50 rounded-[var(--radius-lg)] text-center space-y-2">
              <p className="text-sm font-semibold text-rose-800">
                {(aiError as any)?.response?.data?.message || 'AI search could not be completed.'}
              </p>
              <Button size="sm" variant="outline" onClick={clearAiSearch}>
                Return to standard catalog
              </Button>
            </div>
          ) : aiData ? (
            <>
              {/* Extracted Criteria Pills */}
              <div className="p-4 bg-white border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-xs)] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
                      AI Interpretation
                    </span>
                  </div>
                  <span className="text-xs text-[var(--muted)]">
                    Found <strong>{aiData.products.length}</strong> matching product{aiData.products.length === 1 ? '' : 's'} in database
                  </span>
                </div>

                <p className="text-sm font-medium text-[var(--fg)] italic bg-neutral-50 p-2.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)]">
                  &ldquo;{aiData.extractedCriteria.summary}&rdquo;
                </p>

                <div className="flex items-center gap-1.5 flex-wrap pt-1 text-xs">
                  <span className="text-[var(--muted)] font-medium">Extracted Filters:</span>
                  {aiData.extractedCriteria.category && (
                    <span className="bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-full px-2.5 py-0.5 font-medium">
                      Category: {aiData.extractedCriteria.category}
                    </span>
                  )}
                  {(aiData.extractedCriteria.minPrice != null || aiData.extractedCriteria.maxPrice != null) && (
                    <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full px-2.5 py-0.5 font-medium">
                      Budget: {aiData.extractedCriteria.minPrice != null ? `₹${aiData.extractedCriteria.minPrice}` : '₹0'} - {aiData.extractedCriteria.maxPrice != null ? `₹${aiData.extractedCriteria.maxPrice}` : 'Any'}
                    </span>
                  )}
                  {aiData.extractedCriteria.brand && (
                    <span className="bg-sky-50 text-sky-800 border border-sky-200 rounded-full px-2.5 py-0.5 font-medium">
                      Brand: {aiData.extractedCriteria.brand}
                    </span>
                  )}
                  {aiData.extractedCriteria.color && (
                    <span className="bg-purple-50 text-purple-800 border border-purple-200 rounded-full px-2.5 py-0.5 font-medium">
                      Color: {aiData.extractedCriteria.color}
                    </span>
                  )}
                  {aiData.extractedCriteria.useCase && (
                    <span className="bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-2.5 py-0.5 font-medium">
                      Use Case: {aiData.extractedCriteria.useCase}
                    </span>
                  )}
                  {aiData.extractedCriteria.searchTerms?.length > 0 && (
                    <span className="bg-neutral-100 text-neutral-800 border border-neutral-200 rounded-full px-2.5 py-0.5 font-medium">
                      Keywords: {aiData.extractedCriteria.searchTerms.join(', ')}
                    </span>
                  )}
                </div>
              </div>

              {/* Product Grid */}
              {aiData.products.length === 0 ? (
                <EmptyState
                  title="No database products matched your AI search"
                  description="We couldn't find products in our catalog matching all the requested criteria. Try adjusting the budget, brand, or query."
                  action={{
                    label: 'Browse All Products',
                    onClick: clearAiSearch,
                  }}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {aiData.products.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : (
        /* Standard Catalog Mode */
        <>
          {/* Top filter / header bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[var(--border)]">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">
                {search ? `Results for "${search}"` : 'All Products'}
              </h1>
              {!isLoading && (
                <p className="text-xs text-[var(--muted)] mt-1">
                  {totalProducts} product{totalProducts === 1 ? '' : 's'} cataloged
                  {products.length > 0 && products.length < totalProducts && (
                    <span> · Showing {products.length} loaded</span>
                  )}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={sort}
                onChange={(e) => updateFilter('sort', e.target.value)}
                className="border border-[var(--border)] bg-white rounded-[var(--radius)] px-3 py-1.5 text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
              >
                {sortOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="lg:hidden"
              >
                <SlidersHorizontal size={14} className="mr-1.5" /> Filters
              </Button>
            </div>
          </div>

          <div className="flex gap-8">
            {/* Sidebar Filters */}
            <aside
              className={`${
                showFilters ? 'fixed inset-0 z-50 bg-white p-6 overflow-y-auto' : 'hidden'
              } lg:block lg:static lg:w-60 shrink-0 lg:border-r lg:border-[var(--border)] lg:pr-6`}
            >
              {showFilters && (
                <div className="flex items-center justify-between mb-4 lg:hidden">
                  <h2 className="font-semibold text-[var(--fg)]">Filters</h2>
                  <button
                    onClick={() => setShowFilters(false)}
                    className="p-1 text-[var(--muted)] hover:text-[var(--fg)]"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-xs uppercase tracking-wider text-[var(--muted)] mb-3">
                    Categories
                  </h3>
                  <div className="space-y-1">
                    <button
                      onClick={() => updateFilter('category', '')}
                      className={`block w-full text-left text-sm px-2.5 py-1.5 rounded-[var(--radius)] transition-colors ${
                        !category
                          ? 'bg-[var(--primary)] text-white font-medium'
                          : 'text-[var(--fg-secondary)] hover:bg-[var(--accent)] hover:text-[var(--fg)]'
                      }`}
                    >
                      All Categories
                    </button>
                    {categories?.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => updateFilter('category', cat.id)}
                        className={`block w-full text-left text-sm px-2.5 py-1.5 rounded-[var(--radius)] transition-colors ${
                          category === cat.id
                            ? 'bg-[var(--primary)] text-white font-medium'
                            : 'text-[var(--fg-secondary)] hover:bg-[var(--accent)] hover:text-[var(--fg)]'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-xs uppercase tracking-wider text-[var(--muted)] mb-3">
                    Price Range (₹)
                  </h3>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={minPrice}
                      onChange={(e) => updateFilter('minPrice', e.target.value)}
                      className="w-full border border-[var(--border)] bg-white rounded-[var(--radius)] px-2.5 py-1.5 text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      value={maxPrice}
                      onChange={(e) => updateFilter('maxPrice', e.target.value)}
                      className="w-full border border-[var(--border)] bg-white rounded-[var(--radius)] px-2.5 py-1.5 text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                    />
                  </div>
                </div>
              </div>
            </aside>

            {/* Product Grid with Progressive Scroll Loading */}
            <div className="flex-1">
              {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div
                      key={i}
                      className="border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden bg-white"
                    >
                      <Skeleton className="h-48 w-full rounded-none" />
                      <div className="p-3 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : isError ? (
                <div className="text-center py-16">
                  <p className="text-sm text-[var(--destructive)] mb-3">
                    Failed to load products. Please try again.
                  </p>
                  <Button onClick={() => window.location.reload()} size="sm" variant="outline">
                    Retry
                  </Button>
                </div>
              ) : products.length === 0 ? (
                <EmptyState
                  title="No products found"
                  description="Try adjusting your filters or search terms"
                />
              ) : (
                <>
                  {/* Product cards grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {products.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>

                  {/* Sentinel target for IntersectionObserver */}
                  <div ref={loadMoreRef} className="h-8 my-4" />

                  {/* Loading indicator when fetching next progressive batch */}
                  {isFetchingNextPage && (
                    <div className="flex justify-center py-4">
                      <Loader2 className="animate-spin text-[var(--muted)]" size={24} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
