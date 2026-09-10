import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sellerService } from '@/services/seller.service'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { ProfileAvatar } from '@/components/ui/ProfileAvatar'
import { DocumentUpload } from '@/components/ui/DocumentUpload'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { getChangedFields, notifyNoChanges } from '@/lib/formChanges'
import type { SellerProfile, SellerDocumentType } from '@/types/api'
import { getDocumentTypeLabel } from '@/lib/sellerDocuments'

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  APPROVED: 'success', PENDING: 'warning', REJECTED: 'error', PAUSED: 'default', SUSPENDED: 'error',
}

interface SellerFormValues {
  businessName: string
  phone: string
  bankAccountHolderName: string
  bankAccountNumber: string
  ifscCode: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  pincode: string
}

const EMPTY_VALUES: SellerFormValues = {
  businessName: '',
  phone: '',
  bankAccountHolderName: '',
  bankAccountNumber: '',
  ifscCode: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  pincode: '',
}

/**
 * Flatten the seller profile into form values.
 *
 * NOTE: GET /sellers/me nests the address under `address`
 * ({ address: { addressLine1, city, ... } }) — reading flat
 * `profile.addressLine1` etc. would always be empty. The flat fields are
 * kept as a fallback for backward compatibility with older payloads.
 */
function profileToFormValues(profile: SellerProfile): SellerFormValues {
  const addr = profile.address
  return {
    businessName: profile.businessName ?? '',
    phone: profile.phone ?? '',
    bankAccountHolderName: profile.bankAccountHolderName ?? '',
    bankAccountNumber: profile.bankAccountNumber ?? '',
    ifscCode: profile.ifscCode ?? '',
    addressLine1: addr?.addressLine1 ?? profile.addressLine1 ?? '',
    addressLine2: addr?.addressLine2 ?? profile.addressLine2 ?? '',
    city: addr?.city ?? profile.city ?? '',
    state: addr?.state ?? profile.state ?? '',
    pincode: addr?.pincode ?? profile.pincode ?? '',
  }
}

