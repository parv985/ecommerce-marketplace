import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { authApi } from '@/services/auth.service'
import { extractErrorMessage } from '@/services/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

const schema = z.object({ email: z.string().email('Enter a valid email') })

export function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const { register, handleSubmit } = useForm<{ email: string }>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: { email: string }) => {
    try {
      setLoading(true)
      await authApi.forgotPassword(data.email)
      setSent(true)
    } catch (err) {
      toast.error(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8">
            <p className="text-sm text-[var(--muted)] mb-4">Check your email for a password reset link.</p>
            <Link to="/login" className="text-sm text-[var(--primary)] hover:underline">Back to login</Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Forgot password?</CardTitle>
          <p className="text-sm text-[var(--muted)]">Enter your email and we'll send you a reset link.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Email" type="email" placeholder="you@example.com" {...register('email')} />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending...' : 'Send reset link'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm">
            <Link to="/login" className="text-[var(--primary)] hover:underline">Back to login</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
