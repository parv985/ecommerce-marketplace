import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Heart, Trash2, ShoppingCart } from 'lucide-react'
import { wishlistService } from '@/services/wishlist.service'
import { formatPrice } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { toast } from 'react-hot-toast'

export function WishlistPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: wishlist, isLoading } = useQuery({
    queryKey: ['wishlist'],
    queryFn: wishlistService.get,
  })

  const removeItem = useMutation({
    mutationFn: (productId: string) => wishlistService.removeItem(productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] })
      toast.success('Removed from wishlist')
    },
    onError: () => toast.error('Failed to remove item'),
  })

  if (isLoading) {
    return (
      <div className="container-app py-8">
        <h1 className="text-2xl font-bold mb-6">My Wishlist</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="border rounded-lg overflow-hidden">
              <Skeleton className="h-48 w-full rounded-none" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const items = wishlist?.items || []

  if (items.length === 0) {
    return (
      <div className="container-app py-8">
        <EmptyState
          icon={<Heart size={48} strokeWidth={1.5} />}
          title="Your wishlist is empty"
          description="Save items you love for later"
          action={{ label: 'Browse Products', onClick: () => navigate('/products') }}
        />
      </div>
    )
  }

  return (
    <div className="container-app py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Wishlist ({items.length})</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map(item => {
          const product = item.product
          if (!product) return null

          return (
            <div key={item.productId} className="border rounded-lg overflow-hidden group">
              <Link to={`/products/${product.id}`}>
                <div className="aspect-square bg-zinc-100 relative">
                  {product.images?.[0]?.url ? (
                    <img
                      src={product.images[0].url}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-400">
                      <Heart size={48} />
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      removeItem.mutate(product.id)
                    }}
                    className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-md hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={16} className="text-red-500" />
                  </button>
                </div>
              </Link>
              <div className="p-3">
                <Link to={`/products/${product.id}`}>
                  <h3 className="font-medium text-sm truncate hover:underline">{product.name}</h3>
                </Link>
                <p className="text-lg font-bold mt-1">{formatPrice(product.price)}</p>
                <Link to={`/products/${product.id}`}>
                  <Button className="w-full mt-2" size="sm">
                    <ShoppingCart size={14} className="mr-1" /> View Product
                  </Button>
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
