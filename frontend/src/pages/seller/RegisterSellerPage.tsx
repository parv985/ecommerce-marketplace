import { useState, useEffect } from 'react'
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

const sellerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  businessName: z.string().min(2, 'Business name is required'),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Enter a valid 15-character GSTIN'),
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Enter a valid 10-character PAN'),
  phone: z.string().regex(/^[0-9]{10}$/, 'Enter a valid 10-digit phone number').optional(),
  bankAccountHolderName: z.string().min(2, 'Account holder name is required'),
  bankAccountNumber: z.string().min(8, 'Account number is required'),
  ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC code'),
  addressLine1: z.string().min(1, 'Address is required'),
  addressLine2: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code'),
})

type SellerForm = z.infer<typeof sellerSchema>

export function RegisterSellerPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const { user, isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated || !user) return
    // Buyers, sellers, and admins cannot access this page
    if (user.role === 'BUYER') {
      toast.error('Buyers cannot sell products.')
      navigate('/', { replace: true })
    } else if (user.role === 'SELLER') {
      navigate('/seller/dashboard', { replace: true })
    } else if (user.role === 'SUPER_ADMIN') {
      navigate('/admin/dashboard', { replace: true })
    }
  }, [isAuthenticated, user, navigate])

  const { register, handleSubmit, formState: { errors } } = useForm<SellerForm>({
    resolver: zodResolver(sellerSchema),
  })

  const onSubmit = async (data: SellerForm) => {
    try {
      setLoading(true)
      await sellerService.register(data)
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
          <p className="text-sm text-[var(--muted)]">Register your business to start selling. GSTIN and PAN are immutable after creation.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-3 text-[var(--muted)] uppercase tracking-wide">Personal Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Full Name" placeholder="John Doe" error={errors.name?.message} {...register('name')} />
                <Input label="Email" type="email" placeholder="seller@example.com" error={errors.email?.message} {...register('email')} />
                <Input label="Password" type="password" placeholder="••••••••" error={errors.password?.message} {...register('password')} />
                <Input label="Phone (optional)" placeholder="9876543210" error={errors.phone?.message} {...register('phone')} />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3 text-[var(--muted)] uppercase tracking-wide">Business Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Business Name" placeholder="My Business" error={errors.businessName?.message} {...register('businessName')} />
                <div></div>
                <Input label="GSTIN" placeholder="27AAPFU0939F1ZV" error={errors.gstin?.message} {...register('gstin')} />
                <Input label="PAN" placeholder="AAPFU0939F" error={errors.pan?.message} {...register('pan')} />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3 text-[var(--muted)] uppercase tracking-wide">Bank Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Account Holder Name" error={errors.bankAccountHolderName?.message} {...register('bankAccountHolderName')} />
                <Input label="Account Number" error={errors.bankAccountNumber?.message} {...register('bankAccountNumber')} />
                <Input label="IFSC Code" placeholder="HDFC0001234" error={errors.ifscCode?.message} {...register('ifscCode')} />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3 text-[var(--muted)] uppercase tracking-wide">Business Address</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Input label="Address Line 1" error={errors.addressLine1?.message} {...register('addressLine1')} />
                </div>
                <div className="sm:col-span-2">
                  <Input label="Address Line 2 (optional)" error={errors.addressLine2?.message} {...register('addressLine2')} />
                </div>
                <Input label="City" error={errors.city?.message} {...register('city')} />
                <Input label="State" error={errors.state?.message} {...register('state')} />
                <Input label="PIN Code" placeholder="400001" error={errors.pincode?.message} {...register('pincode')} />
              </div>
            </div>

            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
              Important: GSTIN and PAN cannot be changed after registration. Please verify before submitting.
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit Registration'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
