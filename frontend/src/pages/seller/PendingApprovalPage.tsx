import { Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'

export function PendingApprovalPage() {
  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="pt-8 pb-8">
          <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
            <Clock className="h-8 w-8 text-yellow-600" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Awaiting Approval</h2>
          <p className="text-sm text-[var(--muted)]">
            Your seller registration has been submitted. An admin will review and approve your account shortly.
            You will receive an email notification once approved.
          </p>
          <p className="text-sm text-[var(--muted)] mt-4">
            You can close this page and check back later.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
