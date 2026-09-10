import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Star } from 'lucide-react'
import { orderService } from '@/services/order.service'
import { reviewService } from '@/services/review.service'
import { formatPrice, formatDate, formatDateFull } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { ReviewDialog } from '@/components/reviews/ReviewDialog'
import { toast } from 'react-hot-toast'
import type { OrderItem, Review } from '@/types/api'

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error' | 'secondary'> = {
  PENDING: 'warning',
  CONFIRMED: 'secondary',
  SHIPPED: 'secondary',
  DELIVERED: 'success',
  CANCELLED: 'error',
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [reviewingItem, setReviewingItem] = useState<OrderItem | null>(null)
  const [existingReview, setExistingReview] = useState<Review | null>(null)

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => orderService.getById(id!),
    enabled: !!id,
  })

  const { data: tracking } = useQuery({
    queryKey: ['tracking', id],
    queryFn: () => orderService.getTracking(id!),
    enabled: !!id,
  })

  const { data: invoice } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => orderService.getInvoice(id!),
    enabled: !!id && order?.status === 'DELIVERED',
  })

  const cancelOrder = useMutation({
    mutationFn: () => orderService.cancel(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      toast.success('Order cancelled')
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Cannot cancel'),
  })

  const markPaid = useMutation({
    mutationFn: () => orderService.markPaid(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      toast.success('Payment recorded')
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed'),
  })

  const handleOpenReview = async (item: OrderItem) => {
    try {
      // Check if user already reviewed this product
      const reviewsData = await reviewService.getProductReviews(item.productId, 1, 50)
      const reviewsList = reviewsData.items ?? reviewsData.reviews ?? []
      const myReview = reviewsList.find((r) => r.productId === item.productId)
      setExistingReview(myReview || null)
    } catch {
      setExistingReview(null)
    }
    setReviewingItem(item)
  }

  if (isLoading) {
    return (
      <div className="container-app py-8 space-y-4">
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )
  }
  if (!order) return <div className="text-center py-20">Order not found</div>

  const canCancel = ['PENDING', 'CONFIRMED'].includes(order.status)
  const canPay = order.paymentMethod === 'COD' && order.paymentStatus === 'UNPAID' && order.status === 'DELIVERED'
  const isDelivered = order.status === 'DELIVERED'

  return (
    <div className="container-app py-8">
      <Link
        to="/orders"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)] mb-6 font-medium transition-colors"
      >
        <ArrowLeft size={16} /> Back to orders
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Order #{order.orderNumber}</h1>
          <p className="text-sm text-[var(--muted)]">Placed on {formatDateFull(order.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={statusColors[order.status]}>{order.status}</Badge>
          <Badge variant={order.paymentStatus === 'PAID' ? 'success' : 'warning'}>
            {order.paymentStatus}
          </Badge>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Items */}
          <div className="border border-[var(--border)] rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-sm)]">
            <h2 className="font-semibold mb-3">Items</h2>
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-3 border-b last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  {item.image && (
                    <img
                      src={item.image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-12 h-12 rounded object-cover border border-[var(--border)]"
                    />
                  )}
                  <div className="min-w-0">
                    <Link
                      to={`/products/${item.productId}`}
                      className="text-sm font-medium hover:text-[var(--primary)] truncate block transition-colors"
                    >
                      {item.name}
                    </Link>
                    <p className="text-xs text-[var(--muted)]">
                      Qty: {item.quantity} · {formatPrice(item.subtotal)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {isDelivered && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenReview(item)}
                      className="text-xs gap-1"
                    >
                      <Star size={12} className="fill-amber-400 text-amber-400" /> Review
                    </Button>
                  )}
                  <span className="text-sm font-medium">{formatPrice(item.subtotal)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Timeline */}
          {tracking?.timeline && tracking.timeline.length > 0 && (
            <div className="border border-[var(--border)] rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-sm)]">
              <h2 className="font-semibold mb-3">Order Tracking</h2>
              <div className="space-y-3">
                {tracking.timeline.map((t, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-[var(--primary)] mt-1.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{t.status}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {formatDateFull(t.createdAt)}
                        {t.reason ? ` - ${t.reason}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invoice */}
          {invoice && (
            <div className="border border-[var(--border)] rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-sm)]">
              <h2 className="font-semibold mb-3">Invoice</h2>
              <p className="text-sm text-[var(--muted)]">Invoice: {invoice.invoiceNumber}</p>
              <p className="text-sm text-[var(--muted)]">Date: {formatDate(invoice.orderDate)}</p>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatPrice(invoice.itemsTotal)}</span>
                </div>
                {invoice.discountTotal > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-{formatPrice(invoice.discountTotal)}</span>
                  </div>
                )}
                {invoice.couponDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Coupon</span>
                    <span>-{formatPrice(invoice.couponDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Tax (GST {invoice.taxRate}%)</span>
                  <span>{formatPrice(invoice.taxAmount)}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1">
                  <span>Total</span>
                  <span>{formatPrice(invoice.total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Summary Sidebar */}
        <div className="space-y-4">
          <div className="border border-[var(--border)] rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-sm)]">
            <h2 className="font-semibold mb-3">Payment Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatPrice(order.itemsTotal)}</span>
              </div>
              {order.discountTotal > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>-{formatPrice(order.discountTotal)}</span>
                </div>
              )}
              {order.couponDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Coupon{order.couponCode ? ` (${order.couponCode})` : ''}</span>
                  <span>-{formatPrice(order.couponDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold border-t pt-2">
                <span>Total</span>
                <span>{formatPrice(order.total)}</span>
              </div>
            </div>
            <p className="text-xs text-[var(--muted)] mt-2">Payment: {order.paymentMethod}</p>
          </div>

          {/* Shipping */}
          <div className="border border-[var(--border)] rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-sm)]">
            <h2 className="font-semibold mb-2">Shipping Address</h2>
            <p className="text-sm">{order.shippingAddress?.addressLine1}</p>
            <p className="text-sm">
              {order.shippingAddress?.city}, {order.shippingAddress?.state} {order.shippingAddress?.pincode}
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            {canCancel && (
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => cancelOrder.mutate()}
                disabled={cancelOrder.isPending}
              >
                Cancel Order
              </Button>
            )}
            {canPay && (
              <Button className="w-full" onClick={() => markPaid.mutate()} disabled={markPaid.isPending}>
                Mark as Paid
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Review Dialog from Order */}
      {reviewingItem && (
        <ReviewDialog
          open={!!reviewingItem}
          onClose={() => setReviewingItem(null)}
          productId={reviewingItem.productId}
          productName={reviewingItem.name}
          productImage={reviewingItem.image}
          existingReview={existingReview}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['reviews', reviewingItem.productId] })
          }}
        />
      )}
    </div>
  )
}
