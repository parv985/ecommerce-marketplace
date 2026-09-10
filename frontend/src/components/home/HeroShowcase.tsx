import { useCallback, useEffect, useRef, useState } from 'react'
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

/** Auto-slide interval in ms. */
const SLIDE_INTERVAL = 2500

/** Slide transition duration in ms (kept in sync with the CSS below). */
const SLIDE_TRANSITION_MS = 600

/** One collage = featured tile + two supporting tiles (the hero layout). */
interface Collage {
  featured: Product
  secondary: Product[]
}

/** Direction of an in-flight slide. */
type SlideDirection = 1 | -1

interface SlideAnimation {
  from: number
  to: number
  dir: SlideDirection
  /** Flips to true one frame in, letting the CSS transform transition run. */
  entered: boolean
}

/**
 * Right-hand showcase of the homepage hero (light theme).
 *
 * Built entirely from LIVE catalog data — the newest products returned by
 * `productService.browse`. The showcase is an auto-playing carousel: every
 * 2.5 seconds the featured product advances by one and the whole collage
 * (featured + two supporting tiles) glides horizontally to the next
 * combination. While loading it renders matching skeletons; if the catalog
 * has fewer than four imaged products it shows them as a static collage,
 * and with none at all it degrades to a branded panel that surfaces the
 * real categories (never fake product imagery).
 */
