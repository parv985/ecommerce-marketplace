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

/**
 * Entry point of the server-side Google OAuth flow. The browser navigates
 * here (full page), the backend redirects to Google, and Google sends the
 * user back to the backend callback, which finally lands on the frontend's
 * `/auth/google/callback` route with a session.
 *
 * @param returnTo Optional in-app path the user should return to after
 *   sign-in (carried through the OAuth `state` value by the backend).
 */
export function googleSignInUrl(returnTo?: string): string {
  const base = `${API_BASE_URL}/auth/google`

  if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
    return `${base}?to=${encodeURIComponent(returnTo)}`
  }

  return base
}
