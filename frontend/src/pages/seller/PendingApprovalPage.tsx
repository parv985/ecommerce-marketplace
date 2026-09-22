import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Clock, CheckCircle2, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/services/auth.service'

export function PendingApprovalPage() {
  const { user, isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  const [isApproved, setIsApproved] = useState(false)

  useEffect(() => {
    if (!isAuthenticated || !user) return

    if (user.role === 'SUPER_ADMIN') {
      navigate('/admin/dashboard', { replace: true })
      return
    }

    if (user.role === 'BUYER') {
      navigate('/', { replace: true })
      return
    }

    if (user.role === 'SELLER') {
      if (user.sellerStatus === 'APPROVED') {
        setIsApproved(true)
        navigate('/seller/dashboard', { replace: true })
        return
      }

      authApi
        .getSellerProfile()
        .then((profile) => {
          if (profile.status === 'APPROVED') {
            setIsApproved(true)
            navigate('/seller/dashboard', { replace: true })
          }
        })
        .catch(() => {
          // Stay on awaiting approval screen if profile status cannot be verified
        })
    }
  }, [isAuthenticated, user, navigate])

  if (isApproved) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Account Approved!</h2>
            <p className="text-sm text-[var(--muted)] mb-4">
              Your seller account has been approved. Redirecting to your dashboard...
            </p>
            <Button onClick={() => navigate('/seller/dashboard', { replace: true })}>
              Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

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
          <div className="mt-6">
            <Link to="/login">
              <Button variant="outline" size="sm">
                Go to Sign In
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
