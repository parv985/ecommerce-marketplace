import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BadgeCheck,
  LockKeyhole,
  Truck,
} from 'lucide-react'
import { categoryService } from '@/services/category.service'
import { productService } from '@/services/product.service'
import { Skeleton } from '@/components/ui/Skeleton'
import { HeroShowcase } from '@/components/home/HeroShowcase'
import { HomeProductCard } from '@/components/home/HomeProductCard'
import { SectionHeader } from '@/components/home/SectionHeader'
import { TrustSection } from '@/components/home/TrustSection'
import { CategoryIcon } from '@/components/home/categoryVisual'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'
import { APP_NAME } from '@/config/brand'
import type { Category } from '@/types/api'
import '@/components/home/home.css'

/*
 * Homepage — Hero → Categories → New Arrivals → Best Deals → Trust → Footer.
 *
 * Everything is rendered from the LIVE catalog: one browse query feeds the
 * hero showcase, the New Arrivals grid and the Best Deals row (products with
 * a live seller discount, ranked by discount). No mock products anywhere.
 */

/** Products shown in the New Arrivals grid. */
const NEW_ARRIVALS_COUNT = 8
/** Upper bound fetched once and shared by hero + both product sections. */
const HOME_CATALOG_LIMIT = 24
/** Deals shown in the Best Deals row. */
const BEST_DEALS_COUNT = 4

