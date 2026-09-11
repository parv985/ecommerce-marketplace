import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, keepPreviousData } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'react-hot-toast'
import { Ticket, X } from 'lucide-react'
import { useCart } from '@/hooks/useCart'
import { useRestrictedAction } from '@/hooks/useRestrictedAction'
import { userService } from '@/services/user.service'
import { orderService } from '@/services/order.service'
import { isAccountInactiveError } from '@/services/api'
import { formatPrice } from '@/lib/utils'
import {
  COUPON_EXPIRED_MESSAGE,
  COUPON_EXPIRED_TOAST_ID,
  getCouponErrorMessage,
  isCouponExpiredError,
} from '@/lib/couponStatus'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import type { CheckoutPreview } from '@/types/api'

const addressSchema = z.object({
  label: z.string().min(1, 'Label is required').max(30),
  recipientName: z.string().min(2, 'Recipient name is required').max(100),
  phone: z.string().regex(/^\d{10}$/, 'Phone must be 10 digits'),
  addressLine1: z.string().min(3, 'Address is required').max(200),
  addressLine2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  pincode: z.string().regex(/^\d{6}$/, 'PIN must be 6 digits'),
})

type AddressForm = z.infer<typeof addressSchema>

export function CheckoutPage() {
  const navigate = useNavigate()
  const { data: cart } = useCart()
  const guardRestrictedAction = useRestrictedAction()
  const [selectedAddress, setSelectedAddress] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'ONLINE'>('COD')
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null)
  const [showNewAddress, setShowNewAddress] = useState(false)

  /*
   * Server-side checkout preview (no side effects). Runs whenever the
   * applied coupon changes so subtotal, product discounts, coupon
   * discount and the final payable always match what the backend will
   * actually charge when the order is placed.
   */
  const cartFingerprint = cart?.items
    .map(item => `${item.productId}:${item.quantity}`)
    .join(',') ?? ''

  const previewQuery = useQuery({
    queryKey: ['checkout-preview', appliedCoupon ?? '', cartFingerprint],
    queryFn: () =>
      orderService.preview(appliedCoupon ? { couponCode: appliedCoupon } : undefined),
    enabled: !!(cart && cart.items.length > 0),
    staleTime: 15_000,
    // Keep the last totals on screen while a coupon preview refreshes,
    // so the payable amount never flickers to a wrong value.
    placeholderData: keepPreviousData,
  })

  const applyCoupon = useMutation({
    mutationFn: (code: string) => orderService.preview({ couponCode: code }),
    onSuccess: (data) => {
      setAppliedCoupon(data.couponCode ?? couponInput.trim().toUpperCase())
      setCouponInput(data.couponCode ?? couponInput.trim().toUpperCase())
      if (data.couponDiscount > 0) {
        toast.success(`🎉 Coupon applied! You saved ${formatPrice(data.couponDiscount)} on this order.`)
      } else {
        toast.success('Coupon applied!')
      }
    },
    onError: (error) => {
      /*
       * Expired and fully-used coupons are distinct states on the API
       * (`COUPON_EXPIRED` / `COUPON_USAGE_LIMIT_REACHED`) but the buyer
       * sees the same "Coupon code expired" message for both; every
       * other rejection keeps the generic message.
       */
      toast.error(getCouponErrorMessage(error), {
        id: isCouponExpiredError(error) ? COUPON_EXPIRED_TOAST_ID : 'checkout-invalid-coupon',
      })
    },
  })

  const removeCoupon = () => {
    setAppliedCoupon(null)
    setCouponInput('')
  }

  /*
   * A coupon can expire (or consume its last usage slot) between being
   * applied and the order being placed. When the background re-validation
   * fails, drop the coupon and tell the buyer why.
   */
  useEffect(() => {
    if (!appliedCoupon || !previewQuery.error) return
    if (!isCouponExpiredError(previewQuery.error)) return

    setAppliedCoupon(null)
    setCouponInput('')
    toast.error(COUPON_EXPIRED_MESSAGE, { id: COUPON_EXPIRED_TOAST_ID })
  }, [appliedCoupon, previewQuery.error])

  const preview: CheckoutPreview | null =
    previewQuery.data ??
    (cart && cart.items.length > 0
      ? {
          itemsTotal: cart.totalPrice,
          discountTotal: 0,
          couponCode: null,
          couponDiscount: 0,
          total: cart.totalPrice,
          orders: [],
        }
      : null)

  const { data: addresses } = useQuery({
    queryKey: ['addresses'],
    queryFn: userService.getAddresses,
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<AddressForm>({
    resolver: zodResolver(addressSchema),
  })

  const createAddress = useMutation({
    mutationFn: (data: AddressForm) => userService.createAddress(data),
    onSuccess: (res) => {
      setSelectedAddress(res.data.id)
      setShowNewAddress(false)
      reset()
      toast.success('Address added')
    },
  })

  const placeOrder = useMutation({
    mutationFn: () => orderService.create({
      shippingAddressId: selectedAddress,
      paymentMethod,
      couponCode: appliedCoupon || undefined,
    }),
    onSuccess: (res) => {
      const orders = res.data
      if (paymentMethod === 'ONLINE' && orders.length > 0) {
        navigate(`/orders/${orders[0].id}/pay`)
      } else {
        toast.success('Order(s) placed successfully!')
        navigate('/orders')
      }
    },
    onError: (err: any) => {
      // Inactive-account errors are toasted + handled by the api interceptor.
      if (isAccountInactiveError(err)) return
      // The applied coupon is no longer redeemable: say so and clear it
      // so the buyer can continue without the discount.
      if (isCouponExpiredError(err)) {
        removeCoupon()
        toast.error(COUPON_EXPIRED_MESSAGE, { id: COUPON_EXPIRED_TOAST_ID })
        return
      }
      toast.error(err?.response?.data?.message || 'Failed to place order')
    },
  })

  if (!cart || !cart.items || cart.items.length === 0) {
    return (
      <div className="container-app py-16 text-center">
        <p className="text-base text-[var(--muted)] mb-4">Your cart is empty.</p>
        <Link to="/products" className="text-sm font-semibold text-[var(--primary)] hover:underline">
          Browse catalog
        </Link>
      </div>
    )
  }

  return (
    <div className="container-app py-8">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)] mb-6 pb-4 border-b border-[var(--border)]">
        Checkout
      </h1>
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Shipping Address */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Shipping Address</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setShowNewAddress(true)}>Add New</Button>
            </CardHeader>
            <CardContent>
              {addresses && addresses.length > 0 ? (
                <div className="space-y-2.5">
                  {addresses.map(addr => (
                    <label
                      key={addr.id}
                      className={`block border rounded-[var(--radius)] p-3.5 cursor-pointer transition-colors ${selectedAddress === addr.id ? 'border-[var(--primary)] bg-[var(--primary-subtle)]' : 'border-[var(--border)] hover:bg-[var(--accent)]'}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="address"
                          value={addr.id}
                          checked={selectedAddress === addr.id}
                          onChange={() => setSelectedAddress(addr.id)}
                          className="accent-[var(--primary)]"
                        />
                        <span className="font-semibold text-sm text-[var(--fg)]">{addr.label}</span>
                      </div>
                      <p className="text-xs text-[var(--fg-secondary)] ml-6 mt-1 leading-relaxed">
                        {addr.recipientName && <span className="font-medium text-[var(--fg)]">{addr.recipientName}, </span>}
                        {addr.addressLine1}{addr.addressLine2 ? `, ${addr.addressLine2}` : ''}, {addr.city}, {addr.state} - {addr.pincode}
                        {addr.phone && <span className="block text-[var(--muted)] mt-0.5">Phone: {addr.phone}</span>}
                      </p>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">No addresses saved. Add one to continue.</p>
              )}
            </CardContent>
          </Card>

          {/* Payment Method */}
          <Card>
            <CardHeader><CardTitle>Payment Method</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                <label className={`block border rounded-[var(--radius)] p-3.5 cursor-pointer transition-colors ${paymentMethod === 'COD' ? 'border-[var(--primary)] bg-[var(--primary-subtle)]' : 'border-[var(--border)] hover:bg-[var(--accent)]'}`}>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="payment"
                      value="COD"
                      checked={paymentMethod === 'COD'}
                      onChange={() => setPaymentMethod('COD')}
                      className="accent-[var(--primary)]"
                    />
                    <span className="font-semibold text-sm text-[var(--fg)]">Cash on Delivery (COD)</span>
                  </div>
                  <p className="text-xs text-[var(--muted)] ml-6 mt-0.5">Pay via cash or UPI upon parcel delivery</p>
                </label>
                <label className={`block border rounded-[var(--radius)] p-3.5 cursor-pointer transition-colors ${paymentMethod === 'ONLINE' ? 'border-[var(--primary)] bg-[var(--primary-subtle)]' : 'border-[var(--border)] hover:bg-[var(--accent)]'}`}>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="payment"
                      value="ONLINE"
                      checked={paymentMethod === 'ONLINE'}
                      onChange={() => setPaymentMethod('ONLINE')}
                      className="accent-[var(--primary)]"
                    />
                    <span className="font-semibold text-sm text-[var(--fg)]">Pay Online (Razorpay)</span>
                  </div>
                  <p className="text-xs text-[var(--muted)] ml-6 mt-0.5">UPI, Debit/Credit Card, Netbanking with 256-bit encryption</p>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Coupon */}
          <Card>
            <CardHeader><CardTitle>Coupon</CardTitle></CardHeader>
            <CardContent>
              {appliedCoupon ? (
                <div className="flex items-center justify-between gap-3 border border-emerald-200 bg-emerald-50 rounded-[var(--radius)] px-3.5 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Ticket size={16} className="text-emerald-700 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-emerald-800">
                        Coupon <span className="uppercase">{appliedCoupon}</span> applied
                      </p>
                      <p className="text-xs text-emerald-700">
                        {preview && preview.couponDiscount > 0
                          ? `You save ${formatPrice(preview.couponDiscount)} on this order`
                          : 'Discount applied at checkout'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeCoupon}
                    className="shrink-0 text-emerald-700 hover:text-red-700 transition-colors p-1"
                    title="Remove coupon"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter coupon code"
                    value={couponInput}
                    onChange={e => setCouponInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && couponInput.trim()) {
                        e.preventDefault()
                        applyCoupon.mutate(couponInput.trim())
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    disabled={!couponInput.trim() || applyCoupon.isPending}
                    onClick={() => applyCoupon.mutate(couponInput.trim())}
                  >
                    {applyCoupon.isPending ? 'Checking...' : 'Apply'}
                  </Button>
                </div>
              )}
              {!appliedCoupon && (
                <p className="text-[11px] text-[var(--muted)] mt-2">
                  Enter a seller coupon code — it is validated instantly and the discount is shown below.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Order Summary */}
        <div className="border border-[var(--border)] bg-white rounded-[var(--radius-lg)] p-5 h-fit shadow-[var(--shadow-sm)]">
          <h2 className="font-semibold text-base text-[var(--fg)] mb-4 pb-3 border-b border-[var(--border)]">Order Summary</h2>
          <div className="space-y-2.5 text-sm">
            {cart.items.map(item => item.product && (
              <div key={item.productId} className="flex justify-between items-start text-xs text-[var(--fg-secondary)]">
                <span className="truncate mr-2 font-medium text-[var(--fg)]">{item.product.name} <span className="text-[var(--muted)]">x{item.quantity}</span></span>
                <span className="shrink-0 font-semibold text-[var(--fg)]">{formatPrice(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-[var(--border)] mt-4 pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-[var(--fg-secondary)]">
              <span>Subtotal ({cart.totalQuantity} items)</span>
              <span className="font-semibold text-[var(--fg)]">{formatPrice(preview?.itemsTotal ?? cart.totalPrice)}</span>
            </div>
            {(preview?.discountTotal ?? 0) > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Product Discounts</span>
                <span className="font-semibold">− {formatPrice(preview!.discountTotal)}</span>
              </div>
            )}
            {(preview?.couponDiscount ?? 0) > 0 && appliedCoupon && (
              <div className="flex justify-between text-emerald-700">
                <span className="uppercase">Coupon ({appliedCoupon})</span>
                <span className="font-semibold">− {formatPrice(preview!.couponDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between text-[var(--fg-secondary)]">
              <span>Shipping</span>
              <span className="text-emerald-700 font-medium">Calculated at checkout</span>
            </div>
            <div className="border-t border-[var(--border)] pt-3 flex justify-between font-bold text-base text-[var(--fg)]">
              <span>Total Payable</span>
              <span className="font-bold text-[var(--primary)]">{formatPrice(preview?.total ?? cart.totalPrice)}</span>
            </div>
          </div>
          <Button
            className="w-full mt-4"
            size="lg"
            disabled={!selectedAddress || placeOrder.isPending}
            onClick={() => {
              // Buying is restricted: inactive/unauthenticated users are
              // blocked with a "Your account is inactive" toast.
              if (!guardRestrictedAction()) return
              placeOrder.mutate()
            }}
          >
            {placeOrder.isPending ? 'Placing Order...' : `Confirm & Place Order`}
          </Button>
          <p className="text-[11px] text-[var(--muted)] mt-2.5 text-center">Secure 256-bit encrypted transaction</p>
        </div>
      </div>

      {/* New Address Dialog */}
      <Dialog open={showNewAddress} onClose={() => setShowNewAddress(false)} title="Add New Address">
        <form onSubmit={handleSubmit((data) => createAddress.mutate(data))} className="space-y-3.5">
          <Input label="Label" placeholder="Home, Office, etc." error={errors.label?.message} {...register('label')} />
          <Input label="Recipient Name" placeholder="Full name" error={errors.recipientName?.message} {...register('recipientName')} />
          <Input label="Address Line 1" error={errors.addressLine1?.message} {...register('addressLine1')} />
          <Input label="Address Line 2" {...register('addressLine2')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="City" error={errors.city?.message} {...register('city')} />
            <Input label="State" error={errors.state?.message} {...register('state')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="PIN Code" error={errors.pincode?.message} {...register('pincode')} />
            <Input label="Phone (10 digits)" error={errors.phone?.message} {...register('phone')} />
          </div>
          <Button type="submit" className="w-full" disabled={createAddress.isPending}>Save Address</Button>
        </form>
      </Dialog>
    </div>
  )
}
