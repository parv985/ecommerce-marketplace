import { toast } from 'react-hot-toast'
import { isAccountInactiveError } from '@/services/api'

/**
 * Shared error handler for seller mutations.
 * Handles TWO_FACTOR_REQUIRED (403) by redirecting to 2FA setup,
 * ACCOUNT_INACTIVE (403) is toasted globally by the axios interceptor,
 * and shows the backend error message for all other errors.
 */
export function useSellerErrorHandler() {
  const handleError = (err: any, fallbackMessage = 'An error occurred') => {
    const data = err?.response?.data

    if (isAccountInactiveError(err)) {
      // Already toasted + session invalidated by the api interceptor.
    } else {
      toast.error(data?.message || fallbackMessage)
    }
  }

  return { handleSellerError: handleError }
}