export function HomePage() {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuthStore()

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryService.list,
  })

  const { data: catalog, isLoading: productsLoading } = useQuery({
    queryKey: ['products', { limit: HOME_CATALOG_LIMIT, sort: 'newest' }],
    queryFn: () => productService.browse({ limit: HOME_CATALOG_LIMIT, sort: 'newest' }),
  })

  const newestItems = catalog?.items ?? []
  const newArrivals = newestItems.slice(0, NEW_ARRIVALS_COUNT)
  /*
   * Best Deals — only real, live seller discounts (the catalog response
   * resolves product/category discounts server-side). Ranked by percentage.
   */
  const bestDeals = newestItems
    .filter((p) => (p.activeDiscount?.discountValue ?? 0) > 0)
    .sort((a, b) => (b.activeDiscount?.discountValue ?? 0) - (a.activeDiscount?.discountValue ?? 0))
    .slice(0, BEST_DEALS_COUNT)

  const handleSellClick = () => {
    if (!isAuthenticated) {
      toast.error('Please login as a seller to sell products.')
    } else if (user?.role === 'SELLER') {
      navigate('/seller/dashboard')
    } else if (user?.role === 'BUYER') {
      toast.error('Buyers cannot sell products.')
    } else {
      toast.error('Admin accounts cannot sell on this platform')
    }
  }

  return (
    <div>
      {/* ── Hero: two-column — headline + CTAs left, live product showcase right ── */}
      <section className="relative overflow-hidden bg-[#191816] text-white">
        <div className="nc-home-grid-bg absolute inset-0" aria-hidden />
        <div
          className="nc-home-glow absolute -top-32 right-[-8%] h-[26rem] w-[26rem] rounded-full opacity-50"
          aria-hidden
        />
        <div className="container-app relative grid items-center gap-10 py-10 md:py-12 lg:grid-cols-2 lg:gap-14 lg:py-14">
          <div>
            <div className="nc-home-rise inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-neutral-700 bg-neutral-900/90 px-2.5 py-1 text-xs font-medium tracking-tight text-neutral-300">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" aria-hidden />
              Verified Marketplace · 10,000+ Indian Sellers
            </div>

            <h1 className="nc-home-rise nc-home-rise-1 mt-5 text-3xl font-semibold leading-[1.15] tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
              Shop authentic goods from{' '}
              <span className="text-neutral-300">verified sellers across India</span>
            </h1>

            <p className="nc-home-rise nc-home-rise-1 mt-4 max-w-xl text-base leading-relaxed text-[#a8a59e] md:text-lg">
              Connect directly with trusted regional artisans, verified distributors, and
              independent merchants. Quality inspected, transparently priced.
            </p>

            <div className="nc-home-rise nc-home-rise-2 mt-7 flex flex-wrap items-center gap-3">
              <Link
                to="/products"
                className="inline-flex items-center gap-2 rounded-[var(--radius)] bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)]"
              >
                Browse Products
                <ArrowRight size={15} aria-hidden />
              </Link>
              <button
                type="button"
                onClick={handleSellClick}
                className="inline-flex items-center rounded-[var(--radius)] border border-neutral-700 bg-neutral-900/40 px-5 py-2.5 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 hover:text-white"
              >
                Sell on {APP_NAME}
              </button>
            </div>

            {/* Compact trust markers — the facts that matter before the first scroll */}
            <ul className="nc-home-rise nc-home-rise-3 mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-xs font-medium text-[#a8a59e]">
              <li className="flex items-center gap-1.5">
                <Truck size={14} className="text-[var(--primary)]" aria-hidden />
                Free shipping over ₹999
              </li>
              <li className="flex items-center gap-1.5">
                <BadgeCheck size={14} className="text-[var(--primary)]" aria-hidden />
                7-day easy returns
              </li>
              <li className="flex items-center gap-1.5">
                <LockKeyhole size={14} className="text-[var(--primary)]" aria-hidden />
                Secure Razorpay payments
              </li>
            </ul>
          </div>

          <div className="nc-home-rise nc-home-rise-2 mx-auto w-full max-w-md lg:max-w-none lg:pl-4">
            <HeroShowcase
              products={newestItems}
              categories={categories}
              isLoading={productsLoading}
            />
          </div>
        </div>
      </section>

      {/* ── Shop by Category ── */}
      {categoriesLoading ? (
        <section className="container-app pb-10 pt-10 md:pb-12 md:pt-12" aria-label="Loading categories">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={`cat-skeleton-${i}`} className="h-[76px] rounded-[var(--radius-lg)]" />
            ))}
          </div>
        </section>
      ) : (
        categories && categories.length > 0 && (
          <section className="container-app pb-10 pt-10 md:pb-12 md:pt-12" aria-labelledby="home-categories-title">
            <SectionHeader
              eyebrow="Browse"
              title="Shop by Category"
              titleId="home-categories-title"
              subtitle="Explore the live catalog across verified sellers"
              linkTo="/products"
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
              {categories.slice(0, 8).map((cat) => (
                <CategoryCard key={cat.id} category={cat} />
              ))}
            </div>
          </section>
        )
      )}

      {/* ── New Arrivals ── */}
      <section className="container-app pb-10 md:pb-12" aria-labelledby="home-new-arrivals-title">
        <SectionHeader
          eyebrow="Just dropped"
          title="New Arrivals"
          titleId="home-new-arrivals-title"
          subtitle="The latest inspected items added by verified merchants"
          linkTo="/products?sort=newest"
        />
        {productsLoading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={`product-skeleton-${i}`} />
            ))}
          </div>
        ) : newArrivals.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {newArrivals.map((product, index) => (
              <HomeProductCard key={product.id} product={product} priority={index < 4} />
            ))}
          </div>
        ) : (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-white px-5 py-10 text-center text-sm text-[var(--muted)]">
            No products in the catalog yet — check back soon.
          </p>
        )}
      </section>

      {/* ── Best Deals (only when live seller discounts exist) ── */}
      {!productsLoading && bestDeals.length > 0 && (
        <section className="container-app pb-10 md:pb-12" aria-labelledby="home-best-deals-title">
          <SectionHeader
            eyebrow="Limited time"
            title="Best Deals"
            titleId="home-best-deals-title"
            subtitle="Live seller discounts across the marketplace — ranked by savings"
            linkTo="/products?sort=price_asc"
            linkLabel="Shop all deals"
          />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {bestDeals.map((product) => (
              <HomeProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* ── Trust / Why NexCart ── */}
      <TrustSection />
    </div>
  )
}

// ── Homepage-local building blocks ──

/**
 * Category card with a proper visual: the Category API has no imagery, so
 * each category name is mapped to a curated lucide glyph (see
 * categoryVisual.tsx) presented in an interactive tile — no more bare
 * letter placeholders.
 */
function CategoryCard({ category }: { category: Category }) {
  return (
    <Link
      to={`/products?category=${category.id}`}
      className="group flex items-center gap-3.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] md:p-4"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--surface-subtle)] text-[var(--fg-secondary)] transition-colors duration-200 group-hover:bg-[var(--primary)] group-hover:text-white">
        <CategoryIcon name={category.name} className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold tracking-tight text-[var(--fg)] transition-colors group-hover:text-[var(--primary)]">
          {category.name}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-[var(--muted)]">
          Shop now
          <ArrowRight
            size={11}
            className="transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
      </span>
    </Link>
  )
}

/** Loading placeholder matching the HomeProductCard geometry. */
function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-white">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="space-y-2.5 p-3.5 md:p-4">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  )
}

