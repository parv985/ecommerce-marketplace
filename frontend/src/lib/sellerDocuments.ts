import type { SellerDocumentType } from '@/types/api'

/** Canonical document types accepted by the seller document upload flow. */
export const SELLER_DOCUMENT_TYPES = {
  GST_CERTIFICATE: 'GST_CERTIFICATE',
  PAN_CARD: 'PAN_CARD',
  BANK_STATEMENT: 'BANK_STATEMENT',
  OTHER: 'OTHER',
} as const satisfies Record<SellerDocumentType, SellerDocumentType>

export const SELLER_DOCUMENT_TYPE_LABELS: Record<SellerDocumentType, string> = {
  GST_CERTIFICATE: 'GST Certificate',
  PAN_CARD: 'PAN Card',
  BANK_STATEMENT: 'Bank Statement',
  OTHER: 'Other',
}

export const SELLER_DOCUMENT_TYPE_OPTIONS: { value: SellerDocumentType; label: string }[] = (
  Object.keys(SELLER_DOCUMENT_TYPE_LABELS) as SellerDocumentType[]
).map((value) => ({ value, label: SELLER_DOCUMENT_TYPE_LABELS[value] }))

/**
 * Backend / legacy naming aliases. Older records (and the API docs) use the
 * short forms `GST` and `PAN`; map them to the canonical frontend types.
 */
const DOCUMENT_TYPE_ALIASES: Record<string, SellerDocumentType> = {
  GST: 'GST_CERTIFICATE',
  GST_CERTIFICATE: 'GST_CERTIFICATE',
  PAN: 'PAN_CARD',
  PAN_CARD: 'PAN_CARD',
  BANK_STATEMENT: 'BANK_STATEMENT',
  BANK: 'BANK_STATEMENT',
  OTHER: 'OTHER',
}

export function normalizeDocumentType(type: string | undefined | null): SellerDocumentType {
  if (!type) return 'OTHER'
  return DOCUMENT_TYPE_ALIASES[type.trim().toUpperCase()] ?? 'OTHER'
}

export function getDocumentTypeLabel(type: string | undefined | null): string {
  return SELLER_DOCUMENT_TYPE_LABELS[normalizeDocumentType(type)]
}

/** Upload constraints — mirror `src/middlewares/upload.middleware.ts`. */
export const DOCUMENT_ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const
export const DOCUMENT_ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'] as const
export const DOCUMENT_MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
export const DOCUMENT_ACCEPT_ATTR = DOCUMENT_ALLOWED_MIME_TYPES.join(',')

export function isAllowedDocumentFile(file: File): boolean {
  if ((DOCUMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) return true
  // Some browsers/OSes report an empty MIME type — fall back to the extension.
  const lower = file.name.toLowerCase()
  return !file.type && DOCUMENT_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export function formatFileSize(bytes: number | undefined | null): string {
  if (bytes == null || Number.isNaN(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Derive a readable file name from a Cloudinary URL / publicId. */
export function getDocumentFileName(doc: { url: string; publicId: string; fileName?: string }): string {
  if (doc.fileName) return doc.fileName
  try {
    const path = new URL(doc.url).pathname
    const last = decodeURIComponent(path.split('/').pop() ?? '')
    if (last) return last
  } catch {
    /* fall through */
  }
  return doc.publicId.split('/').pop() || doc.publicId
}

export function isPdfDocument(doc: { url: string; publicId: string }): boolean {
  return /\.pdf($|\?)/i.test(doc.url) || /\.pdf$/i.test(doc.publicId)
}

export function isImageDocument(doc: { url: string; publicId: string }): boolean {
  return /\.(jpe?g|png)($|\?)/i.test(doc.url) || /\.(jpe?g|png)$/i.test(doc.publicId)
}
