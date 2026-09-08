import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, CreditCard, CheckCircle, AlertCircle } from 'lucide-react'
import { orderService } from '@/services/order.service'
import { paymentService } from '@/services/payment.service'
import { formatPrice } from '@/lib/utils'
import { toast } from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

declare global {
  interface Window {
    Razorpay: any
  }
}

export function PaymentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const razorpayOptionsRef = useRef<any>(null)

  const { data: orderData, isLoading: orderLoading, error: orderError } = useQuery({
    queryKey: ['order', id],
    queryFn: () => orderService.getById(id!),
    enabled: !!id,
  })

  const verifyPayment = useMutation({
    mutationFn: (response: any) => paymentService.verify(id!, {
      paymentId: response.razorpay_payment_id,
      signature: response.razorpay_signature,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toast.success('Payment successful!')
      navigate(`/orders/${id}`)
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Payment verification failed')
      setIsProcessing(false)
      setIsLoading(false)
    },
  })

  const openRazorpay = (options: any) => {
    if (!window.Razorpay || !options) return
    const rzp = new window.Razorpay(options)
    rzp.on('payment.failed', (response: any) => {
      toast.error(response.error?.description || 'Payment failed')
      setIsProcessing(false)
      setIsLoading(false)
    })
    rzp.open()
  }

  const loadRazorpayScript = (options: any) => {
    if (window.Razorpay) {
      openRazorpay(options)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => openRazorpay(options)
    script.onerror = () => {
      toast.error('Failed to load Razorpay checkout. Please try again.')
      setIsProcessing(false)
      setIsLoading(false)
    }
    document.body.appendChild(script)
  }

  const initiatePayment = useMutation({
    mutationFn: () => paymentService.initiate(id!),
    onSuccess: (res) => {
      const payment = res.data
      const options = {
        key: payment.keyId,
        amount: payment.amount,
        currency: 'INR',
        name: 'NexCart Marketplace',
        description: `Order #${orderData?.orderNumber || ''}`,
        order_id: payment.gatewayOrderId,
        handler: async (response: any) => {
          await verifyPayment.mutateAsync(response)
        },
        prefill: {
          name: orderData?.shippingAddress?.recipientName || '',
          contact: orderData?.shippingAddress?.phone || '',
        },
        theme: {
          color: '#000000',
        },
        modal: {
          ondismiss: () => {
            setIsProcessing(false)
            setIsLoading(false)
            toast.error('Payment cancelled')
          },
        },
      }
      razorpayOptionsRef.current = options
      setIsProcessing(true)
      setIsLoading(false)
      loadRazorpayScript(options)
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to initiate payment')
      setIsLoading(false)
      setIsProcessing(false)
    },
  })

  useEffect(() => {
    if (orderData && !initiatePayment.isPending && !initiatePayment.isSuccess) {
      if (orderData.paymentMethod === 'ONLINE' && orderData.paymentStatus !== 'PAID') {
        initiatePayment.mutate()
      } else {
        setIsLoading(false)
      }
    }
  }, [orderData])

  if (orderLoading || isLoading) {
    return (
      <div className="container-app py-20 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)] mx-auto" />
        <p className="mt-4 text-[var(--muted)]">Loading payment...</p>
      </div>
    )
  }

  if (orderError || !orderData) {
    return (
      <div className="container-app py-20 text-center">
        <AlertCircle className="h-12 w-12 text-[var(--destructive)] mx-auto" />
        <h2 className="text-xl font-semibold mt-4">Order not found</h2>
        <Button variant="outline" onClick={() => navigate('/orders')} className="mt-4">
          Back to Orders
        </Button>
      </div>
    )
  }

  if (orderData.paymentStatus === 'PAID') {
    return (
      <div className="container-app py-20 text-center">
        <CheckCircle className="h-16 w-16 text-green-600 mx-auto" />
        <h2 className="text-2xl font-bold mt-4">Payment Already Completed</h2>
        <p className="text-[var(--muted)] mt-2">This order has already been paid for.</p>
        <Button onClick={() => navigate(`/orders/${id}`)} className="mt-6">
          View Order
        </Button>
      </div>
    )
  }

  if (orderData.paymentMethod !== 'ONLINE') {
    return (
      <div className="container-app py-20 text-center">
        <AlertCircle className="h-12 w-12 text-[var(--destructive)] mx-auto" />
        <h2 className="text-xl font-semibold mt-4">Online Payment Required</h2>
        <p className="text-[var(--muted)] mt-2">This order does not require online payment.</p>
        <Button onClick={() => navigate(`/orders/${id}`)} className="mt-6">
          View Order
        </Button>
      </div>
    )
  }

  return (
    <div className="container-app py-12 max-w-md mx-auto">
      <Card>
        <CardHeader className="text-center">
          <CreditCard className="h-12 w-12 text-[var(--primary)] mx-auto mb-3" />
          <CardTitle>Complete Payment</CardTitle>
          <p className="text-[var(--muted)]">Order #{orderData.orderNumber}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Items Total</span>
              <span>{formatPrice(orderData.itemsTotal)}</span>
            </div>
            {orderData.discountTotal > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Sale Discount</span>
                <span>-{formatPrice(orderData.discountTotal)}</span>
              </div>
            )}
            {orderData.couponDiscount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Coupon ({orderData.couponCode})</span>
                <span>-{formatPrice(orderData.couponDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t pt-2 text-lg">
              <span>Total</span>
              <span>{formatPrice(orderData.total)}</span>
            </div>
          </div>

          {isProcessing ? (
            <div className="flex items-center justify-center gap-2 text-[var(--primary)]">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Opening Razorpay checkout...</span>
            </div>
          ) : (
            <Button
              className="w-full"
              size="lg"
              onClick={() => initiatePayment.mutate()}
              disabled={initiatePayment.isPending}
            >
              {initiatePayment.isPending ? 'Initializing...' : `Pay ${formatPrice(orderData.total)}`}
            </Button>
          )}

          <p className="text-center text-xs text-[var(--muted)]">
            Secure payment powered by Razorpay (Test Mode)
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
