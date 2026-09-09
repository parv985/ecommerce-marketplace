import { Link } from 'react-router-dom'
import { BadgeCheck, Flame } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import type { Category, Product } from '@/types/api'
import { Skeleton } from '@/components/ui/Skeleton'
import { CategoryIcon } from './categoryVisual'
import { APP_NAME, APP_TAGLINE } from '@/config/brand'

interface HeroShowcaseProps {
  /** Newest catalog products (already fetched by the homepage queries). */
  products: Product[] | undefined
  /** Active categories, used by the branded fallback panel. */
  categories: Category[] | undefined
  isLoading: boolean
}

/**
 * Two-column hero showcase (right side of the homepage hero).
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
      <div className="grid gap-3 sm:grid-cols-5 sm:grid-rows-[200px_200px] lg:grid-rows-[220px_220px]">
        <Skeleton className="h-[260px] w-full rounded-[var(--radius-lg)] border border-white/10 bg-white/5 sm:col-span-3 sm:row-span-2 sm:h-full" />
        <Skeleton className="hidden rounded-[var(--radius-lg)] border border-white/10 bg-white/5 sm:col-span-2 sm:block" />
        <Skeleton className="hidden rounded-[var(--radius-lg)] border border-white/10 bg-white/5 sm:col-span-2 sm:block" />
      </div>
    )
  }

  /* ── Live products: featured tile + two supporting tiles ── */
  if (featured) {
    const sale = featured.activeDiscount ?? null
    const featuredPrice = sale ? sale.discountedPrice : featured.price

    return (
      <div className="relative">
        {/* Floating status chip */}
        <div className="absolute -top-3 right-3 z-20 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-white/15 bg-[#211f1c]/90 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-200 shadow-lg backdrop-blur">
          {sale ? (
            <>
              <Flame size={12} className="text-[var(--primary)]" aria-hidden />
              Live discount · {sale.discountValue}% off
            </>
          ) : (
            <>
              <BadgeCheck size={12} className="text-[var(--primary)]" aria-hidden />
              Verified seller item
            </>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-5 sm:grid-rows-[200px_200px] lg:grid-rows-[220px_220px]">
          {/* Featured product */}
          <Link
            to={`/products/${featured.id}`}
            className="group relative h-[260px] overflow-hidden rounded-[var(--radius-lg)] border border-white/10 bg-white shadow-[0_24px_60px_-24px_rgba(0,0,0,0.65)] focus-visible:outline-white sm:col-span-3 sm:row-span-2 sm:h-full"
          >
            <img
              src={featured.images[0].url}
              alt={featured.name}
              loading="eager"
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            />
            {/* Caption overlay */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-4 pt-10 text-white">
              <p className="line-clamp-1 text-sm font-semibold">{featured.name}</p>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="text-base font-bold">{formatPrice(featuredPrice)}</span>
                {sale && (
                  <span className="text-xs text-neutral-300 line-through">
                    {formatPrice(featured.price)}
                  </span>
                )}
              </div>
            </div>
            <span className="absolute left-3 top-3 rounded-[var(--radius-sm)] bg-white/95 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--fg)] shadow-sm">
              New arrival
            </span>
          </Link>

          {/* Supporting tiles (tablet/desktop only — keeps the mobile hero tight) */}
          {secondary.map((product) => (
            <Link
              key={product.id}
              to={`/products/${product.id}`}
              className="group relative hidden overflow-hidden rounded-[var(--radius-lg)] border border-white/10 bg-white shadow-[0_16px_40px_-20px_rgba(0,0,0,0.6)] sm:col-span-2 sm:block"
            >
              <img
                src={product.images[0].url}
                alt={product.name}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3 pt-8 text-white">
                <p className="line-clamp-1 text-xs font-semibold">{product.name}</p>
                <p className="mt-0.5 text-xs font-bold">
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
    <div className="relative flex min-h-[320px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-white/10 bg-gradient-to-br from-[#242119] via-[#1d1b18] to-[#191816] p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.65)] sm:p-7">
      <div className="nc-home-glow absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-60" aria-hidden />
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">
        {APP_NAME} Marketplace
      </p>
      <p className="mt-2 max-w-xs text-2xl font-semibold leading-snug tracking-tight text-white">
        {APP_TAGLINE}
      </p>
      <p className="mt-1.5 text-sm text-[#a8a59e]">
        Browse live categories from verified sellers across India.
      </p>

      {categories && categories.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:mt-auto sm:pt-6">
          {categories.slice(0, 4).map((cat) => (
            <Link
              key={cat.id}
              to={`/products?category=${cat.id}`}
              className="flex items-center gap-2.5 rounded-[var(--radius)] border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-neutral-200 transition-colors hover:border-[var(--primary)]/50 hover:bg-white/10"
            >
              <CategoryIcon name={cat.name} className="h-4 w-4 shrink-0 text-[var(--primary)]" />
              <span className="truncate">{cat.name}</span>
            </Link>
          ))}
        </div>
      ) : (
        <Link
          to="/products"
          className="mt-auto inline-flex w-fit items-center gap-2 rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-hover)] sm:mt-6"
        >
          Browse Products
        </Link>
      )}
    </div>
  )
}
