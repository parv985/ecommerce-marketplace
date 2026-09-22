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
  const accountInactive = useAuthStore((s) => s.accountInactive)
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  // Fetch the full wishlist (only when authenticated and active)
  const { data: wishlistData } = useQuery({
    queryKey: ['wishlist'],
    queryFn: () => wishlistService.get(),
    enabled: isAuthenticated && !accountInactive && user?.isActive !== false,
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
      const state = useAuthStore.getState()
      if (!state.isAuthenticated) {
        toast.error('Sign in to add products to wishlist')
        return 'unauthenticated'
      }
      if (state.accountInactive || state.user?.isActive === false) {
        toast.error('Your account is inactive')
        return 'inactive'
      }
      if (wishlistProductIds.has(productId)) {
        await wishlistService.removeItem(productId)
        return 'removed'
      } else {
        await wishlistService.addItem(productId)
        return 'added'
      }
    },
    onSuccess: (result) => {
      // Invalidate so the wishlist query refetches
      if (result === 'added' || result === 'removed') {
        queryClient.invalidateQueries({ queryKey: ['wishlist'] })
      }
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

  return { wishlistData, wishlistProductIds, isWishlisted, toggle, isToggling: toggle.isPending }
}
