import React, { useEffect, useMemo, useRef, useState } from 'react'
import { UploadCloud, FileText, Trash2, Loader2, ExternalLink, Download, X, Image as ImageIcon } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Select } from '@/components/ui/Select'
import {
  DOCUMENT_ACCEPT_ATTR,
  DOCUMENT_MAX_FILE_SIZE,
  SELLER_DOCUMENT_TYPE_OPTIONS,
  formatFileSize,
  getDocumentFileName,
  getDocumentTypeLabel,
  isAllowedDocumentFile,
  isImageDocument,
  isPdfDocument,
} from '@/lib/sellerDocuments'
import type { SellerDocument, SellerDocumentType } from '@/types/api'

export interface DocumentUploadProps {
  existingDocuments?: SellerDocument[]
  /** Upload handler — should reject/throw on failure so the pending file is kept. */
  onUpload: (file: File, type: SellerDocumentType) => Promise<unknown> | void
  /** Delete handler — receives the Cloudinary publicId of the document. */
  onDelete?: (publicId: string) => Promise<unknown> | void
  disabled?: boolean
  /** True while the parent's upload mutation is in flight. */
  isUploading?: boolean
  /** publicId of the document currently being deleted (shows a spinner on that card). */
  deletingPublicId?: string | null
  /** Optional message shown when uploads/deletions are disabled. */
  disabledReason?: string
}

const DOCUMENT_STATUS_LABEL = 'Pending'

