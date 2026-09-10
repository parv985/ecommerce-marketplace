import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ScrollText,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import {
  Badge as MuiBadge,
  Button as MuiButton,
  Chip,
  Collapse,
  MenuItem,
  IconButton,
  Popover,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
} from '@mui/material'
import { ThemeProvider } from '@mui/material/styles'
import { adminService } from '@/services/admin.service'
import { extractErrorMessage } from '@/services/api'
import { formatDateFull } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { Skeleton } from '@/components/ui/Skeleton'
import { CopyButton } from '@/components/admin/audit/CopyButton'
import { auditTheme } from '@/theme/auditTheme'
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

/** Debounce for the free-text search box before it hits the API. */
const SEARCH_DEBOUNCE_MS = 400

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

const isObjectId = (value: string): boolean => /^[0-9a-f]{24}$/i.test(value)

const describe = (value: unknown, pretty = false): string => {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, pretty ? 2 : undefined) ?? '—'
  } catch {
    return String(value)
  }
}

/** One applied filter, rendered as a removable chip under the search bar. */
interface FilterChip {
  key: string
  label: string
  value: string
}

/** Compact select used in the toolbar / filters panel (NexCart-sized). */
function ToolbarSelect({
  value,
  onChange,
  options,
  minWidth,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  minWidth: number
  ariaLabel: string
}) {
  return (
    <Select
      size="small"
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value as string)}
      sx={{ minWidth, bgcolor: '#fff', '& .MuiSelect-select': { py: 0.75 } }}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value} dense>
          {option.label}
        </MenuItem>
      ))}
    </Select>
  )
}

