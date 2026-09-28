import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { sellerService } from '@/services/seller.service'
import { extractErrorMessage } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { StateCityFields } from '@/components/seller/StateCityFields'
import { googleSignInUrl } from '@/config/api'
import {
  isCityInState,
  isValidIndianState,
} from '@/lib/locations/indiaLocations'

const sellerSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Enter a valid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    businessName: z.string().min(2, 'Business name is required'),
    gstin: z
      .string()
      .regex(
        /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
        'Enter a valid 15-character GSTIN',
      ),
    pan: z
      .string()
      .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Enter a valid 10-character PAN'),
    phone: z
      .string()
      .regex(/^[0-9]{10}$/, 'Enter a valid 10-digit phone number')
      .optional()
      .or(z.literal('')),
    bankAccountHolderName: z.string().min(2, 'Account holder name is required'),
    bankAccountNumber: z.string().min(8, 'Account number is required'),
    ifscCode: z
      .string()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC code'),
    addressLine1: z.string().min(1, 'Address is required'),
    addressLine2: z.string().optional(),
    city: z.string().trim().min(2, 'City is required'),
    state: z.string().trim().min(2, 'State is required'),
    pincode: z
      .string()
      .regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code'),
  })
  .superRefine((data, ctx) => {
    // State and City must form a real Indian pair — mirrors the backend check.
    if (data.state && !isValidIndianState(data.state)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['state'],
        message: 'Not a valid Indian state',
      })
      return
    }
    if (data.state && data.city && !isCityInState(data.city, data.state)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['city'],
        message: `"${data.city}" is not a city in ${data.state}`,
      })
    }
  })

type SellerForm = z.infer<typeof sellerSchema>

export function RegisterSellerPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const { user, isAuthenticated } = useAuthStore()
  const guardedRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || !user) return
    // Guard once per mount - React StrictMode re-runs effects in dev,
    // which previously produced duplicate toasts + redirects.
    if (guardedRef.current) return
    guardedRef.current = true

    // Buyers, sellers, and admins cannot access this page
    if (user.role === 'BUYER') {
      toast.error('Buyers cannot sell products.', { id: 'become-seller-buyer' })
      navigate('/', { replace: true })
    } else if (user.role === 'SELLER') {
      toast.error('You are already registered as a seller.', {
        id: 'become-seller-already-registered',
      })
      navigate('/seller/dashboard', { replace: true })
    } else if (user.role === 'SUPER_ADMIN') {
      navigate('/admin/dashboard', { replace: true })
    }
  }, [isAuthenticated, user, navigate])

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<SellerForm>({
    resolver: zodResolver(sellerSchema),
    // The State/City comboboxes are Controller-backed — seed empty strings
    // so validation messages come from the schema instead of "undefined".
    defaultValues: { state: '', city: '' },
  })

  const onSubmit = async (data: SellerForm) => {
    try {
      setLoading(true)
      // An untouched optional phone reaches the resolver as '' — send
      // undefined instead so the backend's .optional() accepts it
      // (same mapping AuthPage uses for its seller signup).
      await sellerService.register({ ...data, phone: data.phone || undefined })
      toast.success('Seller registration submitted! Awaiting admin approval.')
      navigate('/seller/pending')
    } catch (err) {
      toast.error(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Become a Seller</CardTitle>
          <p className="text-sm text-[var(--muted)]">
            Register your business to start selling. GSTIN and PAN are immutable
            after creation.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-3 text-[var(--muted)] uppercase tracking-wide">
                Personal Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Full Name"
                  placeholder="John Doe"
                  error={errors.name?.message}
                  {...register('name')}
                />
                <Input
                  label="Email"
                  type="email"
                  placeholder="seller@example.com"
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
                <Input
                  label="Phone (optional)"
                  placeholder="9876543210"
                  error={errors.phone?.message}
                  {...register('phone')}
                />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3 text-[var(--muted)] uppercase tracking-wide">
                Business Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Business Name"
                  placeholder="My Business"
                  error={errors.businessName?.message}
                  {...register('businessName')}
                />
                <div></div>
                <Input
                  label="GSTIN"
                  placeholder="27AAPFU0939F1ZV"
                  error={errors.gstin?.message}
                  {...register('gstin')}
                />
                <Input
                  label="PAN"
                  placeholder="AAPFU0939F"
                  error={errors.pan?.message}
                  {...register('pan')}
                />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3 text-[var(--muted)] uppercase tracking-wide">
                Bank Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Account Holder Name"
                  error={errors.bankAccountHolderName?.message}
                  {...register('bankAccountHolderName')}
                />
                <Input
                  label="Account Number"
                  error={errors.bankAccountNumber?.message}
                  {...register('bankAccountNumber')}
                />
                <Input
                  label="IFSC Code"
                  placeholder="HDFC0001234"
                  error={errors.ifscCode?.message}
                  {...register('ifscCode')}
                />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3 text-[var(--muted)] uppercase tracking-wide">
                Business Address
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Input
                    label="Address Line 1"
                    error={errors.addressLine1?.message}
                    {...register('addressLine1')}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    label="Address Line 2 (optional)"
                    error={errors.addressLine2?.message}
                    {...register('addressLine2')}
                  />
                </div>
                <StateCityFields
                  control={control}
                  setValue={setValue}
                  getValues={getValues}
                />
                <Input
                  label="PIN Code"
                  placeholder="400001"
                  error={errors.pincode?.message}
                  {...register('pincode')}
                />
              </div>
            </div>

            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
              Important: GSTIN and PAN cannot be changed after registration.
              Please verify before submitting.
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading}
            >
              {loading ? 'Submitting...' : 'Submit Registration'}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border)]" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-[var(--muted)]">or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              window.location.href = googleSignInUrl({
                intent: 'signup',
                role: 'SELLER',
              })
            }}
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
        </CardContent>
      </Card>
    </div>
  )
}
