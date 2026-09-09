import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import { formatDateFull } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

export function AdminAuditPage() {
  const [page, setPage] = useState(1)
  const [actorId, setActorId] = useState('')
  const [actorRole, setActorRole] = useState('')
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [entityId, setEntityId] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      'admin-audit-logs',
      page,
      actorId,
      actorRole,
      action,
      entityType,
      entityId,
      fromDate,
      toDate,
      sortBy,
      sortOrder,
    ],
    queryFn: () =>
      adminService.getAuditLogs({
        page,
        limit: 20,
        actorId: actorId || undefined,
        actorRole: actorRole || undefined,
        action: action || undefined,
        entityType: entityType || undefined,
        entityId: entityId || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        sortBy,
        sortOrder,
      }),
  })

  const applyFilter = () => setPage(1)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Audit Log</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
        <Input placeholder="Actor ID" value={actorId} onChange={(e) => { setActorId(e.target.value); applyFilter() }} />
        <Input placeholder="Actor role" value={actorRole} onChange={(e) => { setActorRole(e.target.value); applyFilter() }} />
        <Input placeholder="Action" value={action} onChange={(e) => { setAction(e.target.value); applyFilter() }} />
        <Input placeholder="Entity type" value={entityType} onChange={(e) => { setEntityType(e.target.value); applyFilter() }} />
        <Input placeholder="Entity ID" value={entityId} onChange={(e) => { setEntityId(e.target.value); applyFilter() }} />
        <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); applyFilter() }} />
        <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); applyFilter() }} />
        <Select
          value={`${sortBy}:${sortOrder}`}
          onChange={(e) => {
            const [by, order] = e.target.value.split(':')
            setSortBy(by)
            setSortOrder(order as 'asc' | 'desc')
            setPage(1)
          }}
          options={[
            { value: 'createdAt:desc', label: 'Newest first' },
            { value: 'createdAt:asc', label: 'Oldest first' },
            { value: 'action:asc', label: 'Action A–Z' },
            { value: 'action:desc', label: 'Action Z–A' },
            { value: 'actorRole:asc', label: 'Role A–Z' },
            { value: 'entityType:asc', label: 'Entity type A–Z' },
          ]}
        />
      </div>

      {isLoading && <p className="text-sm text-[var(--muted)] py-8">Loading audit logs…</p>}

      {isError && (
        <p className="text-sm text-red-700 py-8">
          {(error as Error)?.message || 'Failed to load audit logs.'}
        </p>
      )}

      {!isLoading && !isError && (!data?.items || data.items.length === 0) && (
        <EmptyState
          icon={<ScrollText size={48} />}
          title="No audit logs"
          description="No records match the current filters."
        />
      )}

      {!isLoading && !isError && data && data.items.length > 0 && (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">Time</th>
                <th className="text-left p-3 font-medium">Actor</th>
                <th className="text-left p-3 font-medium">Action</th>
                <th className="text-left p-3 font-medium">Entity</th>
                <th className="text-left p-3 font-medium">Changes</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((log) => (
                <tr key={log.id} className="border-b align-top">
                  <td className="p-3 whitespace-nowrap text-[var(--muted)]">
                    {formatDateFull(log.createdAt)}
                  </td>
                  <td className="p-3">
                    <p className="font-mono text-xs break-all">{log.actorId}</p>
                    <Badge variant="default">{log.actorRole}</Badge>
                  </td>
                  <td className="p-3 font-medium">{log.action}</td>
                  <td className="p-3">
                    <p>{log.entityType}</p>
                    {log.entityId && (
                      <p className="font-mono text-xs text-[var(--muted)] break-all">{log.entityId}</p>
                    )}
                  </td>
                  <td className="p-3 max-w-xs">
                    <pre className="text-[10px] whitespace-pre-wrap break-all text-[var(--muted)]">
                      {JSON.stringify({ before: log.before, after: log.after, metadata: log.metadata }, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4">
            <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} />
          </div>
        </div>
      )}
    </div>
  )
}
