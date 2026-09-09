import { ScrollText } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'

export function AdminAuditPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Audit Log</h1>
      <EmptyState
        icon={<ScrollText size={48} />}
        title="Audit Log"
        description="Audit logs record important actions performed by users, sellers, and admins. This page will display the complete audit trail once the backend exposes a public audit log API endpoint."
      />
    </div>
  )
}
