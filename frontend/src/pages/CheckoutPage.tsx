import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'react-hot-toast'
import { useCart } from '@/hooks/useCart'
import { userService } from '@/services/user.service'
import { orderService } from '@/services/order.service'
import { formatPrice } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'

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
  const [selectedAddress, setSelectedAddress] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'ONLINE'>('COD')
  const [couponCode, setCouponCode] = useState('')
  const [showNewAddress, setShowNewAddress] = useState(false)

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
      couponCode: couponCode || undefined,
    }),
    onSuccess: (res) => {
      const orders = res.data
      if (paymentMethod === 'ONLINE' && orders.length > 0) {
        navigate(`/orders/${orders[0]._id}/pay`)
      } else {
        toast.success('Order(s) placed successfully!')
        navigate('/orders')
      }
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to place order'),
  })

  if (!cart || !cart.items || cart.items.length === 0) {
    return <div className="container-app py-10 text-center">Your cart is empty. <a href="/products" className="underline">Browse products</a></div>
  }

  return (
    <div className="container-app py-8">
      <h1 className="text-2xl font-bold mb-6">Checkout</h1>
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
                <div className="space-y-2">
                  {addresses.map(addr => (
                    <label key={addr.id} className={`block border rounded p-3 cursor-pointer ${selectedAddress === addr.id ? 'border-[var(--primary)] bg-blue-50' : ''}`}>
                      <input type="radio" name="address" value={addr.id} checked={selectedAddress === addr.id} onChange={() => setSelectedAddress(addr.id)} className="mr-2" />
                      <span className="font-medium text-sm">{addr.label}</span>
                      <p className="text-sm text-[var(--muted)] ml-5">{addr.addressLine1}{addr.addressLine2 ? `, ${addr.addressLine2}` : ''}, {addr.city}, {addr.state} - {addr.pincode}</p>
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
              <div className="space-y-2">
                <label className={`block border rounded p-3 cursor-pointer ${paymentMethod === 'COD' ? 'border-[var(--primary)] bg-blue-50' : ''}`}>
                  <input type="radio" name="payment" value="COD" checked={paymentMethod === 'COD'} onChange={() => setPaymentMethod('COD')} className="mr-2" />
                  Cash on Delivery
                </label>
                <label className={`block border rounded p-3 cursor-pointer ${paymentMethod === 'ONLINE' ? 'border-[var(--primary)] bg-blue-50' : ''}`}>
                  <input type="radio" name="payment" value="ONLINE" checked={paymentMethod === 'ONLINE'} onChange={() => setPaymentMethod('ONLINE')} className="mr-2" />
                  Pay Online (Razorpay)
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Coupon */}
          <Card>
            <CardContent>
              <div className="flex gap-2">
                <Input placeholder="Enter coupon code" value={couponCode} onChange={e => setCouponCode(e.target.value)} />
                <Button variant="outline" onClick={() => couponCode && toast.success('Coupon applied! Discount will be calculated server-side.')}>Apply</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Order Summary */}
        <div className="border rounded-lg p-6 h-fit">
          <h2 className="font-semibold mb-4">Order Summary</h2>
          <div className="space-y-2 text-sm">
            {cart.items.map(item => item.product && (
              <div key={item.productId} className="flex justify-between">
                <span className="text-[var(--muted)] truncate mr-2">{item.product.name} x{item.quantity}</span>
                <span className="shrink-0">{formatPrice((item.product?.price ?? 0) * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="border-t mt-4 pt-4 space-y-2 text-sm font-semibold">
            <div className="flex justify-between">
              <span>Total (from server)</span>
              <span>{formatPrice(cart.totalPrice)}</span>
            </div>
          </div>
          <Button
            className="w-full mt-4"
            disabled={!selectedAddress || placeOrder.isPending}
            onClick={() => placeOrder.mutate()}
          >
            {placeOrder.isPending ? 'Placing Order...' : `Place Order - ${formatPrice(cart.totalPrice)}`}
          </Button>
          <p className="text-[10px] text-[var(--muted)] mt-2 text-center">Final price and discounts calculated server-side</p>
        </div>
      </div>

      {/* New Address Dialog */}
      <Dialog open={showNewAddress} onClose={() => setShowNewAddress(false)} title="Add New Address">
        <form onSubmit={handleSubmit((data) => createAddress.mutate(data))} className="space-y-3">
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
