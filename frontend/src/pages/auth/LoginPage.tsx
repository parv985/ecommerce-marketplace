import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/services/auth.service'
import { extractErrorMessage } from '@/services/api'
import { googleSignInUrl } from '@/config/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Shield, Copy, CheckCircle2 } from 'lucide-react'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

export function LoginPage() {
  const { setAuth, accountInactive } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(false)
  const [show2FA, setShow2FA] = useState(false)
  const [twoFactorSetup, setTwoFactorSetup] = useState<{ secret: string; otpauthUrl: string; recoveryCodes: string[] } | null>(null)
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [loginToken, setLoginToken] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/'

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const getPostLoginRedirect = (role: string, returnPath?: string) => {
    if (role === 'SUPER_ADMIN') return '/admin/dashboard'
    if (role === 'SELLER') {
      if (
        !returnPath ||
        returnPath === '/seller/pending' ||
        returnPath === '/seller/register' ||
        returnPath === '/login' ||
        returnPath === '/'
      ) {
        return '/seller/dashboard'
      }
      return returnPath
    }
    return returnPath || '/'
  }

  const onSubmit = async (data: LoginForm) => {
    try {
      setLoading(true)
      const res = await authApi.login(data)
      if (res.data.twoFactorRequired && res.data.loginToken) {
        setLoginToken(res.data.loginToken)
        if (res.data.twoFactorSetupRequired && res.data.twoFactorSetup) {
          setTwoFactorSetup(res.data.twoFactorSetup)
        } else {
          setTwoFactorSetup(null)
        }
        setShow2FA(true)
        return
      }
      if (res.data.accessToken) {
        setAuth(res.data.user, res.data.accessToken)
        toast.success('Welcome back!')
        navigate(getPostLoginRedirect(res.data.user.role, from), { replace: true })
      }
    } catch (err: any) {
      const status = err?.response?.status
      const code = err?.response?.data?.code
      const message = err?.response?.data?.message

      if (err?.response?.data?.code === 'TWO_FACTOR_REQUIRED') {
        setLoginToken(err.response.data.loginToken || '')
        if (err.response.data.twoFactorSetup) {
          setTwoFactorSetup(err.response.data.twoFactorSetup)
        }
        setShow2FA(true)
      } else if (status === 403 && (code === 'SELLER_PENDING_APPROVAL' || message?.toLowerCase().includes('approval'))) {
        toast.error('Waiting for admin approval.')
      } else {
        toast.error(extractErrorMessage(err))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!twoFactorCode.trim()) return
    try {
      setLoading(true)
      const res = await authApi.verify2FA(loginToken, twoFactorCode.trim())
      setAuth(res.data.user, res.data.accessToken)
      toast.success('Two-factor authentication successful!')
      navigate(getPostLoginRedirect(res.data.user.role, from), { replace: true })
    } catch (err) {
      toast.error(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = () => {
    // Full-page navigation to the backend, which redirects to Google's
    // consent screen and back to /auth/google/callback with a session.
    window.location.href = googleSignInUrl(from)
  }

  /*
   * Distinct key: this view replaces the login view in the same tree, and
   * React would otherwise reuse the login form's DOM node for the
   * verification-code input, flipping it from uncontrolled (register) to
   * controlled (value={twoFactorCode}) and logging
   * "A component is changing an uncontrolled input to be controlled".
   */
  if (show2FA) {
    if (twoFactorSetup) {
      return (
        <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 py-8">
          <Card className="w-full max-w-lg">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mb-2 border border-amber-200">
                <Shield size={24} className="text-amber-700" />
              </div>
              <CardTitle className="text-2xl">Set Up Two-Factor Authentication</CardTitle>
              <p className="text-sm text-[var(--muted)]">
                Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.) and enter the 6-digit verification code to complete login.
              </p>
            </CardHeader>
            <CardContent>
              <form key="two-factor-setup-form" onSubmit={handleTwoFactor} className="space-y-4">
                <div className="flex flex-col items-center justify-center">
                  <div className="bg-white p-3 border border-[var(--border)] rounded-[var(--radius-lg)] shadow-sm">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(twoFactorSetup.otpauthUrl)}`}
                      alt="2FA QR Code"
                      className="w-44 h-44 object-contain"
                    />
                  </div>
                  <p className="text-xs text-[var(--muted)] mt-2">Scan with Google Authenticator, Microsoft Authenticator, or Authy</p>
                </div>

                <div>
                  <p className="text-xs font-medium text-[var(--fg-secondary)] mb-1">Or enter this secret key manually:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-zinc-100 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-mono break-all select-all text-zinc-800">
                      {twoFactorSetup.secret}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(twoFactorSetup.secret)
                        setCopiedSecret(true)
                        toast.success('Secret key copied!')
                        setTimeout(() => setCopiedSecret(false), 2000)
                      }}
                      className="p-1.5 hover:bg-zinc-100 rounded-[var(--radius-sm)] text-xs text-[var(--muted)] hover:text-[var(--fg)] border border-[var(--border)] shrink-0 transition-colors"
                      title="Copy secret"
                    >
                      {copiedSecret ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {twoFactorSetup.recoveryCodes?.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-[var(--fg-secondary)]">One-time recovery codes:</p>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(twoFactorSetup.recoveryCodes.join('\n'))
                          toast.success('Recovery codes copied!')
                        }}
                        className="text-xs text-[var(--primary)] hover:underline font-medium"
                      >
                        Copy all codes
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1 bg-zinc-50 border border-[var(--border-subtle)] rounded-[var(--radius-sm)] p-2 text-[11px] font-mono max-h-20 overflow-y-auto">
                      {twoFactorSetup.recoveryCodes.map((c, i) => (
                        <span key={i} className="text-zinc-600">{c}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <Input
                    label="Enter 6-Digit Verification Code"
                    placeholder="123456"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value)}
                    maxLength={6}
                    autoComplete="one-time-code"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading || twoFactorCode.trim().length < 6}>
                  {loading ? 'Verifying...' : 'Verify & Enter Seller Panel'}
                </Button>
                <button
                  type="button"
                  onClick={() => { setShow2FA(false); setTwoFactorSetup(null); setTwoFactorCode(''); }}
                  className="w-full text-sm text-[var(--muted)] hover:underline"
                >
                  Back to login
                </button>
              </form>
            </CardContent>
          </Card>
        </div>
      )
    }

    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Two-Factor Authentication</CardTitle>
            <p className="text-sm text-[var(--muted)]">Enter the 6-digit code from your authenticator app or a recovery code.</p>
          </CardHeader>
          <CardContent>
            <form key="two-factor-form" onSubmit={handleTwoFactor} className="space-y-4">
              <Input
                label="Verification Code"
                placeholder="123456 or ABCD-EFGH-IJKL-NPQR"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                autoComplete="one-time-code"
              />
              <Button type="submit" className="w-full" disabled={loading || !twoFactorCode.trim()}>
                {loading ? 'Verifying...' : 'Verify'}
              </Button>
              <button
                type="button"
                onClick={() => { setShow2FA(false); setTwoFactorSetup(null); setTwoFactorCode(''); }}
                className="w-full text-sm text-[var(--muted)] hover:underline"
              >
                Back to login
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <p className="text-sm text-[var(--muted)]">Sign in to your account to continue</p>
        </CardHeader>
        <CardContent>
          {accountInactive && (
            <div className="mb-4 rounded-[var(--radius)] border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              Your account is inactive. Please contact support for assistance.
            </div>
          )}
          <form key="login-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded" />
                Remember me
              </label>
              <Link to="/forgot-password" className="text-[var(--primary)] hover:underline">
                Forgot password?
              </Link>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-[var(--muted)]">or continue with</span>
            </div>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-2 border border-[var(--border)] rounded-[var(--radius)] bg-white py-2.5 text-sm font-medium text-[var(--fg)] hover:bg-[var(--accent)] hover:border-[var(--border-strong)] transition-all"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </button>

          <p className="mt-6 text-center text-sm text-[var(--muted)]">
            Don't have an account?{' '}
            <Link to="/register" className="text-[var(--primary)] font-medium hover:underline">Sign up</Link>
          </p>
          <p className="mt-2 text-center text-sm text-[var(--muted)]">
            Want to sell on NexCart?{' '}
            <Link to="/seller/register" className="text-[var(--primary)] font-medium hover:underline">
              Become a Seller
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
