import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Bell, CheckCheck, Mail } from 'lucide-react'
import { notificationService } from '@/services/notification.service'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Notification } from '@/types/api'

/**
 * The email copy of a notification is a mirror of the in-app one, so its
 * delivery state is worth surfacing: a buyer can tell "you also have this in
 * your inbox" from "the inbox copy did not arrive" (which the platform can
 * still replay, because the in-app record is what owns the content).
 */
function EmailCopyNote({ notification }: { notification: Notification }) {
  switch (notification.emailStatus) {
    case 'SENT':
      return (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--muted)]">
          <Mail size={11} /> Also delivered to your email
        </p>
      )
    case 'PENDING':
      return (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--muted)]">
          <Mail size={11} /> Sending the email copy…
        </p>
      )
    case 'FAILED':
      return (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-700">
          <AlertCircle size={11} /> Email copy failed — it will be retried. This message stays here.
        </p>
      )
    case 'INVALID_ADDRESS':
      return (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-700">
          <AlertCircle size={11} /> No email was sent — add a valid address in your profile
        </p>
      )
    default:
      return null
  }
}

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
      <p className="-mt-3 mb-5 flex items-center gap-1.5 text-xs text-[var(--muted)]">
        <Mail size={13} />
        Every notification listed here is also sent to your registered email address.
      </p>
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
                  <EmailCopyNote notification={n} />
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
