import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShoppingCart,
  Heart,
  Star,
  Minus,
  Plus,
  ArrowLeft,
  CheckCircle2,
  Edit2,
  Trash2,
  MessageSquarePlus,
  Sparkles,
} from 'lucide-react'
import { productService } from '@/services/product.service'
import { cartService } from '@/services/cart.service'
import { orderService } from '@/services/order.service'
import { reviewService } from '@/services/review.service'
import { isAccountInactiveError, extractErrorMessage } from '@/services/api'
import { useWishlist } from '@/hooks/useWishlist'
import { useRestrictedAction } from '@/hooks/useRestrictedAction'
import { formatPrice, formatDate } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { toast } from 'react-hot-toast'
import { Pagination } from '@/components/ui/Pagination'
import { ReviewDialog } from '@/components/reviews/ReviewDialog'
import { Dialog } from '@/components/ui/Dialog'
import type { Review } from '@/types/api'

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [selectedImage, setSelectedImage] = useState(0)
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({})
  const [quantity, setQuantity] = useState(1)
  const [reviewPage, setReviewPage] = useState(1)
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false)
  const [editingReview, setEditingReview] = useState<Review | null>(null)
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null)

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  // 1. Fetch Product details
  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productService.getById(id!),
    enabled: !!id,
  })

  // 2. Fetch Product Reviews (backend API: GET /api/v1/reviews/product/:productId)
  const { data: reviewData, isLoading: isReviewsLoading } = useQuery({
    queryKey: ['reviews', id, reviewPage],
    queryFn: () => reviewService.getProductReviews(id!, reviewPage, 5),
    enabled: !!id,
  })

  // 3. Fetch buyer's delivered orders to check review eligibility
  const isBuyer = isAuthenticated && user?.role === 'BUYER'
  const { data: deliveredOrders } = useQuery({
    queryKey: ['orders', 'delivered-for-reviews'],
    queryFn: () => orderService.list({ status: 'DELIVERED', limit: 100 }),
    enabled: isBuyer,
  })

  // Check whether buyer has a delivered order for this product
  const hasDeliveredOrder = deliveredOrders?.items?.some((order) =>
    order.items.some((item) => item.productId === id)
  ) ?? false

  // Check if current user already has a review in the fetched review list
  const reviewItems = reviewData?.items ?? reviewData?.reviews ?? []
  const userReview = reviewItems.find((r) => r.userId === user?.id)

  // Add to cart mutation
  const addToCartMutation = useMutation({
    mutationFn: () => cartService.addItem({ productId: id!, quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      toast.success('Added to cart')
    },
    onError: (err: unknown) => {
      if (isAccountInactiveError(err)) return
      const error = err as { response?: { data?: { message?: string } } }
      toast.error(error?.response?.data?.message || 'Failed to add to cart')
    },
  })

  // Delete review mutation
  const deleteReviewMutation = useMutation({
    mutationFn: (reviewId: string) => reviewService.delete(reviewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', id] })
      queryClient.invalidateQueries({ queryKey: ['product', id] })
      setDeletingReviewId(null)
      toast.success('Review deleted successfully')
    },
    onError: (err: unknown) => {
      toast.error(extractErrorMessage(err))
    },
  })

  const { isWishlisted, toggle: toggleWishlistMutation, isToggling } = useWishlist()
  const guardRestrictedAction = useRestrictedAction()
  const liked = id ? isWishlisted(id) : false

  const handleAddToCart = () => {
    if (!guardRestrictedAction()) return
    addToCartMutation.mutate()
  }

  const handleWishlist = () => {
    if (!guardRestrictedAction()) return
    if (isToggling || !id) return
    toggleWishlistMutation.mutate(id, {
      onSuccess: (result) => {
        toast(result === 'added' ? 'Added to wishlist' : 'Removed from wishlist')
      },
    })
  }

  const handleOpenWriteReview = () => {
    setEditingReview(null)
    setIsReviewDialogOpen(true)
  }

  const handleOpenEditReview = (rev: Review) => {
    setEditingReview(rev)
    setIsReviewDialogOpen(true)
  }

  const handleReviewSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['reviews', id] })
    queryClient.invalidateQueries({ queryKey: ['product', id] })
  }

  if (isLoading) {
    return (
      <div className="container-app py-8">
        <div className="grid md:grid-cols-2 gap-8">
          <Skeleton className="aspect-square rounded-[var(--radius-lg)]" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (!product) return <div className="text-center py-20 text-[var(--muted)]">Product not found</div>

  const saleDiscount = product.activeDiscount ?? null
  const displayPrice = saleDiscount ? saleDiscount.discountedPrice : product.price
  const hasCompareAt = !!product.compareAtPrice && product.compareAtPrice > product.price
  const strikeThrough = saleDiscount
    ? product.price
    : hasCompareAt
      ? product.compareAtPrice!
      : null
  const discountPercent = saleDiscount
    ? saleDiscount.discountValue
    : hasCompareAt
      ? Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100)
      : 0

  const averageRating = reviewData?.averageRating ?? product.averageRating ?? 0
  const totalReviews = reviewData?.reviewCount ?? reviewData?.total ?? product.totalReviews ?? 0

  return (
    <div className="container-app py-8">
      <Link
        to="/products"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--fg)] mb-6 transition-colors font-medium"
      >
        <ArrowLeft size={15} /> Back to products
      </Link>

      <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
        {/* Images */}
        <div>
          <div className="aspect-square bg-[#f6f5f2] rounded-[var(--radius-lg)] border border-[var(--border)] overflow-hidden mb-3.5">
            {product.images?.[selectedImage]?.url && !imageErrors[selectedImage] ? (
              <img
                src={product.images[selectedImage].url}
                alt={product.name}
                loading="eager"
                decoding="async"
                className="w-full h-full object-cover"
                onError={() => setImageErrors((prev) => ({ ...prev, [selectedImage]: true }))}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-neutral-400">
                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}
          </div>
          {product.images && product.images.length > 1 && (
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {product.images.map((img, i) => (
                <button
                  key={img.publicId || i}
                  onClick={() => setSelectedImage(i)}
                  className={`w-16 h-16 rounded-[var(--radius)] border-2 overflow-hidden shrink-0 bg-[#f6f5f2] transition-all ${
                    selectedImage === i ? 'border-[var(--primary)] shadow-sm' : 'border-[var(--border)] hover:border-neutral-400'
                  }`}
                >
                  {imageErrors[i] ? (
                    <div className="w-full h-full bg-[#f4f3ef] flex items-center justify-center">
                      <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  ) : (
                    <img
                      src={img.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                      onError={() => setImageErrors((prev) => ({ ...prev, [i]: true }))}
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[var(--fg)] mb-3 leading-tight">
            {product.name}
          </h1>
          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-2xl md:text-3xl font-bold text-[var(--fg)]">{formatPrice(displayPrice)}</span>
            {strikeThrough !== null && (
              <>
                <span className="text-base text-[var(--muted)] line-through">{formatPrice(strikeThrough)}</span>
                <span className="bg-[var(--primary)] text-white text-xs px-2 py-0.5 rounded-[var(--radius-sm)] font-semibold tracking-tight">
                  {discountPercent}% off
                </span>
              </>
            )}
          </div>
          {saleDiscount && (
            <p className="text-xs font-medium text-emerald-700 mb-3">
              Seller discount active — you save {formatPrice(saleDiscount.discountAmount)} per unit
            </p>
          )}
          {averageRating > 0 && (
            <div className="flex items-center gap-1.5 mb-4">
              <div className="flex items-center text-amber-500">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={`star-${i}`}
                    size={14}
                    className={
                      i < Math.round(averageRating)
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-neutral-300'
                    }
                  />
                ))}
              </div>
              <span className="text-xs font-semibold text-[var(--fg)]">{averageRating.toFixed(1)}</span>
              <span className="text-xs text-[var(--muted)]">({totalReviews} reviews)</span>
            </div>
          )}
          <div className="mb-5 flex items-center gap-3">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-[var(--radius-sm)] text-xs font-medium border ${
                product.stock > 0
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
            </span>
            {product.sku && <span className="text-xs text-[var(--muted)]">SKU: {product.sku}</span>}
          </div>
          <div className="text-sm text-[var(--fg-secondary)] mb-6 leading-relaxed border-t border-b border-[var(--border)] py-4">
            <p>{product.description}</p>
          </div>

          {product.specifications && product.specifications.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-xs uppercase tracking-wider text-[var(--muted)] mb-3">Specifications</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 bg-[#f6f5f2] p-4 rounded-[var(--radius)] border border-[var(--border)]">
                {product.specifications.map((s, i) => (
                  <div key={`spec-${i}`} className="text-xs">
                    <span className="text-[var(--muted)]">{s.key}:</span>{' '}
                    <span className="font-medium text-[var(--fg)]">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {product.stock > 0 && (
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center border border-[var(--border)] rounded-[var(--radius)] bg-white overflow-hidden">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="p-2.5 hover:bg-[var(--accent)] text-[var(--fg)] transition-colors"
                >
                  <Minus size={14} />
                </button>
                <span className="px-3.5 text-sm font-semibold min-w-[36px] text-center text-[var(--fg)]">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                  className="p-2.5 hover:bg-[var(--accent)] text-[var(--fg)] transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
              <Button onClick={handleAddToCart} disabled={addToCartMutation.isPending} className="flex-1">
                <ShoppingCart size={15} className="mr-2" /> {isAuthenticated ? 'Add to Cart' : 'Sign in to Buy'}
              </Button>
              <Button
                variant="outline"
                onClick={handleWishlist}
                title={isAuthenticated ? (liked ? 'Remove from Wishlist' : 'Add to Wishlist') : 'Sign in to add to Wishlist'}
                className={liked ? 'border-red-200 text-red-600 bg-red-50' : ''}
                disabled={isToggling}
              >
                <Heart size={15} className={liked ? 'fill-current' : ''} />
              </Button>
            </div>
          )}

          {typeof product.category === 'object' && product.category && (
            <div className="text-xs text-[var(--muted)]">
              Category:{' '}
              <Link
                to={`/products?category=${product.category.id}`}
                className="text-[var(--fg-secondary)] hover:text-[var(--primary)] underline"
              >
                {product.category.name}
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Customer Reviews Section ── */}
      <section className="mt-14 border-t border-[var(--border)] pt-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--fg)]">Customer Reviews</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Verified feedback from delivered purchases
            </p>
          </div>

          {/* Write review trigger button (if eligible and hasn't reviewed yet) */}
          {isBuyer && hasDeliveredOrder && !userReview && (
            <Button onClick={handleOpenWriteReview} className="shrink-0 gap-2">
              <MessageSquarePlus size={16} /> Write a Review
            </Button>
          )}
        </div>

        {/* Rating summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8 p-6 rounded-[var(--radius-lg)] bg-[var(--surface-warm)] border border-[var(--border)]">
          <div className="flex flex-col items-center justify-center text-center p-3 border-b md:border-b-0 md:border-r border-[var(--border)]">
            <span className="text-4xl font-bold text-[var(--fg)] tracking-tight">
              {averageRating > 0 ? averageRating.toFixed(1) : '0.0'}
            </span>
            <div className="flex items-center gap-1 my-2 text-amber-400">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={`sum-star-${i}`}
                  size={18}
                  className={i < Math.round(averageRating) ? 'fill-amber-400 text-amber-400' : 'text-neutral-300'}
                />
              ))}
            </div>
            <span className="text-xs font-medium text-[var(--muted)]">
              Based on {totalReviews} review{totalReviews === 1 ? '' : 's'}
            </span>
          </div>

          <div className="md:col-span-2 flex flex-col justify-center">
            {/* Authenticated buyer status notice */}
            {isBuyer && (
              <div className="text-xs space-y-1.5">
                {hasDeliveredOrder ? (
                  <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-3 py-2 rounded-[var(--radius)] border border-emerald-200">
                    <CheckCircle2 size={16} className="shrink-0" />
                    <span>
                      <strong>Verified Delivery:</strong> You have purchased and received this product, so you are eligible to review it.
                    </span>
                  </div>
                ) : (
                  <div className="text-[var(--muted)] bg-white/80 p-3 rounded-[var(--radius)] border border-[var(--border)]">
                    <span>
                      You can review this product once an order containing it has been delivered.{' '}
                    </span>
                    <Link to="/orders" className="text-[var(--primary)] hover:underline font-medium">
                      View your orders
                    </Link>
                  </div>
                )}
              </div>
            )}

            {!isAuthenticated && (
              <div className="text-xs text-[var(--muted)] bg-white/80 p-3 rounded-[var(--radius)] border border-[var(--border)]">
                <span>Have you purchased this item? </span>
                <Link to="/login" className="text-[var(--primary)] hover:underline font-semibold">
                  Sign in
                </Link>
                <span> to leave a review after your order is delivered.</span>
              </div>
            )}

            {isAuthenticated && user?.role === 'SELLER' && (
              <p className="text-xs text-[var(--muted)] bg-white/80 p-3 rounded-[var(--radius)] border border-[var(--border)]">
                Seller accounts cannot submit buyer product reviews.
              </p>
            )}
          </div>
        </div>

        {/* Highlighted "Your Review" section if already reviewed */}
        {userReview && (
          <div className="mb-8 p-5 rounded-[var(--radius-lg)] bg-amber-50/70 border-2 border-amber-200/90 shadow-[var(--shadow-sm)]">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-[var(--radius-sm)]">
                  <Sparkles size={11} /> Your Review
                </span>
                <span className="text-xs font-semibold text-[var(--fg)]">{userReview.userName}</span>
                <span className="text-[11px] text-[var(--muted)] ml-2">{formatDate(userReview.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenEditReview(userReview)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[var(--fg)] bg-white rounded-[var(--radius-sm)] border border-[var(--border)] hover:bg-[var(--accent)] hover:border-[var(--border-strong)] transition-colors"
                >
                  <Edit2 size={12} /> Edit
                </button>
                <button
                  onClick={() => setDeletingReviewId(userReview.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 bg-white rounded-[var(--radius-sm)] border border-red-200 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
            <div className="flex items-center gap-0.5 mb-2 text-amber-400">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={`user-star-${i}`}
                  size={14}
                  className={i < userReview.rating ? 'fill-amber-400 text-amber-400' : 'text-neutral-300'}
                />
              ))}
            </div>
            {userReview.comment ? (
              <p className="text-sm text-[var(--fg)] leading-relaxed whitespace-pre-line">{userReview.comment}</p>
            ) : (
              <p className="text-xs italic text-[var(--muted)]">No comment provided.</p>
            )}
          </div>
        )}

        {/* Reviews List */}
        {isReviewsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-[var(--radius)]" />
            ))}
          </div>
        ) : reviewItems.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-[var(--border)] rounded-[var(--radius-lg)] bg-white p-6">
            <p className="text-sm font-medium text-[var(--fg)] mb-1">No reviews yet</p>
            <p className="text-xs text-[var(--muted)]">
              Be the first to review this product after your order has been delivered!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviewItems.map((review) => {
              const isOwner = user && user.id === review.userId
              return (
                <div
                  key={review.id}
                  className={`border rounded-[var(--radius-lg)] p-4.5 bg-white transition-shadow duration-150 ${
                    isOwner ? 'border-amber-200 shadow-sm' : 'border-[var(--border)] shadow-[var(--shadow-xs)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      {review.userAvatar ? (
                        <img
                          src={review.userAvatar}
                          alt={review.userName}
                          className="w-8 h-8 rounded-full object-cover border border-[var(--border)]"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#191816] text-white flex items-center justify-center text-xs font-semibold">
                          {review.userName?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-[var(--fg)]">{review.userName}</span>
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                            <CheckCircle2 size={10} /> Verified Buyer
                          </span>
                          {isOwner && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded">
                              You
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-[var(--muted)]">{formatDate(review.createdAt)}</span>
                      </div>
                    </div>

                    {isOwner && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditReview(review)}
                          title="Edit Review"
                          className="p-1.5 rounded text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--accent)] transition-colors"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => setDeletingReviewId(review.id)}
                          title="Delete Review"
                          className="p-1.5 rounded text-[var(--muted)] hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-0.5 mb-2 text-amber-400">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={`star-${review.id}-${i}`}
                        size={13}
                        className={i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-neutral-300'}
                      />
                    ))}
                  </div>

                  {review.comment && (
                    <p className="text-sm text-[var(--fg-secondary)] leading-relaxed whitespace-pre-line">
                      {review.comment}
                    </p>
                  )}
                </div>
              )
            })}

            {reviewData && reviewData.totalPages > 1 && (
              <div className="pt-2">
                <Pagination
                  currentPage={reviewPage}
                  totalPages={reviewData.totalPages}
                  onPageChange={setReviewPage}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* Review Dialog for Submission / Editing */}
      <ReviewDialog
        open={isReviewDialogOpen}
        onClose={() => setIsReviewDialogOpen(false)}
        productId={id!}
        productName={product.name}
        productImage={product.images?.[0]?.url}
        existingReview={editingReview}
        onSuccess={handleReviewSuccess}
      />

      {/* Confirmation Dialog for Review Deletion */}
      <Dialog
        open={!!deletingReviewId}
        onClose={() => setDeletingReviewId(null)}
        title="Delete Review"
        className="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--fg-secondary)]">
            Are you sure you want to delete your review? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeletingReviewId(null)}
              disabled={deleteReviewMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deletingReviewId && deleteReviewMutation.mutate(deletingReviewId)}
              disabled={deleteReviewMutation.isPending}
            >
              {deleteReviewMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
