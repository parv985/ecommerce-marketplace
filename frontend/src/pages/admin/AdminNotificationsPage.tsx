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
    </div>
  )
}
