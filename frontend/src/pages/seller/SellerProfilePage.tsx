import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sellerService } from '@/services/seller.service'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  APPROVED: 'success', PENDING: 'warning', REJECTED: 'error', PAUSED: 'default', SUSPENDED: 'error',
}

export function SellerProfilePage() {
  const queryClient = useQueryClient()
  const { data: profile } = useQuery({ queryKey: ['seller-profile'], queryFn: sellerService.getProfile })
  const { register, handleSubmit } = useForm({ values: { businessName: profile?.businessName || '', phone: profile?.phone || '', bankAccountHolderName: profile?.bankAccountHolderName || '', bankAccountNumber: profile?.bankAccountNumber || '', ifscCode: profile?.ifscCode || '', addressLine1: profile?.addressLine1 || '', addressLine2: profile?.addressLine2 || '', city: profile?.city || '', state: profile?.state || '', pincode: profile?.pincode || '' } })

  const update = useMutation({
    mutationFn: (d: Record<string, string>) => sellerService.updateProfile(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['seller-profile'] }); toast.success('Profile updated') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  if (!profile) return null

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Seller Profile</h1>
        <Badge variant={statusColors[profile.status]}>{profile.status}</Badge>
      </div>

      {profile.status === 'REJECTED' && profile.rejectionReason && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <strong>Rejection reason:</strong> {profile.rejectionReason}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Business Details</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-[var(--muted)]">Business Name:</span> <p className="font-medium">{profile.businessName}</p></div>
            <div><span className="text-[var(--muted)]">GSTIN:</span> <p className="font-medium font-mono">{profile.gstin}</p></div>
            <div><span className="text-[var(--muted)]">PAN:</span> <p className="font-medium font-mono">{profile.pan}</p></div>
            <div><span className="text-[var(--muted)]">Phone:</span> <p className="font-medium">{profile.phone || '-'}</p></div>
          </div>
          <p className="text-xs text-[var(--muted)] mt-3">GSTIN and PAN cannot be changed after registration.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Edit Details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((d) => {
            // Filter out empty strings so optional fields pass backend validation.
            // Backend schema uses .optional() which only accepts undefined, not "".
            const filtered = Object.fromEntries(
              Object.entries(d).filter(([_, v]) => v !== '')
            )
            update.mutate(filtered as Record<string, string>)
          })} className="space-y-3">
            <Input label="Business Name" {...register('businessName')} />
            <Input label="Phone" {...register('phone')} />
            <Input label="Account Holder" {...register('bankAccountHolderName')} />
            <Input label="Account Number" {...register('bankAccountNumber')} />
            <Input label="IFSC" {...register('ifscCode')} />
            <Input label="Address" {...register('addressLine1')} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="City" {...register('city')} />
              <Input label="State" {...register('state')} />
            </div>
            <Input label="Pincode" {...register('pincode')} />
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Updating...' : 'Update Profile'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
