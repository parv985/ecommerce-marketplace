import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit, Trash2, ImagePlus, CheckCircle2 } from 'lucide-react'
import { productService } from '@/services/product.service'
import { categoryService } from '@/services/category.service'
import { formatPrice } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { Input } from '@/components/ui/Input'
import { TextArea } from '@/components/ui/TextArea'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'react-hot-toast'
import { useSellerErrorHandler } from '@/hooks/useSellerErrorHandler'
import { getChangedFields, notifyNoChanges } from '@/lib/formChanges'
import type { Product } from '@/types/api'

/** Mirrors the backend limit: `POST /products/:id/images` takes 8 files and the service rejects more. */
const MAX_IMAGES = 8

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

/**
 * The dialog either creates a new product (`productId: null`) or is bound to an
 * existing one. `step` chooses between the detail fields and the image manager;
 * `justCreated` marks the hand-off right after creation, so the seller lands on
 * the images step for a product that finally has an id to upload against.
 * `originalValues` is the snapshot the product had when the dialog opened —
 * submitting an untouched edit form is compared against it, so a no-op update
 * never reaches the API.
 */
interface DialogState {
  productId: string | null
  step: 'details' | 'images'
  justCreated: boolean
  originalValues: ProductForm | null
}

/** Maps a product onto the form fields (kept in sync with `openEditDialog`). */
function productToFormValues(product: Product): ProductForm {
  return {
    name: product.name,
    description: product.description || '',
    price: product.price,
    sku: product.sku || '',
    stock: product.stock,
    category: typeof product.category === 'object' ? product.category?.id ?? '' : product.category || '',
  }
}

