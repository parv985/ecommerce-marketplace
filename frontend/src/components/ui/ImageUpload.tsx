import React, { useState, useRef, useEffect } from 'react'
import { UploadCloud, Image as ImageIcon, Trash2, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'react-hot-toast'
import type { ProductImage } from '@/types/api'

export interface ImageUploadProps {
  existingImages?: ProductImage[]
  pendingFiles?: File[]
  onFilesSelected?: (files: File[]) => void
  onRemovePendingFile?: (index: number) => void
  onImageDelete?: (publicId: string) => Promise<void> | void
  onUploadPending?: () => Promise<void> | void
  maxImages?: number
  disabled?: boolean
  isUploading?: boolean
  deletingPublicId?: string | null
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export function ImageUpload({
  existingImages = [],
  pendingFiles = [],
  onFilesSelected,
  onRemovePendingFile,
  onImageDelete,
  onUploadPending,
  maxImages = 8,
  disabled = false,
  isUploading = false,
  deletingPublicId = null,
}: ImageUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrls, setPreviewUrls] = useState<string[]>([])

  // Generate object URLs for pending file previews
  useEffect(() => {
    const urls = pendingFiles.map((f) => URL.createObjectURL(f))
    setPreviewUrls(urls)

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [pendingFiles])

  const totalCount = existingImages.length + pendingFiles.length
  const remainingSlots = Math.max(0, maxImages - totalCount)

  const validateAndAddFiles = (fileList: FileList | File[]) => {
    if (disabled || isUploading) return

    const incoming = Array.from(fileList)
    if (incoming.length === 0) return

    if (totalCount >= maxImages) {
      toast.error(`Maximum of ${maxImages} images allowed per product`)
      return
    }

    const validFiles: File[] = []

    for (const file of incoming) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`"${file.name}" is not a supported format. Please use JPG, PNG, WebP, or GIF.`)
        continue
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`"${file.name}" exceeds 5MB limit. Please upload a smaller image.`)
        continue
      }
      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    if (validFiles.length > remainingSlots) {
      toast.error(`You can only add ${remainingSlots} more image${remainingSlots === 1 ? '' : 's'}. (${maxImages} max)`)
      const trimmed = validFiles.slice(0, remainingSlots)
      onFilesSelected?.(trimmed)
    } else {
      onFilesSelected?.(validFiles)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled && !isUploading && remainingSlots > 0) {
      setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (disabled || isUploading) return
    if (e.dataTransfer.files) {
      validateAndAddFiles(e.dataTransfer.files)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      validateAndAddFiles(e.target.files)
      e.target.value = ''
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Product Images
          </span>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            PNG, JPG, WebP, GIF up to 5MB each (maximum {maxImages})
          </p>
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-[var(--radius-sm)] border ${
            totalCount >= maxImages
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-[#f6f5f2] text-[var(--fg-secondary)] border-[var(--border)]'
          }`}
        >
          {totalCount} of {maxImages} slots
        </span>
      </div>

      {/* Drag & Drop Zone */}
      {remainingSlots > 0 && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-[var(--radius-lg)] p-6 text-center cursor-pointer transition-all duration-150 ${
            isDragOver
              ? 'border-[var(--primary)] bg-[var(--primary-subtle)]'
              : 'border-[var(--border)] bg-[#faf9f6] hover:bg-[#f6f5f2] hover:border-neutral-400'
          } ${disabled || isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileInputChange}
            disabled={disabled || isUploading}
            className="sr-only"
          />
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="w-11 h-11 rounded-[var(--radius)] bg-white border border-[var(--border)] flex items-center justify-center text-[var(--fg-secondary)] shadow-sm">
              <UploadCloud size={22} strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--fg)]">
                Click to browse <span className="font-normal text-[var(--muted)]">or drag and drop images here</span>
              </p>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Up to {remainingSlots} more image{remainingSlots === 1 ? '' : 's'} can be added
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Existing and Pending Grid */}
      {(existingImages.length > 0 || pendingFiles.length > 0) && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Existing Uploaded Images */}
            {existingImages.map((img, index) => {
              const isDeleting = deletingPublicId === img.publicId
              return (
                <div
                  key={img.publicId || index}
                  className="group relative aspect-square rounded-[var(--radius)] bg-[#f6f5f2] border border-[var(--border)] overflow-hidden shadow-sm flex items-center justify-center"
                >
                  <img src={img.url} alt={`Product ${index + 1}`} className="w-full h-full object-cover" />

                  {/* Primary Cover Badge */}
                  {index === 0 && (
                    <span className="absolute top-1.5 left-1.5 bg-[#191816]/80 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-[var(--radius-sm)] backdrop-blur-none shadow-sm">
                      Cover
                    </span>
                  )}

                  {/* Delete Button */}
                  {onImageDelete && (
                    <button
                      type="button"
                      disabled={disabled || isUploading || isDeleting}
                      onClick={(e) => {
                        e.stopPropagation()
                        onImageDelete(img.publicId)
                      }}
                      className="absolute top-1.5 right-1.5 p-1.5 bg-white/95 text-neutral-700 hover:text-red-700 hover:bg-white rounded-[var(--radius-sm)] border border-[var(--border)] shadow-sm transition-all"
                      title="Delete image"
                    >
                      {isDeleting ? (
                        <Loader2 size={13} className="animate-spin text-red-600" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                    </button>
                  )}
                </div>
              )
            })}

            {/* Pending Previews (not yet uploaded) */}
            {pendingFiles.map((file, index) => {
              const preview = previewUrls[index]
              return (
                <div
                  key={`pending-${index}-${file.name}`}
                  className="group relative aspect-square rounded-[var(--radius)] bg-[#f6f5f2] border-2 border-dashed border-amber-300 overflow-hidden shadow-sm flex items-center justify-center"
                >
                  {preview ? (
                    <img src={preview} alt={file.name} className="w-full h-full object-cover opacity-90" />
                  ) : (
                    <ImageIcon size={20} className="text-neutral-400" />
                  )}

                  {/* Pending Badge */}
                  <span className="absolute top-1.5 left-1.5 bg-amber-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-[var(--radius-sm)] shadow-sm">
                    Pending
                  </span>

                  {/* File Size */}
                  <span className="absolute bottom-1.5 left-1.5 right-1.5 bg-black/70 text-white text-[9px] px-1 py-0.5 rounded-[var(--radius-sm)] truncate text-center">
                    {formatBytes(file.size)}
                  </span>

                  {/* Remove Button */}
                  {onRemovePendingFile && (
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemovePendingFile(index)
                      }}
                      className="absolute top-1.5 right-1.5 p-1.5 bg-white/95 text-neutral-700 hover:text-red-700 hover:bg-white rounded-[var(--radius-sm)] border border-[var(--border)] shadow-sm transition-all"
                      title="Remove pending file"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Pending Upload Action */}
          {pendingFiles.length > 0 && onUploadPending && (
            <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
              <p className="text-xs text-[var(--muted)]">
                {pendingFiles.length} new image{pendingFiles.length === 1 ? '' : 's'} ready to upload
              </p>
              <Button
                type="button"
                size="sm"
                onClick={onUploadPending}
                disabled={disabled || isUploading}
                className="gap-1.5"
              >
                {isUploading && <Loader2 size={13} className="animate-spin" />}
                {isUploading ? 'Uploading...' : `Upload ${pendingFiles.length} Image${pendingFiles.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
