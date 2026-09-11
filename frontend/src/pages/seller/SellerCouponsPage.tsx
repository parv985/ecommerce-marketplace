import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { couponService } from '@/services/coupon.service'
import { productService } from '@/services/product.service'
import { formatDate } from '@/lib/utils'
import { couponInactiveReasons, getCouponState } from '@/lib/couponStatus'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Dialog } from '@/components/ui/Dialog'
import { Pagination } from '@/components/ui/Pagination'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'react-hot-toast'

const couponSchema = z.object({
  code: z.string().min(3, 'Code must be at least 3 characters'),
  type: z.enum(['PERCENTAGE', 'FIXED']),
  value: z.number().min(1),
  minOrderValue: z.number().min(0).default(0),
  maxDiscount: z.number().min(0).optional().nullable(),
  usageLimit: z.number().min(1).optional().nullable(),
  perUserLimit: z.number().min(1).default(1),
  startAt: z.string().min(1, 'Start date is required'),
  endAt: z.string().min(1, 'End date is required'),
  productIds: z.array(z.string()).optional().default([]),
}).superRefine((val, ctx) => {
  if (val.endAt && val.startAt && val.endAt <= val.startAt) {
    ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'End date must be after start date' })
  }
})

type CouponForm = z.infer<typeof couponSchema>

const today = new Date().toISOString().split('T')[0]

export function SellerCouponsPage() {
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()

  /*
   * `status` comes back derived from the current date and the remaining
   * usage limit, and the list is re-fetched periodically so a coupon
   * that expires (or hits its usage limit) while the page is open flips
   * to Inactive on its own.
   */
  const { data } = useQuery({
    queryKey: ['coupons', page],
    queryFn: () => couponService.list({ page }),
    staleTime: 0,
    refetchInterval: 60_000,
  })

  const { data: sellerProducts } = useQuery({
    queryKey: ['sellerProducts'],
    queryFn: () => productService.getMyProducts(),
    enabled: showCreate,
  })

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<z.input<typeof couponSchema>, unknown, CouponForm>({
    resolver: zodResolver(couponSchema),
    defaultValues: {
      code: '',
      type: 'PERCENTAGE',
      value: 10,
      minOrderValue: 0,
      maxDiscount: null,
      usageLimit: null,
      perUserLimit: 1,
      startAt: today,
      endAt: '',
      productIds: [],
    },
  })

  const selectedProducts = watch('productIds') || []

  const create = useMutation({
    mutationFn: (d: CouponForm) => couponService.create({
      code: d.code,
      type: d.type,
      value: d.value,
      minOrderValue: d.minOrderValue,
      maxDiscount: d.maxDiscount || null,
      usageLimit: d.usageLimit || null,
      perUserLimit: d.perUserLimit,
      startAt: d.startAt,
      endAt: d.endAt,
      productIds: d.productIds?.length ? d.productIds : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      // The dashboard reports the live coupon count from the database.
      queryClient.invalidateQueries({ queryKey: ['seller-dashboard'] })
      setShowCreate(false)
      reset()
      toast.success('Coupon created successfully')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to create coupon'),
  })

  return (
    <div>
      <div className="flex justify-between mb-6">
        <h1 className="text-2xl font-bold">Coupons</h1>
        <Button onClick={() => setShowCreate(true)}>Create Coupon</Button>
      </div>
      <div className="space-y-3">
        {(data?.items ?? []).map(c => {
          /*
           * Status is derived (never stale): a coupon whose end date has
           * passed or whose usage limit is exhausted shows as Inactive
           * without the seller having to deactivate it manually.
           */
          const state = getCouponState(c)
          const active = state === 'ACTIVE'
          return (
          <div key={c.id} className="border rounded-lg p-4 flex items-center justify-between">
            <div>
              <span className="font-mono font-bold">{c.code}</span>
              <span className="ml-2 text-sm text-[var(--muted)]">
                {c.type === 'PERCENTAGE' ? `${c.value}% off` : `₹${c.value} off`}
              </span>
              <span className="ml-2 text-xs text-[var(--muted)]">
                Used: {c.usageCount}/{c.usageLimit ?? '∞'}
              </span>
              <span className="ml-2 text-xs text-[var(--muted)]">
                ({formatDate(c.startAt)} - {formatDate(c.endAt)})
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!active && (
                <span className="text-xs text-[var(--muted)]">
                  {couponInactiveReasons[state]}
                </span>
              )}
              <Badge variant={active ? 'success' : 'default'}>
                {active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>
          )
        })}
        {!data?.items?.length && (
          <p className="text-center text-[var(--muted)] py-8">No coupons yet.</p>
        )}
        {data && data.totalPages > 0 && (
          <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} />
        )}
      </div>

      <Dialog open={showCreate} onClose={() => { setShowCreate(false); reset() }} title="Create Coupon">
        <form onSubmit={handleSubmit((d) => create.mutate(d))} className="space-y-4">
          <Input
            label="Coupon Code"
            placeholder="e.g. SAVE20"
            error={errors.code?.message}
            {...register('code')}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Type</label>
              <select className="w-full border rounded px-3 py-2 text-sm" {...register('type')}>
                <option value="PERCENTAGE">Percentage</option>
                <option value="FIXED">Fixed Amount</option>
              </select>
            </div>
            <Input
              label="Value"
              type="number"
              error={errors.value?.message}
              {...register('value', { valueAsNumber: true })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Min Order Value (₹)"
              type="number"
              {...register('minOrderValue', { valueAsNumber: true })}
            />
            <Input
              label="Max Discount (₹, optional)"
              type="number"
              {...register('maxDiscount', { valueAsNumber: true })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Usage Limit (optional)"
              type="number"
              placeholder="Unlimited if empty"
              {...register('usageLimit', { valueAsNumber: true })}
            />
            <Input
              label="Per User Limit"
              type="number"
              {...register('perUserLimit', { valueAsNumber: true })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start Date"
              type="date"
              min={today}
              error={errors.startAt?.message}
              {...register('startAt')}
            />
            <Input
              label="End Date"
              type="date"
              min={today}
              error={errors.endAt?.message}
              {...register('endAt')}
            />
          </div>

          {/* Product selector — seller's own products */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Apply to Products (optional)</label>
            <p className="text-xs text-[var(--muted)]">Leave empty for all products, or select specific products</p>
            <div className="border rounded-lg max-h-40 overflow-y-auto mt-2">
              {(sellerProducts ?? []).length === 0 && (
                <p className="text-xs text-[var(--muted)] p-3">No products found. Create products first.</p>
              )}
              {(sellerProducts ?? []).map(p => (
                <label key={p.id} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 cursor-pointer border-b last:border-b-0">
                  <input
                    type="checkbox"
                    checked={selectedProducts.includes(p.id)}
                    onChange={(e) => {
                      const current = selectedProducts
                      if (e.target.checked) {
                        setValue('productIds', [...current, p.id], { shouldValidate: true })
                      } else {
                        setValue('productIds', current.filter(id => id !== p.id), { shouldValidate: true })
                      }
                    }}
                    className="rounded"
                  />
                  <span className="text-sm">{p.name}</span>
                  <span className="text-xs text-[var(--muted)] ml-auto">₹{p.price}</span>
                </label>
              ))}
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={create.isPending}>
            {create.isPending ? 'Creating...' : 'Create Coupon'}
          </Button>
        </form>
      </Dialog>
    </div>
  )
}
