import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { wishlistService } from '@/services/wishlist.service'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'
import { isAccountInactiveError } from '@/services/api'

/**
 * Shared hook that fetches the current buyer's wishlist and provides
 * helpers to check/add/remove items. The wishlist is cached via
 * TanStack Query so every ProductCard and ProductDetailPage reads
 * from the same source of truth.
 */
export function useWishlist() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const queryClient = useQueryClient()

  // Fetch the full wishlist (only when authenticated)
  const { data: wishlistData } = useQuery({
    queryKey: ['wishlist'],
    queryFn: () => wishlistService.get(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes — don't refetch on every navigation
  })

  // Set of product IDs currently in the wishlist
  const wishlistProductIds = new Set(
    wishlistData?.items?.map((item) => item.productId) ?? []
  )

  /** Check if a specific product is in the wishlist */
  const isWishlisted = (productId: string): boolean =>
    wishlistProductIds.has(productId)

  /** Toggle a product in/out of the wishlist */
  const toggle = useMutation({
    mutationFn: async (productId: string) => {
      if (wishlistProductIds.has(productId)) {
        await wishlistService.removeItem(productId)
        return 'removed'
      } else {
        await wishlistService.addItem(productId)
        return 'added'
      }
    },
    onSuccess: (_result, _productId) => {
      // Invalidate so the wishlist query refetches
      queryClient.invalidateQueries({ queryKey: ['wishlist'] })
    },
    onError: (err: any) => {
      // Inactive-account errors are toasted + handled by the api interceptor.
      if (isAccountInactiveError(err)) return
      if (err?.response?.status === 409) {
        queryClient.invalidateQueries({ queryKey: ['wishlist'] })
      } else {
        toast.error(err?.response?.data?.message || 'Failed to update wishlist')
      }
    },
  })

  return { wishlistProductIds, isWishlisted, toggle, isToggling: toggle.isPending }
}
