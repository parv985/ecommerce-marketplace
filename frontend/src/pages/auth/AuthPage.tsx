import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/services/auth.service'
import { extractErrorMessage } from '@/services/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
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
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [registerRole, setRegisterRole] = useState<'BUYER' | 'SELLER'>('BUYER')
  const [loading, setLoading] = useState(false)
  const [show2FA, setShow2FA] = useState(false)
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
    if (role === 'SELLER') return returnPath || '/seller/dashboard'
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
        (err as { response?: { data?: { code?: string; loginToken?: string } } })
          ?.response?.data?.code === 'TWO_FACTOR_REQUIRED'
      ) {
        const loginT = (err as { response: { data: { loginToken: string } } })
          .response.data.loginToken
        setLoginToken(loginT)
        setShow2FA(true)
      } else {
        const axiosErr = err as { response?: { status?: number; data?: { message?: string } } }
        const status = axiosErr?.response?.status
        if (status === 401) {
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
      toast.success('Account created! Welcome to ECOM.')
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
    window.location.href = `${import.meta.env.VITE_API_URL || '/api/v1'}/auth/google`
  }

  // ── 2FA view ──
  if (show2FA) {
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
            <form onSubmit={handleTwoFactor} className="space-y-4">
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
                onClick={() => { setShow2FA(false); setTwoFactorCode(''); }}
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
            {/* Role Switcher */}
            <div className="flex rounded-lg border overflow-hidden mb-6">
              <button
                onClick={() => setRegisterRole('BUYER')}
                className={cn(
                  'flex-1 py-2.5 text-sm font-medium transition-colors',
                  registerRole === 'BUYER'
                    ? 'bg-zinc-900 text-white'
                    : 'bg-white text-zinc-600 hover:bg-zinc-50'
                )}
              >
                Buyer
              </button>
              <button
                onClick={() => setRegisterRole('SELLER')}
                className={cn(
                  'flex-1 py-2.5 text-sm font-medium transition-colors',
                  registerRole === 'SELLER'
                    ? 'bg-zinc-900 text-white'
                    : 'bg-white text-zinc-600 hover:bg-zinc-50'
                )}
              >
                Seller
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
              className="w-full flex items-center justify-center gap-2 border rounded-md py-2.5 text-sm font-medium hover:bg-[var(--accent)] transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
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
          <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
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
            className="w-full flex items-center justify-center gap-2 border rounded-md py-2.5 text-sm font-medium hover:bg-[var(--accent)] transition-colors"
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
            New here?{' '}
            <button onClick={() => setMode('register')} className="text-[var(--primary)] font-medium hover:underline">
              Create an account
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
