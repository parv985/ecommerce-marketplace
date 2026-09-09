import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ScrollText,
} from 'lucide-react'
import { adminService } from '@/services/admin.service'
import { extractErrorMessage } from '@/services/api'
import { formatDateFull } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Pagination } from '@/components/ui/Pagination'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import type { AuditLog, AuditLogQuery, AuditLogSortField } from '@/types/api'

/*
 * Filter values the backend currently records (see the audit logging call
 * sites across src/modules and the GET /admin/audit-logs docs). The API
 * accepts any string for these fields, so they are offered as convenience
 * shortcuts rather than hard constraints.
 */
const ACTOR_ROLES = ['BUYER', 'SELLER', 'SUPER_ADMIN', 'SYSTEM']

const ENTITY_TYPES = [
  'COUPON',
  'DISCOUNT',
  'NOTIFICATION',
  'ORDER',
  'PLATFORM_SETTING',
  'PRODUCT',
  'RETURN',
  'SELLER',
  'SETTLEMENT',
  'USER',
]

const ACTIONS = [
  'ADMIN_BROADCAST',
  'COMMISSION_RATE_CHANGED',
  'COUPON_CREATED',
  'COUPON_DEACTIVATED',
  'COUPON_UPDATED',
  'DISCOUNT_CREATED',
  'DISCOUNT_DEACTIVATED',
  'DISCOUNT_UPDATED',
  'LOGIN',
  'ORDER_CANCELLED',
  'ORDER_CREATED',
  'ORDER_STATUS_CHANGED',
  'PAYMENT_CAPTURED',
  'PAYMENT_INITIATED',
  'PAYMENT_REFUNDED',
  'PAYMENT_VERIFIED',
  'PRODUCT_CREATED',
  'PRODUCT_IMAGE_DELETED',
  'PRODUCT_IMAGES_UPLOADED',
  'PRODUCT_STATUS_CHANGED',
  'PRODUCT_UPDATED',
  'RETURN_REQUESTED',
  'RETURN_STATUS_CHANGED',
  'SELLER_DOCUMENT_DELETED',
  'SELLER_DOCUMENT_UPLOADED',
  'SELLER_PROFILE_UPDATED',
  'SELLER_REGISTERED',
  'SELLER_STATUS_UPDATE',
  'SETTLEMENT_GENERATED',
  'SETTLEMENT_REMINDER_SENT',
  'SETTLEMENT_STATUS_CHANGED',
  'USER_STATUS_UPDATE',
]

const SORT_FIELDS: { value: AuditLogSortField; label: string }[] = [
  { value: 'createdAt', label: 'Timestamp' },
  { value: 'action', label: 'Action' },
  { value: 'entityType', label: 'Entity type' },
  { value: 'actorRole', label: 'Actor role' },
  { value: 'actorId', label: 'Actor id' },
]

const PAGE_SIZES = [
  { value: '20', label: '20 / page' },
  { value: '50', label: '50 / page' },
  { value: '100', label: '100 / page' },
]

interface Filters {
  actorId: string
  actorRole: string
  action: string
  entityType: string
  entityId: string
  fromDate: string
  toDate: string
}

const EMPTY_FILTERS: Filters = {
  actorId: '',
  actorRole: '',
  action: '',
  entityType: '',
  entityId: '',
  fromDate: '',
  toDate: '',
}

const roleVariant = (
  role: string,
): 'default' | 'success' | 'warning' | 'error' | 'secondary' => {
  if (role === 'SUPER_ADMIN') return 'error'
  if (role === 'SELLER') return 'secondary'
  if (role === 'SYSTEM') return 'warning'
  return 'default'
}

const shortId = (value: string | null): string => {
  if (!value) return '—'
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value
}

