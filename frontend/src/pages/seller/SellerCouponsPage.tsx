import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { couponService } from '@/services/coupon.service'
import { formatDate } from '@/lib/utils'
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
  code: z.string().min(3), discountType: z.enum(['PERCENTAGE', 'FIXED']),
  discountValue: z.number().min(1), minOrderAmount: z.number().min(0).default(0),
  totalUsageLimit: z.number().min(1), perUserLimit: z.number().min(1).default(1),
  startDate: z.string().min(1), endDate: z.string().min(1),
  productId: z.string().optional(), categoryId: z.string().optional(),
})
type CouponForm = z.infer<typeof couponSchema>

export function SellerCouponsPage() {
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['coupons', page], queryFn: () => couponService.list({ page }) })
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CouponForm>({ resolver: zodResolver(couponSchema) })

  const create = useMutation({
    mutationFn: (d: CouponForm) => couponService.create({ ...d, productId: d.productId || undefined, categoryId: d.categoryId || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['coupons'] }); setShowCreate(false); reset(); toast.success('Coupon created') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  return (
    <div>
      <div className="flex justify-between mb-6">
        <h1 className="text-2xl font-bold">Coupons</h1>
        <Button onClick={() => setShowCreate(true)}>Create Coupon</Button>
      </div>
      <div className="space-y-3">
        {data?.items?.map(c => (
          <div key={c._id} className="border rounded-lg p-4 flex items-center justify-between">
            <div>
              <span className="font-mono font-bold">{c.code}</span>
              <span className="ml-2 text-sm text-[var(--muted)]">
                {c.discountType === 'PERCENTAGE' ? `${c.discountValue}% off` : `₹${c.discountValue} off`}
              </span>
              <span className="ml-2 text-xs text-[var(--muted)]">Used: {c.usedCount}/{c.totalUsageLimit}</span>
            </div>
            <Badge variant={c.isActive ? 'success' : 'default'}>{c.isActive ? 'Active' : 'Inactive'}</Badge>
          </div>
        ))}
        {data && <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} />}
      </div>

      <Dialog open={showCreate} onClose={() => { setShowCreate(false); reset(); }} title="Create Coupon">
        <form onSubmit={handleSubmit((d) => create.mutate(d))} className="space-y-3">
          <Input label="Code" placeholder="SAVE20" error={errors.code?.message} {...register('code')} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Type</label>
              <select className="w-full border rounded px-3 py-2 text-sm" {...register('discountType')}>
                <option value="PERCENTAGE">Percentage</option>
                <option value="FIXED">Fixed Amount</option>
              </select>
            </div>
            <Input label="Value" type="number" error={errors.discountValue?.message} {...register('discountValue', { valueAsNumber: true })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Min Order (₹)" type="number" {...register('minOrderAmount', { valueAsNumber: true })} />
            <Input label="Total Usage Limit" type="number" {...register('totalUsageLimit', { valueAsNumber: true })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start Date" type="date" error={errors.startDate?.message} {...register('startDate')} />
            <Input label="End Date" type="date" error={errors.endDate?.message} {...register('endDate')} />
          </div>
          <Input label="Product ID (optional)" {...register('productId')} />
          <Input label="Category ID (optional)" {...register('categoryId')} />
          <Button type="submit" className="w-full">Create Coupon</Button>
        </form>
      </Dialog>
    </div>
  )
}
