import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import type { Product } from '@/types/api'
import { useAuthStore } from '@/stores/authStore'
import { useWishlist } from '@/hooks/useWishlist'
import { toast } from 'react-hot-toast'

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const [imageError, setImageError] = useState(false)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { isWishlisted, toggle, isToggling } = useWishlist()
  const liked = isWishlisted(product.id)

  const discount = product.compareAtPrice && product.compareAtPrice > product.price
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
    : 0

  return (
    <div className="group border rounded-lg overflow-hidden hover:shadow-md transition-shadow bg-white">
      <Link to={`/products/${product.id}`}>
        <div className="relative aspect-square bg-zinc-100">
          {product.images?.[0]?.url && !imageError ? (
            <img
              src={product.images[0].url}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-400">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
          )}
          {discount > 0 && (
            <span className="absolute top-2 left-2 bg-[var(--destructive)] text-white text-[10px] font-bold px-2 py-0.5 rounded">
              -{discount}%
            </span>
          )}
          {product.stock <= 0 && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white font-medium text-sm">Out of Stock</span>
            </div>
          )}
        </div>
      </Link>
      <div className="p-3">
        <Link to={`/products/${product.id}`}>
          <h3 className="font-medium text-sm line-clamp-2 mb-1 group-hover:text-[var(--primary)] transition-colors">
            {product.name}
          </h3>
        </Link>
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">{formatPrice(product.price)}</span>
          {discount > 0 && (
            <span className="text-xs text-[var(--muted)] line-through">{formatPrice(product.compareAtPrice!)}</span>
          )}
        </div>
        {product.averageRating > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-yellow-500 text-xs">{'★'.repeat(Math.round(product.averageRating))}</span>
            <span className="text-xs text-[var(--muted)]">({product.totalReviews})</span>
          </div>
        )}
        {isAuthenticated && product.stock > 0 && (
          <button
            onClick={(e) => {
              e.preventDefault()
              if (isToggling) return
              toggle.mutate(product.id, {
                onSuccess: (result) => {
                  toast(result === 'added' ? 'Added to wishlist' : 'Removed from wishlist')
                },
              })
            }}
            className="mt-2 text-xs transition-colors flex items-center gap-1"
            style={{ color: liked ? '#ef4444' : undefined }}
          >
            <Heart size={12} className={liked ? 'fill-current' : ''} />
            {liked ? 'In wishlist' : 'Add to wishlist'}
          </button>
        )}
      </div>
    </div>
  )
}