const describe = (value: unknown): string => {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function AdminAuditPage() {
  /* Draft values live in the form; `applied` is what drives the query so
     typing in an id/date field does not fire a request per keystroke. */
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS)
  const [sortBy, setSortBy] = useState<AuditLogSortField>('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const queryParams = useMemo<AuditLogQuery>(
    () => ({
      actorId: applied.actorId.trim() || undefined,
      actorRole: applied.actorRole || undefined,
      action: applied.action || undefined,
      entityType: applied.entityType || undefined,
      entityId: applied.entityId.trim() || undefined,
      fromDate: applied.fromDate || undefined,
      toDate: applied.toDate || undefined,
      sortBy,
      sortOrder,
      page,
      limit,
    }),
    [applied, sortBy, sortOrder, page, limit],
  )

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['admin-audit-logs', queryParams],
    queryFn: () => adminService.getAuditLogs(queryParams),
  })

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault()
    setApplied(draft)
    setPage(1)
  }

  const resetFilters = () => {
    setDraft(EMPTY_FILTERS)
    setApplied(EMPTY_FILTERS)
    setPage(1)
  }

  const changeFilter = (key: keyof Filters, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  /* Selects apply immediately; text/date fields apply on submit. */
  const applyFilterNow = (key: keyof Filters, value: string) => {
    const next = { ...draft, [key]: value }
    setDraft(next)
    setApplied(next)
    setPage(1)
  }

  const toggleCreatedAtSort = () => {
    if (sortBy === 'createdAt') {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortBy('createdAt')
      setSortOrder('desc')
    }
    setPage(1)
  }

  const hasActiveFilters = Object.values(applied).some((value) => value !== '')
  const items: AuditLog[] = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Every audited action recorded on the platform — who did it, what changed and when.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">
            {isFetching && !isLoading ? 'Refreshing…' : `${total} entr${total === 1 ? 'y' : 'ies'}`}
          </span>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw size={14} className="mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Filters ── */}
      <form
        onSubmit={applyFilters}
        className="border border-[var(--border)] rounded-[var(--radius-lg)] bg-white p-4 mb-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Input
            label="Actor id"
            value={draft.actorId}
            onChange={(e) => changeFilter('actorId', e.target.value)}
            placeholder="User ObjectId or system"
          />
          <Select
            label="Actor role"
            value={draft.actorRole}
            onChange={(e) => applyFilterNow('actorRole', e.target.value)}
            options={[
              { value: '', label: 'All roles' },
              ...ACTOR_ROLES.map((role) => ({ value: role, label: role })),
            ]}
          />
          <Select
            label="Action"
            value={draft.action}
            onChange={(e) => applyFilterNow('action', e.target.value)}
            options={[
              { value: '', label: 'All actions' },
              ...ACTIONS.map((action) => ({ value: action, label: action })),
            ]}
          />
          <Select
            label="Entity type"
            value={draft.entityType}
            onChange={(e) => applyFilterNow('entityType', e.target.value)}
            options={[
              { value: '', label: 'All entities' },
              ...ENTITY_TYPES.map((type) => ({ value: type, label: type })),
            ]}
          />
          <Input
            label="Entity id"
            value={draft.entityId}
            onChange={(e) => changeFilter('entityId', e.target.value)}
            placeholder="24-char ObjectId"
          />
          <Input
            label="From date"
            type="date"
            value={draft.fromDate}
            max={draft.toDate || undefined}
            onChange={(e) => changeFilter('fromDate', e.target.value)}
          />
          <Input
            label="To date"
            type="date"
            value={draft.toDate}
            min={draft.fromDate || undefined}
            onChange={(e) => changeFilter('toDate', e.target.value)}
          />
          <div className="flex items-end gap-2">
            <Button type="submit" className="flex-1">
              Apply
            </Button>
            <Button type="button" variant="outline" onClick={resetFilters} disabled={!hasActiveFilters}>
              Reset
            </Button>
          </div>
        </div>

        {/* ── Sorting & page size ── */}
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-[var(--border-subtle)] pt-3">
          <div className="w-44">
            <Select
              label="Sort by"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as AuditLogSortField)
                setPage(1)
              }}
              options={SORT_FIELDS}
            />
          </div>
          <div className="w-36">
            <Select
              label="Order"
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value as 'asc' | 'desc')
                setPage(1)
              }}
              options={[
                { value: 'desc', label: 'Descending' },
                { value: 'asc', label: 'Ascending' },
              ]}
            />
          </div>
          <div className="w-36">
            <Select
              label="Page size"
              value={String(limit)}
              onChange={(e) => {
                setLimit(Number(e.target.value))
                setPage(1)
              }}
              options={PAGE_SIZES}
            />
          </div>
        </div>
      </form>

      {/* ── Error state ── */}
      {isError && (
        <div className="border border-rose-200 bg-rose-50 rounded-[var(--radius-lg)] p-6 text-center">
          <AlertTriangle size={28} className="mx-auto text-rose-600 mb-2" />
          <p className="font-medium text-rose-900">Could not load audit logs</p>
          <p className="text-sm text-rose-700 mt-1">{extractErrorMessage(error)}</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      )}

      {/* ── Loading state ── */}
      {isLoading && (
        <div className="border border-[var(--border)] rounded-[var(--radius-lg)] bg-white p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          icon={<ScrollText size={48} />}
          title={hasActiveFilters ? 'No matching audit entries' : 'No audit entries yet'}
          description={
            hasActiveFilters
              ? 'No entries match the current filters. Widen the date range or clear the filters to see more.'
              : 'Audit entries appear here as soon as audited actions (logins, orders, seller approvals, admin changes…) are recorded.'
          }
          action={hasActiveFilters ? { label: 'Clear filters', onClick: resetFilters } : undefined}
        />
      )}

      {/* ── Table ── */}
      {!isLoading && !isError && items.length > 0 && (
        <div className="border border-[var(--border)] rounded-[var(--radius-lg)] bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-[var(--border)]">
                <tr>
                  <th className="text-left p-3 font-medium w-8" />
                  <th className="text-left p-3 font-medium">
                    <button
                      type="button"
                      onClick={toggleCreatedAtSort}
                      className="inline-flex items-center gap-1 hover:text-[var(--primary)] transition-colors"
                    >
                      Timestamp
                      <ArrowDownUp size={13} />
                      {sortBy === 'createdAt' && (
                        <span className="text-[10px] text-[var(--muted)]">
                          {sortOrder === 'desc' ? 'newest first' : 'oldest first'}
                        </span>
                      )}
                    </button>
                  </th>
                  <th className="text-left p-3 font-medium">Action</th>
                  <th className="text-left p-3 font-medium">Actor</th>
                  <th className="text-left p-3 font-medium">Entity</th>
                  <th className="text-left p-3 font-medium">Changes</th>
                </tr>
              </thead>
              <tbody>
                {items.map((log) => {
                  const expanded = expandedId === log.id
                  return (
                    <Fragment key={log.id}>
                      <tr className="border-b border-[var(--border-subtle)] align-top">
                        <td className="p-3">
                          <button
                            type="button"
                            aria-label={expanded ? 'Hide details' : 'Show details'}
                            onClick={() => setExpandedId(expanded ? null : log.id)}
                            className="text-[var(--muted)] hover:text-[var(--fg)]"
                          >
                            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </button>
                        </td>
                        <td className="p-3 whitespace-nowrap text-[var(--fg-secondary)]">
                          {formatDateFull(log.createdAt)}
                        </td>
                        <td className="p-3">
                          <Badge variant="brand">{log.action}</Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant={roleVariant(log.actorRole)}>{log.actorRole}</Badge>
                          <p className="text-xs text-[var(--muted)] mt-1 font-mono" title={log.actorId}>
                            {shortId(log.actorId)}
                          </p>
                        </td>
                        <td className="p-3">
                          <span className="font-medium">{log.entityType}</span>
                          <p className="text-xs text-[var(--muted)] mt-1 font-mono" title={log.entityId ?? ''}>
                            {shortId(log.entityId)}
                          </p>
                        </td>
                        <td className="p-3 text-xs text-[var(--muted)] max-w-xs truncate">
                          {describe(log.before) === '—' && describe(log.after) === '—'
                            ? '—'
                            : `${describe(log.before)} → ${describe(log.after)}`}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
                          <td colSpan={6} className="p-4">
                            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                              <div>
                                <dt className="font-semibold text-[var(--fg-secondary)]">Entry id</dt>
                                <dd className="mt-1 font-mono break-all">{log.id}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold text-[var(--fg-secondary)]">Actor id</dt>
                                <dd className="mt-1 font-mono break-all">{log.actorId}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold text-[var(--fg-secondary)]">Entity id</dt>
                                <dd className="mt-1 font-mono break-all">{log.entityId ?? '—'}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold text-[var(--fg-secondary)]">Recorded at</dt>
                                <dd className="mt-1">{new Date(log.createdAt).toISOString()}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold text-[var(--fg-secondary)]">Before</dt>
                                <dd className="mt-1 font-mono break-all">{describe(log.before)}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold text-[var(--fg-secondary)]">After</dt>
                                <dd className="mt-1 font-mono break-all">{describe(log.after)}</dd>
                              </div>
                              <div className="sm:col-span-2">
                                <dt className="font-semibold text-[var(--fg-secondary)]">Metadata</dt>
                                <dd className="mt-1 font-mono break-all">{describe(log.metadata)}</dd>
                              </div>
                            </dl>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)]">
            <p className="text-xs text-[var(--muted)]">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </p>
            <Pagination currentPage={page} totalPages={data?.totalPages ?? 0} onPageChange={setPage} />
          </div>
        </div>
      )}
    </div>
  )
}
