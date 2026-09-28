/**
 * API base URL used by the browser.
 *
 * - Local dev: leave `VITE_API_URL` unset (or `/api/v1`) so requests go to
 *   the Vite dev server, which proxies `/api/*` to the backend on :5000.
 * - Deployed (Render/Netlify/…): set `VITE_API_URL` to the absolute backend
 *   URL, e.g. `https://nexcart-api.onrender.com/api/v1`, because a static
 *   host has no proxy to forward `/api/v1` to the API.
 *
 * Only public values may live in `VITE_*` variables — they are inlined into
 * the client bundle. The Google client secret, JWT secrets and SMTP
 * credentials stay in the backend environment only.
 */
export const API_BASE_URL = (
  import.meta.env.VITE_API_URL || '/api/v1'
).replace(/\/+$/, '')

export interface GoogleSignInOptions {
  to?: string
  intent?: 'signin' | 'signup'
  role?: 'BUYER' | 'SELLER'
}

/**
 * Entry point of the server-side Google OAuth flow. The browser navigates
 * here (full page), the backend redirects to Google, and Google sends the
 * user back to the backend callback.
 *
 * @param returnToOrOptions Optional in-app path or configuration options
 *   including intent ('signin' | 'signup') and role ('BUYER' | 'SELLER').
 */
export function googleSignInUrl(
  returnToOrOptions?: string | GoogleSignInOptions,
  intent?: 'signin' | 'signup',
  role?: 'BUYER' | 'SELLER',
): string {
  const base = `${API_BASE_URL}/auth/google`
  const params = new URLSearchParams()

  let returnTo: string | undefined
  let effectiveIntent: 'signin' | 'signup' | undefined = intent
  let effectiveRole: 'BUYER' | 'SELLER' | undefined = role

  if (typeof returnToOrOptions === 'object' && returnToOrOptions !== null) {
    returnTo = returnToOrOptions.to
    if (returnToOrOptions.intent) effectiveIntent = returnToOrOptions.intent
    if (returnToOrOptions.role) effectiveRole = returnToOrOptions.role
  } else if (typeof returnToOrOptions === 'string') {
    returnTo = returnToOrOptions
  }

  if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
    params.set('to', returnTo)
  }

  if (effectiveIntent) {
    params.set('intent', effectiveIntent)
  }

  if (effectiveRole) {
    params.set('role', effectiveRole)
  }

  const query = params.toString()
  return query ? `${base}?${query}` : base
}
