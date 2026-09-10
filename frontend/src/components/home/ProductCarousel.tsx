import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { HomeProductCard } from './HomeProductCard'
import { SectionHeader } from './SectionHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import type { Product } from '@/types/api'

interface ProductCarouselProps {
  products: Product[]
  isLoading?: boolean
  title: string
  subtitle?: string
  eyebrow?: string
  linkTo?: string
  linkLabel?: string
  titleId?: string
  autoPlayInterval?: number // default 2500ms (every 2-3 seconds)
  priorityFirst?: boolean
}

export function ProductCarousel({
  products,
  isLoading = false,
  title,
  subtitle,
  eyebrow = 'Collection',
  linkTo,
  linkLabel,
  titleId,
  autoPlayInterval = 2500,
  priorityFirst = false,
}: ProductCarouselProps) {
  const [rawIndex, setRawIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const [itemsPerView, setItemsPerView] = useState(4)
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)

  // Update visible items count based on viewport width
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      if (width < 640) {
        setItemsPerView(1)
      } else if (width < 1024) {
        setItemsPerView(2)
      } else {
        setItemsPerView(4)
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const totalItems = products?.length || 0
  const maxIndex = Math.max(0, totalItems - itemsPerView)
  const currentIndex = Math.min(rawIndex, maxIndex)

  // Slide to next item
  const nextSlide = useCallback(() => {
    if (totalItems <= itemsPerView) return
    setRawIndex((prev) => {
      const current = Math.min(prev, maxIndex)
      return current >= maxIndex ? 0 : current + 1
    })
  }, [totalItems, itemsPerView, maxIndex])

  // Slide to previous item
  const prevSlide = useCallback(() => {
    if (totalItems <= itemsPerView) return
    setRawIndex((prev) => {
      const current = Math.min(prev, maxIndex)
      return current <= 0 ? maxIndex : current - 1
    })
  }, [totalItems, itemsPerView, maxIndex])

  // Automatic carousel rotation every 2–3 seconds (default 2500ms)
  useEffect(() => {
    if (isLoading || isHovered || totalItems <= itemsPerView) return

    const timer = setInterval(() => {
      nextSlide()
    }, autoPlayInterval)

    return () => clearInterval(timer)
  }, [isLoading, isHovered, totalItems, itemsPerView, autoPlayInterval, nextSlide])

  // Touch gesture handlers for mobile swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX
  }

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return
    const diff = touchStartX.current - touchEndX.current
    if (diff > 50) {
      nextSlide()
    } else if (diff < -50) {
      prevSlide()
    }
    touchStartX.current = null
    touchEndX.current = null
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
    >
      {/* Header with Title and manual navigation buttons */}
      <div className="flex items-end justify-between mb-4">
        <SectionHeader
          eyebrow={eyebrow}
          title={title}
          titleId={titleId}
          subtitle={subtitle}
          linkTo={linkTo}
          linkLabel={linkLabel}
        />

        {/* Carousel Navigation Arrows */}
        {totalItems > itemsPerView && !isLoading && (
          <div className="hidden sm:flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={prevSlide}
              aria-label="Previous products"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--fg)] shadow-xs transition-all hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-[var(--primary-subtle)] active:scale-95 cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={nextSlide}
              aria-label="Next products"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--fg)] shadow-xs transition-all hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-[var(--primary-subtle)] active:scale-95 cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={`carousel-skeleton-${i}`}
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
        /* Carousel Track Container */
        <div
          className="relative overflow-hidden py-1"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{
              transform: `translateX(-${currentIndex * (100 / itemsPerView)}%)`,
            }}
          >
            {products.map((product, idx) => (
              <div
                key={product.id}
                style={{
                  flex: `0 0 ${100 / itemsPerView}%`,
                  maxWidth: `${100 / itemsPerView}%`,
                }}
                className="px-2"
              >
                <HomeProductCard
                  product={product}
                  priority={priorityFirst && idx < itemsPerView}
                />
              </div>
            ))}
          </div>

          {/* Mobile Overlay Arrows */}
          {totalItems > itemsPerView && (
            <div className="sm:hidden flex justify-between absolute inset-y-0 left-0 right-0 pointer-events-none items-center px-1">
              <button
                type="button"
                onClick={prevSlide}
                aria-label="Previous product"
                className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/90 border border-[var(--border)] text-[var(--fg)] shadow-sm backdrop-blur-sm active:scale-95"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={nextSlide}
                aria-label="Next product"
                className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/90 border border-[var(--border)] text-[var(--fg)] shadow-sm backdrop-blur-sm active:scale-95"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Dot Indicators */}
      {totalItems > itemsPerView && !isLoading && (
        <div className="mt-5 flex items-center justify-center gap-1.5">
          {Array.from({ length: maxIndex + 1 }).map((_, i) => (
            <button
              key={`dot-${i}`}
              type="button"
              aria-label={`Go to slide position ${i + 1}`}
              onClick={() => setRawIndex(i)}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                i === currentIndex
                  ? 'w-6 bg-[var(--primary)]'
                  : 'w-1.5 bg-[var(--border-strong)] hover:bg-[var(--muted)]'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