export function HeroShowcase({ products, categories, isLoading }: HeroShowcaseProps) {
  const withImages = (products ?? []).filter((p) => p.images?.[0]?.url)
  const totalSlides = withImages.length

  /* ── Carousel state ── */
  const [step, setStep] = useState(0)
  const [anim, setAnim] = useState<SlideAnimation | null>(null)

  /* Pause conditions — the timer never runs while any of these hold. */
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [touching, setTouching] = useState(false)
  const [pageVisible, setPageVisible] = useState(true)
  const isPaused = hovered || focused || touching || !pageVisible

  const reducedMotion = usePrefersReducedMotion()

  /* Refs mirror the latest state so timer callbacks never go stale and
     the interval is not torn down on every slide. */
  const stepRef = useRef(step)
  const animRef = useRef(anim)
  const reducedMotionRef = useRef(reducedMotion)

  useEffect(() => {
    stepRef.current = step
    animRef.current = anim
    reducedMotionRef.current = reducedMotion
  }, [step, anim, reducedMotion])

  /* The step is kept in range at read time, so a refetch that shrinks the
     catalog can never leave the carousel pointing past the last slide. */
  const safeStep =
    totalSlides > 0 ? ((step % totalSlides) + totalSlides) % totalSlides : 0

  /** Commit the in-flight slide: land on `to`, drop the animation. */
  const finalizeSlide = useCallback(() => {
    const current = animRef.current
    if (!current) return
    setStep(((current.to % totalSlides) + totalSlides) % totalSlides)
    setAnim(null)
  }, [totalSlides])

  /**
   * Advance to an absolute index with a directional slide. Shared by the
   * auto-timer (dir=1), swipe gestures and the dot indicators. No-ops
   * while a slide is already in flight.
   */
  const goTo = useCallback(
    (index: number) => {
      if (totalSlides <= 3 || animRef.current) return
      const from =
        ((stepRef.current % totalSlides) + totalSlides) % totalSlides
      const to = ((index % totalSlides) + totalSlides) % totalSlides
      if (to === from) return
      if (reducedMotionRef.current) {
        setStep(to)
        return
      }
      setAnim({ from, to, dir: to > from ? 1 : -1, entered: false })
    },
    [totalSlides],
  )

  const advance = useCallback(
    (dir: SlideDirection) => {
      goTo(stepRef.current + dir)
    },
    [goTo],
  )

  /* Auto-play: advance one product every 2.5s while the hero is visible,
     unhovered, untouched and no slide is in flight. */
  useEffect(() => {
    if (totalSlides <= 3 || isPaused) return
    const timer = setInterval(() => advance(1), SLIDE_INTERVAL)
    return () => clearInterval(timer)
  }, [totalSlides, isPaused, advance])

  /* Flip `entered` a frame after a slide starts so the transform
     transition actually animates (instead of jumping). */
  useEffect(() => {
    if (!anim || anim.entered) return
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setAnim((current) =>
          current && !current.entered ? { ...current, entered: true } : current,
        )
      }),
    )
    return () => cancelAnimationFrame(raf)
  }, [anim])

  /* Safety net: finalize the slide even if `transitionend` is swallowed
     (backgrounded tab, reduced-motion flag flipping mid-slide…). */
  useEffect(() => {
    if (!anim || !anim.entered || reducedMotion) return
    const timeout = setTimeout(finalizeSlide, SLIDE_TRANSITION_MS + 150)
    return () => clearTimeout(timeout)
  }, [anim, reducedMotion, finalizeSlide])

  /* Pause auto-play while the tab is hidden. */
  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  /* Resume auto-play shortly after a swipe ends. */
  const touchResumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (touchResumeTimer.current) clearTimeout(touchResumeTimer.current)
    },
    [],
  )

  /* Horizontal swipe support (mobile). */
  const touchStartX = useRef<number | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX
    setTouching(true)
    if (touchResumeTimer.current) clearTimeout(touchResumeTimer.current)
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const delta = touchStartX.current - e.changedTouches[0].clientX
    touchStartX.current = null
    if (Math.abs(delta) > 40) advance(delta > 0 ? 1 : -1)
    touchResumeTimer.current = setTimeout(() => setTouching(false), 1200)
  }
  const onTouchCancel = () => {
    touchStartX.current = null
    touchResumeTimer.current = setTimeout(() => setTouching(false), 1200)
  }

  /* Products shown in the currently-landed slide (drives the status chip). */
  const displayIndex = anim ? anim.to : safeStep
  const displayed = totalSlides > 0 ? withImages[displayIndex % totalSlides] : undefined

  /* Build the featured + supporting pair for any slide index. */
  const collageAt = (index: number): Collage | null => {
    if (totalSlides === 0) return null
    const featured = withImages[((index % totalSlides) + totalSlides) % totalSlides]
    const secondary = [1, 2]
      .map((offset) => withImages[(index + offset) % totalSlides])
      .filter(Boolean)
    return { featured, secondary }
  }

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

  /* ── Live products: auto-playing carousel of featured + supporting tiles ── */
  if (displayed) {
    const dotCount = Math.min(totalSlides, 8)
    const showDots = totalSlides > 3

    /* Collages currently mounted in the sliding track. */
    const trackCollages: { collage: Collage }[] = anim
      ? anim.dir === 1
        ? [{ collage: collageAt(anim.from)! }, { collage: collageAt(anim.to)! }]
        : [{ collage: collageAt(anim.to)! }, { collage: collageAt(anim.from)! }]
      : [{ collage: collageAt(safeStep)! }]

    const trackStyle: React.CSSProperties = anim
      ? {
          width: '200%',
          transform:
            anim.dir === 1
              ? `translateX(${anim.entered ? '-50%' : '0%'})`
              : `translateX(${anim.entered ? '0%' : '-50%'})`,
          transition:
            anim.entered && !reducedMotion
              ? `transform ${SLIDE_TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
              : 'none',
        }
      : { width: '100%', transform: 'translateX(0%)' }

    return (
      <div
        className="relative"
        role="region"
        aria-roledescription="carousel"
        aria-label="Featured products"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
        {/* Floating status chip (reflects the slide being slid into) */}
        <div className="absolute -top-3 right-3 z-20 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[var(--fg)] shadow-[var(--shadow-md)]">
          {displayed.activeDiscount ? (
            <>
              <Flame size={12} className="text-[var(--primary)]" aria-hidden />
              Live discount · {displayed.activeDiscount.discountValue}% off
            </>
          ) : (
            <>
              <BadgeCheck size={12} className="text-[var(--primary)]" aria-hidden />
              Verified seller item
            </>
          )}
        </div>

        <div className="overflow-hidden rounded-[var(--radius-lg)]">
          <div
            className="flex"
            style={trackStyle}
            onTransitionEnd={(e) => {
              if (e.target === e.currentTarget && e.propertyName === 'transform') {
                finalizeSlide()
              }
            }}
          >
            {trackCollages.map(({ collage }, slideIdx) => (
              <div
                key={collage.featured.id}
                className="shrink-0"
                style={{ width: anim ? '50%' : '100%' }}
                aria-hidden={anim ? slideIdx !== (anim.dir === 1 ? 1 : 0) : false}
              >
                <div className="grid gap-3 sm:grid-cols-5 sm:grid-rows-[196px_196px] lg:grid-rows-[216px_216px]">
                  <FeaturedTile product={collage.featured} />
                  {collage.secondary.map((product) => (
                    <SecondaryTile key={product.id} product={product} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Slide indicators — shown only when there are enough products to slide */}
        {showDots && (
          <div className="absolute -bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1">
            {Array.from({ length: dotCount }).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                aria-current={displayIndex % dotCount === i}
                onClick={() => goTo(i)}
                className={`h-1.5 cursor-pointer rounded-full transition-all duration-300 ${
                  i === displayIndex % dotCount
                    ? 'w-5 bg-[var(--primary)]'
                    : 'w-1.5 bg-[var(--border-strong)] hover:bg-[var(--muted)]'
                }`}
              />
            ))}
          </div>
        )}
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
 * The large featured tile — markup and styling identical to the original
 * hero showcase card (badge strip, caption with price/discount, whole
 * tile links to the product).
 */
function FeaturedTile({ product }: { product: Product }) {
  return (
    <Link
      to={`/products/${product.id}`}
      className="group relative flex h-[320px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)] transition-shadow duration-200 hover:shadow-[var(--shadow-md)] sm:col-span-3 sm:row-span-2 sm:h-full"
    >
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[var(--surface-warm)]">
        <ShowcaseImage product={product} />
        <span className="absolute left-3 top-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white/95 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--primary)] shadow-sm backdrop-blur-sm">
          New arrival
        </span>
      </div>

      {/* Caption in a clean white strip — text never sits on the photo */}
      <div className="flex items-end justify-between gap-4 border-t border-[var(--border-subtle)] bg-white px-4 py-3">
        <p className="min-w-0 truncate text-sm font-semibold tracking-tight text-[var(--fg)]">
          {product.name}
        </p>
        <div className="flex shrink-0 items-baseline gap-2">
          <span className="text-[15px] font-bold text-[var(--fg)]">
            {formatPrice(product.activeDiscount?.discountedPrice ?? product.price)}
          </span>
          {(product.activeDiscount || (product.compareAtPrice ?? 0) > product.price) && (
            <span className="text-xs text-[var(--muted)] line-through">
              {formatPrice(product.activeDiscount ? product.price : product.compareAtPrice)}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

/**
 * Supporting tile — same design as before: discount badge over the photo,
 * compact caption strip, links to the product. Tablet/desktop only so the
 * mobile hero stays tight.
 */
function SecondaryTile({ product }: { product: Product }) {
  return (
    <Link
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
  )
}

/**
 * Image with loading/failure states. While the photo loads, the warm
 * surface beneath shows; on error (or a missing URL) a tidy placeholder
 * replaces the photo — never a broken-image glyph. Images inside the
 * carousel track load eagerly (they are about to slide into view).
 */
function ShowcaseImage({ product }: { product: Product }) {
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
      loading="eager"
      onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
    />
  )
}

/** Tracks the user's reduced-motion preference (system level). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduced
}
