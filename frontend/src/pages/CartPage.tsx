import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Minus, Plus, ShoppingBag } from 'lucide-react'
import { useCart } from '@/hooks/useCart'
import { cartService } from '@/services/cart.service'
import { formatPrice } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from 'react-hot-toast'

export function CartPage() {
  const { data: cart, isLoading } = useCart()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const updateQty = useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      cartService.updateItem(productId, quantity),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  })

  const removeItem = useMutation({
    mutationFn: (productId: string) => cartService.removeItem(productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      toast.success('Removed from cart')
    },
  })

  const clearCart = useMutation({
    mutationFn: () => cartService.clear(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      toast.success('Cart cleared')
    },
  })

  if (isLoading) {
    return (
      <div className="container-app py-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-[var(--radius-lg)]" />)}</div>
      </div>
    )
  }

  if (!cart || !cart.items || cart.items.length === 0) {
    return (
      <div className="container-app py-8">
        <EmptyState
          icon={<ShoppingBag size={48} strokeWidth={1.5} />}
          title="Your cart is empty"
          description="Browse our curated catalog to add products from verified sellers"
          action={{ label: 'Browse Products', onClick: () => navigate('/products') }}
        />
      </div>
    )
  }

  return (
    <div className="container-app py-8">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)] mb-6 pb-4 border-b border-[var(--border)]">
        Shopping Cart <span className="text-sm font-normal text-[var(--muted)]">({cart.items.length} {cart.items.length === 1 ? 'item' : 'items'})</span>
      </h1>
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-3.5">
          {cart.items.map(item => {
            const product = item.product
            if (!product) return null
            return (
            <div key={item.productId} className="flex gap-4 p-4 border border-[var(--border)] bg-white rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
              <Link to={`/products/${item.productId}`} className="shrink-0 w-20 h-20 bg-[#f6f5f2] border border-[var(--border-subtle)] rounded-[var(--radius)] overflow-hidden">
                {product.images?.[0]?.url ? (
                  <img src={product.images[0].url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-400 text-xs">No img</div>
                )}
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={`/products/${item.productId}`} className="font-semibold text-sm text-[var(--fg)] hover:text-[var(--primary)] transition-colors line-clamp-1">
                  {product.name}
                </Link>
                <p className="text-sm font-bold text-[var(--fg)] mt-1">{formatPrice(product.price)}</p>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center border border-[var(--border)] rounded-[var(--radius)] bg-white overflow-hidden">
                    <button onClick={() => updateQty.mutate({ productId: item.productId, quantity: Math.max(1, item.quantity - 1) })} className="p-1.5 hover:bg-[var(--accent)] text-[var(--fg)] transition-colors"><Minus size={13} /></button>
                    <span className="px-2.5 text-xs font-semibold min-w-[28px] text-center text-[var(--fg)]">{item.quantity}</span>
                    <button onClick={() => updateQty.mutate({ productId: item.productId, quantity: Math.min(product.stock, item.quantity + 1) })} className="p-1.5 hover:bg-[var(--accent)] text-[var(--fg)] transition-colors"><Plus size={13} /></button>
                  </div>
                  <button onClick={() => removeItem.mutate(item.productId)} className="text-[var(--muted)] hover:text-red-700 transition-colors p-1" title="Remove item">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
            )
          })}
          <div className="pt-2">
            <button onClick={() => clearCart.mutate()} className="text-xs text-[var(--muted)] hover:text-red-700 transition-colors font-medium">
              Clear entire cart
            </button>
          </div>
        </div>

        <div className="border border-[var(--border)] bg-white rounded-[var(--radius-lg)] p-5 h-fit shadow-[var(--shadow-sm)]">
          <h2 className="font-semibold text-base text-[var(--fg)] mb-4 pb-3 border-b border-[var(--border)]">Order Summary</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-[var(--fg-secondary)]">
              <span>Subtotal ({cart.items.length} items)</span>
              <span className="font-medium text-[var(--fg)]">{formatPrice(cart.totalPrice)}</span>
            </div>
            <div className="flex justify-between text-[var(--fg-secondary)]">
              <span>Shipping</span>
              <span className="text-emerald-700 font-medium">Calculated at checkout</span>
            </div>
            <div className="border-t border-[var(--border)] pt-3 flex justify-between font-bold text-base text-[var(--fg)]">
              <span>Estimated Total</span>
              <span>{formatPrice(cart.totalPrice)}</span>
            </div>
          </div>
          <p className="text-[11px] text-[var(--muted)] mt-4">
            Have a coupon? Apply it at checkout.
          </p>
          <Link to="/checkout">
            <Button className="w-full mt-3" size="lg">Proceed to Checkout</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
