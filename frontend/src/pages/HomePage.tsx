import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Truck, Shield, CreditCard, Headphones } from 'lucide-react'
import { categoryService } from '@/services/category.service'
import { productService } from '@/services/product.service'
import { formatPrice } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import { ProductCard } from '@/components/ProductCard'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'

const features = [
  { icon: Truck, title: 'Free Shipping', desc: 'On orders over ₹999' },
  { icon: Shield, title: 'Secure Payment', desc: 'Razorpay protected' },
  { icon: CreditCard, title: 'Easy Returns', desc: '7-day return policy' },
  { icon: Headphones, title: '24/7 Support', desc: 'We are here to help' },
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
      {/* Hero */}
      <section className="bg-zinc-900 text-white">
        <div className="container-app py-16 md:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-zinc-400 mb-3 uppercase tracking-wider">Welcome to ECOM</p>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
              Shop from the best sellers across India
            </h1>
            <p className="text-zinc-400 mb-8 text-lg">
              Discover thousands of products from verified sellers. Quality guaranteed.
            </p>
            <div className="flex gap-3">
              <Link to="/products">
                <button className="bg-white text-zinc-900 px-6 py-3 rounded-md font-medium hover:bg-zinc-100 transition-colors">
                  Browse Products
                </button>
              </Link>
              <button
                onClick={handleSellClick}
                className="border border-zinc-600 px-6 py-3 rounded-md font-medium hover:bg-zinc-800 transition-colors"
              >
                Sell on ECOM
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      {categories && categories.length > 0 && (
        <section className="container-app py-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Shop by Category</h2>
            <Link to="/products" className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">View all</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {categories.slice(0, 8).map((cat) => (
              <Link
                key={cat.id}
                to={`/products?category=${cat.id}`}
                className="group border rounded-lg p-6 text-center hover:border-[var(--primary)] transition-colors"
              >
                <div className="w-12 h-12 mx-auto bg-zinc-100 rounded-full flex items-center justify-center mb-3 group-hover:bg-zinc-200 transition-colors">
                  <span className="text-lg font-bold text-zinc-600">{cat.name.charAt(0)}</span>
                </div>
                <h3 className="font-medium text-sm">{cat.name}</h3>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured Products */}
      <section className="container-app py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">New Arrivals</h2>
          <Link to="/products?sort=newest" className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">View all</Link>
        </div>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="border rounded-lg overflow-hidden">
                <Skeleton className="h-48 w-full rounded-none" />
                <div className="p-4 space-y-2">
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
      <section className="bg-zinc-50 border-y">
        <div className="container-app py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {features.map((f) => (
              <div key={f.title} className="text-center">
                <f.icon className="mx-auto h-8 w-8 text-[var(--muted)] mb-3" strokeWidth={1.5} />
                <h3 className="font-semibold text-sm mb-1">{f.title}</h3>
                <p className="text-xs text-[var(--muted)]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
