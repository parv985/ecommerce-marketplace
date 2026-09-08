import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'react-hot-toast'
import { userService } from '@/services/user.service'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Trash2 } from 'lucide-react'

const profileSchema = z.object({ name: z.string().min(2) })
const addressSchema = z.object({
  label: z.string().min(1), recipientName: z.string().min(2), addressLine1: z.string().min(3), addressLine2: z.string().optional(),
  city: z.string().min(1), state: z.string().min(1), pincode: z.string().regex(/^\d{6}$/),
  phone: z.string().regex(/^\d{10}$/),
})

export function AccountPage() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showAddressForm, setShowAddressForm] = useState(false)

  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: userService.getProfile })
  const { data: addresses } = useQuery({ queryKey: ['addresses'], queryFn: userService.getAddresses })

  const updateProfile = useMutation({
    mutationFn: (data: { name: string }) => userService.updateProfile(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile'] }); toast.success('Profile updated') },
  })

  const uploadAvatar = useMutation({
    mutationFn: (file: File) => userService.uploadAvatar(file),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile'] }); toast.success('Avatar updated') },
  })

  const deleteAvatar = useMutation({
    mutationFn: () => userService.deleteAvatar(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile'] }); toast.success('Avatar removed') },
  })

  const { register: registerProfile, handleSubmit: handleProfileSubmit, formState: { errors: profileErrors } } = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema) })
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof addressSchema>>({ resolver: zodResolver(addressSchema) })

  const createAddress = useMutation({
    mutationFn: (data: z.infer<typeof addressSchema>) => userService.createAddress(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['addresses'] }); setShowAddressForm(false); reset(); toast.success('Address added') },
  })

  const deleteAddress = useMutation({
    mutationFn: (id: string) => userService.deleteAddress(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['addresses'] }); toast.success('Address removed') },
  })

  return (
    <div className="container-app py-8">
      <h1 className="text-2xl font-bold mb-6">My Account</h1>
      <div className="grid md:grid-cols-2 gap-6">
        {/* Profile */}
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-zinc-200 overflow-hidden flex items-center justify-center text-xl font-bold">
                {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" /> : profile?.name?.charAt(0)}
              </div>
              <div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar.mutate(f) }} />
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>Change Avatar</Button>
                {profile?.avatarUrl && <Button variant="ghost" size="sm" onClick={() => deleteAvatar.mutate()}>Remove</Button>}
              </div>
            </div>
            <form onSubmit={handleProfileSubmit((d) => updateProfile.mutate(d))} className="space-y-3">
              <Input label="Name" defaultValue={profile?.name} error={profileErrors.name?.message} {...registerProfile('name')} />
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
            <Button variant="outline" size="sm" onClick={() => setShowAddressForm(true)}>Add</Button>
          </CardHeader>
          <CardContent>
            {!addresses?.length ? (
              <p className="text-sm text-[var(--muted)]">No addresses yet</p>
            ) : (
              <div className="space-y-3">
                {addresses.map(addr => (
                  <div key={addr.id} className="border rounded p-3 flex justify-between">
                    <div>
                      <span className="font-medium text-sm">{addr.label}</span>
                      <p className="text-sm text-[var(--muted)]">{addr.recipientName} — {addr.addressLine1}, {addr.city}, {addr.state} {addr.pincode}</p>
                    </div>
                    <button onClick={() => deleteAddress.mutate(addr.id)} className="text-[var(--muted)] hover:text-[var(--destructive)]">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showAddressForm} onClose={() => setShowAddressForm(false)} title="Add Address">
        <form onSubmit={handleSubmit((d) => createAddress.mutate(d))} className="space-y-3">
          <Input label="Label" placeholder="Home/Office" error={errors.label?.message} {...register('label')} />
          <Input label="Recipient Name" error={errors.recipientName?.message} {...register('recipientName')} />
          <Input label="Address" error={errors.addressLine1?.message} {...register('addressLine1')} />
          <Input label="Address 2" {...register('addressLine2')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="City" error={errors.city?.message} {...register('city')} />
            <Input label="State" error={errors.state?.message} {...register('state')} />
          </div>
          <Input label="PIN" error={errors.pincode?.message} {...register('pincode')} />
          <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
          <Button type="submit" className="w-full">Save</Button>
        </form>
      </Dialog>
    </div>
  )
}
