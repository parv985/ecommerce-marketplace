import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit, Trash2 } from 'lucide-react'
import { productService } from '@/services/product.service'
import { categoryService } from '@/services/category.service'
import { formatPrice } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { TextArea } from '@/components/ui/TextArea'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'react-hot-toast'
import { useSellerErrorHandler } from '@/hooks/useSellerErrorHandler'

const productSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(10),
  price: z.number().min(1),
  sku: z.string().min(1),
  stock: z.number().min(0),
  category: z.string().min(1),
})
type ProductForm = z.infer<typeof productSchema>

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  ACTIVE: 'success', DRAFT: 'warning', INACTIVE: 'error',
}

export function SellerProductsPage() {
  const navigate = useNavigate()
  const { handleSellerError } = useSellerErrorHandler()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const { data: products, isLoading } = useQuery({ queryKey: ['my-products'], queryFn: productService.getMyProducts })
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: categoryService.list })
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProductForm>({ resolver: zodResolver(productSchema) })

  // Load product data when editing
  useEffect(() => {
    if (editId && products) {
      const product = products.find(p => p.id === editId)
      if (product) {
        reset({
          name: product.name,
          description: product.description || '',
          price: product.price,
          sku: product.sku || '',
          stock: product.stock,
          category: typeof product.category === 'object' ? product.category?.id : product.category || '',
        })
      }
    }
  }, [editId, products, reset])

  const createProduct = useMutation({
    mutationFn: (data: ProductForm) => productService.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['my-products'] }); setShowCreate(false); reset(); toast.success('Product created') },
    onError: (err: any) => handleSellerError(err, 'Failed to create product'),
  })

  const deleteProduct = useMutation({
    mutationFn: (id: string) => productService.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['my-products'] }); toast.success('Product deactivated') },
  })

  const updateProduct = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProductForm> }) => productService.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['my-products'] }); setShowCreate(false); setEditId(null); reset(); toast.success('Product updated') },
    onError: (err: any) => handleSellerError(err, 'Failed to update product'),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Products</h1>
        <Button onClick={() => setShowCreate(true)}><Plus size={16} className="mr-1" /> Add Product</Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-zinc-100 rounded animate-pulse" />)}</div>
      ) : !products?.length ? (
        <div className="text-center py-12 text-[var(--muted)]">No products yet. Add your first product!</div>
      ) : (
        <div className="space-y-3">
          {products.map(p => (
            <div key={p.id} className="flex items-center gap-4 p-4 border rounded-lg">
              <div className="w-16 h-16 bg-zinc-100 rounded overflow-hidden shrink-0">
                {p.images?.[0]?.url ? <img src={p.images[0].url} alt="" className="w-full h-full object-cover" /> : null}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{p.name}</span>
                  <Badge variant={statusColors[p.status]}>{p.status}</Badge>
                </div>
                <p className="text-xs text-[var(--muted)]">{formatPrice(p.price)} • Stock: {p.stock} • SKU: {p.sku}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditId(p.id)}><Edit size={14} /></Button>
                <Button variant="ghost" size="sm" onClick={() => deleteProduct.mutate(p.id)}><Trash2 size={14} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreate || !!editId} onClose={() => { setShowCreate(false); setEditId(null); reset(); }} title={editId ? 'Edit Product' : 'Add Product'}>
        <form onSubmit={handleSubmit((d) => {
  if (editId) {
    updateProduct.mutate({ id: editId, data: d })
  } else {
    createProduct.mutate(d)
  }
})} className="space-y-3">
          <Input label="Name" error={errors.name?.message} {...register('name')} />
          <TextArea label="Description" error={errors.description?.message} {...register('description')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Price (₹)" type="number" error={errors.price?.message} {...register('price', { valueAsNumber: true })} />
            <Input label="SKU" error={errors.sku?.message} {...register('sku')} />
          </div>
          <Input label="Stock" type="number" error={errors.stock?.message} {...register('stock', { valueAsNumber: true })} />
          <div>
            <label className="block text-sm font-medium mb-1.5">Category</label>
            <select className="w-full border rounded px-3 py-2 text-sm" {...register('category')}>
              <option value="">Select category</option>
              {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <Button type="submit" className="w-full" disabled={createProduct.isPending || updateProduct.isPending}>
  {createProduct.isPending || updateProduct.isPending ? 'Saving...' : editId ? 'Update Product' : 'Create Product'}
</Button>
        </form>
      </Dialog>
    </div>
  )
}
