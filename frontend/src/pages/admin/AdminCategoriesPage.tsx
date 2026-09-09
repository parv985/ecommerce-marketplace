import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, RefreshCw, AlertCircle, Tags, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { categoryService } from '@/services/category.service'
import { extractErrorMessage } from '@/services/api'
import { notifyNoChanges } from '@/lib/formChanges'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { CategoryTable } from '@/components/admin/CategoryTable'
import { CategoryFormDialog, type CategoryFormSubmit } from '@/components/admin/CategoryFormDialog'
import { cn } from '@/lib/utils'
import type { Category } from '@/types/api'

type StatusView = 'active' | 'all'

const statusViews: { value: StatusView; label: string; hint: string }[] = [
  { value: 'active', label: 'Active', hint: 'Categories currently visible to buyers and sellers' },
  { value: 'all', label: 'All', hint: 'Every category, including deactivated ones' },
]

/*
 * Query keys:
 *   ['categories']        → GET /categories      (shared with storefront pages)
 *   ['categories', 'all'] → GET /categories/all
 * Invalidating ['categories'] refreshes both, keeping every consumer in sync.
 */
const CATEGORIES_KEY = ['categories'] as const
const ALL_CATEGORIES_KEY = ['categories', 'all'] as const

export function AdminCategoriesPage() {
  const queryClient = useQueryClient()

  const [view, setView] = useState<StatusView>('active')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [deactivating, setDeactivating] = useState<Category | null>(null)

  const query = useQuery({
    queryKey: view === 'all' ? ALL_CATEGORIES_KEY : CATEGORIES_KEY,
    queryFn: view === 'all' ? categoryService.listAll : categoryService.list,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY })

  const createMutation = useMutation({
    mutationFn: categoryService.create,
    onSuccess: async () => {
      await invalidate()
      closeForm()
      toast.success('Category created successfully.')
    },
    onError: (e) => toast.error(extractErrorMessage(e) || 'Failed to create category'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof categoryService.update>[1] }) =>
      categoryService.update(id, data),
    onSuccess: async (_res, variables) => {
      await invalidate()
      closeForm()
      toast.success(variables.data.isActive === true
        ? 'Category reactivated successfully.'
        : 'Category updated successfully.')
    },
    onError: (e) => toast.error(extractErrorMessage(e) || 'Failed to update category'),
  })

  const deactivateMutation = useMutation({
    mutationFn: categoryService.deactivate,
    onSuccess: async () => {
      await invalidate()
      setDeactivating(null)
      toast.success('Category deactivated successfully.')
    },
    onError: (e) => toast.error(extractErrorMessage(e) || 'Failed to deactivate category'),
  })

  const isMutating = createMutation.isPending || updateMutation.isPending || deactivateMutation.isPending

  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (c: Category) => { setEditing(c); setFormOpen(true) }
  const closeForm = () => { setFormOpen(false); setEditing(null) }

  const handleFormSubmit = (payload: CategoryFormSubmit) => {
    if (isMutating) return
    if (payload.mode === 'create') {
      createMutation.mutate(payload.data)
      return
    }
    if (Object.keys(payload.data).length === 0) {
      // Nothing changed — no request needed. The dialog stays open so the
      // admin can keep editing; the toast explains why nothing was saved.
      notifyNoChanges()
      return
    }
    updateMutation.mutate({ id: payload.id, data: payload.data })
  }

  const handleReactivate = (c: Category) => {
    if (isMutating) return
    // The row already reports an active category (e.g. stale cache after another
    // admin reactivated it) — flipping it again is a no-op, so no request.
    if (c.isActive) {
      notifyNoChanges()
      return
    }
    updateMutation.mutate({ id: c.id, data: { isActive: true } })
  }

  const categories = useMemo(() => query.data ?? [], [query.data])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return categories
    return categories.filter(c =>
      c.name.toLowerCase().includes(term) ||
      (c.description ?? '').toLowerCase().includes(term)
    )
  }, [categories, search])

  const activeCount = categories.filter(c => c.isActive).length
  const inactiveCount = categories.length - activeCount

  return (
    <div>
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 pb-4 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">Categories</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Manage product categories for the marketplace.</p>
        </div>
        <Button onClick={openCreate} disabled={isMutating} className="w-full sm:w-auto shrink-0">
          <Plus size={16} className="mr-1.5" />
          Add Category
        </Button>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search categories..."
            aria-label="Search categories"
            className="w-full h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white pl-9 pr-3 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] transition-all duration-150 focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider shrink-0">Status</span>
          <div role="tablist" aria-label="Category status filter" className="inline-flex rounded-[var(--radius)] border border-[var(--border)] bg-white p-0.5">
            {statusViews.map(v => (
              <button
                key={v.value}
                role="tab"
                type="button"
                aria-selected={view === v.value}
                title={v.hint}
                onClick={() => setView(v.value)}
                className={cn(
                  'px-3 h-7 rounded-[var(--radius-sm)] text-xs font-medium transition-all duration-150 cursor-pointer',
                  view === v.value
                    ? 'bg-[var(--primary)] text-white shadow-sm'
                    : 'text-[var(--fg-secondary)] hover:text-[var(--fg)] hover:bg-[var(--accent)]'
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── List ── */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-[var(--border)] bg-white">
          <p className="text-xs text-[var(--muted)]">
            {query.isPending ? (
              'Loading categories…'
            ) : view === 'all' ? (
              <>Showing <span className="font-semibold text-[var(--fg)]">{filtered.length}</span> of {categories.length} categories · {activeCount} active, {inactiveCount} inactive</>
            ) : (
              <>Showing <span className="font-semibold text-[var(--fg)]">{filtered.length}</span> of {categories.length} active categories</>
            )}
          </p>
          <button
            type="button"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--fg-secondary)] hover:text-[var(--fg)] disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={cn(query.isFetching && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {query.isError ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="p-3 rounded-full bg-[var(--destructive-subtle)] text-[var(--destructive)] mb-4">
              <AlertCircle size={28} strokeWidth={1.75} />
            </div>
            <h3 className="text-lg font-medium mb-1">Unable to load categories.</h3>
            <p className="text-sm text-[var(--muted)] max-w-sm mb-4">{extractErrorMessage(query.error)}</p>
            <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
              {query.isFetching
                ? <Loader2 size={14} className="animate-spin mr-2" />
                : <RefreshCw size={14} className="mr-2" />}
              Retry
            </Button>
          </div>
        ) : query.isPending ? (
          <CategoryTable
            categories={[]}
            loading
            onEdit={openEdit}
            onDeactivate={setDeactivating}
            onReactivate={handleReactivate}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Tags size={44} strokeWidth={1.5} />}
            title="No categories found."
            description={
              search.trim()
                ? `No categories match "${search.trim()}". Try a different search term.`
                : view === 'active'
                  ? 'There are no active categories yet. Create one to get started.'
                  : 'No categories have been created yet.'
            }
            action={
              search.trim()
                ? { label: 'Clear search', onClick: () => setSearch('') }
                : { label: 'Add Category', onClick: openCreate }
            }
          />
        ) : (
          <CategoryTable
            categories={filtered}
            actionsDisabled={isMutating}
            onEdit={openEdit}
            onDeactivate={setDeactivating}
            onReactivate={handleReactivate}
          />
        )}
      </Card>

      {/* ── Create / Edit dialog ── */}
      <CategoryFormDialog
        open={formOpen}
        category={editing}
        submitting={createMutation.isPending || updateMutation.isPending}
        onClose={closeForm}
        onSubmit={handleFormSubmit}
      />

      {/* ── Deactivate confirmation ── */}
      <Dialog
        open={!!deactivating}
        onClose={() => { if (!deactivateMutation.isPending) setDeactivating(null) }}
        title="Deactivate Category?"
        className="max-w-md"
      >
        <p className="text-sm text-[var(--fg-secondary)]">
          Are you sure you want to deactivate{' '}
          <span className="font-semibold text-[var(--fg)]">"{deactivating?.name}"</span>?
        </p>
        <p className="text-xs text-[var(--muted)] mt-2">
          The category will be hidden from buyers and sellers. Existing products keep their category, and you can reactivate it later from the "All" view.
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={() => setDeactivating(null)} disabled={deactivateMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deactivateMutation.isPending}
            onClick={() => {
              if (!deactivating || deactivateMutation.isPending) return
              deactivateMutation.mutate(deactivating.id)
            }}
            className="min-w-[7rem]"
          >
            {deactivateMutation.isPending && <Loader2 size={14} className="animate-spin mr-2" />}
            Deactivate
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
