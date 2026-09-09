import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { isAccountInactiveError } from '@/services/api'

/**
 * Shared error handler for seller mutations.
 * Handles TWO_FACTOR_REQUIRED (403) by redirecting to 2FA setup,
 * ACCOUNT_INACTIVE (403) is toasted globally by the axios interceptor,
 * and shows the backend error message for all other errors.
 */
export function useSellerErrorHandler() {
  const navigate = useNavigate()

  const handleError = (err: any, fallbackMessage = 'An error occurred') => {
    const status = err?.response?.status
    const data = err?.response?.data
    const code = data?.code

    if (status === 403 && code === 'TWO_FACTOR_REQUIRED') {
      toast.error('Two-factor authentication is required. Please set up 2FA to continue.')
      navigate('/seller/2fa-setup')
    } else if (isAccountInactiveError(err)) {
      // Already toasted + session invalidated by the api interceptor.
    } else {
      toast.error(data?.message || fallbackMessage)
    }
  }

  return { handleSellerError: handleError }
}
