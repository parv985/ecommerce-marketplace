import axios from 'axios'
import { toast } from 'react-hot-toast'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

let accessToken: string | null = null
let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (err: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error)
    else prom.resolve(token!)
  })
  failedQueue = []
}

// Restore token from sessionStorage
try {
  const stored = sessionStorage.getItem('access_token')
  if (stored) accessToken = stored
} catch { /* ignore */ }

export function setAccessToken(token: string | null) {
  accessToken = token
  if (token) sessionStorage.setItem('access_token', token)
  else sessionStorage.removeItem('access_token')
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

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
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

    // Skip token refresh for auth endpoints (login/register) — a 401 there
    // means invalid credentials, not an expired token.
    const skipRefresh = originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/register') ||
      originalRequest.url?.includes('/auth/google')

    if (error.response?.status === 401 && !originalRequest._retry && !skipRefresh) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const { data } = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          {},
          { withCredentials: true }
        )
        const newToken = data.data?.accessToken || data.accessToken
        if (newToken) {
          setAccessToken(newToken)
          processQueue(null, newToken)
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return api(originalRequest)
        }
        throw new Error('No token in refresh response')
      } catch (refreshError) {
        processQueue(refreshError, null)
        setAccessToken(null)

        if (isAccountInactiveError(refreshError)) {
          // The account was deactivated (e.g. token expired after a Super
          // Admin deactivation). Mark the session inactive — the UI guards
          // redirect to login reactively and the toast stays visible.
          accountInactiveHandler?.()
          if (Date.now() - lastInactiveToastAt > INACTIVE_TOAST_THROTTLE_MS) {
            lastInactiveToastAt = Date.now()
            toast.error('Your account is inactive')
          }
          return Promise.reject(refreshError)
        }

        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
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
