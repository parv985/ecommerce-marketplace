import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'react-hot-toast'
import { userService } from '@/services/user.service'
import { formatDate } from '@/lib/utils'
import { hasChanges, notifyNoChanges } from '@/lib/formChanges'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { ProfileAvatar } from '@/components/ui/ProfileAvatar'
import { StateCityFields } from '@/components/ui/StateCityFields'
import { Pencil, Trash2 } from 'lucide-react'
import type { Address } from '@/types/api'

const profileSchema = z.object({ name: z.string().min(2) })
const addressSchema = z.object({
  label: z.string().trim().min(1, 'Label is required'),
  recipientName: z.string().trim().min(2, 'Recipient name is required'),
  addressLine1: z.string().trim().min(3, 'Address is required'),
  addressLine2: z.string().optional(),
  state: z.string().trim().min(1, 'State is required'),
  city: z.string().trim().min(1, 'City is required'),
  pincode: z.string().trim().regex(/^\d{6}$/, 'PIN must be 6 digits'),
  phone: z.string().trim().regex(/^\d{10}$/, 'Phone must be 10 digits'),
})

type AddressFormValues = z.infer<typeof addressSchema>

const EMPTY_ADDRESS_FORM: AddressFormValues = {
  label: '',
  recipientName: '',
  addressLine1: '',
  addressLine2: '',
  state: '',
  city: '',
  pincode: '',
  phone: '',
}