export function AdminAuditPage() {
  /* Free-text search: the input is debounced into `search`, which drives
     the server-side query — one request per pause in typing, never one
     per keystroke. */
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  /* Draft values live inside the Filters popover; `applied` is what drives
     the query, so editing the form never fires a request until Apply. */
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS)
  const [filtersAnchor, setFiltersAnchor] = useState<HTMLElement | null>(null)

  const [sortBy, setSortBy] = useState<AuditLogSortField>('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  /* Debounce the search box into the applied query. */
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  const queryParams = useMemo<AuditLogQuery>(
    () => ({
      search: search || undefined,
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
    [search, applied, sortBy, sortOrder, page, limit],
  )

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['admin-audit-logs', queryParams],
    queryFn: () => adminService.getAuditLogs(queryParams),
  })

  /* ── Filter actions ── */

  const openFilters = (event: React.MouseEvent<HTMLButtonElement>) => {
    setDraft(applied) // always edit the currently applied state
    setFiltersAnchor(event.currentTarget)
  }

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault()
    setApplied(draft)
    setPage(1)
    setFiltersAnchor(null)
  }

  const resetFilters = () => {
    setDraft(EMPTY_FILTERS)
    setApplied(EMPTY_FILTERS)
    setSearchInput('')
    setSearch('')
    setPage(1)
  }

  /* Remove a single filter via its chip (applies immediately). */
  const removeFilter = (key: string) => {
    if (key === 'search') {
      setSearchInput('')
      setSearch('')
    } else if (key in applied) {
      const next = { ...applied, [key]: '' } as Filters
      setApplied(next)
      setDraft(next)
    }
    setPage(1)
  }

  const changeFilter = (key: keyof Filters, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
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

  /* ── Derived state ── */

  const activeFilterChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = []
    if (search) chips.push({ key: 'search', label: 'Search', value: search })
    if (applied.actorId.trim())
      chips.push({ key: 'actorId', label: 'Actor ID', value: applied.actorId.trim() })
    if (applied.actorRole)
      chips.push({ key: 'actorRole', label: 'Role', value: applied.actorRole })
    if (applied.action) chips.push({ key: 'action', label: 'Action', value: applied.action })
    if (applied.entityType)
      chips.push({ key: 'entityType', label: 'Entity', value: applied.entityType })
    if (applied.entityId.trim())
      chips.push({ key: 'entityId', label: 'Entity ID', value: applied.entityId.trim() })
    if (applied.fromDate) chips.push({ key: 'fromDate', label: 'From', value: applied.fromDate })
    if (applied.toDate) chips.push({ key: 'toDate', label: 'To', value: applied.toDate })
    return chips
  }, [search, applied])

  const appliedFilterCount = activeFilterChips.filter((chip) => chip.key !== 'search').length
  const hasActiveFilters = activeFilterChips.length > 0

  /* Quick sort dropdown — Newest/Oldest first, plus the current state of an
     advanced sort chosen in the Filters panel. */
  const sortOptions = useMemo(() => {
    const base = [
      { value: 'createdAt:desc', label: 'Newest first' },
      { value: 'createdAt:asc', label: 'Oldest first' },
    ]
    if (sortBy !== 'createdAt') {
      const fieldLabel = SORT_FIELDS.find((f) => f.value === sortBy)?.label ?? sortBy
      base.unshift({
        value: `${sortBy}:${sortOrder}`,
        label: `${fieldLabel} · ${sortOrder === 'asc' ? 'A→Z' : 'Z→A'}`,
      })
    }
    return base
  }, [sortBy, sortOrder])

  const changeQuickSort = (value: string) => {
    const [field, order] = value.split(':') as [AuditLogSortField, 'asc' | 'desc']
    setSortBy(field)
    setSortOrder(order)
    setPage(1)
  }

  const items: AuditLog[] = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <ThemeProvider theme={auditTheme}>
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

        {/* ── Compact toolbar: search + filters + sort ── */}
        <div className="border border-[var(--border)] rounded-[var(--radius-lg)] bg-white p-3 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <TextField
              size="small"
              fullWidth
              className="min-w-[200px] flex-1"
              placeholder="Search audit logs… (actor ID, entity ID, action)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              sx={{
                flex: '1 1 220px',
                '& .MuiOutlinedInput-root': { bgcolor: '#fff' },
              }}
              slotProps={{
                htmlInput: { 'aria-label': 'Search audit logs' },
                input: {
                  startAdornment: (
                    <Search size={15} className="mr-2 shrink-0 text-[var(--muted)]" aria-hidden />
                  ),
                  endAdornment: searchInput && (
                    <IconButton
                      size="small"
                      aria-label="Clear search"
                      onClick={() => setSearchInput('')}
                      sx={{ p: '2px' }}
                    >
                      <X size={14} />
                    </IconButton>
                  ),
                },
              }}
            />

            <MuiButton
              size="small"
              variant={filtersAnchor || appliedFilterCount > 0 ? 'contained' : 'outlined'}
              onClick={openFilters}
              startIcon={<SlidersHorizontal size={15} />}
              disableElevation
              sx={{ height: 38, px: 2 }}
            >
              Filters
              {appliedFilterCount > 0 && (
                <MuiBadge
                  badgeContent={appliedFilterCount}
                  color="primary"
                  sx={{ ml: 1, '& .MuiBadge-badge': { position: 'static', transform: 'none' } }}
                />
              )}
            </MuiButton>

            <Tooltip title="Sort order" arrow>
              <div>
                <ToolbarSelect
                  value={`${sortBy}:${sortOrder}`}
                  onChange={changeQuickSort}
                  options={sortOptions}
                  minWidth={150}
                  ariaLabel="Sort audit logs"
                />
              </div>
            </Tooltip>

            <Tooltip title="Rows per page" arrow>
              <div className="hidden sm:block">
                <ToolbarSelect
                  value={String(limit)}
                  onChange={(value) => {
                    setLimit(Number(value))
                    setPage(1)
                  }}
                  options={PAGE_SIZES}
                  minWidth={110}
                  ariaLabel="Rows per page"
                />
              </div>
            </Tooltip>
          </div>

          {/* ── Active filter chips ── */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 border-t border-[var(--border-subtle)]">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)] mr-0.5">
                Active
              </span>
              {activeFilterChips.map((chip) => (
                <Chip
                  key={chip.key}
                  size="small"
                  label={`${chip.label}: ${chip.value.length > 24 ? `${chip.value.slice(0, 24)}…` : chip.value}`}
                  onDelete={() => removeFilter(chip.key)}
                  deleteIcon={
                    <X size={13} role="button" aria-label={`Remove ${chip.label} filter`} />
                  }
                  sx={{ bgcolor: 'var(--primary-subtle)', borderColor: 'rgba(184, 62, 32, 0.2)' }}
                />
              ))}
              {activeFilterChips.length > 1 && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="ml-1 text-xs font-medium text-[var(--primary)] hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
          )}

          {/* ── Advanced filters popover ── */}
          <Popover
            open={filtersAnchor !== null}
            anchorEl={filtersAnchor}
            onClose={() => setFiltersAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{
              paper: {
                elevation: 12,
                sx: {
                  mt: 1,
                  width: { xs: 'calc(100vw - 24px)', sm: 560 },
                  maxWidth: 'calc(100vw - 24px)',
                  p: 2.5,
                },
              },
            }}
          >
            <form onSubmit={applyFilters}>
              <p className="text-sm font-semibold text-[var(--fg)]">Advanced filters</p>
              <p className="text-xs text-[var(--muted)] mt-0.5 mb-2.5">
                All fields are optional and combined.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <TextField
                  size="small"
                  label="Actor ID"
                  placeholder="User ObjectId or system"
                  value={draft.actorId}
                  onChange={(e) => changeFilter('actorId', e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  size="small"
                  label="Entity ID"
                  placeholder="24-char ObjectId"
                  value={draft.entityId}
                  onChange={(e) => changeFilter('entityId', e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />

                <TextField
                  select
                  size="small"
                  label="Actor role"
                  value={draft.actorRole}
                  onChange={(e) => changeFilter('actorRole', e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                >
                  <MenuItem value="">All roles</MenuItem>
                  {ACTOR_ROLES.map((role) => (
                    <MenuItem key={role} value={role}>
                      {role}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  label="Action"
                  value={draft.action}
                  onChange={(e) => changeFilter('action', e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                >
                  <MenuItem value="">All actions</MenuItem>
                  {ACTIONS.map((action) => (
                    <MenuItem key={action} value={action} dense>
                      {action}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  select
                  size="small"
                  label="Entity type"
                  value={draft.entityType}
                  onChange={(e) => changeFilter('entityType', e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                >
                  <MenuItem value="">All entities</MenuItem>
                  {ENTITY_TYPES.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </TextField>

                <div className="grid grid-cols-2 gap-2.5">
                  <TextField
                    size="small"
                    label="From date"
                    type="date"
                    value={draft.fromDate}
                    onChange={(e) => changeFilter('fromDate', e.target.value)}
                    slotProps={{
                      inputLabel: { shrink: true },
                      htmlInput: { max: draft.toDate || undefined },
                    }}
                  />
                  <TextField
                    size="small"
                    label="To date"
                    type="date"
                    value={draft.toDate}
                    onChange={(e) => changeFilter('toDate', e.target.value)}
                    slotProps={{
                      inputLabel: { shrink: true },
                      htmlInput: { min: draft.fromDate || undefined },
                    }}
                  />
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] grid grid-cols-2 gap-2.5">
                <TextField
                  select
                  size="small"
                  label="Sort by"
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as AuditLogSortField)
                    setPage(1)
                  }}
                  slotProps={{ inputLabel: { shrink: true } }}
                >
                  {SORT_FIELDS.map((field) => (
                    <MenuItem key={field.value} value={field.value}>
                      {field.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  label="Order"
                  value={sortOrder}
                  onChange={(e) => {
                    setSortOrder(e.target.value as 'asc' | 'desc')
                    setPage(1)
                  }}
                  slotProps={{ inputLabel: { shrink: true } }}
                >
                  <MenuItem value="desc">Descending</MenuItem>
                  <MenuItem value="asc">Ascending</MenuItem>
                </TextField>
              </div>

              <div className="flex items-center justify-end gap-2 mt-3.5">
                <MuiButton
                  type="button"
                  variant="text"
                  onClick={resetFilters}
                  disabled={!hasActiveFilters}
                  sx={{ color: 'text.secondary', mr: 'auto' }}
                >
                  Reset filters
                </MuiButton>
                <MuiButton
                  type="button"
                  variant="text"
                  onClick={() => setFiltersAnchor(null)}
                >
                  Cancel
                </MuiButton>
                <MuiButton type="submit" variant="contained" disableElevation>
                  Apply filters
                </MuiButton>
              </div>
            </form>
          </Popover>
        </div>

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
                ? 'No entries match the current search and filters. Widen the date range or clear them to see more.'
                : 'Audit entries appear here as soon as audited actions (logins, orders, seller approvals, admin changes…) are recorded.'
            }
            action={hasActiveFilters ? { label: 'Clear filters', onClick: resetFilters } : undefined}
          />
        )}

        {/* ── Table ── */}
        {!isLoading && !isError && items.length > 0 && (
          <div className="border border-[var(--border)] rounded-[var(--radius-lg)] bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <Table size="small" sx={{ minWidth: 880 }}>
                <TableHead>
                  <TableRow sx={{ '& th': { bgcolor: '#faf9f6' } }}>
                    <TableCell sx={{ width: 40, py: 1.5 }} />
                    <TableCell sx={{ py: 1.5, fontWeight: 600, fontSize: 13 }}>
                      <button
                        type="button"
                        onClick={toggleCreatedAtSort}
                        className="inline-flex items-center gap-1 hover:text-[var(--primary)] transition-colors cursor-pointer"
                      >
                        Timestamp
                        <ArrowDownUp size={13} />
                        {sortBy === 'createdAt' && (
                          <span className="text-[10px] text-[var(--muted)] font-normal">
                            {sortOrder === 'desc' ? 'newest first' : 'oldest first'}
                          </span>
                        )}
                      </button>
                    </TableCell>
                    <TableCell sx={{ py: 1.5, fontWeight: 600, fontSize: 13 }}>Action</TableCell>
                    <TableCell sx={{ py: 1.5, fontWeight: 600, fontSize: 13 }}>Actor</TableCell>
                    <TableCell sx={{ py: 1.5, fontWeight: 600, fontSize: 13 }}>Entity</TableCell>
                    <TableCell sx={{ py: 1.5, fontWeight: 600, fontSize: 13 }}>Changes</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((log) => {
                    const expanded = expandedId === log.id
                    const actorLabel = log.actorName ?? log.actorEmail ?? log.actorId
                    const actorEmailShown = log.actorName && log.actorEmail ? log.actorEmail : null
                    return (
                      <Fragment key={log.id}>
                        <TableRow
                          hover
                          onClick={() => setExpandedId(expanded ? null : log.id)}
                          sx={{
                            cursor: 'pointer',
                            '&:last-child td': { borderBottom: 0 },
                            '& td': { borderBottom: '1px solid #eeedea', py: 1.25 },
                          }}
                        >
                          <TableCell sx={{ pl: 1.5, pr: 0 }}>
                            <IconButton
                              size="small"
                              aria-label={expanded ? 'Hide details' : 'Show details'}
                              onClick={(e) => {
                                e.stopPropagation()
                                setExpandedId(expanded ? null : log.id)
                              }}
                              sx={{ p: '4px' }}
                            >
                              {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            </IconButton>
                          </TableCell>
                          <TableCell
                            sx={{ whiteSpace: 'nowrap', fontSize: 13, color: 'text.secondary' }}
                          >
                            {formatDateFull(log.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="brand">{log.action}</Badge>
                          </TableCell>
                          <TableCell sx={{ maxWidth: 230 }}>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant={roleVariant(log.actorRole)}>{log.actorRole}</Badge>
                              {(log.actorName || log.actorEmail || !isObjectId(log.actorId)) && (
                                <Tooltip title={actorEmailShown ?? actorLabel} placement="top" arrow>
                                  <span className="text-xs font-medium text-[var(--fg-secondary)] truncate max-w-[150px] inline-block align-middle">
                                    {actorLabel}
                                  </span>
                                </Tooltip>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 mt-1">
                              <Tooltip title={log.actorId} placement="top" arrow>
                                <span className="text-[11px] text-[var(--muted)] font-mono">
                                  {shortId(log.actorId)}
                                </span>
                              </Tooltip>
                              <CopyButton value={log.actorId} label="Copy actor ID" />
                            </div>
                          </TableCell>
                          <TableCell sx={{ maxWidth: 190 }}>
                            <span className="text-[13px] font-medium">{log.entityType}</span>
                            {log.entityId && (
                              <div className="flex items-center gap-0.5 mt-1">
                                <Tooltip title={log.entityId} placement="top" arrow>
                                  <span className="text-[11px] text-[var(--muted)] font-mono">
                                    {shortId(log.entityId)}
                                  </span>
                                </Tooltip>
                                <CopyButton value={log.entityId} label="Copy entity ID" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell sx={{ fontSize: 12, color: 'text.secondary', maxWidth: 280 }}>
                            <span className="block truncate">
                              {describe(log.before) === '—' && describe(log.after) === '—'
                                ? '—'
                                : `${describe(log.before)} → ${describe(log.after)}`}
                            </span>
                          </TableCell>
                        </TableRow>
                        <TableRow hover={false} sx={{ '& td': { py: 0 } }}>
                          <TableCell colSpan={6} sx={{ border: 0, p: 0 }}>
                            <Collapse in={expanded} timeout="auto" unmountOnExit>
                              <div className="bg-[var(--bg-subtle)] border-b border-[var(--border-subtle)] px-4 py-4">
                                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                                  <div>
                                    <dt className="font-semibold text-[var(--fg-secondary)]">
                                      Entry id
                                    </dt>
                                    <dd className="mt-1 flex items-center gap-0.5 font-mono break-all">
                                      <span className="break-all">{log.id}</span>
                                      <CopyButton value={log.id} label="Copy entry ID" />
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="font-semibold text-[var(--fg-secondary)]">
                                      Actor
                                    </dt>
                                    <dd className="mt-1">
                                      <Badge variant={roleVariant(log.actorRole)}>
                                        {log.actorRole}
                                      </Badge>
                                      {log.actorName && (
                                        <p className="mt-1 font-medium text-[var(--fg)]">
                                          {log.actorName}
                                        </p>
                                      )}
                                      {log.actorEmail && (
                                        <p className="text-[var(--fg-secondary)]">
                                          {log.actorEmail}
                                        </p>
                                      )}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="font-semibold text-[var(--fg-secondary)]">
                                      Actor id
                                    </dt>
                                    <dd className="mt-1 flex items-start gap-0.5 font-mono break-all">
                                      <span className="break-all">{log.actorId}</span>
                                      <CopyButton value={log.actorId} label="Copy actor ID" />
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="font-semibold text-[var(--fg-secondary)]">
                                      Entity id
                                    </dt>
                                    <dd className="mt-1 flex items-start gap-0.5 font-mono break-all">
                                      <span className="break-all">{log.entityId ?? '—'}</span>
                                      {log.entityId && (
                                        <CopyButton value={log.entityId} label="Copy entity ID" />
                                      )}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="font-semibold text-[var(--fg-secondary)]">
                                      Recorded at
                                    </dt>
                                    <dd className="mt-1">{new Date(log.createdAt).toISOString()}</dd>
                                  </div>
                                  <div>
                                    <dt className="font-semibold text-[var(--fg-secondary)]">
                                      Before
                                    </dt>
                                    <dd className="mt-1 font-mono break-all whitespace-pre-wrap">
                                      {describe(log.before, true)}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="font-semibold text-[var(--fg-secondary)]">
                                      After
                                    </dt>
                                    <dd className="mt-1 font-mono break-all whitespace-pre-wrap">
                                      {describe(log.after, true)}
                                    </dd>
                                  </div>
                                  <div className="sm:col-span-2 lg:col-span-2">
                                    <dt className="font-semibold text-[var(--fg-secondary)]">
                                      Metadata
                                    </dt>
                                    <dd className="mt-1 font-mono break-all whitespace-pre-wrap">
                                      {describe(log.metadata, true)}
                                    </dd>
                                  </div>
                                </dl>
                              </div>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)]">
              <p className="text-xs text-[var(--muted)]">
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
              </p>
              <div className="flex items-center gap-3">
                <div className="sm:hidden">
                  <ToolbarSelect
                    value={String(limit)}
                    onChange={(value) => {
                      setLimit(Number(value))
                      setPage(1)
                    }}
                    options={PAGE_SIZES}
                    minWidth={100}
                    ariaLabel="Rows per page"
                  />
                </div>
                <Pagination
                  currentPage={page}
                  totalPages={data?.totalPages ?? 0}
                  onPageChange={setPage}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </ThemeProvider>
  )
}
