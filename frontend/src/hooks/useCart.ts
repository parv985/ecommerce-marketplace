import { useQuery } from '@tanstack/react-query'
import { cartService } from '@/services/cart.service'
import { useAuthStore } from '@/stores/authStore'

export function useCart() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: ['cart'],
    queryFn: cartService.get,
    enabled: isAuthenticated,
    staleTime: 30_000,
  })
}
