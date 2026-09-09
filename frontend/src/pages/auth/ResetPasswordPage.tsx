import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { authApi } from '@/services/auth.service'
import { extractErrorMessage } from '@/services/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

const schema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: z.infer<typeof schema>) => {
    try {
      setLoading(true)
      await authApi.resetPassword({ token, password: data.password, confirmPassword: data.confirmPassword })
      setDone(true)
    } catch (err) {
      toast.error(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (!token) return <div className="text-center py-20 text-[var(--muted)]">Invalid reset link.</div>
  if (done) return (
    <div className="text-center py-20">
      <p className="mb-4">Password reset successfully.</p>
      <Link to="/login" className="text-[var(--primary)] hover:underline">Sign in</Link>
    </div>
  )

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>Reset password</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="New Password" type="password" placeholder="••••••••" error={errors.password?.message} {...register('password')} />
            <Input label="Confirm Password" type="password" placeholder="••••••••" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
            <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Resetting...' : 'Reset Password'}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
