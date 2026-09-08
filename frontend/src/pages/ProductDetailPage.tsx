import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShoppingCart, Heart, Star, Minus, Plus, ArrowLeft } from 'lucide-react'
import { productService } from '@/services/product.service'
import { cartService } from '@/services/cart.service'
import { reviewService } from '@/services/review.service'
import { useWishlist } from '@/hooks/useWishlist'
import { formatPrice, formatDate } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { toast } from 'react-hot-toast'
import { Pagination } from '@/components/ui/Pagination'

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [selectedImage, setSelectedImage] = useState(0)
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({})
  const [quantity, setQuantity] = useState(1)
  const [reviewPage, setReviewPage] = useState(1)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productService.getById(id!),
    enabled: !!id,
  })

  const { data: reviewData } = useQuery({
    queryKey: ['reviews', id, reviewPage],
    queryFn: () => reviewService.getProductReviews(id!, reviewPage, 5),
    enabled: !!id,
  })

  const addToCartMutation = useMutation({
    mutationFn: () => cartService.addItem({ productId: id!, quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      toast.success('Added to cart')
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { message?: string } } }
      toast.error(error?.response?.data?.message || 'Failed to add to cart')
    },
  })

  const { isWishlisted, toggle: toggleWishlistMutation, isToggling } = useWishlist()
  const liked = id ? isWishlisted(id) : false

  const handleAddToCart = () => {
    if (!isAuthenticated) {
      toast('Sign in to add items to your cart', { icon: '🔐' })
      navigate('/login', { state: { from: { pathname: `/products/${id}` } } })
      return
    }
    addToCartMutation.mutate()
  }

  const handleWishlist = () => {
    if (!isAuthenticated) {
      toast('Sign in to add items to your wishlist', { icon: '🔐' })
      navigate('/login', { state: { from: { pathname: `/products/${id}` } } })
      return
    }
    if (isToggling || !id) return
    toggleWishlistMutation.mutate(id, {
      onSuccess: (result) => {
        toast(result === 'added' ? 'Added to wishlist' : 'Removed from wishlist')
      },
    })
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

  const discount = product.compareAtPrice && product.compareAtPrice > product.price
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100) : 0

  return (
    <div className="container-app py-8">
      <Link to="/products" className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--fg)] mb-6 transition-colors font-medium">
        <ArrowLeft size={15} /> Back to products
      </Link>

      <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
        {/* Images with signature recessed frame */}
        <div>
          <div className="aspect-square bg-[#f6f5f2] rounded-[var(--radius-lg)] border border-[var(--border)] overflow-hidden mb-3.5">
            {product.images?.[selectedImage]?.url && !imageErrors[selectedImage] ? (
              <img
                src={product.images[selectedImage].url}
                alt={product.name}
                className="w-full h-full object-cover"
                onError={() => setImageErrors(prev => ({ ...prev, [selectedImage]: true }))}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-neutral-400">
                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>
          {product.images && product.images.length > 1 && (
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {product.images.map((img, i) => (
                <button
                  key={img.publicId}
                  onClick={() => setSelectedImage(i)}
                  className={`w-16 h-16 rounded-[var(--radius)] border-2 overflow-hidden shrink-0 bg-[#f6f5f2] transition-all ${selectedImage === i ? 'border-[var(--primary)] shadow-sm' : 'border-[var(--border)] hover:border-neutral-400'}`}
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
                      className="w-full h-full object-cover"
                      onError={() => setImageErrors(prev => ({ ...prev, [i]: true }))}
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[var(--fg)] mb-3 leading-tight">{product.name}</h1>
          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-2xl md:text-3xl font-bold text-[var(--fg)]">{formatPrice(product.price)}</span>
            {discount > 0 && (
              <>
                <span className="text-base text-[var(--muted)] line-through">{formatPrice(product.compareAtPrice!)}</span>
                <span className="bg-[var(--primary)] text-white text-xs px-2 py-0.5 rounded-[var(--radius-sm)] font-semibold tracking-tight">
                  {discount}% off
                </span>
              </>
            )}
          </div>
          {product.averageRating && product.averageRating > 0 && (
            <div className="flex items-center gap-1.5 mb-4">
              <div className="flex items-center text-amber-500">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={`star-${i}`} size={14} className={i < Math.round(product.averageRating!) ? 'fill-amber-400 text-amber-400' : 'text-neutral-300'} />
                ))}
              </div>
              <span className="text-xs font-semibold text-[var(--fg)]">{product.averageRating.toFixed(1)}</span>
              <span className="text-xs text-[var(--muted)]">({product.totalReviews || 0} reviews)</span>
            </div>
          )}
          <div className="mb-5 flex items-center gap-3">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-[var(--radius-sm)] text-xs font-medium border ${product.stock > 0 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'}`}>
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
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="p-2.5 hover:bg-[var(--accent)] text-[var(--fg)] transition-colors"><Minus size={14} /></button>
                <span className="px-3.5 text-sm font-semibold min-w-[36px] text-center text-[var(--fg)]">{quantity}</span>
                <button onClick={() => setQuantity(Math.min(product.stock, quantity + 1))} className="p-2.5 hover:bg-[var(--accent)] text-[var(--fg)] transition-colors"><Plus size={14} /></button>
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
              Category: <Link to={`/products?category=${product.category.id}`} className="text-[var(--fg-secondary)] hover:text-[var(--primary)] underline">{product.category.name}</Link>
            </div>
          )}
        </div>
      </div>

      {/* Reviews */}
      <section className="mt-14 border-t border-[var(--border)] pt-8">
        <h2 className="text-xl font-bold tracking-tight text-[var(--fg)] mb-6">Customer Reviews</h2>
        {isAuthenticated && user?.role === 'BUYER' && product.status === 'ACTIVE' && (
          <p className="text-[var(--muted)] text-sm mb-6">
            You can write a review after your order for this product has been delivered.
            {' '}<Link to="/orders" className="text-[var(--primary)] hover:underline font-medium">View your orders</Link>
          </p>
        )}
        {!isAuthenticated && product.status === 'ACTIVE' && (
          <p className="text-[var(--muted)] text-sm mb-6">
            <Link to="/login" className="text-[var(--primary)] hover:underline font-medium">Sign in</Link> to write a review after purchase.
          </p>
        )}
        {reviewData?.reviews?.length === 0 ? (
          <p className="text-[var(--muted)] text-sm">No reviews yet. Be the first to review this product!</p>
        ) : (
          <div className="space-y-3.5">
            {reviewData?.reviews?.map(review => (
              <div key={review.id} className="border border-[var(--border)] bg-white rounded-[var(--radius)] p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-[#191816] text-white flex items-center justify-center text-xs font-semibold">
                    {typeof review.user === 'object' ? review.user.name?.charAt(0) : '?'}
                  </div>
                  <span className="font-semibold text-xs text-[var(--fg)]">{typeof review.user === 'object' ? review.user.name : 'User'}</span>
                  <span className="text-[11px] text-[var(--muted)] ml-auto">{formatDate(review.createdAt)}</span>
                </div>
                <div className="flex items-center gap-0.5 mb-2 text-amber-400">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={`star-${i}`} size={12} className={i < review.rating ? 'fill-amber-400' : 'text-neutral-300'} />
                  ))}
                </div>
                {review.comment && <p className="text-sm text-[var(--fg-secondary)] leading-relaxed">{review.comment}</p>}
              </div>
            ))}
            {reviewData && reviewData.totalPages > 1 && (
              <Pagination currentPage={reviewPage} totalPages={reviewData.totalPages} onPageChange={setReviewPage} />
            )}
          </div>
        )}
      </section>
    </div>
  )
}
