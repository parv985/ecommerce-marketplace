import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/services/auth.service'
import { Skeleton } from '@/components/ui/Skeleton'
import { User, Mail, Shield, Calendar, CheckCircle, XCircle } from 'lucide-react'

function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date))
}

export default function AdminProfilePage() {
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['admin-profile'],
    queryFn: () => authApi.getMe(),
  })

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="bg-white border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
          <Skeleton className="h-px w-full" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Failed to load profile information.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Admin Profile</h1>

      <div className="bg-white border rounded-xl overflow-hidden">
        {/* Header with avatar */}
        <div className="px-6 py-5 border-b bg-slate-50/50">
          <div className="flex items-center gap-4">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.name}
                className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-xl font-bold text-slate-600 border-2 border-white shadow-sm">
                {profile.name?.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{profile.name}</h2>
              <p className="text-sm text-slate-500">{profile.email}</p>
            </div>
          </div>
        </div>

        {/* Details grid */}
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Full Name */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <User size={16} className="text-slate-500" />
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">Full Name</p>
                <p className="text-sm font-medium text-slate-900 mt-0.5">{profile.name}</p>
              </div>
            </div>

            {/* Email */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <Mail size={16} className="text-slate-500" />
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">Email</p>
                <p className="text-sm font-medium text-slate-900 mt-0.5">{profile.email}</p>
              </div>
            </div>

            {/* Role */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <Shield size={16} className="text-slate-500" />
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">Role</p>
                <p className="text-sm font-medium text-slate-900 mt-0.5">Super Admin</p>
              </div>
            </div>

            {/* Email Verified */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                {profile.isEmailVerified ? (
                  <CheckCircle size={16} className="text-green-500" />
                ) : (
                  <XCircle size={16} className="text-amber-500" />
                )}
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">Email Status</p>
                <p className="text-sm font-medium text-slate-900 mt-0.5">
                  {profile.isEmailVerified ? 'Verified' : 'Not Verified'}
                </p>
              </div>
            </div>

            {/* Account Status */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <Shield size={16} className="text-slate-500" />
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">Account Status</p>
                <p className="text-sm font-medium text-green-600 mt-0.5">Active</p>
              </div>
            </div>

            {/* Date Joined */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <Calendar size={16} className="text-slate-500" />
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">Date Joined</p>
                <p className="text-sm font-medium text-slate-900 mt-0.5">
                  {formatDate(profile.createdAt)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
