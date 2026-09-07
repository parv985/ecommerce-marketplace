import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Minus, Plus, ShoppingBag } from 'lucide-react'
import { useCart } from '@/hooks/useCart'
import { cartService } from '@/services/cart.service'
import { formatPrice } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from 'react-hot-toast'

export function CartPage() {
  const { data: cart, isLoading } = useCart()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [couponCode, setCouponCode] = useState('')

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
        <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
      </div>
    )
  }

  if (!cart || !cart.items || cart.items.length === 0) {
    return (
      <div className="container-app py-8">
        <EmptyState
          icon={<ShoppingBag size={48} strokeWidth={1.5} />}
          title="Your cart is empty"
          description="Start shopping to add items to your cart"
          action={{ label: 'Browse Products', onClick: () => navigate('/products') }}
        />
      </div>
    )
  }

  return (
    <div className="container-app py-8">
      <h1 className="text-2xl font-bold mb-6">Shopping Cart ({cart.items.length} items)</h1>
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {cart.items.map(item => item.product && (
            <div key={item.productId} className="flex gap-4 p-4 border rounded-lg">
              <Link to={`/products/${item.productId}`} className="shrink-0 w-20 h-20 bg-zinc-100 rounded overflow-hidden">
                {item.product.images?.[0]?.url ? (
                  <img src={item.product.images[0].url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">No img</div>
                )}
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={`/products/${item.productId}`} className="font-medium text-sm hover:underline line-clamp-1">
                  {item.product.name}
                </Link>
                <p className="text-sm font-bold mt-1">{formatPrice(item.product?.price ?? 0)}</p>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center border rounded">
                    <button onClick={() => updateQty.mutate({ productId: item.productId, quantity: Math.max(1, item.quantity - 1) })} className="p-1 hover:bg-zinc-50"><Minus size={14} /></button>
                    <span className="px-2 text-sm min-w-[30px] text-center">{item.quantity}</span>
                    <button onClick={() => updateQty.mutate({ productId: item.productId, quantity: Math.min(item.product.stock, item.quantity + 1) })} className="p-1 hover:bg-zinc-50"><Plus size={14} /></button>
                  </div>
                  <button onClick={() => removeItem.mutate(item.productId)} className="text-[var(--muted)] hover:text-[var(--destructive)]">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button onClick={() => clearCart.mutate()} className="text-sm text-[var(--destructive)] hover:underline">
            Clear cart
          </button>
        </div>

        <div className="border rounded-lg p-6 h-fit">
          <h2 className="font-semibold mb-4">Order Summary</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-[var(--muted)]">Subtotal ({cart.items.length} items)</span><span>{formatPrice(cart.totalPrice)}</span></div>
            <div className="border-t pt-3 flex justify-between font-semibold">
              <span>Total</span><span>{formatPrice(cart.totalPrice)}</span>
            </div>
          </div>
          <div className="mt-4">
            <Input
              placeholder="Enter coupon code"
              value={couponCode}
              onChange={e => setCouponCode(e.target.value)}
            />
          </div>
          <Link to="/checkout">
            <Button className="w-full mt-4">Proceed to Checkout</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
