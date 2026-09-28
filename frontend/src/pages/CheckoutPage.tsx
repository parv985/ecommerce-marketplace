import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'react-hot-toast'
import { Ticket, X, Pencil } from 'lucide-react'
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
import { StateCityFields } from '@/components/ui/StateCityFields'
import type { CheckoutPreview, Address } from '@/types/api'

const addressSchema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(30),
  recipientName: z.string().trim().min(2, 'Recipient name is required').max(100),
  phone: z.string().trim().regex(/^\d{10}$/, 'Phone must be 10 digits'),
  addressLine1: z.string().trim().min(3, 'Address is required').max(200),
  addressLine2: z.string().optional(),
  state: z.string().trim().min(1, 'State is required'),
  city: z.string().trim().min(1, 'City is required'),
  pincode: z.string().trim().regex(/^\d{6}$/, 'PIN must be 6 digits'),
})

type AddressForm = z.infer<typeof addressSchema>

const EMPTY_ADDRESS_FORM: AddressForm = {
  label: '',
  recipientName: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  state: '',
  city: '',
  pincode: '',
}

export function CheckoutPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: cart } = useCart()
  const guardRestrictedAction = useRestrictedAction()
  const [selectedAddress, setSelectedAddress] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<'CASH_ON_DELIVERY' | 'ONLINE'>('CASH_ON_DELIVERY')
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null)
  const [showAddressModal, setShowAddressModal] = useState(false)
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null)

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

  // Auto-select first address if none selected yet
  useEffect(() => {
    if (!selectedAddress && addresses && addresses.length > 0) {
      setSelectedAddress(addresses[0].id)
    }
  }, [addresses, selectedAddress])

  const editingAddress = addresses?.find((a) => a.id === editingAddressId)

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<AddressForm>({
    resolver: zodResolver(addressSchema),
    defaultValues: EMPTY_ADDRESS_FORM,
  })

  const createAddress = useMutation({
    mutationFn: (data: AddressForm) => userService.createAddress(data),
    onSuccess: (res) => {
      // Immediately add the new address to the query cache so it appears with zero refresh
      queryClient.setQueryData<Address[]>(['addresses'], (old) =>
        old ? [...old, res.data] : [res.data]
      )
      queryClient.invalidateQueries({ queryKey: ['addresses'] })
      setSelectedAddress(res.data.id)
      setShowAddressModal(false)
      reset(EMPTY_ADDRESS_FORM)
      toast.success('Address added')
    },
  })

  const updateAddress = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AddressForm }) =>
      userService.updateAddress(id, data),
    onSuccess: (res) => {
      queryClient.setQueryData<Address[]>(['addresses'], (old) =>
        old?.map((a) => (a.id === res.data.id ? res.data : a))
      )
      queryClient.invalidateQueries({ queryKey: ['addresses'] })
      setSelectedAddress(res.data.id)
      setShowAddressModal(false)
      setEditingAddressId(null)
      reset(EMPTY_ADDRESS_FORM)
      toast.success('Address updated')
    },
  })

  const handleOpenAddAddress = () => {
    setEditingAddressId(null)
    reset(EMPTY_ADDRESS_FORM)
    setShowAddressModal(true)
  }

  const handleOpenEditAddress = (addr: Address) => {
    setEditingAddressId(addr.id)
    reset({
      label: addr.label,
      recipientName: addr.recipientName,
      phone: addr.phone,
      addressLine1: addr.addressLine1,
      addressLine2: addr.addressLine2 ?? '',
      state: addr.state,
      city: addr.city,
      pincode: addr.pincode,
    })
    setShowAddressModal(true)
  }

  const handleAddressSubmit = (data: AddressForm) => {
    if (editingAddressId) {
      updateAddress.mutate({ id: editingAddressId, data })
    } else {
      createAddress.mutate(data)
    }
  }

  const placeOrder = useMutation({
    mutationFn: () => orderService.create({
      shippingAddressId: selectedAddress,
      paymentMethod,
      couponCode: appliedCoupon || undefined,
    }),
    onSuccess: (res) => {
      const orders = res.data
      queryClient.invalidateQueries({ queryKey: ['cart'] })
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
              <Button variant="outline" size="sm" onClick={handleOpenAddAddress}>Add New</Button>
            </CardHeader>
            <CardContent>
              {addresses && addresses.length > 0 ? (
                <div className="space-y-2.5">
                  {addresses.map(addr => (
                    <div
                      key={addr.id}
                      className={`flex items-start justify-between border rounded-[var(--radius)] p-3.5 cursor-pointer transition-colors ${selectedAddress === addr.id ? 'border-[var(--primary)] bg-[var(--primary-subtle)]' : 'border-[var(--border)] hover:bg-[var(--accent)]'}`}
                    >
                      <label
                        className="flex-1 cursor-pointer"
                        onClick={() => setSelectedAddress(addr.id)}
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
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenEditAddress(addr)
                        }}
                        className="text-[var(--muted)] hover:text-[var(--primary)] shrink-0 p-1.5 ml-2 rounded hover:bg-[var(--bg-subtle)]"
                        aria-label="Edit address"
                        title="Edit address"
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
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
                <label className={`block border rounded-[var(--radius)] p-3.5 cursor-pointer transition-colors ${paymentMethod === 'CASH_ON_DELIVERY' ? 'border-[var(--primary)] bg-[var(--primary-subtle)]' : 'border-[var(--border)] hover:bg-[var(--accent)]'}`}>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="payment"
                      value="CASH_ON_DELIVERY"
                      checked={paymentMethod === 'CASH_ON_DELIVERY'}
                      onChange={() => setPaymentMethod('CASH_ON_DELIVERY')}
                      className="accent-[var(--primary)]"
                    />
                    <span className="font-semibold text-sm text-[var(--fg)]">Cash on Delivery (COD)</span>
                  </div>
                  <p className="text-xs text-[var(--fg-secondary)] ml-6 mt-1">Pay when your order is delivered to your doorstep</p>
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
                    <span className="font-semibold text-sm text-[var(--fg)]">Online Payment</span>
                  </div>
                  <p className="text-xs text-[var(--fg-secondary)] ml-6 mt-1">Credit / Debit Card, UPI, Net Banking via Razorpay</p>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Coupon Code Section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <Ticket size={18} className="text-[var(--primary)]" />
                <CardTitle className="text-base">Apply Coupon</CardTitle>
              </div>
              {appliedCoupon && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  Applied
                </span>
              )}
            </CardHeader>
            <CardContent>
              {appliedCoupon ? (
                <div className="flex items-center justify-between p-3 border border-emerald-300 rounded-[var(--radius)] bg-emerald-50 text-emerald-800 text-sm">
                  <div>
                    <span className="font-bold tracking-wide">{appliedCoupon}</span>
                    {preview && preview.couponDiscount > 0 ? (
                      <span className="ml-2 text-xs text-emerald-600 font-medium">
                        ({formatPrice(preview.couponDiscount)} off)
                      </span>
                    ) : (
                      <span className="ml-2 text-xs text-emerald-600 font-medium">(applied)</span>
                    )}
                  </div>
                  <button
                    onClick={removeCoupon}
                    className="text-emerald-700 hover:text-emerald-900 transition-colors p-1"
                    title="Remove coupon"
                    aria-label="Remove coupon"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="Enter coupon code"
                    className="flex-1 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-sm uppercase placeholder:normal-case focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && couponInput.trim()) {
                        e.preventDefault()
                        applyCoupon.mutate(couponInput.trim())
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!couponInput.trim() || applyCoupon.isPending}
                    onClick={() => applyCoupon.mutate(couponInput.trim())}
                  >
                    {applyCoupon.isPending ? 'Applying...' : 'Apply'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Order Summary Sidebar */}
        <div className="border border-[var(--border)] rounded-[var(--radius-lg)] p-6 bg-white self-start sticky top-24 shadow-[var(--shadow-sm)]">
          <h2 className="font-semibold text-lg text-[var(--fg)] mb-4 pb-2 border-b border-[var(--border)]">
            Order Summary
          </h2>
          <div className="space-y-3 max-h-60 overflow-y-auto mb-4 pr-1">
            {cart.items.map(item => (
              <div key={item.productId} className="flex justify-between items-start text-xs gap-2">
                <span className="line-clamp-1 flex-1 text-[var(--fg-secondary)]">
                  {item.product?.name ?? 'Product'} × {item.quantity}
                </span>
                <span className="font-medium text-[var(--fg)] shrink-0">
                  {formatPrice((item.product?.price ?? 0) * item.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-[var(--border)] pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-[var(--fg-secondary)]">
              <span>Items Total</span>
              <span>{formatPrice(preview?.itemsTotal ?? cart.totalPrice)}</span>
            </div>
            {preview && preview.discountTotal > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Product Discounts</span>
                <span>-{formatPrice(preview.discountTotal)}</span>
              </div>
            )}
            {preview && preview.couponDiscount > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Coupon ({preview.couponCode})</span>
                <span>-{formatPrice(preview.couponDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between text-[var(--fg-secondary)]">
              <span>Delivery Fee</span>
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
              if (!guardRestrictedAction()) return
              placeOrder.mutate()
            }}
          >
            {placeOrder.isPending ? 'Placing Order...' : `Confirm & Place Order`}
          </Button>
          <p className="text-[11px] text-[var(--muted)] mt-2.5 text-center">Secure 256-bit encrypted transaction</p>
        </div>
      </div>

      {/* Address Dialog */}
      <Dialog
        open={showAddressModal}
        onClose={() => {
          setShowAddressModal(false)
          setEditingAddressId(null)
        }}
        title={editingAddressId ? 'Edit Address' : 'Add New Address'}
      >
        <form onSubmit={handleSubmit(handleAddressSubmit)} className="space-y-3.5">
          <Input label="Label" placeholder="Home, Office, etc." error={errors.label?.message} {...register('label')} />
          <Input label="Recipient Name" placeholder="Full name" error={errors.recipientName?.message} {...register('recipientName')} />
          <Input label="Address Line 1" error={errors.addressLine1?.message} {...register('addressLine1')} />
          <Input label="Address Line 2" {...register('addressLine2')} />
          <div className="grid grid-cols-2 gap-3">
            <StateCityFields
              control={control}
              setValue={setValue}
              getValues={getValues}
              originalState={editingAddress?.state}
              originalCity={editingAddress?.city}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="PIN Code" error={errors.pincode?.message} {...register('pincode')} />
            <Input label="Phone (10 digits)" error={errors.phone?.message} {...register('phone')} />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={createAddress.isPending || updateAddress.isPending}
          >
            {createAddress.isPending || updateAddress.isPending
              ? 'Saving...'
              : editingAddressId
              ? 'Update Address'
              : 'Save Address'}
          </Button>
        </form>
      </Dialog>
    </div>
  )
}
