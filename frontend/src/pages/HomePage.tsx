import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Truck, Shield, CreditCard, Headphones, ArrowRight } from 'lucide-react'
import { categoryService } from '@/services/category.service'
import { productService } from '@/services/product.service'
import { Skeleton } from '@/components/ui/Skeleton'
import { ProductCard } from '@/components/ProductCard'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'
import { APP_NAME } from '@/config/brand'

const features = [
  { icon: Truck, title: 'Free Shipping', desc: 'On orders over ₹999 across India' },
  { icon: Shield, title: 'Verified Merchants', desc: 'Every seller thoroughly audited' },
  { icon: CreditCard, title: 'Secure Checkout', desc: 'Protected by Razorpay & 256-bit encryption' },
  { icon: Headphones, title: 'Dedicated Support', desc: '7 days a week resolution desk' },
]

export function HomePage() {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuthStore()

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryService.list,
  })

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', { limit: 8, sort: 'newest' }],
    queryFn: () => productService.browse({ limit: 8, sort: 'newest' }),
  })

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
      {/* Hero — Flat solid deep charcoal, real trust chip, deliberate single arrow CTA */}
      <section className="relative bg-[#191816] text-white border-b border-neutral-800">
        <div className="container-app py-16 md:py-24">
          <div className="max-w-2xl">
            {/* Real trust chip instead of generic AI template star pill */}
            <div className="inline-flex items-center gap-2 border border-neutral-700 bg-neutral-900/90 rounded-[var(--radius-sm)] px-2.5 py-1 mb-6 text-xs text-neutral-300 font-medium tracking-tight">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
              <span>Verified Marketplace · 10,000+ Indian Sellers</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold leading-[1.18] mb-5 tracking-tight text-white">
              Shop authentic goods from<br />
              <span className="text-neutral-300">verified sellers across India</span>
            </h1>

            <p className="text-[#a8a59e] mb-8 text-base md:text-lg leading-relaxed max-w-xl">
              Connect directly with trusted regional artisans, verified distributors, and independent merchants. Quality inspected, transparently priced.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              {/* Single deliberate arrow on the most important CTA */}
              <Link
                to="/products"
                className="inline-flex items-center gap-2 bg-[var(--primary)] text-white px-5 py-2.5 rounded-[var(--radius)] font-medium text-sm hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)] transition-all duration-150 shadow-sm"
              >
                Browse Products
                <ArrowRight size={15} />
              </Link>
              {/* Clean structured secondary CTA without arrow icon */}
              <button
                onClick={handleSellClick}
                className="inline-flex items-center border border-neutral-700 bg-neutral-900/40 text-neutral-200 px-5 py-2.5 rounded-[var(--radius)] font-medium text-sm hover:bg-neutral-800 hover:text-white transition-all duration-150"
              >
                Sell on {APP_NAME}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      {categories && categories.length > 0 && (
        <section className="container-app py-12 md:py-16">
          <div className="flex items-end justify-between mb-8 border-b border-[var(--border)] pb-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[var(--fg)]">Shop by Category</h2>
              <p className="text-sm text-[var(--muted)] mt-0.5">Explore catalog offerings across verified sellers</p>
            </div>
            <Link to="/products" className="text-sm font-medium text-[var(--fg-secondary)] hover:text-[var(--primary)] transition-colors">
              View all
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {categories.slice(0, 8).map((cat) => (
              <Link
                key={cat.id}
                to={`/products?category=${cat.id}`}
                className="group bg-white border border-[var(--border)] rounded-[var(--radius-lg)] p-5 text-center transition-all duration-200 hover:border-neutral-400 hover:shadow-[var(--shadow-sm)]"
              >
                <div className="w-12 h-12 mx-auto bg-[#f6f5f2] rounded-[var(--radius)] flex items-center justify-center mb-3 group-hover:bg-[#191816] group-hover:text-white transition-colors">
                  <span className="text-base font-semibold text-[var(--fg-secondary)] group-hover:text-white transition-colors">
                    {cat.name.charAt(0)}
                  </span>
                </div>
                <h3 className="font-medium text-sm text-[var(--fg)] group-hover:text-[var(--primary)] transition-colors">{cat.name}</h3>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured Products */}
      <section className="container-app py-12 md:py-16">
        <div className="flex items-end justify-between mb-8 border-b border-[var(--border)] pb-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-[var(--fg)]">New Arrivals</h2>
            <p className="text-sm text-[var(--muted)] mt-0.5">The latest inspected items added by verified merchants</p>
          </div>
          <Link to="/products?sort=newest" className="text-sm font-medium text-[var(--fg-secondary)] hover:text-[var(--primary)] transition-colors">
            View all
          </Link>
        </div>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="bg-white border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
                <Skeleton className="aspect-square w-full rounded-none" />
                <div className="p-4 space-y-2.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {products?.items?.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* Features */}
      <section className="bg-white border-y border-[var(--border)]">
        <div className="container-app py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {features.map((f) => (
              <div key={f.title} className="text-left md:text-center">
                <div className="w-10 h-10 md:mx-auto bg-[#f6f5f2] border border-[var(--border)] rounded-[var(--radius)] flex items-center justify-center mb-3 text-[var(--fg)]">
                  <f.icon className="h-5 w-5 text-[var(--fg)]" strokeWidth={1.5} />
                </div>
                <h3 className="font-semibold text-sm text-[var(--fg)] mb-1">{f.title}</h3>
                <p className="text-xs text-[var(--muted)] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
