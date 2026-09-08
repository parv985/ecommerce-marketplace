import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { toast } from 'react-hot-toast'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { userService } from '@/services/user.service'
import { extractErrorMessage } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

// Keep in sync with the backend upload middleware
// (src/middlewares/upload.middleware.ts: ALLOWED_IMAGE_MIMES / MAX_IMAGE_SIZE).
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_AVATAR_SIZE = 5 * 1024 * 1024

interface ProfileAvatarProps {
  /** Rendered diameter of the circular avatar in px (default 64). */
  size?: number
  /** Name used for the initial fallback (default: logged-in user's name). */
  name?: string
  /** Explicit avatar URL. Default: avatar of the logged-in user from the auth store. */
  avatarUrl?: string | null
  /** Show the upload/change and remove actions (default true). */
  showActions?: boolean
  className?: string
}

/**
 * Circular profile avatar with name-initial fallback, plus upload/change and
 * remove actions backed by the existing user avatar APIs:
 *   POST   /api/v1/users/me/avatar  (multipart `image`, Cloudinary)
 *   DELETE /api/v1/users/me/avatar
 *
 * On success the auth store is updated so the navbar account icon and every
 * other place reading the logged-in user's avatar re-render immediately —
 * no page refresh needed. Replacing an avatar deletes the previous Cloudinary
 * image on the backend side.
 */
export function ProfileAvatar({ size = 64, name, avatarUrl, showActions = true, className }: ProfileAvatarProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { user, updateUser } = useAuthStore()

  const displayUrl = avatarUrl ?? user?.avatarUrl ?? null
  const displayName = name ?? user?.name ?? ''

  const uploadAvatar = useMutation({
    mutationFn: (file: File) => userService.uploadAvatar(file),
    onSuccess: (res) => {
      const url = res.data?.avatarUrl
      if (url) updateUser({ avatarUrl: url })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success('Profile photo updated')
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  })

  const deleteAvatar = useMutation({
    mutationFn: () => userService.deleteAvatar(),
    onSuccess: () => {
      updateUser({ avatarUrl: null })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success('Profile photo removed')
    },
    onError: (e) => {
      const code = axios.isAxiosError(e) ? (e.response?.data as { code?: string } | undefined)?.code : undefined
      const message = extractErrorMessage(e)
      const isNoAvatar = code === 'NO_AVATAR' || message === 'No avatar to delete'
      // The Remove button only renders when an avatar URL is shown, so a
      // NO_AVATAR response means local state is stale (the server already has
      // no avatar). Sync local state so the name-initial fallback is shown
      // instead of leaving a stuck avatar with an error toast.
      if (isNoAvatar && useAuthStore.getState().user?.avatarUrl) {
        updateUser({ avatarUrl: null })
        queryClient.invalidateQueries({ queryKey: ['profile'] })
        toast.success('Profile photo removed')
        return
      }
      toast.error(message)
    },
  })

  const isBusy = uploadAvatar.isPending || deleteAvatar.isPending

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset so selecting the same file again still triggers onChange.
    e.target.value = ''
    if (!file) return

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      toast.error('Only JPEG, PNG, WebP and GIF images are allowed')
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error('Image exceeds the 5MB limit. Please upload a smaller image.')
      return
    }

    uploadAvatar.mutate(file)
  }

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div
        className="rounded-full bg-zinc-200 overflow-hidden flex items-center justify-center font-bold text-[var(--fg-secondary)] shrink-0"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.375) }}
      >
        {displayUrl ? (
          <img src={displayUrl} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          displayName.charAt(0)?.toUpperCase() || 'U'
        )}
      </div>

      {showActions && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            disabled={isBusy}
            onChange={handleFileChange}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
              className="gap-1.5"
            >
              {uploadAvatar.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Camera size={13} />
              )}
              {uploadAvatar.isPending ? 'Uploading...' : displayUrl ? 'Change Photo' : 'Upload Photo'}
            </Button>
            {displayUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteAvatar.mutate()}
                disabled={isBusy}
                className="gap-1.5"
              >
                {deleteAvatar.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Trash2 size={13} />
                )}
                {deleteAvatar.isPending ? 'Removing...' : 'Remove'}
              </Button>
            )}
          </div>
          <p className="text-xs text-[var(--muted)] mt-1.5">JPEG, PNG, WebP or GIF &middot; max 5MB</p>
        </div>
      )}
    </div>
  )
}
