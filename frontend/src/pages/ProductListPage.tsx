import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { SlidersHorizontal, X } from 'lucide-react'
import { productService } from '@/services/product.service'
import { categoryService } from '@/services/category.service'
import { ProductCard } from '@/components/ProductCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { Pagination } from '@/components/ui/Pagination'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

const sortOptions = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'name_asc', label: 'Name: A-Z' },
]

export function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showFilters, setShowFilters] = useState(false)

  const page = parseInt(searchParams.get('page') || '1')
  const search = searchParams.get('search') || ''
  const category = searchParams.get('category') || ''
  const sort = searchParams.get('sort') || 'newest'
  const minPrice = searchParams.get('minPrice') || ''
  const maxPrice = searchParams.get('maxPrice') || ''

  const { data, isLoading } = useQuery({
    queryKey: ['products', { search, category, sort, minPrice, maxPrice, page }],
    queryFn: () => productService.browse({
      search: search || undefined,
      category: category || undefined,
      sort: sort as any,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      page,
      limit: 12,
    }),
  })

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryService.list,
  })

  const updateFilter = (key: string, value: string) => {
    setSearchParams(prev => {
      if (value) prev.set(key, value)
      else prev.delete(key)
      return prev
    }, { replace: true })
  }

  return (
    <div className="container-app py-8">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">
            {search ? `Results for "${search}"` : 'All Products'}
          </h1>
          {data && <p className="text-xs text-[var(--muted)] mt-1">{data.total} products cataloged</p>}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => updateFilter('sort', e.target.value)}
            className="border border-[var(--border)] bg-white rounded-[var(--radius)] px-3 py-1.5 text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
          >
            {sortOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="lg:hidden">
            <SlidersHorizontal size={14} className="mr-1.5" /> Filters
          </Button>
        </div>
      </div>

      <div className="flex gap-8">
        {/* Sidebar Filters */}
        <aside className={`${showFilters ? 'fixed inset-0 z-50 bg-white p-6' : 'hidden'} lg:block lg:static lg:w-60 shrink-0 lg:border-r lg:border-[var(--border)] lg:pr-6`}>
          {showFilters && (
            <div className="flex items-center justify-between mb-4 lg:hidden">
              <h2 className="font-semibold text-[var(--fg)]">Filters</h2>
              <button onClick={() => setShowFilters(false)} className="p-1 text-[var(--muted)] hover:text-[var(--fg)]"><X size={18} /></button>
            </div>
          )}
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-xs uppercase tracking-wider text-[var(--muted)] mb-3">Categories</h3>
              <div className="space-y-1">
                <button
                  onClick={() => updateFilter('category', '')}
                  className={`block w-full text-left text-sm px-2.5 py-1.5 rounded-[var(--radius)] transition-colors ${!category ? 'bg-[var(--primary)] text-white font-medium' : 'text-[var(--fg-secondary)] hover:bg-[var(--accent)] hover:text-[var(--fg)]'}`}
                >
                  All Categories
                </button>
                {categories?.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => updateFilter('category', cat.id)}
                    className={`block w-full text-left text-sm px-2.5 py-1.5 rounded-[var(--radius)] transition-colors ${category === cat.id ? 'bg-[var(--primary)] text-white font-medium' : 'text-[var(--fg-secondary)] hover:bg-[var(--accent)] hover:text-[var(--fg)]'}`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-xs uppercase tracking-wider text-[var(--muted)] mb-3">Price Range (₹)</h3>
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

        {/* Product Grid */}
        <div className="flex-1">
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden bg-white">
                  <Skeleton className="h-48 w-full rounded-none" />
                  <div className="p-3 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : !data?.items?.length ? (
            <EmptyState title="No products found" description="Try adjusting your filters or search terms" />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {data.items.map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              <Pagination
                currentPage={page}
                totalPages={data.totalPages}
                onPageChange={(p) => updateFilter('page', String(p))}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
