import { Pencil, Ban, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDate } from '@/lib/utils'
import type { Category } from '@/types/api'

interface CategoryTableProps {
  categories: Category[]
  loading?: boolean
  /** Disables every row action while a mutation is in flight. */
  actionsDisabled?: boolean
  onEdit: (category: Category) => void
  onDeactivate: (category: Category) => void
  onReactivate: (category: Category) => void
}

const SKELETON_ROWS = 5

function StatusBadge({ isActive }: { isActive: boolean }) {
  return <Badge variant={isActive ? 'success' : 'default'}>{isActive ? 'Active' : 'Inactive'}</Badge>
}

function RowActions({
  category, disabled, onEdit, onDeactivate, onReactivate,
}: { category: Category; disabled?: boolean } & Pick<CategoryTableProps, 'onEdit' | 'onDeactivate' | 'onReactivate'>) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => onEdit(category)} aria-label={`Edit ${category.name}`}>
        <Pencil size={13} className="mr-1.5" />
        Edit
      </Button>
      {category.isActive ? (
        <Button size="sm" variant="destructive" disabled={disabled} onClick={() => onDeactivate(category)} aria-label={`Deactivate ${category.name}`}>
          <Ban size={13} className="mr-1.5" />
          Deactivate
        </Button>
      ) : (
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onReactivate(category)} aria-label={`Reactivate ${category.name}`}>
          <RotateCcw size={13} className="mr-1.5" />
          Reactivate
        </Button>
      )}
    </div>
  )
}

export function CategoryTable({
  categories, loading, actionsDisabled, onEdit, onDeactivate, onReactivate,
}: CategoryTableProps) {
  const actionProps = { onEdit, onDeactivate, onReactivate }

  return (
    <>
      {/* ── Desktop / tablet: table ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border)]">
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Description</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 whitespace-nowrap">Created</th>
              <th className="px-5 py-3 whitespace-nowrap">Updated</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {loading
              ? Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <tr key={i}>
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-56" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-5 w-16" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-8 w-40 ml-auto" /></td>
                </tr>
              ))
              : categories.map(c => (
                <tr key={c.id} className="hover:bg-[var(--bg-subtle)]/60 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-[var(--fg)] max-w-[220px]">
                    <span className="block truncate" title={c.name}>{c.name}</span>
                  </td>
                  <td className="px-5 py-3.5 text-[var(--fg-secondary)] max-w-[360px]">
                    {c.description
                      ? <span className="block truncate" title={c.description}>{c.description}</span>
                      : <span className="text-[var(--muted)] italic">—</span>}
                  </td>
                  <td className="px-5 py-3.5"><StatusBadge isActive={c.isActive} /></td>
                  <td className="px-5 py-3.5 text-[var(--muted)] whitespace-nowrap">{formatDate(c.createdAt)}</td>
                  <td className="px-5 py-3.5 text-[var(--muted)] whitespace-nowrap">{formatDate(c.updatedAt)}</td>
                  <td className="px-5 py-3.5">
                    <RowActions category={c} disabled={actionsDisabled} {...actionProps} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile: stacked cards ── */}
      <div className="md:hidden divide-y divide-[var(--border-subtle)]">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))
          : categories.map(c => (
            <div key={c.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-[var(--fg)] break-words min-w-0">{c.name}</p>
                <StatusBadge isActive={c.isActive} />
              </div>
              {c.description && (
                <p className="text-sm text-[var(--fg-secondary)] break-words">{c.description}</p>
              )}
              <p className="text-xs text-[var(--muted)]">
                Created {formatDate(c.createdAt)} · Updated {formatDate(c.updatedAt)}
              </p>
              <RowActions category={c} disabled={actionsDisabled} {...actionProps} />
            </div>
          ))}
      </div>
    </>
  )
}
