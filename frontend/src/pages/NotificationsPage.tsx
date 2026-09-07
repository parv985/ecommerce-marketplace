import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { notificationService } from '@/services/notification.service'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'

export function NotificationsPage() {
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['notifications', page],
    queryFn: () => notificationService.list({ page, limit: 20 }),
  })

  const markRead = useMutation({
    mutationFn: (id: string) => notificationService.markAsRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAllRead = useMutation({
    mutationFn: () => notificationService.markAllAsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  return (
    <div className="container-app py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()}><CheckCheck size={14} className="mr-1" /> Mark all read</Button>
      </div>
      {!data?.items?.length ? (
        <EmptyState icon={<Bell size={48} />} title="No notifications" description="You're all caught up!" />
      ) : (
        <div className="space-y-2">
          {data.items.map(n => (
            <div key={n.id} className={`p-4 border rounded-lg ${n.isRead ? 'bg-white' : 'bg-blue-50 border-blue-100'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-sm">{n.title}</h3>
                  <p className="text-sm text-[var(--muted)] mt-1">{n.message}</p>
                  <p className="text-xs text-[var(--muted)] mt-1">{formatDate(n.createdAt)}</p>
                </div>
                {!n.isRead && (
                  <button onClick={() => markRead.mutate(n.id)} className="text-xs text-blue-600 hover:underline shrink-0">
                    Mark read
                  </button>
                )}
              </div>
            </div>
          ))}
          {data.totalPages > 1 && <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} />}
        </div>
      )}
    </div>
  )
}
