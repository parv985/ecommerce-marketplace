import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BadgeCheck,
  LockKeyhole,
} from 'lucide-react'
import { categoryService } from '@/services/category.service'
import { productService } from '@/services/product.service'
import { sellerService } from '@/services/seller.service'
import { Skeleton } from '@/components/ui/Skeleton'
import { HeroShowcase } from '@/components/home/HeroShowcase'
import { ProductCarousel } from '@/components/home/ProductCarousel'
import { ProductGrid } from '@/components/home/ProductGrid'
import { SectionHeader } from '@/components/home/SectionHeader'
import { TrustSection } from '@/components/home/TrustSection'
import { SellerCtaSection } from '@/components/home/SellerCtaSection'
import { CategoryIcon } from '@/components/home/categoryVisual'
import { formatCategoryLabel } from '@/lib/categoryLabel'
import { useAuthStore } from '@/stores/authStore'
import { APP_NAME } from '@/config/brand'
import type { Category } from '@/types/api'
import '@/components/home/home.css'

/*
 * Homepage — Announcement bar (header) → Hero → Categories → New Arrivals (Grid) →
 * Best Deals (Carousel) → Trust → Become-a-Seller CTA → Footer.
 *
 * Everything is rendered from the LIVE catalog: one browse query feeds the
 * hero showcase, the New Arrivals grid and the Best Deals carousel (products with
 * a live seller discount, ranked by discount). No mock products anywhere.
 */

/** Products shown in the New Arrivals carousel. */
const NEW_ARRIVALS_COUNT = 12
/** Upper bound fetched once and shared by hero + both product sections. */
const HOME_CATALOG_LIMIT = 24
/** Deals shown in the Best Deals carousel. */
const BEST_DEALS_COUNT = 8