export function AccountPage() {
  const queryClient = useQueryClient()
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null)

  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: userService.getProfile })
  const { data: addresses } = useQuery({ queryKey: ['addresses'], queryFn: userService.getAddresses })

  const updateProfile = useMutation({
    mutationFn: (data: { name: string }) => userService.updateProfile(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile'] }); toast.success('Profile updated') },
  })

  const { register: registerProfile, handleSubmit: handleProfileSubmit, reset: resetProfile, formState: { errors: profileErrors } } = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema) })

  /* Keep the form in sync with the loaded profile so the diff below always has
     a trustworthy baseline (and the field is filled once the query resolves). */
  const originalName = profile?.name ?? ''
  useEffect(() => {
    if (profile) resetProfile({ name: originalName })
  }, [profile, originalName, resetProfile])

  /*
   * An untouched "Update Profile" click must not hit the API — compare the form
   * value with the stored name first and report that there is nothing to save.
   */
  const submitProfile = (data: z.infer<typeof profileSchema>) => {
    if (!hasChanges(data, { name: originalName })) {
      notifyNoChanges()
      return
    }
    updateProfile.mutate(data)
  }

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<AddressFormValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: EMPTY_ADDRESS_FORM,
  })

  const editingAddress = addresses?.find((a) => a.id === editingAddressId)

  const createAddress = useMutation({
    mutationFn: (data: AddressFormValues) => userService.createAddress(data),
    onSuccess: (res) => {
      queryClient.setQueryData<Address[]>(['addresses'], (old) =>
        old ? [...old, res.data] : [res.data]
      )
      queryClient.invalidateQueries({ queryKey: ['addresses'] })
      setShowAddressForm(false)
      reset(EMPTY_ADDRESS_FORM)
      toast.success('Address added')
    },
  })

  const updateAddress = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AddressFormValues }) =>
      userService.updateAddress(id, data),
    onSuccess: (res) => {
      queryClient.setQueryData<Address[]>(['addresses'], (old) =>
        old?.map((a) => (a.id === res.data.id ? res.data : a))
      )
      queryClient.invalidateQueries({ queryKey: ['addresses'] })
      setShowAddressForm(false)
      setEditingAddressId(null)
      reset(EMPTY_ADDRESS_FORM)
      toast.success('Address updated')
    },
  })

  const deleteAddress = useMutation({
    mutationFn: (id: string) => userService.deleteAddress(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['addresses'] }); toast.success('Address removed') },
  })

  const handleOpenAdd = () => {
    setEditingAddressId(null)
    reset(EMPTY_ADDRESS_FORM)
    setShowAddressForm(true)
  }

  const handleOpenEdit = (addr: Address) => {
    setEditingAddressId(addr.id)
    reset({
      label: addr.label,
      recipientName: addr.recipientName,
      addressLine1: addr.addressLine1,
      addressLine2: addr.addressLine2 ?? '',
      state: addr.state,
      city: addr.city,
      pincode: addr.pincode,
      phone: addr.phone,
    })
    setShowAddressForm(true)
  }

  const handleAddressSubmit = (data: AddressFormValues) => {
    if (editingAddressId) {
      updateAddress.mutate({ id: editingAddressId, data })
    } else {
      createAddress.mutate(data)
    }
  }

  return (
    <div className="container-app py-8">
      <h1 className="text-2xl font-bold mb-6">My Account</h1>
      <div className="grid md:grid-cols-2 gap-6">
        {/* Profile */}
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* Avatar (photo or name initial) + upload/change/remove. Updates
                the navbar icon immediately via the auth store. */}
            <ProfileAvatar size={64} />
            <form onSubmit={handleProfileSubmit(submitProfile)} className="space-y-3">
              <Input label="Name" error={profileErrors.name?.message} {...registerProfile('name')} />
              <Input label="Email" value={profile?.email || ''} disabled />
              <p className="text-xs text-[var(--muted)]">Account created: {profile?.createdAt ? formatDate(profile.createdAt) : '-'}</p>
              <Button type="submit" size="sm">Update Profile</Button>
            </form>
          </CardContent>
        </Card>

        {/* Addresses */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Addresses</CardTitle>
            <Button variant="outline" size="sm" onClick={handleOpenAdd}>Add</Button>
          </CardHeader>
          <CardContent>
            {!addresses?.length ? (
              <p className="text-sm text-[var(--muted)]">No addresses yet</p>
            ) : (
              <div className="space-y-3">
                {addresses.map(addr => (
                  <div key={addr.id} className="border rounded p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-sm block">{addr.label}</span>
                      <p className="text-sm text-[var(--muted)] break-words">
                        {addr.recipientName} — {addr.addressLine1}{addr.addressLine2 ? `, ${addr.addressLine2}` : ''}, {addr.city}, {addr.state} {addr.pincode}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleOpenEdit(addr)}
                        className="text-[var(--muted)] hover:text-[var(--primary)] shrink-0 p-1"
                        aria-label="Edit address"
                        title="Edit address"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => deleteAddress.mutate(addr.id)}
                        className="text-[var(--muted)] hover:text-[var(--destructive)] shrink-0 p-1"
                        aria-label="Delete address"
                        title="Delete address"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={showAddressForm}
        onClose={() => {
          setShowAddressForm(false)
          setEditingAddressId(null)
        }}
        title={editingAddressId ? 'Edit Address' : 'Add Address'}
      >
        <form onSubmit={handleSubmit(handleAddressSubmit)} className="space-y-3">
          <Input label="Label" placeholder="Home/Office" error={errors.label?.message} {...register('label')} />
          <Input label="Recipient Name" error={errors.recipientName?.message} {...register('recipientName')} />
          <Input label="Address" error={errors.addressLine1?.message} {...register('addressLine1')} />
          <Input label="Address 2" {...register('addressLine2')} />
          <div className="grid grid-cols-2 gap-3">
            <StateCityFields
              control={control}
              setValue={setValue}
              getValues={getValues}
              originalState={editingAddress?.state}
              originalCity={editingAddress?.city}
            />
          </div>
          <Input label="PIN" error={errors.pincode?.message} {...register('pincode')} />
          <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
          <Button
            type="submit"
            className="w-full"
            disabled={createAddress.isPending || updateAddress.isPending}
          >
            {createAddress.isPending || updateAddress.isPending
              ? 'Saving...'
              : editingAddressId
              ? 'Update'
              : 'Save'}
          </Button>
        </form>
      </Dialog>
    </div>
  )
}
