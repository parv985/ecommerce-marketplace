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
          <Skeleton className="aspect-square rounded-lg" />
          <div className="space-y-4"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /></div>
        </div>
      </div>
    )
  }

  if (!product) return <div className="text-center py-20">Product not found</div>

  const discount = product.compareAtPrice && product.compareAtPrice > product.price
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100) : 0

  return (
    <div className="container-app py-8">
      <Link to="/products" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)] mb-6">
        <ArrowLeft size={16} /> Back to products
      </Link>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Images */}
        <div>
          <div className="aspect-square bg-zinc-100 rounded-lg overflow-hidden mb-3">
            {product.images?.[selectedImage]?.url && !imageErrors[selectedImage] ? (
              <img
                src={product.images[selectedImage].url}
                alt={product.name}
                className="w-full h-full object-cover"
                onError={() => setImageErrors(prev => ({ ...prev, [selectedImage]: true }))}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-400">
                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
            )}
          </div>
          {product.images && product.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {product.images.map((img, i) => (
                <button key={img.publicId} onClick={() => setSelectedImage(i)} className={`w-16 h-16 rounded border-2 overflow-hidden shrink-0 ${selectedImage === i ? 'border-[var(--primary)]' : 'border-transparent'}`}>
                  {imageErrors[i] ? (
                    <div className="w-full h-full bg-zinc-200 flex items-center justify-center">
                      <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
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
          <h1 className="text-2xl font-bold mb-2">{product.name}</h1>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl font-bold">{formatPrice(product.price)}</span>
            {discount > 0 && (
              <>
                <span className="text-lg text-[var(--muted)] line-through">{formatPrice(product.compareAtPrice!)}</span>
                <span className="bg-green-100 text-green-700 text-sm px-2 py-0.5 rounded font-medium">{discount}% off</span>
              </>
            )}
          </div>
          {product.averageRating && product.averageRating > 0 && (
            <div className="flex items-center gap-1 mb-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={`star-${i}`} size={16} className={i < Math.round(product.averageRating!) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'} />
              ))}
              <span className="text-sm text-[var(--muted)] ml-1">({product.totalReviews || 0} reviews)</span>
            </div>
          )}
          <div className="mb-4">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${product.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
            </span>
            {product.sku && <span className="text-sm text-[var(--muted)] ml-3">SKU: {product.sku}</span>}
          </div>
          <div className="prose prose-sm text-[var(--muted)] mb-6 max-w-none">
            <p>{product.description}</p>
          </div>

          {product.specifications && product.specifications.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold mb-2 text-sm">Specifications</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {product.specifications.map((s, i) => (
                  <div key={`spec-${i}`} className="text-sm">
                    <span className="text-[var(--muted)]">{s.key}:</span>{' '}
                    <span className="font-medium">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {product.stock > 0 && (
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center border rounded">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="p-2 hover:bg-zinc-50"><Minus size={16} /></button>
                <span className="px-4 text-sm font-medium min-w-[40px] text-center">{quantity}</span>
                <button onClick={() => setQuantity(Math.min(product.stock, quantity + 1))} className="p-2 hover:bg-zinc-50"><Plus size={16} /></button>
              </div>
              <Button onClick={handleAddToCart} disabled={addToCartMutation.isPending} className="flex-1">
                <ShoppingCart size={16} className="mr-2" /> {isAuthenticated ? 'Add to Cart' : 'Sign in to Buy'}
              </Button>
              <Button
                variant="outline"
                onClick={handleWishlist}
                title={isAuthenticated ? (liked ? 'Remove from Wishlist' : 'Add to Wishlist') : 'Sign in to add to Wishlist'}
                className={liked ? 'border-red-300 text-red-500 hover:bg-red-50' : ''}
                disabled={isToggling}
              >
                <Heart size={16} className={liked ? 'fill-current' : ''} />
              </Button>
            </div>
          )}

          {typeof product.category === 'object' && product.category && (
            <div className="text-sm text-[var(--muted)]">
              Category: <Link to={`/products?category=${product.category.id}`} className="underline">{product.category.name}</Link>
            </div>
          )}
        </div>
      </div>

      {/* Reviews */}
      <section className="mt-12 border-t pt-8">
        <h2 className="text-xl font-bold mb-6">Customer Reviews</h2>
        {isAuthenticated && user?.role === 'BUYER' && product.status === 'ACTIVE' && (
          <p className="text-[var(--muted)] text-sm mb-6">
            You can write a review after your order for this product has been delivered.
            {' '}<Link to="/orders" className="text-[var(--primary)] hover:underline">View your orders</Link>
          </p>
        )}
        {!isAuthenticated && product.status === 'ACTIVE' && (
          <p className="text-[var(--muted)] text-sm mb-6">
            <Link to="/login" className="text-[var(--primary)] hover:underline">Sign in</Link> to write a review after purchase.
          </p>
        )}
        {reviewData?.reviews?.length === 0 ? (
          <p className="text-[var(--muted)] text-sm">No reviews yet. Be the first to review this product!</p>
        ) : (
          <div className="space-y-4">
            {reviewData?.reviews?.map(review => (
              <div key={review._id} className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-xs font-medium">
                    {typeof review.user === 'object' ? review.user.name?.charAt(0) : '?'}
                  </div>
                  <span className="font-medium text-sm">{typeof review.user === 'object' ? review.user.name : 'User'}</span>
                  <span className="text-xs text-[var(--muted)]">{formatDate(review.createdAt)}</span>
                </div>
                <div className="flex items-center gap-0.5 mb-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={`star-${i}`} size={14} className={i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'} />
                  ))}
                </div>
                {review.comment && <p className="text-sm text-[var(--muted)]">{review.comment}</p>}
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