export function SellerProfilePage() {
  const queryClient = useQueryClient()
  const { data: profile, isLoading } = useQuery({ queryKey: ['seller-profile'], queryFn: sellerService.getProfile })

  const originalValues = useMemo(
    () => (profile ? profileToFormValues(profile) : EMPTY_VALUES),
    [profile],
  )

  const { register, handleSubmit, reset } = useForm<SellerFormValues>({
    defaultValues: EMPTY_VALUES,
  })

  // Pre-fill the form once the profile loads (and re-sync after updates).
  useEffect(() => {
    if (profile) reset(profileToFormValues(profile))
  }, [profile, reset])

  const update = useMutation({
    mutationFn: (d: Record<string, string>) => sellerService.updateProfile(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['seller-profile'] }); toast.success('Profile updated') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  // ---- Business documents (Cloudinary via backend) ----
  const [deletingPublicId, setDeletingPublicId] = useState<string | null>(null)

  const uploadDocument = useMutation({
    mutationFn: ({ file, type }: { file: File; type: SellerDocumentType }) =>
      sellerService.uploadDocument(file, type),
    onSuccess: async (_res, vars) => {
      await queryClient.invalidateQueries({ queryKey: ['seller-profile'] })
      toast.success(`${getDocumentTypeLabel(vars.type)} uploaded`)
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to upload document. Please try again.'),
  })

  const deleteDocument = useMutation({
    mutationFn: (publicId: string) => sellerService.deleteDocument(publicId),
    onMutate: (publicId) => setDeletingPublicId(publicId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['seller-profile'] })
      toast.success('Document deleted')
    },
    onError: (e: any) => {
      const code = e.response?.data?.code
      const message = e.response?.data?.message
      if (code === 'CLOUDINARY_DELETE_FAILED' || e.response?.status === 502) {
        toast.error(message || 'Could not remove the file from storage. Nothing was changed — please try again.')
      } else if (code === 'DOCUMENT_NOT_FOUND' || e.response?.status === 404) {
        toast.error('This document no longer exists. Refreshing your documents…')
        queryClient.invalidateQueries({ queryKey: ['seller-profile'] })
      } else {
        toast.error(message || 'Failed to delete document. Please try again.')
      }
    },
    onSettled: () => setDeletingPublicId(null),
  })

  const onSubmit = (data: SellerFormValues) => {
    if (!profile) return

    // Diff against the loaded profile (trimmed) so a pristine form never
    // triggers an API call. Only changed fields are sent.
    const changedFields = getChangedFields(data, originalValues)
    const changed: Record<string, string> = {}
    ;(Object.keys(changedFields) as (keyof SellerFormValues)[]).forEach((key) => {
      const next = (changedFields[key] ?? '').trim()
      // Backend update schema uses .optional() with .min()/.regex() on most
      // fields, which rejects "" — so cleared values are dropped instead of
      // sent (addressLine2 accepts "" and can be cleared).
      if (next === '' && key !== 'addressLine2') return
      changed[key] = next
    })

    if (Object.keys(changed).length === 0) {
      notifyNoChanges()
      return
    }

    update.mutate(changed)
  }

  if (isLoading || !profile) {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="h-8 w-48 bg-neutral-200 rounded animate-pulse" />
        <div className="border rounded-xl p-6 space-y-3">
          <div className="h-5 w-32 bg-neutral-200 rounded animate-pulse" />
          <div className="h-10 w-full bg-neutral-100 rounded animate-pulse" />
          <div className="h-10 w-full bg-neutral-100 rounded animate-pulse" />
          <div className="h-10 w-1/2 bg-neutral-100 rounded animate-pulse" />
        </div>
      </div>
    )
  }

  // Backend reports the decision reason as `statusReason`
  // (`rejectionReason` kept as a legacy fallback).
  const decisionReason = profile.statusReason ?? profile.rejectionReason ?? null
  // Suspended sellers are read-only for KYC documents.
  const documentsLocked = profile.status === 'SUSPENDED'

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Seller Profile</h1>
        <Badge variant={statusColors[profile.status]}>{profile.status}</Badge>
      </div>

      {profile.status === 'REJECTED' && decisionReason && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <strong>Rejection reason:</strong> {decisionReason}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Profile Photo</CardTitle></CardHeader>
        <CardContent>
          {/* Uses the shared user-avatar APIs (POST/DELETE /users/me/avatar) —
              the seller's photo is stored on the linked user account and is
              shown in the navbar and seller sidebar immediately after an
              upload or removal (no page refresh needed). When no photo is set,
              the seller's name initial is shown as the fallback avatar. */}
          <ProfileAvatar size={80} />
        </CardContent>
      </Card>

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
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <Input label="Business Name" {...register('businessName')} />
            <Input label="Phone" {...register('phone')} />
            <Input label="Account Holder" {...register('bankAccountHolderName')} />
            <Input label="Account Number" {...register('bankAccountNumber')} />
            <Input label="IFSC" {...register('ifscCode')} />
            <Input label="Address Line 1" {...register('addressLine1')} />
            <Input label="Address Line 2" {...register('addressLine2')} />
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

      <Card>
        <CardHeader><CardTitle>Business Documents</CardTitle></CardHeader>
        <CardContent>
          {/* Uploads go through POST /sellers/me/documents (backend → Cloudinary
              "raw"); deletions through DELETE /sellers/me/documents/:publicId,
              which removes the Cloudinary asset before dropping the DB
              reference. Credentials never reach the browser. */}
          <DocumentUpload
            existingDocuments={profile.documents ?? []}
            onUpload={(file, type) => uploadDocument.mutateAsync({ file, type })}
            onDelete={(publicId) => deleteDocument.mutateAsync(publicId)}
            disabled={documentsLocked}
            disabledReason={documentsLocked ? 'Your seller account is suspended. Document uploads and deletions are disabled — please contact support.' : undefined}
            isUploading={uploadDocument.isPending}
            deletingPublicId={deletingPublicId}
          />
        </CardContent>
      </Card>
    </div>
  )
}
