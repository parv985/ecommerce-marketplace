import axios from 'axios'
import { toast } from 'react-hot-toast'
import { useLoadingStore } from '../stores/loadingStore'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

let accessToken: string | null = null
let refreshPromise: Promise<string> | null = null

// Restore token from localStorage / sessionStorage
try {
  const stored = localStorage.getItem('access_token') || sessionStorage.getItem('access_token')
  if (stored) accessToken = stored
} catch { /* ignore */ }

export function setAccessToken(token: string | null) {
  accessToken = token
  try {
    if (token) {
      localStorage.setItem('access_token', token)
      sessionStorage.setItem('access_token', token)
    } else {
      localStorage.removeItem('access_token')
      sessionStorage.removeItem('access_token')
    }
  } catch { /* ignore */ }
}

export function getAccessToken() {
  return accessToken
}

/*
 * ---------------------------------------------------------------------------
 * Account-inactive handling
 * ---------------------------------------------------------------------------
 * The backend rejects every authenticated request of a deactivated account
 * with 403 { code: "ACCOUNT_INACTIVE" }. When that happens we show the
 * "Your account is inactive" toast and hand over to the auth store (which
 * marks the session inactive so UI guards kick in without a page refresh).
 *
 * The handler is registered by the auth store at startup to avoid a circular
 * import (the store imports this module for token access).
 */
type AccountInactiveHandler = () => void
let accountInactiveHandler: AccountInactiveHandler | null = null

export function setAccountInactiveHandler(handler: AccountInactiveHandler) {
  accountInactiveHandler = handler
}

type SessionExpiredHandler = () => void
let sessionExpiredHandler: SessionExpiredHandler | null = null

export function setSessionExpiredHandler(handler: SessionExpiredHandler) {
  sessionExpiredHandler = handler
}

export function isAccountInactiveError(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    error.response?.status === 403 &&
    (error.response.data as { code?: string } | undefined)?.code === 'ACCOUNT_INACTIVE'
  )
}

// Avoid a burst of identical toasts when several in-flight queries fail at
// once right after a deactivation.
let lastInactiveToastAt = 0
const INACTIVE_TOAST_THROTTLE_MS = 4000

// Auth pages render their own error message — don't double-toast there.
function isAuthEndpoint(url?: string): boolean {
  return (
    !!url?.includes('/auth/login') ||
    !!url?.includes('/auth/2fa/verify') ||
    !!url?.includes('/auth/google')
  )
}

api.interceptors.request.use(
  (config) => {
    useLoadingStore.getState().startRequest()
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error) => {
    useLoadingStore.getState().endRequest()
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response) => {
    useLoadingStore.getState().endRequest()
    return response
  },
  async (error) => {
    useLoadingStore.getState().endRequest()
    const originalRequest = error.config

    // ── Deactivated account: enforce immediately, no refresh attempt ──
    if (isAccountInactiveError(error)) {
      accountInactiveHandler?.()
      if (!isAuthEndpoint(originalRequest?.url) && Date.now() - lastInactiveToastAt > INACTIVE_TOAST_THROTTLE_MS) {
        lastInactiveToastAt = Date.now()
        toast.error('Your account is inactive')
      }
      return Promise.reject(error)
    }

    // Skip token refresh for auth endpoints (login/register/2fa/refresh) —
    // credentials failure or refresh failures must not trigger recursive refresh.
    const skipRefresh =
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/register') ||
      originalRequest?.url?.includes('/auth/google') ||
      originalRequest?.url?.includes('/auth/2fa/verify') ||
      originalRequest?.url?.includes('/auth/refresh')

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !skipRefresh) {
      originalRequest._retry = true

      // If there is no stored access token anywhere, the user was never authenticated.
      const storedToken = localStorage.getItem('access_token') || sessionStorage.getItem('access_token')
      if (!accessToken && !storedToken) {
        return Promise.reject(error)
      }

      // If a refresh is already in-flight from another concurrent 401, wait for the same promise
      if (!refreshPromise) {
        refreshPromise = (async () => {
          try {
            const { data } = await axios.post(
              `${api.defaults.baseURL}/auth/refresh`,
              {},
              { withCredentials: true }
            )
            const newToken = data.data?.accessToken || data.accessToken
            if (!newToken) {
              throw new Error('No token in refresh response')
            }
            setAccessToken(newToken)
            return newToken
          } catch (refreshErr: any) {
            const status = refreshErr.response?.status

            if (isAccountInactiveError(refreshErr)) {
              setAccessToken(null)
              accountInactiveHandler?.()
              if (Date.now() - lastInactiveToastAt > INACTIVE_TOAST_THROTTLE_MS) {
                lastInactiveToastAt = Date.now()
                toast.error('Your account is inactive')
              }
            } else if (status === 401) {
              // Refresh token is genuinely invalid, expired, or revoked.
              // Clear stored credentials and inform auth store.
              setAccessToken(null)
              try {
                sessionStorage.removeItem('user')
                localStorage.removeItem('user')
              } catch { /* ignore */ }

              sessionExpiredHandler?.()

              // Only redirect if not already on an auth page and route requires auth
              const path = window.location.pathname
              if (!path.startsWith('/login') && !path.startsWith('/register') && !path.startsWith('/forgot-password') && !path.startsWith('/reset-password')) {
                // If on a protected route (seller, admin, buyer-only checkout/account), redirect
                if (path.startsWith('/seller') || path.startsWith('/admin') || path.startsWith('/checkout') || path.startsWith('/account') || path.startsWith('/orders') || path.startsWith('/returns')) {
                  window.location.href = '/login'
                }
              }
            }
            // If the failure is a network error, 502/503/504 (server restarting on Render),
            // or 429, DO NOT log the user out! Keep tokens intact so they can retry.
            throw refreshErr
          } finally {
            refreshPromise = null
          }
        })()
      }

      try {
        const token = await refreshPromise
        originalRequest.headers.Authorization = `Bearer ${token}`
        return api(originalRequest)
      } catch (retryErr) {
        return Promise.reject(retryErr)
      }
    }
    return Promise.reject(error)
  }
)

export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || error.message || 'An error occurred'
  }
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred'
}

export default api
