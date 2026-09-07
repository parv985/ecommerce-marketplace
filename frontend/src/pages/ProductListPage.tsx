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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {search ? `Results for "${search}"` : 'All Products'}
          </h1>
          {data && <p className="text-sm text-[var(--muted)] mt-1">{data.total} products found</p>}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => updateFilter('sort', e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          >
            {sortOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="lg:hidden">
            <SlidersHorizontal size={16} className="mr-1" /> Filters
          </Button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar Filters */}
        <aside className={`${showFilters ? 'fixed inset-0 z-50 bg-white p-4' : 'hidden'} lg:block lg:static lg:w-64 shrink-0`}>
          {showFilters && (
            <div className="flex items-center justify-between mb-4 lg:hidden">
              <h2 className="font-semibold">Filters</h2>
              <button onClick={() => setShowFilters(false)}><X size={20} /></button>
            </div>
          )}
          <div className="space-y-6">
            <div>
              <h3 className="font-medium text-sm mb-3">Categories</h3>
              <div className="space-y-1.5">
                <button
                  onClick={() => updateFilter('category', '')}
                  className={`block w-full text-left text-sm px-2 py-1 rounded ${!category ? 'bg-[var(--primary)] text-white' : 'hover:bg-zinc-100'}`}
                >
                  All Categories
                </button>
                {categories?.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => updateFilter('category', cat.id)}
                    className={`block w-full text-left text-sm px-2 py-1 rounded ${category === cat.id ? 'bg-[var(--primary)] text-white' : 'hover:bg-zinc-100'}`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-medium text-sm mb-3">Price Range</h3>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={minPrice}
                  onChange={(e) => updateFilter('minPrice', e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={maxPrice}
                  onChange={(e) => updateFilter('maxPrice', e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm"
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
                <div key={i} className="border rounded-lg overflow-hidden">
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
