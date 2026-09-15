import React, { useState } from 'react'
import { Star, ShoppingBag, Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { TextArea } from '@/components/ui/TextArea'
import { reviewService } from '@/services/review.service'
import { extractErrorMessage } from '@/services/api'
import { toast } from 'react-hot-toast'
import type { Review } from '@/types/api'

interface ReviewDialogProps {
  open: boolean
  onClose: () => void
  productId: string
  productName: string
  productImage?: string
  existingReview?: Review | null
  onSuccess?: () => void
}

const RATING_LABELS: Record<number, string> = {
  1: 'Terrible - Poor quality or not as described',
  2: 'Poor - Did not meet expectations',
  3: 'Average - Met basic expectations',
  4: 'Good - Satisfied with purchase',
  5: 'Excellent - Highly recommended!',
}

function ReviewForm({
  productId,
  productName,
  productImage,
  existingReview,
  onClose,
  onSuccess,
}: Omit<ReviewDialogProps, 'open'>) {
  const isEditing = !!existingReview
  const [rating, setRating] = useState<number>(existingReview?.rating ?? 5)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [comment, setComment] = useState<string>(existingReview?.comment ?? '')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rating < 1 || rating > 5) {
      setErrorMessage('Please select a rating between 1 and 5 stars.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      if (isEditing && existingReview) {
        await reviewService.update(existingReview.id, {
          rating,
          comment: comment.trim() || null,
        })
        toast.success('Review updated successfully!')
      } else {
        await reviewService.create({
          productId,
          rating,
          comment: comment.trim() || undefined,
        })
        toast.success('Review submitted successfully!')
      }

      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      const msg = extractErrorMessage(err)
      setErrorMessage(msg)
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const activeRating = hoverRating || rating

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Product preview */}
      <div className="flex items-center gap-3 p-3 rounded-[var(--radius)] bg-[var(--surface-warm)] border border-[var(--border)]">
        <div className="w-12 h-12 rounded-[var(--radius-sm)] bg-white border border-[var(--border)] overflow-hidden shrink-0 flex items-center justify-center">
          {productImage ? (
            <img
              src={productImage}
              alt={productName}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <ShoppingBag size={18} className="text-[var(--muted)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Reviewing</p>
          <p className="text-sm font-medium text-[var(--fg)] truncate">{productName}</p>
        </div>
      </div>

      {/* Rating selection */}
      <div>
        <label className="block text-sm font-medium text-[var(--fg)] mb-2">
          Overall Rating <span className="text-[var(--destructive)]">*</span>
        </label>
        <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              aria-label={`${star} star${star > 1 ? 's' : ''}`}
              className="p-1 rounded transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-amber-400"
            >
              <Star
                size={28}
                className={star <= activeRating ? 'fill-amber-400 text-amber-400' : 'text-neutral-300 stroke-1'}
              />
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--fg-secondary)] mt-1.5 h-4">
          {RATING_LABELS[activeRating] || ''}
        </p>
      </div>

      {/* Comment field */}
      <div>
        <TextArea
          label="Your Review (Optional)"
          placeholder="What did you like or dislike? How was the quality, fit, or delivery experience?"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          rows={4}
        />
        <div className="flex justify-end mt-1">
          <span className="text-[11px] text-[var(--muted)]">
            {comment.length}/1000 characters
          </span>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-[var(--radius)] bg-red-50 border border-red-200 text-xs text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border)]">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="min-w-[120px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={15} className="mr-2 animate-spin" />
              {isEditing ? 'Updating...' : 'Submitting...'}
            </>
          ) : isEditing ? (
            'Update Review'
          ) : (
            'Submit Review'
          )}
        </Button>
      </div>
    </form>
  )
}

export function ReviewDialog({
  open,
  onClose,
  productId,
  productName,
  productImage,
  existingReview,
  onSuccess,
}: ReviewDialogProps) {
  if (!open) return null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={existingReview ? 'Edit Your Review' : 'Write a Product Review'}
      className="max-w-md"
    >
      <ReviewForm
        key={`${productId}-${existingReview?.id ?? 'new'}`}
        productId={productId}
        productName={productName}
        productImage={productImage}
        existingReview={existingReview}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    </Dialog>
  )
}
