import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, ShoppingBag, Star } from 'lucide-react'
import { cn, formatPrice } from '@/lib/utils'
import type { Product } from '@/types/api'
import { useAuthStore } from '@/stores/authStore'
import { useWishlist } from '@/hooks/useWishlist'
import { toast } from 'react-hot-toast'

/**
 * Homepage product card.
 *
 * Homepage-specific presentation of a catalog product: enhanced image
 * presentation (fade-in, zoom, graceful fallback), discount + low-stock
 * badges, clearer price hierarchy, overlay wishlist action and a
 * stretched-link so the whole card navigates to the product page.
 *
 * Display rules intentionally mirror the shared `ProductCard` (used by the
 * listing pages): a live seller discount wins the price display, otherwise
 * the seller's compareAtPrice (MRP marker) is struck through. Ratings are
 * rendered only when the catalog response carries them.
 */

/** Below this many units left the card shows a "Only N left" chip. */
const LOW_STOCK_THRESHOLD = 5 // mirrors ProductSearchBar's convention

interface HomeProductCardProps {
  product: Product
  /** Eager-load the image (above-the-fold cards); defaults to lazy loading. */
  priority?: boolean
}

export function HomeProductCard({ product, priority = false }: HomeProductCardProps) {
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const accountInactive = useAuthStore((s) => s.accountInactive)
  const isActive = useAuthStore((s) => s.user?.isActive !== false)
  const { isWishlisted, toggle, isToggling } = useWishlist()
  const liked = isWishlisted(product.id)
  // Wishlist is a buyer-specific action — hide it for signed-out and
  // inactive users (the backend rejects it too).
  const canUseWishlist = isAuthenticated && isActive && !accountInactive

  /*
   * Live seller sales discount (product or category) wins the display:
   * discountedPrice is what the buyer pays, base price is struck through.
   * Without one, the seller's compareAtPrice (MRP-style marker) is used as
   * the struck-through reference.
   */
  const saleDiscount = product.activeDiscount ?? null
  const displayPrice = saleDiscount ? saleDiscount.discountedPrice : product.price
  const hasCompareAt = !!product.compareAtPrice && product.compareAtPrice > product.price
  const strikeThrough = saleDiscount ? product.price : (hasCompareAt ? product.compareAtPrice : null)
  const discount = saleDiscount
    ? saleDiscount.discountValue
    : (hasCompareAt ? Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100) : 0)

  const outOfStock = product.stock <= 0
  const lowStock = !outOfStock && product.stock <= LOW_STOCK_THRESHOLD
  const detailUrl = `/products/${product.id}`
  const imageUrl = product.images?.[0]?.url
  const showImage = imageUrl && imageState !== 'error'

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)]">
      {/* ── Image ── */}
      <div
        className={cn(
          'relative aspect-square overflow-hidden border-b border-[var(--border-subtle)] bg-[var(--surface-warm)]',
          !!imageUrl && imageState === 'loading' && 'animate-pulse'
        )}
      >
        {showImage ? (
          <img
            src={imageUrl}
            alt={product.name}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            onLoad={() => setImageState('loaded')}
            onError={() => setImageState('error')}
            className={cn(
              'h-full w-full object-cover transition-[opacity,transform] duration-500 ease-out group-hover:scale-[1.04]',
              imageState === 'loaded' ? 'opacity-100' : 'opacity-0'
            )}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 bg-[linear-gradient(165deg,var(--surface-warm),#ffffff_72%)]">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--muted)]">
              <ShoppingBag className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              No photo yet
            </span>
          </div>
        )}

        {/* Discount badge */}
        {discount > 0 && (
          <span className="absolute left-2.5 top-2.5 z-10 rounded-[var(--radius-sm)] bg-[var(--primary)] px-2 py-1 text-[11px] font-bold tracking-tight text-white shadow-sm">
            -{discount}%
          </span>
        )}

        {/* Low stock chip */}
        {lowStock && (
          <span className="absolute bottom-2.5 left-2.5 z-10 rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50/95 px-2 py-0.5 text-[11px] font-semibold text-amber-800 backdrop-blur-sm">
            Only {product.stock} left
          </span>
        )}

        {/* Wishlist action (sits above the stretched card link) */}
        {canUseWishlist && !outOfStock && (
          <button
            type="button"
            aria-label={liked ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
            aria-pressed={liked}
            onClick={(e) => {
              e.preventDefault()
              if (isToggling) return
              toggle.mutate(product.id, {
                onSuccess: (result) => {
                  toast(result === 'added' ? 'Added to wishlist' : 'Removed from wishlist')
                },
              })
            }}
            className={cn(
              'absolute right-2.5 top-2.5 z-20 flex h-8 w-8 items-center justify-center rounded-[var(--radius)] border shadow-sm backdrop-blur-sm transition-all duration-150 active:scale-90',
              liked
                ? 'border-[var(--primary)]/30 bg-[var(--primary-subtle)] text-[var(--primary)]'
                : 'border-[var(--border)] bg-white/95 text-[var(--fg-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--primary)]',
              isToggling && 'opacity-60'
            )}
          >
            <Heart size={15} className={liked ? 'fill-current' : ''} aria-hidden />
          </button>
        )}

        {/* Sold-out overlay */}
        {outOfStock && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--surface-warm)]/90 backdrop-blur-[2px]">
            <span className="rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--fg)]">
              Out of Stock
            </span>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 flex-col p-3.5 md:p-4">
        {product.category?.name && (
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
            {product.category.name}
          </p>
        )}
        <h3 className="mt-0.5 text-sm font-medium leading-snug text-[var(--fg)]">
          {/* Stretched link: the entire card navigates to the product page.
              Same destination as the image link, so click order is safe. */}
          <Link
            to={detailUrl}
            className="line-clamp-2 transition-colors after:absolute after:inset-0 hover:text-[var(--primary)]"
          >
            {product.name}
          </Link>
        </h3>

        {(product.averageRating ?? 0) > 0 && (
          <div className="mt-1.5 flex items-center gap-1">
            <Star size={12} className="fill-amber-400 text-amber-400" aria-hidden />
            <span className="text-xs font-semibold text-[var(--fg)]">
              {(product.averageRating ?? 0).toFixed(1)}
            </span>
            <span className="text-[11px] text-[var(--muted)]">({product.totalReviews ?? 0})</span>
          </div>
        )}

        <div className="mt-auto pt-2.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[15px] font-bold tracking-tight text-[var(--fg)]">
              {formatPrice(displayPrice)}
            </span>
            {strikeThrough !== null && strikeThrough !== undefined && (
              <span className="text-xs text-[var(--muted)] line-through">
                {formatPrice(strikeThrough)}
              </span>
            )}
            {discount > 0 && (
              <span className="text-[11px] font-bold text-[var(--primary)]">{discount}% off</span>
            )}
          </div>
          {saleDiscount && (
            <p className="mt-0.5 text-[11px] font-semibold text-emerald-700">
              You save {formatPrice(saleDiscount.discountAmount)} · Seller discount
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
