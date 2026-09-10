import type { ReturnStatus } from '@/types/api'
import { RETURN_WINDOW_DAYS } from '@/types/api'

export const returnStatusColors: Record<
  ReturnStatus,
  'default' | 'success' | 'warning' | 'error' | 'secondary' | 'brand'
> = {
  PENDING: 'warning',
  APPROVED: 'secondary',
  REJECTED: 'error',
  CANCELLED: 'default',
  COMPLETED: 'success',
}

export const returnStatusLabels: Record<ReturnStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
}

/** Statuses that block a new return request for the same order. */
export const ACTIVE_RETURN_STATUSES: ReturnStatus[] = ['PENDING', 'APPROVED', 'COMPLETED']

export function isReturnCancellable(status: ReturnStatus): boolean {
  return status === 'PENDING'
}

/** Seller/admin transitions available from the current status. */
export function getSellerReturnActions(status: ReturnStatus): Array<{
  status: 'APPROVED' | 'REJECTED' | 'COMPLETED'
  label: string
  requiresReason?: boolean
  variant?: 'default' | 'outline' | 'destructive'
}> {
  if (status === 'PENDING') {
    return [
      { status: 'APPROVED', label: 'Approve', variant: 'default' },
      { status: 'REJECTED', label: 'Reject', requiresReason: true, variant: 'destructive' },
    ]
  }
  if (status === 'APPROVED') {
    return [
      { status: 'COMPLETED', label: 'Mark Completed', variant: 'default' },
    ]
  }
  return []
}

/**
 * Whether a delivered order is still inside the return window.
 * Anchored at `deliveredAt` (from tracking/invoice). When unknown, allow
 * the UI to show the action and let the API enforce the window.
 */
export function isWithinReturnWindow(deliveredAt?: string | Date | null): boolean {
  if (!deliveredAt) return true
  const delivered = new Date(deliveredAt).getTime()
  if (Number.isNaN(delivered)) return true
  const windowMs = RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000
  return Date.now() - delivered <= windowMs
}

export function daysLeftInReturnWindow(deliveredAt?: string | Date | null): number | null {
  if (!deliveredAt) return null
  const delivered = new Date(deliveredAt).getTime()
  if (Number.isNaN(delivered)) return null
  const windowMs = RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const remaining = windowMs - (Date.now() - delivered)
  if (remaining <= 0) return 0
  return Math.ceil(remaining / (24 * 60 * 60 * 1000))
}

export const RETURN_REASON_PRESETS = [
  'Damaged or defective product',
  'Wrong item received',
  'Item not as described',
  'Quality not as expected',
  'Changed my mind',
  'Other',
] as const
