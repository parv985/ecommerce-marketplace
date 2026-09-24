import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
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
import { cn } from '@/lib/utils'

// ── Schemas ──────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

const buyerRegisterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
})

const sellerRegisterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  businessName: z.string().min(2, 'Business name is required').max(150),
  phone: z.string().regex(/^[0-9]{10}$/, 'Must be a valid 10-digit phone number').optional().or(z.literal('')),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Invalid GSTIN format (e.g., 27AAPFU0939F1ZV)'),
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN format (e.g., AAPFU0939F)'),
  bankAccountHolderName: z.string().min(2, 'Account holder name is required'),
  bankAccountNumber: z.string().min(8, 'Invalid account number').max(20, 'Invalid account number'),
  ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code (e.g., HDFC0001234)'),
  addressLine1: z.string().min(3, 'Address is required'),
  addressLine2: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Invalid 6-digit pincode'),
})

type LoginForm = z.infer<typeof loginSchema>
type BuyerRegisterForm = z.infer<typeof buyerRegisterSchema>
type SellerRegisterForm = z.infer<typeof sellerRegisterSchema>

// ── Component ────────────────────────────────────────────────────
export default function AuthPage() {
  const { setAuth, accountInactive } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [registerRole, setRegisterRole] = useState<'BUYER' | 'SELLER'>('BUYER')
  const [loading, setLoading] = useState(false)
  const [show2FA, setShow2FA] = useState(false)
  const [twoFactorSetup, setTwoFactorSetup] = useState<{ secret: string; otpauthUrl: string; recoveryCodes: string[] } | null>(null)
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [loginToken, setLoginToken] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')

  // ── Login form ──
  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  // ── Buyer register form ──
  const buyerRegisterForm = useForm<BuyerRegisterForm>({
    resolver: zodResolver(buyerRegisterSchema),
  })

  // ── Seller register form ──
  const sellerRegisterForm = useForm<SellerRegisterForm>({
    resolver: zodResolver(sellerRegisterSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      businessName: '',
      phone: '',
      gstin: '',
      pan: '',
      bankAccountHolderName: '',
      bankAccountNumber: '',
      ifscCode: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      pincode: '',
    },
  })

  // ── Handlers ──
  /** Determine redirect path based on user role */
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

  const onLogin = async (data: LoginForm) => {
    try {
      setLoading(true)
      // Ensure email is normalized before sending
      const payload = { ...data, email: data.email.trim().toLowerCase() }
      const res = await authApi.login(payload)
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
    } catch (err: unknown) {
      if (
        (err as { response?: { data?: { code?: string; loginToken?: string; twoFactorSetup?: any } } })
          ?.response?.data?.code === 'TWO_FACTOR_REQUIRED'
      ) {
        const loginT = (err as { response: { data: { loginToken: string; twoFactorSetup?: any } } })
          .response.data.loginToken
        setLoginToken(loginT)
        if ((err as any)?.response?.data?.twoFactorSetup) {
          setTwoFactorSetup((err as any).response.data.twoFactorSetup)
        }
        setShow2FA(true)
      } else {
        const axiosErr = err as { response?: { status?: number; data?: { message?: string; code?: string } } }
        const status = axiosErr?.response?.status
        const code = axiosErr?.response?.data?.code
        const message = axiosErr?.response?.data?.message

        if (status === 403 && (code === 'SELLER_PENDING_APPROVAL' || message?.toLowerCase().includes('approval'))) {
          toast.error('Waiting for admin approval.')
        } else if (status === 401) {
          toast.error('Invalid email or password. Please check your credentials and try again.')
        } else if (status === 429) {
          toast.error('Too many login attempts. Please wait a moment and try again.')
        } else if (!status) {
          toast.error('Unable to connect to the server. Please check your internet connection.')
        } else {
          toast.error(extractErrorMessage(err))
        }
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
      const res = await authApi.verify2FA(loginToken, twoFactorCode)
      setAuth(res.data.user, res.data.accessToken)
      toast.success('Two-factor authentication successful!')
      navigate(getPostLoginRedirect(res.data.user.role, from), { replace: true })
    } catch (err) {
      toast.error(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const onBuyerRegister = async (data: BuyerRegisterForm) => {
    try {
      setLoading(true)
      const res = await authApi.register(data)
      setAuth(res.data.user, res.data.accessToken)
      toast.success('Account created! Welcome to NexCart.')
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const onSellerRegister = async (data: SellerRegisterForm) => {
    try {
      setLoading(true)
      await authApi.registerSeller({
        ...data,
        phone: data.phone || undefined,
      })
      toast.success('Seller application submitted! Please wait for admin approval.')
      // Switch to login view so they can sign in after approval
      setMode('login')
      loginForm.setValue('email', data.email)
      loginForm.setValue('password', data.password)
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

  // ── 2FA view ──
  /*
   * This view replaces the login view in the same tree, so the two forms
   * carry distinct keys. Without them React reuses the login form's DOM
   * node for the verification-code input (same element type, same
   * position) and flips that <input> from uncontrolled (react-hook-form's
   * register) to controlled (`value={twoFactorCode}`), logging
   * "A component is changing an uncontrolled input to be controlled".
   * A distinct key mounts a fresh subtree, so the code input is
   * controlled from its very first render.
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
                {/* QR Code */}
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

                {/* Secret Key manual entry */}
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

                {/* Recovery codes */}
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

                {/* Verification Code Input */}
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
                  {loading ? 'Verifying...' : 'Verify & Complete Login'}
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
            <CardTitle className="text-2xl">Two-Factor Verification</CardTitle>
            <p className="text-sm text-[var(--muted)]">
              Enter the 6-digit code from your authenticator app or a recovery code.
            </p>
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

  // ── Register view ──
  if (mode === 'register') {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-2xl">Create an account</CardTitle>
            <p className="text-sm text-[var(--muted)]">Choose your account type and fill in your details</p>
          </CardHeader>
          <CardContent>
            {/* Role Switcher — Crisp Segmented Control */}
            <div className="flex rounded-[var(--radius)] border border-[var(--border)] p-1 bg-[#f6f5f2] mb-6">
              <button
                type="button"
                onClick={() => setRegisterRole('BUYER')}
                className={cn(
                  'flex-1 py-2 text-xs font-semibold rounded-[calc(var(--radius)-2px)] transition-all duration-150',
                  registerRole === 'BUYER'
                    ? 'bg-white text-[var(--fg)] shadow-sm'
                    : 'text-[var(--fg-secondary)] hover:text-[var(--fg)]'
                )}
              >
                Buyer Account
              </button>
              <button
                type="button"
                onClick={() => navigate('/seller/register')}
                className={cn(
                  'flex-1 py-2 text-xs font-semibold rounded-[calc(var(--radius)-2px)] transition-all duration-150',
                  'text-[var(--fg-secondary)] hover:text-[var(--fg)]'
                )}
              >
                Seller Account
              </button>
            </div>

            {/* Buyer Registration */}
            {registerRole === 'BUYER' && (
              <form onSubmit={buyerRegisterForm.handleSubmit(onBuyerRegister)} className="space-y-4">
                <Input
                  label="Full Name"
                  placeholder="John Doe"
                  error={buyerRegisterForm.formState.errors.name?.message}
                  {...buyerRegisterForm.register('name')}
                />
                <Input
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  error={buyerRegisterForm.formState.errors.email?.message}
                  {...buyerRegisterForm.register('email')}
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="At least 8 characters"
                  error={buyerRegisterForm.formState.errors.password?.message}
                  {...buyerRegisterForm.register('password')}
                />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Creating account...' : 'Create Buyer Account'}
                </Button>
              </form>
            )}

            {/* Seller Registration */}
            {registerRole === 'SELLER' && (
              <form onSubmit={sellerRegisterForm.handleSubmit(onSellerRegister)} className="space-y-4">
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Seller registration requires business details. GSTIN and PAN become permanent after registration.
                </p>

                {/* Personal Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Full Name"
                    placeholder="John Doe"
                    error={sellerRegisterForm.formState.errors.name?.message}
                    {...sellerRegisterForm.register('name')}
                  />
                  <Input
                    label="Email"
                    type="email"
                    placeholder="you@example.com"
                    error={sellerRegisterForm.formState.errors.email?.message}
                    {...sellerRegisterForm.register('email')}
                  />
                </div>
                <Input
                  label="Password"
                  type="password"
                  placeholder="At least 8 characters"
                  error={sellerRegisterForm.formState.errors.password?.message}
                  {...sellerRegisterForm.register('password')}
                />
                <Input
                  label="Phone (optional)"
                  placeholder="10-digit mobile number"
                  error={sellerRegisterForm.formState.errors.phone?.message}
                  {...sellerRegisterForm.register('phone')}
                />

                {/* Business Info */}
                <div className="border-t pt-4 mt-2">
                  <h4 className="text-sm font-medium text-zinc-700 mb-3">Business Details</h4>
                </div>
                <Input
                  label="Business Name"
                  placeholder="Your Business Name"
                  error={sellerRegisterForm.formState.errors.businessName?.message}
                  {...sellerRegisterForm.register('businessName')}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="GSTIN"
                    placeholder="27AAPFU0939F1ZV"
                    error={sellerRegisterForm.formState.errors.gstin?.message}
                    {...sellerRegisterForm.register('gstin')}
                  />
                  <Input
                    label="PAN"
                    placeholder="AAPFU0939F"
                    error={sellerRegisterForm.formState.errors.pan?.message}
                    {...sellerRegisterForm.register('pan')}
                  />
                </div>

                {/* Bank Details */}
                <div className="border-t pt-4 mt-2">
                  <h4 className="text-sm font-medium text-zinc-700 mb-3">Bank Details</h4>
                </div>
                <Input
                  label="Account Holder Name"
                  placeholder="Account holder name"
                  error={sellerRegisterForm.formState.errors.bankAccountHolderName?.message}
                  {...sellerRegisterForm.register('bankAccountHolderName')}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Account Number"
                    placeholder="Account number"
                    error={sellerRegisterForm.formState.errors.bankAccountNumber?.message}
                    {...sellerRegisterForm.register('bankAccountNumber')}
                  />
                  <Input
                    label="IFSC Code"
                    placeholder="HDFC0001234"
                    error={sellerRegisterForm.formState.errors.ifscCode?.message}
                    {...sellerRegisterForm.register('ifscCode')}
                  />
                </div>

                {/* Address */}
                <div className="border-t pt-4 mt-2">
                  <h4 className="text-sm font-medium text-zinc-700 mb-3">Business Address</h4>
                </div>
                <Input
                  label="Address Line 1"
                  placeholder="Street address"
                  error={sellerRegisterForm.formState.errors.addressLine1?.message}
                  {...sellerRegisterForm.register('addressLine1')}
                />
                <Input
                  label="Address Line 2 (optional)"
                  placeholder="Apartment, suite, etc."
                  {...sellerRegisterForm.register('addressLine2')}
                />
                <div className="grid grid-cols-3 gap-4">
                  <Input
                    label="City"
                    placeholder="City"
                    error={sellerRegisterForm.formState.errors.city?.message}
                    {...sellerRegisterForm.register('city')}
                  />
                  <Input
                    label="State"
                    placeholder="State"
                    error={sellerRegisterForm.formState.errors.state?.message}
                    {...sellerRegisterForm.register('state')}
                  />
                  <Input
                    label="Pincode"
                    placeholder="110001"
                    error={sellerRegisterForm.formState.errors.pincode?.message}
                    {...sellerRegisterForm.register('pincode')}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Submitting...' : 'Register as Seller'}
                </Button>
              </form>
            )}

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-[var(--muted)]">or</span>
              </div>
            </div>

            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-2 border border-[var(--border)] rounded-[var(--radius)] bg-white py-2.5 text-sm font-medium text-[var(--fg)] hover:bg-[var(--accent)] hover:border-[var(--border-strong)] transition-all"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign up with Google
            </button>

            <p className="mt-6 text-center text-sm text-[var(--muted)]">
              Already have an account?{' '}
              <button onClick={() => setMode('login')} className="text-[var(--primary)] font-medium hover:underline">
                Sign in
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Login view ──
  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <p className="text-sm text-[var(--muted)]">Sign in to your account to continue</p>
        </CardHeader>
        <CardContent>
          {/* Shown when this session learned the account is deactivated
              (failed login attempt or a deactivation detected mid-session). */}
          {accountInactive && (
            <div className="mb-4 rounded-[var(--radius)] border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              Your account is inactive. Please contact support for assistance.
            </div>
          )}
          <form key="login-form" onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              error={loginForm.formState.errors.email?.message}
              {...loginForm.register('email')}
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              error={loginForm.formState.errors.password?.message}
              {...loginForm.register('password')}
            />
            <div className="flex items-center justify-between text-sm">
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
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google
          </button>

          <p className="mt-6 text-center text-sm text-[var(--muted)]">
            New here?{' '}
            <button onClick={() => setMode('register')} className="text-[var(--primary)] font-medium hover:underline">
              Create an account
            </button>
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