export function HomePage() {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuthStore()

  const isBuyer = isAuthenticated && user?.role === 'BUYER'

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryService.list,
  })

  const { data: catalog, isLoading: productsLoading } = useQuery({
    queryKey: ['products', { limit: HOME_CATALOG_LIMIT, sort: 'newest' }],
    queryFn: () => productService.browse({ limit: HOME_CATALOG_LIMIT, sort: 'newest' }),
  })

  /* Live seller count — fetched once from the public endpoint. */
  const { data: sellerCountData } = useQuery({
    queryKey: ['sellerCount'],
    queryFn: sellerService.getCount,
    staleTime: 5 * 60 * 1000,
  })
  const sellerCount = sellerCountData?.count ?? 0

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
      navigate('/seller/register')
    } else if (user?.role === 'SELLER') {
      navigate('/seller/dashboard')
    }
  }

  return (
    <div>
      {/* ── Hero — two-column: headline + CTAs left, live product showcase right ── */}
      <section className="nc-home-hero relative overflow-hidden">
        <div className="nc-home-grid-warm absolute inset-0" aria-hidden />
        <div
          className="nc-home-glow absolute -top-32 right-[-8%] h-[24rem] w-[24rem] rounded-full opacity-70"
          aria-hidden
        />
        <div
          className="nc-home-glow-soft absolute -bottom-40 left-[-10%] h-[26rem] w-[26rem] rounded-full opacity-80"
          aria-hidden
        />

        <div className="container-app relative grid items-center gap-10 py-10 md:py-12 lg:grid-cols-[1.04fr_0.96fr] lg:gap-12 lg:py-14">
          <div>
            <div className="nc-home-rise inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white/80 px-2.5 py-1 text-xs font-medium tracking-tight text-[var(--fg-secondary)] backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" aria-hidden />
              Verified Marketplace · {sellerCount > 0 ? `${sellerCount.toLocaleString('en-IN')}+ Indian Sellers` : 'Indian Sellers'}
            </div>

            <h1 className="nc-home-rise nc-home-rise-1 mt-4 text-[1.85rem] font-bold leading-[1.18] tracking-tight text-[var(--fg)] sm:text-4xl lg:text-[2.6rem]">
              Shop authentic goods from{' '}
              <span className="text-[var(--primary)]">verified sellers across India</span>
            </h1>

            <p className="nc-home-rise nc-home-rise-1 mt-4 max-w-xl text-base leading-relaxed text-[var(--fg-secondary)] md:text-lg">
              Connect directly with trusted regional artisans, verified distributors, and
              independent merchants. Quality inspected, transparently priced.
            </p>

            <div className="nc-home-rise nc-home-rise-2 mt-7 flex flex-wrap items-center gap-3">
              <Link
                to="/products"
                className="inline-flex items-center gap-2 rounded-[var(--radius)] bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_10px_-2px_rgba(184,62,32,0.45)] transition-colors duration-150 hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)]"
              >
                Browse Products
                <ArrowRight size={15} aria-hidden />
              </Link>
              {!isBuyer && (
                <button
                  type="button"
                  onClick={handleSellClick}
                  className="inline-flex items-center rounded-[var(--radius)] border border-[var(--border-strong)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--fg)] transition-colors duration-150 hover:border-[var(--primary)] hover:text-[var(--primary)] active:bg-[var(--primary-subtle)]"
                >
                  Sell on {APP_NAME}
                </button>
              )}
            </div>

            {/* Compact trust markers — the facts that matter before the first scroll */}
            <ul className="nc-home-rise nc-home-rise-3 mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--border)] pt-5 text-xs font-medium text-[var(--fg-secondary)]">
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

          <div className="nc-home-rise nc-home-rise-2 mx-auto w-full max-w-xl lg:max-w-none">
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
        <section
          className="container-app py-9 md:py-11"
          aria-label="Loading categories"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton
                key={`cat-skeleton-${i}`}
                className="h-[76px] rounded-[var(--radius-lg)]"
              />
            ))}
          </div>
        </section>
      ) : (
        categories &&
        categories.length > 0 && (
          <section
            className="container-app py-9 md:py-11"
            aria-labelledby="home-categories-title"
          >
            <SectionHeader
              eyebrow="Browse"
              title="Shop by Category"
              titleId="home-categories-title"
              subtitle="Explore the live catalog across verified sellers"
              linkTo="/products"
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4">
              {categories.slice(0, 8).map((cat) => (
                <CategoryCard key={cat.id} category={cat} />
              ))}
            </div>
          </section>
        )
      )}

      {/* ── New Arrivals — responsive grid, every card fully visible ── */}
      <section
        className="border-y border-[var(--border-subtle)] bg-white py-9 md:py-12"
        aria-labelledby="home-new-arrivals-title"
      >
        <div className="container-app">
          <ProductGrid
            products={newArrivals}
            isLoading={productsLoading}
            eyebrow="Just dropped"
            title="New Arrivals"
            titleId="home-new-arrivals-title"
            subtitle="The latest inspected items added by verified merchants"
            linkTo="/products?sort=newest"
            linkLabel="View all"
          />
        </div>
      </section>

      {/* ── Best Deals Automatic Carousel (when live seller discounts exist) ── */}
      {(!productsLoading || bestDeals.length > 0) && (
        <section
          className="border-y border-[var(--border)] bg-[var(--surface-tint)] py-9 md:py-12"
          aria-labelledby="home-best-deals-title"
        >
          <div className="container-app">
            <ProductCarousel
              products={bestDeals}
              isLoading={productsLoading}
              eyebrow="Limited time"
              title="Best Deals"
              titleId="home-best-deals-title"
              subtitle="Live seller discounts across the marketplace — ranked by savings"
              linkTo="/products?sort=price_asc"
              linkLabel="Shop all deals"
              autoPlayInterval={2500}
            />
          </div>
        </section>
      )}

      {/* ── Trust / Why NexCart ── */}
      <TrustSection />

      {/* ── Become a Seller CTA (hidden for authenticated buyers) ── */}
      {!isBuyer && <SellerCtaSection />}
    </div>
  )
}

// ── Homepage-local building blocks ──

/**
 * Category card with visual icon.
 */
function CategoryCard({ category }: { category: Category }) {
  return (
    <Link
      to={`/products?category=${category.id}`}
      className="group flex items-center gap-3.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] md:p-4"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--primary-subtle)] text-[var(--primary)] transition-colors duration-200 group-hover:bg-[var(--primary)] group-hover:text-white">
        <CategoryIcon name={category.name} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold tracking-tight text-[var(--fg)] transition-colors duration-200 group-hover:text-[var(--primary)]">
          {formatCategoryLabel(category.name)}
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
