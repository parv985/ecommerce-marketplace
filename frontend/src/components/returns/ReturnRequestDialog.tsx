import { useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { TextArea } from '@/components/ui/TextArea'
import { returnService } from '@/services/return.service'
import { extractErrorMessage } from '@/services/api'
import { RETURN_REASON_PRESETS } from '@/lib/returnStatus'
import { RETURN_WINDOW_DAYS } from '@/types/api'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'

interface ReturnRequestDialogProps {
  open: boolean
  onClose: () => void
  orderId: string
  orderNumber: string
  onSuccess?: () => void
}

export function ReturnRequestDialog({
  open,
  onClose,
  orderId,
  orderNumber,
  onSuccess,
}: ReturnRequestDialogProps) {
  const [preset, setPreset] = useState<string>('')
  const [details, setDetails] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const buildReason = (): string => {
    if (!preset) return details.trim()
    if (preset === 'Other') return details.trim()
    if (details.trim()) return `${preset}. ${details.trim()}`
    return preset
  }

  const reset = () => {
    setPreset('')
    setDetails('')
    setErrorMessage(null)
    setFieldError(null)
  }

  const handleClose = () => {
    if (isSubmitting) return
    reset()
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const reason = buildReason()

    if (!preset) {
      setFieldError('Please select a return reason')
      return
    }
    if (reason.length < 5) {
      setFieldError('Please provide more detail (at least 5 characters)')
      return
    }
    if (reason.length > 500) {
      setFieldError('Reason cannot exceed 500 characters')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)
    setFieldError(null)

    try {
      await returnService.request({ orderId, reason })
      toast.success('Return request submitted')
      onSuccess?.()
      reset()
      onClose()
    } catch (err: unknown) {
      const msg = extractErrorMessage(err)
      setErrorMessage(msg)
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const reasonLen = buildReason().length
  const needsDetails = preset === 'Other' || !preset

  return (
    <Dialog open={open} onClose={handleClose} title="Request a Return" className="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex items-start gap-3 p-3 rounded-[var(--radius)] bg-[var(--surface-warm)] border border-[var(--border)]">
          <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-white border border-[var(--border)] flex items-center justify-center shrink-0 text-[var(--primary)]">
            <RotateCcw size={18} strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Order
            </p>
            <p className="text-sm font-medium text-[var(--fg)]">#{orderNumber}</p>
            <p className="text-xs text-[var(--muted)] mt-1">
              Returns are accepted within {RETURN_WINDOW_DAYS} days of delivery.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--fg)] mb-2">
            Reason <span className="text-[var(--destructive)]">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {RETURN_REASON_PRESETS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setPreset(r)
                  setFieldError(null)
                }}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-[var(--radius)] border transition-all',
                  preset === r
                    ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm'
                    : 'bg-white text-[var(--fg-secondary)] border-[var(--border)] hover:bg-[var(--accent)] hover:text-[var(--fg)]',
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <TextArea
            label={needsDetails ? 'Details *' : 'Additional details (optional)'}
            placeholder={
              needsDetails
                ? 'Tell us more about why you want to return this order…'
                : 'Any extra context that helps the seller process your return…'
            }
            value={details}
            onChange={(e) => {
              setDetails(e.target.value)
              setFieldError(null)
            }}
            maxLength={500}
            rows={4}
            error={fieldError ?? undefined}
          />
          <div className="flex justify-end mt-1">
            <span className="text-[11px] text-[var(--muted)]">{reasonLen}/500</span>
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-[var(--radius)] bg-red-50 border border-red-200 text-xs text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border)]">
          <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="min-w-[140px]">
            {isSubmitting ? (
              <>
                <Loader2 size={15} className="mr-2 animate-spin" />
                Submitting…
              </>
            ) : (
              'Submit Return'
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
