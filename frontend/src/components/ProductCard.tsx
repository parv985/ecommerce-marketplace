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
  const accountInactive = useAuthStore((s) => s.accountInactive)
  const isActive = useAuthStore((s) => s.user?.isActive !== false)
  const { isWishlisted, toggle, isToggling } = useWishlist()
  const liked = isWishlisted(product.id)
  // Wishlist is a buyer-specific action — hide it for signed-out and
  // inactive users (the backend rejects it too).
  const canUseWishlist = isAuthenticated && isActive && !accountInactive

  const discount = product.compareAtPrice && product.compareAtPrice > product.price
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
    : 0

  return (
    <div className="group border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden bg-white transition-all duration-200 hover:border-neutral-300 hover:shadow-[var(--shadow-md)] flex flex-col justify-between">
      <div>
        <Link to={`/products/${product.id}`} className="block relative aspect-square bg-[#f6f5f2] overflow-hidden border-b border-[var(--border-subtle)]">
          {product.images?.[0]?.url && !imageError ? (
            <img
              src={product.images[0].url}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-400">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          {discount > 0 && (
            <span className="absolute top-2.5 left-2.5 bg-[var(--primary)] text-white text-[11px] font-semibold px-2 py-0.5 rounded-[var(--radius-sm)] tracking-tight shadow-sm">
              -{discount}%
            </span>
          )}
          {product.stock <= 0 && (
            <div className="absolute inset-0 bg-[#191816]/70 flex items-center justify-center">
              <span className="text-white text-xs font-medium px-2.5 py-1 bg-neutral-900/80 rounded-[var(--radius-sm)] border border-white/20">
                Out of Stock
              </span>
            </div>
          )}
        </Link>
        <div className="p-3.5">
          <Link to={`/products/${product.id}`}>
            <h3 className="font-medium text-sm line-clamp-2 text-[var(--fg)] mb-1.5 group-hover:text-[var(--primary)] transition-colors leading-snug">
              {product.name}
            </h3>
          </Link>
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-sm text-[var(--fg)]">{formatPrice(product.price)}</span>
            {discount > 0 && (
              <span className="text-xs text-[var(--muted)] line-through">{formatPrice(product.compareAtPrice!)}</span>
            )}
          </div>
          {(product.averageRating ?? 0) > 0 && (
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-amber-500 text-xs">★</span>
              <span className="text-xs font-medium text-[var(--fg)]">{(product.averageRating ?? 0).toFixed(1)}</span>
              <span className="text-[11px] text-[var(--muted)]">({product.totalReviews})</span>
            </div>
          )}
        </div>
      </div>
      {canUseWishlist && product.stock > 0 && (
        <div className="px-3.5 pb-3 pt-0">
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
            className="text-xs text-[var(--muted)] hover:text-[var(--primary)] transition-colors flex items-center gap-1.5 font-medium"
            style={{ color: liked ? 'var(--primary)' : undefined }}
          >
            <Heart size={13} className={liked ? 'fill-current' : ''} />
            {liked ? 'Saved in wishlist' : 'Save to wishlist'}
          </button>
        </div>
      )}
    </div>
  )
}
