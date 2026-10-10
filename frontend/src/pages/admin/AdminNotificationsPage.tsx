import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { adminService } from '@/services/admin.service'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { TextArea } from '@/components/ui/TextArea'
import { toast } from 'react-hot-toast'

type RecipientOption = 'ALL_SELLERS' | 'ALL_USERS' | ''

export function AdminNotificationsPage() {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [channel, setChannel] = useState('BOTH')
  const [recipient, setRecipient] = useState<RecipientOption | string>('')

  // Individual buyers/sellers (Super Admin can now target a specific
  // person) plus the broadcast groups. Limit to the first 100 of each.
  const buyersQuery = useQuery({
    queryKey: ['admin', 'users', 'BUYER'],
    queryFn: () => adminService.getUsers({ role: 'BUYER', limit: 100 }),
  })
  const sellersQuery = useQuery({
    queryKey: ['admin', 'users', 'SELLER'],
    queryFn: () => adminService.getUsers({ role: 'SELLER', limit: 100 }),
  })

  const buyers = useMemo(() => buyersQuery.data?.items ?? [], [buyersQuery.data])
  const sellers = useMemo(() => sellersQuery.data?.items ?? [], [sellersQuery.data])

  const broadcast = useMutation({
    mutationFn: () => {
      const payload =
        recipient === 'ALL_SELLERS' || recipient === 'ALL_USERS'
          ? {
              title,
              message,
              channel,
              audience: recipient === 'ALL_SELLERS' ? ('SELLERS' as const) : ('USERS' as const),
            }
          : {
              title,
              message,
              channel,
              recipientIds: [recipient],
            }
      return adminService.broadcast(payload as any)
    },
    onSuccess: (res) => {
      const count = res.data?.deliveredTo ?? 0
      toast.success(`Notification sent to ${count} ${count === 1 ? 'recipient' : 'recipients'}`)
      setTitle('')
      setMessage('')
      setRecipient('')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error sending notification'),
  })

  const retryEmails = useMutation({
    mutationFn: () => adminService.retryNotificationEmails(),
    onSuccess: result => {
      if (!result || result.attempted === 0) {
        toast('No failed notification emails to retry')
        return
      }

      if (result.failed > 0) {
        toast.error(
          `${result.sent} emailed, ${result.failed} still failing (${result.pending} left in the backlog)`,
        )
        return
      }

      toast.success(`${result.sent} failed email${result.sent === 1 ? '' : 's'} resent`)
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || 'Could not retry the failed emails'),
  })

  const loadingRecipients = buyersQuery.isLoading || sellersQuery.isLoading

  const selectedLabel = recipient === 'ALL_SELLERS'
    ? 'All Sellers'
    : recipient === 'ALL_USERS'
      ? 'All Users (Buyers)'
      : (recipient
          ? [...buyers, ...sellers].find(u => u.id === recipient)?.name ?? 'the selected user'
          : null)

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-1">Broadcast Notification</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        Send a notification to every buyer/seller or to a specific person.
      </p>
      <div className="space-y-4">
        <Input label="Title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Notification title" />
        <TextArea label="Message" value={message} onChange={e => setMessage(e.target.value)} placeholder="Notification message" />
        <div>
          <label className="block text-sm font-medium mb-1.5">Channel</label>
          <select className="w-full border rounded px-3 py-2 text-sm" value={channel} onChange={e => setChannel(e.target.value)}>
            <option value="BOTH">Both (In-App + Email)</option>
            <option value="IN_APP">In-App Only</option>
            <option value="EMAIL">Email Only</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Send To</label>
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={recipient}
            onChange={e => setRecipient(e.target.value as RecipientOption | string)}
            disabled={loadingRecipients}
          >
            <option value="">{loadingRecipients ? 'Loading recipients…' : 'Select recipient'}</option>
            <optgroup label="Everyone">
              <option value="ALL_SELLERS">All Sellers</option>
              <option value="ALL_USERS">All Users (Buyers)</option>
            </optgroup>
            {sellers.length > 0 && (
              <optgroup label="Individual Sellers">
                {sellers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.name} — {user.email}
                  </option>
                ))}
              </optgroup>
            )}
            {buyers.length > 0 && (
              <optgroup label="Individual Buyers">
                {buyers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.name} — {user.email}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {recipient && !recipient.startsWith('ALL_') && (
            <p className="text-xs text-[var(--muted)] mt-1.5">
              This notification will be sent only to <span className="font-medium text-[var(--fg)]">{selectedLabel}</span>.
            </p>
          )}
        </div>
        <Button
          className="w-full"
          disabled={!title || !message || !recipient || broadcast.isPending}
          onClick={() => broadcast.mutate()}
        >
          {broadcast.isPending ? 'Sending…' : 'Send Notification'}
        </Button>
      </div>

      {/*
        In-app notifications are the source of truth; when the email mirror
        of one of them fails (relay outage, timeout) the record is kept and
        stays eligible for this pass. Retrying never re-creates a
        notification, so nobody gets a second message or a second unread
        badge — only the email that never arrived is resent.
      */}
      <div className="mt-8 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
        <h2 className="text-sm font-semibold">Failed email deliveries</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Replays the email copy of notifications whose delivery failed, oldest first, using each
          recipient's registered address. Safe to run more than once.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={retryEmails.isPending}
            onClick={() => retryEmails.mutate()}
          >
            {retryEmails.isPending ? 'Retrying…' : 'Retry failed emails'}
          </Button>
          {retryEmails.data && (
            <span className="text-xs text-[var(--muted)]">
              {retryEmails.data.attempted === 0
                ? 'Nothing to retry.'
                : `${retryEmails.data.sent} sent · ${retryEmails.data.failed} failed · ${retryEmails.data.skipped} skipped · ${retryEmails.data.pending} left`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
