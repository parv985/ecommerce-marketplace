import { HomeProductCard } from './HomeProductCard'
import { SectionHeader } from './SectionHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import type { Product } from '@/types/api'

interface ProductGridProps {
  products: Product[]
  isLoading?: boolean
  title: string
  subtitle?: string
  eyebrow?: string
  linkTo?: string
  linkLabel?: string
  titleId?: string
}

/**
 * Responsive product grid used by the homepage New Arrivals section.
 *
 * Unlike the carousel, every product is laid out in a true CSS grid, so
 * each card is fully visible and aligned inside the container at every
 * breakpoint — nothing is clipped, overlapped or scrolled off-screen.
 * Grid items stretch to equal heights and the card body pins its price
 * block to the bottom (`mt-auto`), keeping rows visually consistent.
 * Card features (image, wishlist button, discount badge, price/discount
 * info) are unchanged — they come from the shared `HomeProductCard`.
 */
const GRID_CLASSES =
  'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

export function ProductGrid({
  products,
  isLoading = false,
  title,
  subtitle,
  eyebrow = 'Collection',
  linkTo,
  linkLabel,
  titleId,
}: ProductGridProps) {
  const totalItems = products?.length ?? 0

  return (
    <div>
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        titleId={titleId}
        subtitle={subtitle}
        linkTo={linkTo}
        linkLabel={linkLabel}
      />

      {isLoading ? (
        <div className={GRID_CLASSES}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={`product-grid-skeleton-${i}`}
              className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-white"
            >
              <Skeleton className="aspect-square w-full rounded-none" />
              <div className="space-y-2.5 p-3.5 md:p-4">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : totalItems === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--bg)] px-5 py-10 text-center text-sm text-[var(--muted)]">
          No products available in this category yet.
        </p>
      ) : (
        <div className={GRID_CLASSES}>
          {products.map((product, idx) => (
            <HomeProductCard
              key={product.id}
              product={product}
              /* Eager-load the first viewport row, lazy-load the rest. */
              priority={idx < 4}
            />
          ))}
        </div>
      )}
    </div>
  )
}
