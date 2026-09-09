import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { discountService } from '@/services/discount.service'
import { productService } from '@/services/product.service'
import { categoryService } from '@/services/category.service'
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

// Must match backend: exactly one of productId or categoryId required
const discountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  discountValue: z.number().min(1, 'Minimum 1%').max(100, 'Maximum 100%'),
  productId: z.string().optional(),
  categoryId: z.string().optional(),
  startAt: z.string().min(1, 'Start date is required'),
  endAt: z.string().min(1, 'End date is required'),
}).superRefine((val, ctx) => {
  if (!val.productId && !val.categoryId) {
    ctx.addIssue({
      code: 'custom',
      path: ['productId'],
      message: 'Select either a Product or a Category',
    })
  }
  if (val.productId && val.categoryId) {
    ctx.addIssue({
      code: 'custom',
      path: ['categoryId'],
      message: 'Select either a Product or a Category, not both',
    })
  }
})

type DiscountForm = z.infer<typeof discountSchema>

const today = new Date().toISOString().split('T')[0]

export function SellerDiscountsPage() {
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['discounts', page],
    queryFn: () => discountService.list({ page }),
  })

  // Fetch seller's own products for dropdown
  const { data: sellerProducts } = useQuery({
    queryKey: ['sellerProducts'],
    queryFn: () => productService.getMyProducts(),
    enabled: showCreate,
  })

  // Fetch all categories for dropdown
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoryService.list(),
    enabled: showCreate,
  })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<DiscountForm>({
    resolver: zodResolver(discountSchema),
    defaultValues: { name: '', discountValue: 15, startAt: today, endAt: '' },
  })

  const [targetType, setTargetType] = useState<'product' | 'category' | ''>('')

  const create = useMutation({
    mutationFn: (d: DiscountForm) => {
      const payload: Record<string, unknown> = {
        discountType: 'PERCENTAGE',
        discountValue: d.discountValue,
        startAt: d.startAt,
        endAt: d.endAt,
      }
      if (d.productId) payload.productId = d.productId
      if (d.categoryId) payload.categoryId = d.categoryId
      return discountService.create(payload as any)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts'] })
      setShowCreate(false)
      setTargetType('')
      reset()
      toast.success('Discount created successfully')
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || 'Failed to create discount')
    },
  })

  return (
    <div>
      <div className="flex justify-between mb-6">
        <h1 className="text-2xl font-bold">Discounts</h1>
        <Button onClick={() => setShowCreate(true)}>Create Discount</Button>
      </div>
      <div className="space-y-3">
        {(data?.items ?? []).map(d => (
          <div key={d.id} className="border rounded-lg p-4 flex items-center justify-between">
            <div>
              <span className="font-medium">
                {d.discountType === 'PERCENTAGE' ? `${d.discountValue}% off` : 'Fixed discount'}
              </span>
              <span className="ml-2 text-xs text-[var(--muted)]">
                ({formatDate(d.startAt)} - {formatDate(d.endAt)})
              </span>
            </div>
            <Badge variant={d.status === 'ACTIVE' ? 'success' : 'default'}>
              {d.status === 'ACTIVE' ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        ))}
        {!data?.items?.length && (
          <p className="text-center text-[var(--muted)] py-8">No discounts yet.</p>
        )}
        {data && data.totalPages > 0 && (
          <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} />
        )}
      </div>

      <Dialog open={showCreate} onClose={() => { setShowCreate(false); setTargetType(''); reset() }} title="Create Discount">
        <form onSubmit={handleSubmit((d) => create.mutate(d))} className="space-y-4">
          <Input
            label="Name"
            error={errors.name?.message}
            {...register('name')}
            placeholder="e.g. Weekend Sale"
          />
          <Input
            label="Percentage (1-100)"
            type="number"
            error={errors.discountValue?.message}
            {...register('discountValue', { valueAsNumber: true })}
          />

          {/* Target selection: Product OR Category */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Apply to</label>
            <p className="text-xs text-[var(--muted)]">Choose either a Product or a Category (required)</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Button
                type="button"
                variant={targetType === 'product' ? 'default' : 'outline'}
                onClick={() => {
                  setTargetType('product')
                  setValue('categoryId', '', { shouldValidate: false })
                }}
                className="text-xs"
              >
                Product
              </Button>
              <Button
                type="button"
                variant={targetType === 'category' ? 'default' : 'outline'}
                onClick={() => {
                  setTargetType('category')
                  setValue('productId', '', { shouldValidate: false })
                }}
                className="text-xs"
              >
                Category
              </Button>
            </div>
          </div>

          {/* Product selector */}
          {targetType === 'product' && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Select Product</label>
              <select
                {...register('productId')}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">-- Choose a product --</option>
                {(sellerProducts ?? []).map(p => (
                  <option key={p.id} value={p.id}>{p.name} (₹{p.price})</option>
                ))}
              </select>
              {errors.productId && (
                <p className="text-xs text-red-500">{errors.productId.message}</p>
              )}
            </div>
          )}

          {/* Category selector */}
          {targetType === 'category' && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Select Category</label>
              <select
                {...register('categoryId')}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">-- Choose a category --</option>
                {(categories ?? []).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {errors.categoryId && (
                <p className="text-xs text-red-500">{errors.categoryId.message}</p>
              )}
            </div>
          )}

          {/* Show validation error if neither is selected and form submitted */}
          {!targetType && (errors.productId || errors.categoryId) && (
            <p className="text-xs text-red-500">
              {errors.productId?.message || errors.categoryId?.message}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input label="Start Date" type="date" min={today} error={errors.startAt?.message} {...register('startAt')} />
            <Input label="End Date" type="date" min={today} error={errors.endAt?.message} {...register('endAt')} />
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending}>
            {create.isPending ? 'Creating...' : 'Create'}
          </Button>
        </form>
      </Dialog>
    </div>
  )
}
