import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { TextArea } from '@/components/ui/TextArea'
import { Button } from '@/components/ui/Button'
import type { Category, CreateCategoryInput, UpdateCategoryInput } from '@/types/api'

/*
 * Client-side mirror of the backend zod schema
 * (src/modules/categories/category.schema.ts) so users get instant, friendly
 * feedback before the request is sent.
 */
const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Category name is required')
    .min(2, 'Category name must be at least 2 characters')
    .max(100, 'Category name cannot exceed 100 characters'),
  description: z
    .string()
    .trim()
    .max(500, 'Description cannot exceed 500 characters'),
})

export type CategoryFormValues = z.infer<typeof categoryFormSchema>

export type CategoryFormSubmit =
  | { mode: 'create'; data: CreateCategoryInput }
  | { mode: 'edit'; id: string; data: UpdateCategoryInput }

interface CategoryFormDialogProps {
  open: boolean
  /** When provided the dialog works in edit mode and is pre-populated. */
  category?: Category | null
  submitting: boolean
  onClose: () => void
  onSubmit: (payload: CategoryFormSubmit) => void
}

const emptyValues: CategoryFormValues = { name: '', description: '' }

export function CategoryFormDialog({ open, category, submitting, onClose, onSubmit }: CategoryFormDialogProps) {
  const isEdit = !!category

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: emptyValues,
  })

  // (Re)populate whenever the dialog opens or the target category changes.
  useEffect(() => {
    if (!open) return
    reset(category
      ? { name: category.name, description: category.description ?? '' }
      : emptyValues)
  }, [open, category, reset])

  const descriptionValue = useWatch({ control, name: 'description' })
  const descriptionLength = descriptionValue?.length ?? 0

  const handleClose = () => {
    if (submitting) return
    onClose()
  }

  const submit = (values: CategoryFormValues) => {
    if (submitting) return

    if (!isEdit) {
      const data: CreateCategoryInput = { name: values.name }
      if (values.description) data.description = values.description
      onSubmit({ mode: 'create', data })
      return
    }

    // PATCH: only send fields that actually changed. Clearing the description
    // sends `null`, which the backend schema explicitly accepts.
    const data: UpdateCategoryInput = {}
    if (values.name !== category.name) data.name = values.name
    const currentDescription = category.description ?? ''
    if (values.description !== currentDescription) {
      data.description = values.description === '' ? null : values.description
    }
    onSubmit({ mode: 'edit', id: category.id, data })
  }

  return (
    <Dialog open={open} onClose={handleClose} title={isEdit ? 'Edit Category' : 'Create Category'}>
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <Input
          label="Category Name *"
          placeholder="e.g. Electronics"
          autoFocus
          maxLength={100}
          disabled={submitting}
          error={errors.name?.message}
          {...register('name')}
        />
        <div>
          <TextArea
            label="Description"
            placeholder="Optional short description shown to buyers"
            maxLength={500}
            disabled={submitting}
            error={errors.description?.message}
            {...register('description')}
          />
          <p className="mt-1 text-xs text-[var(--muted)] text-right">{descriptionLength}/500</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} className="min-w-[8.5rem]">
            {submitting && <Loader2 size={14} className="animate-spin mr-2" />}
            {isEdit ? 'Save Changes' : 'Create Category'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
