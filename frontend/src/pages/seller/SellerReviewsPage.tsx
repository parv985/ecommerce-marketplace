import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reviewService } from '@/services/review.service'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { formatDate, formatPrice } from '@/lib/utils'
import {
  Star,
  MessageSquare,
  Package,
  Search,
  RefreshCw,
  User,
  Filter,
} from 'lucide-react'
import type { SellerReviewProductItem, Review } from '@/types/api'

export function SellerReviewsPage() {
  const [selectedProductId, setSelectedProductId] = useState<string>('ALL')
  const [ratingFilter, setRatingFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState<string>('')

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['seller-reviews'],
    queryFn: () => reviewService.getSellerReviews(),
  })

  // Filter products based on selected product dropdown
  const filteredProducts = useMemo(() => {
    if (!data?.products) return []
    let list = data.products

    if (selectedProductId !== 'ALL') {
      list = list.filter((p) => p.product.id === selectedProductId)
    }

    return list
  }, [data?.products, selectedProductId])

  // Get reviews for a product filtered by rating & search query
  const getFilteredReviewsForProduct = (pItem: SellerReviewProductItem): Review[] => {
    let reviews = pItem.reviews

    if (ratingFilter !== 'ALL') {
      const targetRating = Number(ratingFilter)
      reviews = reviews.filter((r) => r.rating === targetRating)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      reviews = reviews.filter(
        (r) =>
          r.userName.toLowerCase().includes(q) ||
          (r.comment && r.comment.toLowerCase().includes(q)),
      )
    }

    return reviews
  }

  const renderStars = (rating: number, size: number = 16) => {
    return (
      <div className="inline-flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={size}
            className={
              star <= Math.round(rating)
                ? 'fill-amber-400 text-amber-400'
                : 'fill-zinc-200 text-zinc-300'
            }
          />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Product Reviews</h1>
          <p className="text-sm text-[var(--muted)]">
            Monitor buyer feedback, ratings, and reviews across all your products.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="self-start sm:self-auto"
        >
          <RefreshCw size={14} className={`mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-[var(--border)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-full bg-amber-50 text-amber-600">
              <Star size={24} className="fill-amber-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--muted)]">Average Rating</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{data?.averageRating ?? 0}</span>
                <span className="text-xs text-[var(--muted)]">/ 5.0</span>
              </div>
              <div className="mt-1">{renderStars(data?.averageRating ?? 0, 12)}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-full bg-blue-50 text-blue-600">
              <MessageSquare size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--muted)]">Total Reviews</p>
              <span className="text-2xl font-bold">{data?.totalReviews ?? 0}</span>
              <p className="text-xs text-[var(--muted)] mt-1">From verified buyers</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-full bg-emerald-50 text-emerald-600">
              <Package size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--muted)]">Total Products</p>
              <span className="text-2xl font-bold">{data?.products?.length ?? 0}</span>
              <p className="text-xs text-[var(--muted)] mt-1">
                {data?.products?.filter((p) => p.reviewCount > 0).length ?? 0} reviewed
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card className="border-[var(--border)]">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              />
              <Input
                placeholder="Search reviews or buyers…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>

            {/* Product Selector Dropdown */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium text-[var(--muted)] flex items-center gap-1">
                <Package size={14} /> Product:
              </label>
              <select
                aria-label="Filter by product"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="text-sm rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--primary)] max-w-[220px] truncate"
              >
                <option value="ALL">All Products ({data?.products?.length ?? 0})</option>
                {data?.products?.map((p) => (
                  <option key={p.product.id} value={p.product.id}>
                    {p.product.name} ({p.reviewCount})
                  </option>
                ))}
              </select>

              {/* Rating Filter */}
              <label className="text-xs font-medium text-[var(--muted)] flex items-center gap-1 ml-2">
                <Filter size={14} /> Rating:
              </label>
              <select
                aria-label="Filter by rating"
                value={ratingFilter}
                onChange={(e) => setRatingFilter(e.target.value)}
                className="text-sm rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              >
                <option value="ALL">All Ratings</option>
                <option value="5">5 Stars</option>
                <option value="4">4 Stars</option>
                <option value="3">3 Stars</option>
                <option value="2">2 Stars</option>
                <option value="1">1 Star</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-[var(--radius-lg)]" />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="border border-red-200 rounded-[var(--radius-lg)] bg-red-50 p-6 text-center text-red-800">
          <p className="font-medium">Unable to load reviews</p>
          <p className="text-xs text-red-600 mt-1">
            {(error as any)?.message || 'An unexpected error occurred.'}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">
            Retry
          </Button>
        </div>
      )}

      {/* Product List with Reviews */}
      {!isLoading && !isError && (
        <div className="space-y-6">
          {filteredProducts.length === 0 ? (
            <div className="border border-dashed border-[var(--border)] rounded-[var(--radius-lg)] p-12 text-center">
              <Package size={40} className="mx-auto text-[var(--muted)] mb-3" />
              <p className="font-semibold text-lg">No reviews found.</p>
              <p className="text-sm text-[var(--muted)] mt-1">
                You haven't listed any products yet, or no products match your filter.
              </p>
            </div>
          ) : (
            filteredProducts.map((item) => {
              const reviews = getFilteredReviewsForProduct(item)
              const hasReviews = reviews.length > 0

              return (
                <div
                  key={item.product.id}
                  className="border border-[var(--border)] rounded-[var(--radius-lg)] bg-white overflow-hidden shadow-[var(--shadow-sm)]"
                >
                  {/* Product Header Bar */}
                  <div className="p-4 sm:p-5 bg-zinc-50 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {item.product.image ? (
                        <img
                          src={item.product.image}
                          alt={item.product.name}
                          className="w-14 h-14 rounded-[var(--radius)] object-cover border border-[var(--border)] shrink-0 bg-white"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-[var(--radius)] bg-zinc-200 flex items-center justify-center shrink-0 text-zinc-400">
                          <Package size={24} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h2 className="font-semibold text-base text-[var(--fg)] truncate">
                          {item.product.name}
                        </h2>
                        <div className="flex items-center gap-3 text-xs text-[var(--muted)] mt-1 flex-wrap">
                          <span className="font-medium text-[var(--fg)]">
                            {formatPrice(item.product.price)}
                          </span>
                          <span>·</span>
                          <span>Stock: {item.product.stock} units</span>
                          <span>·</span>
                          <span>
                            {item.reviewCount} total review{item.reviewCount === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Product Rating Pill */}
                    <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 bg-white px-3 py-1.5 rounded-full border border-[var(--border)] shadow-xs">
                      {renderStars(item.averageRating, 14)}
                      <span className="text-xs font-bold">{item.averageRating}</span>
                      <span className="text-xs text-[var(--muted)]">({item.reviewCount})</span>
                    </div>
                  </div>

                  {/* Product Reviews Content */}
                  <div className="p-4 sm:p-5">
                    {!hasReviews ? (
                      <div className="py-8 text-center">
                        <MessageSquare
                          size={32}
                          className="mx-auto text-[var(--muted)]/50 mb-2"
                        />
                        <p className="text-sm font-medium text-[var(--muted)]">No reviews found.</p>
                        <p className="text-xs text-[var(--muted)]/70 mt-0.5">
                          {item.reviewCount === 0
                            ? 'This product has not received any buyer reviews yet.'
                            : 'No reviews match the selected rating or search filter.'}
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--border)]">
                        {reviews.map((rev) => (
                          <div key={rev.id} className="py-4 first:pt-0 last:pb-0">
                            <div className="flex items-start justify-between gap-3 mb-1.5">
                              <div className="flex items-center gap-2">
                                {rev.userAvatar ? (
                                  <img
                                    src={rev.userAvatar}
                                    alt={rev.userName}
                                    className="w-7 h-7 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500">
                                    <User size={14} />
                                  </div>
                                )}
                                <span className="text-sm font-medium text-[var(--fg)]">
                                  {rev.userName}
                                </span>
                                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
                                  Verified Buyer
                                </Badge>
                              </div>
                              <span className="text-xs text-[var(--muted)] shrink-0">
                                {formatDate(rev.createdAt)}
                              </span>
                            </div>

                            <div className="mb-2">{renderStars(rev.rating, 13)}</div>

                            {rev.comment ? (
                              <p className="text-sm text-[var(--fg)] whitespace-pre-wrap leading-relaxed">
                                {rev.comment}
                              </p>
                            ) : (
                              <p className="text-xs italic text-[var(--muted)]">
                                No written feedback provided.
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
