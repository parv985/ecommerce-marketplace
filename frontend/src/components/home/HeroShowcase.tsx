import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, Flame, ShoppingBag } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import type { Category, Product } from '@/types/api'
import { Skeleton } from '@/components/ui/Skeleton'
import { CategoryIcon } from './categoryVisual'
import { formatCategoryLabel } from '@/lib/categoryLabel'
import { APP_NAME, APP_TAGLINE } from '@/config/brand'

interface HeroShowcaseProps {
  /** Newest catalog products (already fetched by the homepage queries). */
  products: Product[] | undefined
  /** Active categories, used by the branded fallback panel. */
  categories: Category[] | undefined
  isLoading: boolean
}

/**
 * Right-hand showcase of the homepage hero (light theme).
 *
 * Built entirely from LIVE catalog data: the newest products returned by
 * `productService.browse` — one featured item plus two supporting tiles.
 * While loading it renders matching skeletons; if the catalog has no
 * imaged products yet it degrades to a branded panel that surfaces the
 * real categories instead (never fake product imagery).
 */
export function HeroShowcase({ products, categories, isLoading }: HeroShowcaseProps) {
  const withImages = (products ?? []).filter((p) => p.images?.[0]?.url)
  const featured = withImages[0]
  const secondary = withImages.slice(1, 3)

  /* ── Loading: skeleton collage with the same geometry ── */
  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-5 sm:grid-rows-[196px_196px] lg:grid-rows-[216px_216px]">
        <div className="flex h-[320px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-white sm:col-span-3 sm:row-span-2 sm:h-full">
          <Skeleton className="min-h-0 w-full flex-1 rounded-none" />
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border-subtle)] p-3.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
        <Skeleton className="hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-white sm:col-span-2 sm:block" />
        <Skeleton className="hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-white sm:col-span-2 sm:block" />
      </div>
    )
  }

  /* ── Live products: featured tile + two supporting tiles ── */
  if (featured) {
    return (
      <div className="relative">
        {/* Floating status chip */}
        <div className="absolute -top-3 right-3 z-20 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[var(--fg)] shadow-[var(--shadow-md)]">
          {featured.activeDiscount ? (
            <>
              <Flame size={12} className="text-[var(--primary)]" aria-hidden />
              Live discount · {featured.activeDiscount.discountValue}% off
            </>
          ) : (
            <>
              <BadgeCheck size={12} className="text-[var(--primary)]" aria-hidden />
              Verified seller item
            </>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-5 sm:grid-rows-[196px_196px] lg:grid-rows-[216px_216px]">
          {/* Featured product */}
          <Link
            to={`/products/${featured.id}`}
            className="group relative flex h-[320px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)] transition-shadow duration-200 hover:shadow-[var(--shadow-md)] sm:col-span-3 sm:row-span-2 sm:h-full"
          >
            <div className="relative min-h-0 flex-1 overflow-hidden bg-[var(--surface-warm)]">
              <ShowcaseImage product={featured} eager />
              <span className="absolute left-3 top-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white/95 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--primary)] shadow-sm backdrop-blur-sm">
                New arrival
              </span>
            </div>

            {/* Caption in a clean white strip — text never sits on the photo */}
            <div className="flex items-end justify-between gap-4 border-t border-[var(--border-subtle)] bg-white px-4 py-3">
              <p className="min-w-0 truncate text-sm font-semibold tracking-tight text-[var(--fg)]">
                {featured.name}
              </p>
              <div className="flex shrink-0 items-baseline gap-2">
                <span className="text-[15px] font-bold text-[var(--fg)]">
                  {formatPrice(featured.activeDiscount?.discountedPrice ?? featured.price)}
                </span>
                {(featured.activeDiscount || (featured.compareAtPrice ?? 0) > featured.price) && (
                  <span className="text-xs text-[var(--muted)] line-through">
                    {formatPrice(featured.activeDiscount ? featured.price : featured.compareAtPrice)}
                  </span>
                )}
              </div>
            </div>
          </Link>

          {/* Supporting tiles (tablet/desktop only — keeps the mobile hero tight) */}
          {secondary.map((product) => (
            <Link
              key={product.id}
              to={`/products/${product.id}`}
              className="group relative hidden flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)] transition-shadow duration-200 hover:shadow-[var(--shadow-md)] sm:col-span-2 sm:flex"
            >
              <div className="relative min-h-0 flex-1 overflow-hidden bg-[var(--surface-warm)]">
                <ShowcaseImage product={product} />
                {product.activeDiscount && (
                  <span className="absolute left-2.5 top-2.5 rounded-[var(--radius-sm)] bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                    -{product.activeDiscount.discountValue}%
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] bg-white px-3 py-2">
                <p className="min-w-0 truncate text-xs font-semibold text-[var(--fg)]">
                  {product.name}
                </p>
                <p className="shrink-0 text-xs font-bold text-[var(--fg)]">
                  {formatPrice(product.activeDiscount?.discountedPrice ?? product.price)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  /* ── Fallback: branded panel surfacing real categories (no mock products) ── */
  return (
    <div className="nc-home-hero relative flex min-h-[320px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-sm)] sm:p-7">
      <div className="nc-home-grid-warm absolute inset-0 opacity-60" aria-hidden />
      <div className="nc-home-glow absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-60" aria-hidden />
      <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">
        {APP_NAME} Marketplace
      </p>
      <p className="relative mt-2 max-w-xs text-2xl font-semibold leading-snug tracking-tight text-[var(--fg)]">
        {APP_TAGLINE}
      </p>
      <p className="relative mt-1.5 text-sm text-[var(--fg-secondary)]">
        Browse live categories from verified sellers across India.
      </p>

      {categories && categories.length > 0 ? (
        <div className="relative mt-6 grid grid-cols-2 gap-2.5 sm:mt-auto sm:pt-6">
          {categories.slice(0, 4).map((cat) => (
            <Link
              key={cat.id}
              to={`/products?category=${cat.id}`}
              className="flex items-center gap-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2.5 text-sm font-medium text-[var(--fg)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              <CategoryIcon name={cat.name} className="h-4 w-4 shrink-0 text-[var(--primary)]" />
              <span className="truncate">{formatCategoryLabel(cat.name)}</span>
            </Link>
          ))}
        </div>
      ) : (
        <Link
          to="/products"
          className="relative mt-auto inline-flex w-fit items-center gap-2 rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-hover)] sm:mt-6"
        >
          Browse Products
        </Link>
      )}
    </div>
  )
}

/**
 * Image with loading/failure states. While the photo loads, the warm
 * surface beneath shows; on error (or a missing URL) a tidy placeholder
 * replaces the photo — never a broken-image glyph.
 */
function ShowcaseImage({ product, eager = false }: { product: Product; eager?: boolean }) {
  const [failed, setFailed] = useState(false)
  const url = product.images?.[0]?.url

  if (!url || failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2.5">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--muted)]">
          <ShoppingBag size={20} strokeWidth={1.5} aria-hidden />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          No photo yet
        </span>
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={product.name}
      loading={eager ? 'eager' : 'lazy'}
      onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
    />
  )
}
