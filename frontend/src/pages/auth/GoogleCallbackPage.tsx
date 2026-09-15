import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Toaster, toast } from 'react-hot-toast'

import { setAccessToken } from '@/services/api'
import { authApi } from '@/services/auth.service'
import { useAuthStore } from '@/stores/authStore'
import { Card, CardContent } from '@/components/ui/Card'
import { APP_NAME } from '@/config/brand'

/**
 * Landing page of the Google OAuth flow.
 *
 * The backend callback (`GET /api/v1/auth/google/callback`) exchanges the
 * authorization code with Google, creates/updates the user, issues the same
 * access + refresh tokens as email/password login and redirects the browser
 * here with `?access_token=…`. This page turns that into a real frontend
 * session (token + profile in the auth store) and routes the user to the
 * dashboard that matches their role.
 *
 * Without this route the SPA falls through to its catch-all 404, which is
 * exactly the "Page not found" screen users used to see after Google
 * account selection.
 */

const safeReturnPath = (value: string | null): string | null => {
  if (!value) return null
  if (!value.startsWith('/')) return null
  if (value.startsWith('//')) return null
  return value
}

/** Same routing rules as the email/password login page. */
const postLoginPath = (role: string, returnTo?: string | null): string => {
  const target = safeReturnPath(returnTo ?? null)
  if (target) return target
  if (role === 'SUPER_ADMIN') return '/admin/dashboard'
  if (role === 'SELLER') return '/seller/dashboard'
  return '/'
}

export default function GoogleCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)
  const [failed, setFailed] = useState(false)

  /*
   * React.StrictMode mounts effects twice in development, and a second
   * run would replay the (single-use) handshake — so guard it.
   */
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const accessToken = searchParams.get('access_token')
    const error = searchParams.get('error')
    const message = searchParams.get('message')
    const returnTo = searchParams.get('to')

    /*
     * Drop the query string straight away: the access token must not stay
     * in the address bar, browser history or a shared screenshot.
     */
    window.history.replaceState(
      {},
      '',
      window.location.pathname,
    )

    const backToLogin = (notice?: string) => {
      setFailed(true)
      if (notice) toast.error(notice)
      // Let the toast render for a moment before navigating away.
      window.setTimeout(() => {
        navigate('/login', { replace: true })
      }, 1800)
    }

    if (error) {
      backToLogin(message || 'Google sign-in failed. Please try again.')
      return
    }

    if (!accessToken) {
      backToLogin(
        'Google sign-in did not return a session. Please try again.',
      )
      return
    }

    const completeSignIn = async () => {
      try {
        // Attach the token first so the profile request is authorized.
        setAccessToken(accessToken)

        const user = await authApi.getMe()

        setAuth(user, accessToken)
        toast.success(`Welcome, ${user.name}!`)
        navigate(postLoginPath(user.role, returnTo), {
          replace: true,
        })
      } catch {
        setAccessToken(null)
        backToLogin(
          'Google sign-in succeeded, but your session could not be started. Please try again.',
        )
      }
    }

    void completeSignIn()
  }, [navigate, searchParams, setAuth])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--surface-warm)] px-4">
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />

      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          {failed ? (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600 text-lg font-bold">
                !
              </div>
              <h1 className="text-lg font-semibold">
                Sign-in not completed
              </h1>
              <p className="text-sm text-[var(--muted)]">
                Taking you back to the sign-in page…
              </p>
            </>
          ) : (
            <>
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
              <h1 className="text-lg font-semibold">
                Finishing your {APP_NAME} sign-in
              </h1>
              <p className="text-sm text-[var(--muted)]">
                Verifying your Google account and preparing your session…
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
