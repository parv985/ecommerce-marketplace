import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/services/auth.service'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from 'react-hot-toast'
import { Shield, Copy, CheckCircle } from 'lucide-react'

type Step = 'loading' | 'setup' | 'verify' | 'done'

export function SellerTwoFactorSetupPage() {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()
  const [step, setStep] = useState<Step>('loading')
  const [qrData, setQrData] = useState<{ secret: string; otpauthUrl: string; recoveryCodes: string[] } | null>(null)
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)

  // Step 1: Fetch 2FA setup data
  const setupMutation = useMutation({
    mutationFn: () => authApi.setup2FA(),
    onSuccess: (res) => {
      setQrData(res.data)
      setStep('setup')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to start 2FA setup')
      setStep('setup')
    },
  })

  // Step 2: Verify code and enable 2FA
  const enableMutation = useMutation({
    mutationFn: () => authApi.enable2FA(code),
    onSuccess: () => {
      toast.success('Two-factor authentication enabled!')
      // Update user state
      if (user) {
        setUser({ ...user })
      }
      setStep('done')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Invalid verification code')
    },
  })

  useEffect(() => {
    setupMutation.mutate()
  }, [])

  const copySecret = () => {
    if (qrData?.secret) {
      navigator.clipboard.writeText(qrData.secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const copyRecoveryCodes = () => {
    if (qrData?.recoveryCodes) {
      navigator.clipboard.writeText(qrData.recoveryCodes.join('\n'))
      toast.success('Recovery codes copied')
    }
  }

  if (step === 'loading') {
    return (
      <div className="max-w-lg mx-auto space-y-6 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="max-w-lg mx-auto space-y-6 py-8">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-2">
              <CheckCircle size={24} className="text-green-600" />
            </div>
            <CardTitle className="text-xl">2FA Enabled Successfully</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-[var(--muted)] text-center">
              Two-factor authentication is now active on your account. You will need your authenticator app to perform sensitive operations.
            </p>
            <Button className="w-full" onClick={() => navigate('/seller/products')}>
              Continue to Products
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 py-8">
      <h1 className="text-2xl font-bold">Set Up Two-Factor Authentication</h1>
      <p className="text-sm text-[var(--muted)]">
        Two-factor authentication is required to create and manage products. Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.).
      </p>

      {step === 'setup' && qrData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield size={20} /> Step 1: Scan QR Code
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* QR Code */}
            <div className="flex justify-center">
              <div className="bg-white p-4 border rounded-lg">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData.otpauthUrl)}`}
                  alt="2FA QR Code"
                  className="w-48 h-48"
                />
              </div>
            </div>

            {/* Manual entry */}
            <div>
              <p className="text-xs text-[var(--muted)] mb-1">Or enter this secret manually:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-zinc-100 px-3 py-2 rounded text-sm font-mono break-all">
                  {qrData.secret}
                </code>
                <button onClick={copySecret} className="p-2 hover:bg-zinc-100 rounded" title="Copy secret">
                  {copied ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            {/* Recovery codes */}
            <div>
              <p className="text-xs text-[var(--muted)] mb-1">Save these recovery codes (use if you lose your phone):</p>
              <div className="bg-zinc-100 rounded p-3 text-sm font-mono space-y-0.5">
                {qrData.recoveryCodes.map((code, i) => (
                  <div key={i}>{code}</div>
                ))}
              </div>
              <button onClick={copyRecoveryCodes} className="text-xs text-[var(--primary)] hover:underline mt-1">
                Copy all recovery codes
              </button>
            </div>

            <Button className="w-full" onClick={() => setStep('verify')}>
              I've saved my codes — Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 'verify' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield size={20} /> Step 2: Verify Code
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              Enter the 6-digit code from your authenticator app to verify setup.
            </p>
            <Input
              label="Verification Code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              autoComplete="one-time-code"
            />
            <Button
              className="w-full"
              onClick={() => enableMutation.mutate()}
              disabled={enableMutation.isPending || code.length < 6}
            >
              {enableMutation.isPending ? 'Verifying...' : 'Enable 2FA'}
            </Button>
            <button
              onClick={() => setStep('setup')}
              className="w-full text-sm text-[var(--muted)] hover:underline"
            >
              ← Back to QR code
            </button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