export function SellerProductsPage() {
  const { handleSellerError } = useSellerErrorHandler()
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<DialogState | null>(null)
  /* Files chosen by the seller that have not reached Cloudinary yet. */
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [deletingPublicId, setDeletingPublicId] = useState<string | null>(null)

  const { data: products, isLoading } = useQuery({ queryKey: ['my-products'], queryFn: productService.getMyProducts })
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: categoryService.list })
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProductForm>({ resolver: zodResolver(productSchema) })

  const productId = dialog?.productId ?? null
  const dialogProduct = productId ? products?.find(p => p.id === productId) : undefined
  const existingImages = dialogProduct?.images ?? []
  const isImagesStep = dialog?.step === 'images'

  /*
   * Images are rendered all over the app (shop grid, product page, cart,
   * wishlist), so a change here refreshes the seller list and the catalog.
   */
  function refreshProductQueries() {
    queryClient.invalidateQueries({ queryKey: ['my-products'] })
    queryClient.invalidateQueries({ queryKey: ['products'] })
    queryClient.invalidateQueries({ queryKey: ['product'] })
  }

  /* Patches the list cache so an upload/delete shows instantly, before the refetch lands. */
  function patchImages(targetId: string, apply: (images: Product['images']) => Product['images']) {
    queryClient.setQueryData<Product[]>(['my-products'], (old) =>
      old?.map(p => (p.id === targetId ? { ...p, images: apply(p.images ?? []) } : p)),
    )
  }

  function closeDialog() {
    setDialog(null)
    setPendingFiles([])
    reset()
  }

  const uploadImages = useMutation({
    mutationFn: ({ targetId, files }: { targetId: string; files: File[] }) => productService.uploadImages(targetId, files),
    onSuccess: (res, vars) => {
      const uploaded = res.data ?? []
      if (uploaded.length > 0) patchImages(vars.targetId, (images) => [...images, ...uploaded])
      /* Cleared only on success: a failed upload leaves the files staged for a retry. */
      setPendingFiles([])
      refreshProductQueries()
      toast.success(uploaded.length === 1 ? 'Image uploaded' : `${uploaded.length} images uploaded`)
    },
    onError: (err: any) => handleSellerError(err, 'Failed to upload images'),
  })

  const deleteImage = useMutation({
    mutationFn: ({ targetId, publicId }: { targetId: string; publicId: string }) => productService.deleteImage(targetId, publicId),
    onMutate: (vars) => { setDeletingPublicId(vars.publicId) },
    onSuccess: (_res, vars) => {
      patchImages(vars.targetId, (images) => images.filter(img => img.publicId !== vars.publicId))
      refreshProductQueries()
      toast.success('Image removed')
    },
    onError: (err: any) => handleSellerError(err, 'Failed to delete image'),
    onSettled: () => { setDeletingPublicId(null) },
  })

  const createProduct = useMutation({
    mutationFn: (data: ProductForm) => productService.create(data),
    onSuccess: (res) => {
      const created = res.data
      refreshProductQueries()
      if (!created?.id) {
        closeDialog()
        toast.success('Product created')
        return
      }
      /* Seed the list with the created product so the image step has data immediately. */
      queryClient.setQueryData<Product[]>(['my-products'], (old) => {
        const list = old ?? []
        return list.some(p => p.id === created.id)
          ? list.map(p => (p.id === created.id ? { ...p, ...created } : p))
          : [created, ...list]
      })
      setDialog({ productId: created.id, step: 'images', justCreated: true, originalValues: productToFormValues(created) })
      if (pendingFiles.length > 0) {
        uploadImages.mutate({ targetId: created.id, files: pendingFiles })
      } else {
        toast.success('Product created — now add its images')
      }
    },
    onError: (err: any) => handleSellerError(err, 'Failed to create product'),
  })

  const updateProduct = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProductForm> }) => productService.update(id, data),
    onSuccess: (_res, vars) => {
      refreshProductQueries()
      if (pendingFiles.length > 0) {
        uploadImages.mutate({ targetId: vars.id, files: pendingFiles })
      } else {
        closeDialog()
      }
      toast.success('Product updated')
    },
    onError: (err: any) => handleSellerError(err, 'Failed to update product'),
  })

  const deleteProduct = useMutation({
    mutationFn: (id: string) => productService.delete(id),
    onSuccess: () => { refreshProductQueries(); toast.success('Product deactivated') },
    onError: (err: any) => handleSellerError(err, 'Failed to deactivate product'),
  })

  const isSaving = createProduct.isPending || updateProduct.isPending

  function openCreateDialog() {
    reset()
    setPendingFiles([])
    setDialog({ productId: null, step: 'details', justCreated: false, originalValues: null })
  }

  /* Prefilled from the row data, so the fields are set before the dialog paints. */
  function openEditDialog(product: Product, step: DialogState['step'] = 'details') {
    const originalValues = productToFormValues(product)
    reset(originalValues)
    setPendingFiles([])
    setDialog({ productId: product.id, step, justCreated: false, originalValues })
  }

  /*
   * Update guard for the edit dialog: a form nobody touched must never reach the
   * API. Only the fields that actually differ are sent (PATCH semantics), and
   * staged image files still count as a change — they are uploaded rather than
   * silently dropped, which is what the seller expects from "Save & Upload".
   */
  function submitDetails(values: ProductForm) {
    if (!productId) {
      createProduct.mutate(values)
      return
    }

    const changed = getChangedFields(values, dialog?.originalValues ?? null)

    if (Object.keys(changed).length === 0) {
      if (pendingFiles.length > 0) {
        uploadImages.mutate({ targetId: productId, files: pendingFiles })
        return
      }
      notifyNoChanges()
      return
    }

    updateProduct.mutate({ id: productId, data: changed })
  }

  function handleFilesSelected(files: File[]) {
    setPendingFiles(prev => {
      const room = Math.max(0, MAX_IMAGES - existingImages.length)
      return [...prev, ...files].slice(0, room)
    })
  }

  /*
   * Upload and delete both need a persisted product, so those callbacks are
   * withheld while the product is still being created - which also hides the
   * component's upload button, since the staged files ride along with the create.
   */
  const imageUploadProps = {
    existingImages,
    pendingFiles,
    maxImages: MAX_IMAGES,
    isUploading: uploadImages.isPending,
    deletingPublicId,
    onFilesSelected: handleFilesSelected,
    onRemovePendingFile: (index: number) => setPendingFiles(prev => prev.filter((_, i) => i !== index)),
    onImageDelete: productId ? (publicId: string) => deleteImage.mutate({ targetId: productId, publicId }) : undefined,
    onUploadPending: productId ? () => uploadImages.mutate({ targetId: productId, files: pendingFiles }) : undefined,
  }

  const fileCountLabel = pendingFiles.length > 0
    ? `Upload ${pendingFiles.length} Image${pendingFiles.length === 1 ? '' : 's'}`
    : null

  const submitLabel = isSaving
    ? 'Saving...'
    : fileCountLabel
      ? `${productId ? 'Save' : 'Create Product'} & ${fileCountLabel}`
      : productId
        ? 'Update Product'
        : 'Create Product'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Products</h1>
        <Button onClick={openCreateDialog}><Plus size={16} className="mr-1" /> Add Product</Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-zinc-100 rounded animate-pulse" />)}</div>
      ) : !products?.length ? (
        <div className="text-center py-12 text-[var(--muted)]">No products yet. Add your first product!</div>
      ) : (
        <div className="space-y-3">
          {products.map(p => (
            <div key={p.id} className="flex items-center gap-4 p-4 border rounded-lg">
              <button
                type="button"
                onClick={() => openEditDialog(p, 'images')}
                title={p.images?.length ? 'Manage images' : 'Add images'}
                className="relative w-16 h-16 bg-zinc-100 rounded overflow-hidden shrink-0 cursor-pointer group"
              >
                {p.images?.[0]?.url ? <img src={p.images[0].url} alt="" className="w-full h-full object-cover" /> : null}
                {!p.images?.[0]?.url ? <ImagePlus size={18} className="text-zinc-400 absolute inset-0 m-auto" /> : null}
                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-colors flex items-center justify-center">
                  <span className="text-white text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                    {p.images?.length ? 'Edit images' : 'Add images'}
                  </span>
                </span>
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{p.name}</span>
                  <Badge variant={statusColors[p.status]}>{p.status}</Badge>
                  {p.images?.length ? (
                    <Badge variant="default">{p.images.length}/{MAX_IMAGES} images</Badge>
                  ) : (
                    <Badge variant="warning">No image</Badge>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)]">{formatPrice(p.price)} • Stock: {p.stock} • SKU: {p.sku}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => openEditDialog(p, 'images')} title="Manage images"><ImagePlus size={14} /></Button>
                <Button variant="ghost" size="sm" onClick={() => openEditDialog(p)}><Edit size={14} /></Button>
                <Button variant="ghost" size="sm" onClick={() => deleteProduct.mutate(p.id)}><Trash2 size={14} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={!!dialog}
        onClose={closeDialog}
        title={isImagesStep ? 'Product Images' : productId ? 'Edit Product' : 'Add Product'}
        className="max-w-2xl"
      >
        {isImagesStep ? (
          <div className="space-y-4">
            {dialog?.justCreated ? (
              <div className="flex items-start gap-2.5 rounded-[var(--radius)] bg-emerald-50 border border-emerald-200 p-3">
                <CheckCircle2 size={16} className="text-emerald-700 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-900">Product created</p>
                  <p className="text-xs text-emerald-800">
                    Upload up to {MAX_IMAGES} images — the first one becomes the cover shown across the marketplace.
                  </p>
                </div>
              </div>
            ) : null}

            <ImageUpload {...imageUploadProps} />

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setDialog(d => (d ? { ...d, step: 'details' } : d))}>
                Back to details
              </Button>
              <Button type="button" className="flex-1" onClick={closeDialog}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(submitDetails)}
            className="space-y-3"
          >
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

            <div className="pt-3 border-t border-[var(--border)]">
              <ImageUpload {...imageUploadProps} />
              {!productId && pendingFiles.length > 0 ? (
                <p className="text-xs text-[var(--muted)] mt-2">
                  {pendingFiles.length} image{pendingFiles.length === 1 ? '' : 's'} will be uploaded as soon as the product is created.
                </p>
              ) : null}
            </div>

            <Button type="submit" className="w-full" disabled={isSaving || uploadImages.isPending}>
              {submitLabel}
            </Button>
          </form>
        )}
      </Dialog>
    </div>
  )
}