export function DocumentUpload({
  existingDocuments = [],
  onUpload,
  onDelete,
  disabled = false,
  isUploading = false,
  deletingPublicId = null,
  disabledReason,
}: DocumentUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [documentType, setDocumentType] = useState<SellerDocumentType | ''>('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [confirmDoc, setConfirmDoc] = useState<SellerDocument | null>(null)
  const submittingRef = useRef(false)

  const isBusy = isUploading || Boolean(deletingPublicId)
  const inputsLocked = disabled || isBusy

  // Object URL preview for pending image files (revoked when the file changes)
  const pendingPreviewUrl = useMemo(
    () => (pendingFile && pendingFile.type.startsWith('image/') ? URL.createObjectURL(pendingFile) : null),
    [pendingFile],
  )
  useEffect(() => {
    if (!pendingPreviewUrl) return
    return () => URL.revokeObjectURL(pendingPreviewUrl)
  }, [pendingPreviewUrl])

  const validateFile = (file: File): boolean => {
    if (!isAllowedDocumentFile(file)) {
      toast.error(`"${file.name}" is not supported. Please upload a PDF, JPEG, or PNG file.`)
      return false
    }
    if (file.size > DOCUMENT_MAX_FILE_SIZE) {
      toast.error(`"${file.name}" exceeds the 10 MB limit. Please upload a smaller file.`)
      return false
    }
    if (file.size === 0) {
      toast.error(`"${file.name}" is empty.`)
      return false
    }
    return true
  }

  const selectFile = (fileList: FileList | null) => {
    if (inputsLocked || !fileList || fileList.length === 0) return
    if (fileList.length > 1) toast('Only one document can be uploaded at a time — using the first file.')
    const file = fileList[0]
    if (validateFile(file)) setPendingFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!inputsLocked) setIsDragOver(true)
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
    selectFile(e.dataTransfer.files)
  }
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    selectFile(e.target.files)
    e.target.value = ''
  }

  const handleUpload = async () => {
    if (inputsLocked || submittingRef.current) return
    if (!documentType) {
      toast.error('Please select a document type before uploading.')
      return
    }
    if (!pendingFile) {
      toast.error('Please choose a file to upload.')
      return
    }
    if (!validateFile(pendingFile)) return

    submittingRef.current = true
    try {
      await onUpload(pendingFile, documentType)
      setPendingFile(null)
      setDocumentType('')
    } catch {
      // Parent surfaces the error toast; keep the pending file so the seller can retry.
    } finally {
      submittingRef.current = false
    }
  }

  const handleConfirmDelete = async () => {
    if (!confirmDoc || !onDelete || inputsLocked) return
    const doc = confirmDoc
    setConfirmDoc(null)
    try {
      await onDelete(doc.publicId)
    } catch {
      // Parent surfaces the error toast.
    }
  }

  return (
    <div className="space-y-5">
      {disabled && disabledReason && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-[var(--radius)] text-sm text-amber-800">
          {disabledReason}
        </div>
      )}

      {/* Upload form */}
      <div className="space-y-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Upload a document</span>
          <p className="text-xs text-[var(--muted)] mt-0.5">PDF, JPEG or PNG up to 10 MB. Files are stored securely and reviewed by our team.</p>
        </div>

        <Select
          label="Document type"
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value as SellerDocumentType | '')}
          disabled={inputsLocked}
          options={[{ value: '', label: 'Select document type…' }, ...SELLER_DOCUMENT_TYPE_OPTIONS]}
        />

        {/* Drag & drop zone */}
        <div
          role="button"
          tabIndex={inputsLocked ? -1 : 0}
          aria-disabled={inputsLocked}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !inputsLocked && fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (!inputsLocked && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          className={`relative border-2 border-dashed rounded-[var(--radius-lg)] p-6 text-center transition-all duration-150 ${
            isDragOver
              ? 'border-[var(--primary)] bg-[var(--primary-subtle)]'
              : 'border-[var(--border)] bg-[#faf9f6] hover:bg-[#f6f5f2] hover:border-neutral-400'
          } ${inputsLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={DOCUMENT_ACCEPT_ATTR}
            onChange={handleFileInputChange}
            disabled={inputsLocked}
            className="sr-only"
          />
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="w-11 h-11 rounded-[var(--radius)] bg-white border border-[var(--border)] flex items-center justify-center text-[var(--fg-secondary)] shadow-sm">
              <UploadCloud size={22} strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--fg)]">
                Click to browse <span className="font-normal text-[var(--muted)]">or drag and drop a file here</span>
              </p>
              <p className="text-xs text-[var(--muted)] mt-0.5">PDF, JPG, PNG · max 10 MB</p>
            </div>
          </div>
        </div>

        {/* Pending file preview + upload action */}
        {pendingFile && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-[var(--radius)] border-2 border-dashed border-amber-300 bg-amber-50/40">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <FilePreview
                url={pendingPreviewUrl}
                isPdf={pendingFile.type === 'application/pdf' || /\.pdf$/i.test(pendingFile.name)}
                alt={pendingFile.name}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--fg)] truncate" title={pendingFile.name}>{pendingFile.name}</p>
                <p className="text-xs text-[var(--muted)]">
                  {formatFileSize(pendingFile.size)}
                  {documentType ? ` · ${getDocumentTypeLabel(documentType)}` : ' · Select a document type'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                size="sm"
                onClick={handleUpload}
                disabled={inputsLocked || !documentType}
                className="gap-1.5"
              >
                {isUploading && <Loader2 size={13} className="animate-spin" />}
                {isUploading ? 'Uploading…' : 'Upload'}
              </Button>
              <button
                type="button"
                onClick={() => setPendingFile(null)}
                disabled={isUploading}
                className="p-1.5 text-neutral-600 hover:text-red-700 hover:bg-white rounded-[var(--radius-sm)] border border-[var(--border)] bg-white/90 shadow-sm transition-all disabled:opacity-50"
                title="Remove selected file"
                aria-label="Remove selected file"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Existing documents */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Uploaded documents</span>
          <span className="text-xs text-[var(--muted)]">{existingDocuments.length} file{existingDocuments.length === 1 ? '' : 's'}</span>
        </div>

        {existingDocuments.length === 0 ? (
          <div className="text-sm text-[var(--muted)] border border-[var(--border)] rounded-[var(--radius)] p-4 text-center bg-[#faf9f6]">
            No documents uploaded yet.
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {existingDocuments.map((doc, index) => {
              const isDeleting = deletingPublicId === doc.publicId
              const fileName = getDocumentFileName(doc)
              const pdf = isPdfDocument(doc)
              const image = isImageDocument(doc)
              return (
                <li
                  key={doc.publicId || `${doc.url}-${index}`}
                  className={`flex items-start gap-3 p-3 rounded-[var(--radius)] border border-[var(--border)] bg-white shadow-sm ${isDeleting ? 'opacity-60' : ''}`}
                >
                  <FilePreview url={image ? doc.url : null} isPdf={pdf} alt={fileName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="brand">{getDocumentTypeLabel(doc.type)}</Badge>
                      <Badge variant="warning">{DOCUMENT_STATUS_LABEL}</Badge>
                    </div>
                    <p className="text-sm font-medium text-[var(--fg)] truncate mt-1.5" title={fileName}>{fileName}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {pdf ? 'PDF document' : image ? 'Image' : 'File'}
                      {' · '}
                      {formatFileSize(doc.size)}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs">
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                      >
                        <ExternalLink size={12} /> View
                      </a>
                      <a
                        href={doc.url}
                        download={fileName}
                        className="inline-flex items-center gap-1 text-[var(--fg-secondary)] hover:text-[var(--fg)] hover:underline"
                      >
                        <Download size={12} /> Download
                      </a>
                    </div>
                  </div>
                  {onDelete && (
                    <button
                      type="button"
                      disabled={inputsLocked}
                      onClick={() => setConfirmDoc(doc)}
                      className="shrink-0 p-1.5 bg-white text-neutral-600 hover:text-red-700 hover:bg-red-50 rounded-[var(--radius-sm)] border border-[var(--border)] shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Delete document"
                      aria-label={`Delete ${fileName}`}
                    >
                      {isDeleting ? <Loader2 size={14} className="animate-spin text-red-600" /> : <Trash2 size={14} />}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Delete confirmation */}
      <Dialog open={Boolean(confirmDoc)} onClose={() => setConfirmDoc(null)} title="Delete document?">
        {confirmDoc && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--fg-secondary)]">
              You are about to permanently delete{' '}
              <span className="font-medium text-[var(--fg)]">{getDocumentFileName(confirmDoc)}</span>{' '}
              ({getDocumentTypeLabel(confirmDoc.type)}). The file will be removed from storage and cannot be recovered.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmDoc(null)}>Cancel</Button>
              <Button type="button" variant="destructive" onClick={handleConfirmDelete} className="gap-1.5">
                <Trash2 size={14} /> Delete
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}

function FilePreview({ url, isPdf, alt }: { url: string | null; isPdf: boolean; alt: string }) {
  // Track the URL that failed so a new URL automatically resets the fallback.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)
  const broken = url !== null && brokenUrl === url
  return (
    <div className="w-14 h-14 shrink-0 rounded-[var(--radius)] bg-[#f6f5f2] border border-[var(--border)] overflow-hidden flex items-center justify-center">
      {url && !broken ? (
        <img src={url} alt={alt} className="w-full h-full object-cover" onError={() => setBrokenUrl(url)} />
      ) : isPdf ? (
        <div className="flex flex-col items-center text-red-600">
          <FileText size={22} strokeWidth={1.75} />
          <span className="text-[9px] font-bold leading-none mt-0.5">PDF</span>
        </div>
      ) : (
        <ImageIcon size={20} className="text-neutral-400" />
      )}
    </div>
  )
}
