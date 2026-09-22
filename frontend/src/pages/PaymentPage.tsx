import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, CreditCard, CheckCircle, AlertCircle, ShieldCheck, Smartphone, Landmark } from 'lucide-react'
import { orderService } from '@/services/order.service'
import { paymentService } from '@/services/payment.service'
import { formatPrice, cn } from '@/lib/utils'
import { toast } from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Badge } from '@/components/ui/Badge'
import type { Payment } from '@/types/api'

declare global {
  interface Window {
    Razorpay: any
  }
}

async function computeMockSignature(gatewayOrderId: string, paymentId: string): Promise<string> {
  const secret = 'mock-payment-signing-secret'
  const enc = new TextEncoder()
  const key = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const data = enc.encode(`${gatewayOrderId}|${paymentId}`)
  const signature = await window.crypto.subtle.sign('HMAC', key, data)
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function PaymentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showMockModal, setShowMockModal] = useState(false)
  const [mockPaymentRecord, setMockPaymentRecord] = useState<Payment | null>(null)
  const [selectedSimMethod, setSelectedSimMethod] = useState<'upi' | 'card' | 'netbanking'>('upi')
  const razorpayOptionsRef = useRef<any>(null)

  const { data: orderData, isLoading: orderLoading, error: orderError } = useQuery({
    queryKey: ['order', id],
    queryFn: () => orderService.getById(id!),
    enabled: !!id,
  })

  const verifyPayment = useMutation({
    mutationFn: (data: { paymentId: string; signature: string }) => paymentService.verify(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      setShowMockModal(false)
      setIsProcessing(false)
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
    try {
      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', (response: any) => {
        toast.error(response.error?.description || 'Payment failed')
        setIsProcessing(false)
        setIsLoading(false)
      })
      rzp.open()
    } catch (e: any) {
      console.error('Error opening Razorpay checkout:', e)
      toast.error('Failed to open Razorpay checkout')
      setIsProcessing(false)
      setIsLoading(false)
    }
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
      setIsLoading(false)

      // When Razorpay keys are not configured or in mock mode, use our interactive mock modal
      // rather than passing mock credentials to Razorpay CDN (which gets stuck on the loading shield).
      if (payment.gateway === 'MOCK' || !payment.keyId) {
        setMockPaymentRecord(payment)
        setShowMockModal(true)
        setIsProcessing(false)
        return
      }

      // Live / Sandbox Razorpay credentials flow
      const amountInPaise = Math.round(payment.amount * 100)
      const options = {
        key: payment.keyId,
        amount: amountInPaise,
        currency: payment.currency || 'INR',
        name: 'NexCart Marketplace',
        description: `Order #${orderData?.orderNumber || ''}`,
        order_id: payment.gatewayOrderId,
        handler: async (response: any) => {
          await verifyPayment.mutateAsync({
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          })
        },
        prefill: {
          name: orderData?.shippingAddress?.recipientName || '',
          contact: orderData?.shippingAddress?.phone || '',
        },
        theme: {
          color: '#191816',
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
      loadRazorpayScript(options)
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to initiate payment')
      setIsLoading(false)
      setIsProcessing(false)
    },
  })

  const handleSimulatePayment = async () => {
    if (!mockPaymentRecord) return
    setIsProcessing(true)
    try {
      const mockPaymentId = `pay_mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
      const signature = await computeMockSignature(mockPaymentRecord.gatewayOrderId, mockPaymentId)
      await verifyPayment.mutateAsync({
        paymentId: mockPaymentId,
        signature,
      })
    } catch (err: any) {
      toast.error(err?.message || 'Mock payment simulation failed')
      setIsProcessing(false)
    }
  }

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
            Secure payment powered by Razorpay
          </p>
        </CardContent>
      </Card>

      {/* Mock Razorpay Checkout Dialog */}
      <Dialog
        open={showMockModal}
        onClose={() => {
          setShowMockModal(false)
          setIsProcessing(false)
        }}
        title="Razorpay Checkout"
        className="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
                R
              </div>
              <div>
                <p className="font-semibold text-sm text-[var(--fg)]">NexCart Marketplace</p>
                <p className="text-xs text-[var(--muted)]">Order #{orderData.orderNumber}</p>
              </div>
            </div>
            <Badge variant="warning">Test Mode</Badge>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-[var(--radius)] border border-slate-200 flex justify-between items-center">
            <span className="text-sm text-[var(--muted)] font-medium">Amount to Pay</span>
            <span className="text-xl font-bold text-[var(--fg)]">{formatPrice(orderData.total)}</span>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">Simulated Payment Method</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedSimMethod('upi')}
                className={cn(
                  'p-2.5 rounded-[var(--radius)] border text-center transition-all flex flex-col items-center gap-1 cursor-pointer',
                  selectedSimMethod === 'upi' ? 'border-blue-600 bg-blue-50/70 text-blue-700 font-medium shadow-xs' : 'border-[var(--border)] hover:bg-slate-50 text-[var(--fg-secondary)]'
                )}
              >
                <Smartphone size={18} />
                <span className="text-xs">UPI</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedSimMethod('card')}
                className={cn(
                  'p-2.5 rounded-[var(--radius)] border text-center transition-all flex flex-col items-center gap-1 cursor-pointer',
                  selectedSimMethod === 'card' ? 'border-blue-600 bg-blue-50/70 text-blue-700 font-medium shadow-xs' : 'border-[var(--border)] hover:bg-slate-50 text-[var(--fg-secondary)]'
                )}
              >
                <CreditCard size={18} />
                <span className="text-xs">Card</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedSimMethod('netbanking')}
                className={cn(
                  'p-2.5 rounded-[var(--radius)] border text-center transition-all flex flex-col items-center gap-1 cursor-pointer',
                  selectedSimMethod === 'netbanking' ? 'border-blue-600 bg-blue-50/70 text-blue-700 font-medium shadow-xs' : 'border-[var(--border)] hover:bg-slate-50 text-[var(--fg-secondary)]'
                )}
              >
                <Landmark size={18} />
                <span className="text-xs">NetBanking</span>
              </button>
            </div>
          </div>

          <div className="text-xs text-[var(--muted)] bg-blue-50/60 p-2.5 rounded-[var(--radius)] border border-blue-100 flex items-start gap-2">
            <ShieldCheck size={16} className="text-blue-600 shrink-0 mt-0.5" />
            <span>
              This is a sandbox Razorpay simulation. Click below to verify and complete the transaction without real money.
            </span>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="w-1/3"
              onClick={() => {
                setShowMockModal(false)
                setIsProcessing(false)
              }}
              disabled={isProcessing || verifyPayment.isPending}
            >
              Cancel
            </Button>
            <Button
              className="w-2/3 bg-blue-600 hover:bg-blue-700 text-white font-medium"
              onClick={handleSimulatePayment}
              disabled={isProcessing || verifyPayment.isPending}
            >
              {isProcessing || verifyPayment.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Verifying...
                </>
              ) : (
                `Pay ${formatPrice(orderData.total)}`
              )}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
