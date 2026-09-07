import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { adminService } from '@/services/admin.service'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { TextArea } from '@/components/ui/TextArea'
import { toast } from 'react-hot-toast'

export function AdminNotificationsPage() {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [channel, setChannel] = useState('BOTH')
  const [audience, setAudience] = useState<'SELLERS' | 'USERS' | ''>('')

  const broadcast = useMutation({
    mutationFn: () => adminService.broadcast({ title, message, channel, audience: (audience || undefined) as any }),
    onSuccess: (res) => { toast.success(`Notification sent to ${res.data?.deliveredTo || 0} users`); setTitle(''); setMessage(''); setAudience(''); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Broadcast Notification</h1>
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
          <select className="w-full border rounded px-3 py-2 text-sm" value={audience} onChange={e => setAudience(e.target.value as any)}>
            <option value="">Select audience</option>
            <option value="SELLERS">All Sellers</option>
            <option value="USERS">All Users (Buyers)</option>
          </select>
        </div>
        <Button className="w-full" disabled={!title || !message || !audience} onClick={() => broadcast.mutate()}>
          Send Notification
        </Button>
      </div>
    </div>
  )
}
