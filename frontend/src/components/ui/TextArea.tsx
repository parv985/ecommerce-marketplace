import React from 'react'
import { cn } from '@/lib/utils'

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && <label className="block text-sm font-medium text-[var(--fg)] mb-1.5">{label}</label>}
        <textarea
          ref={ref}
          className={cn(
            'w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] transition-all duration-150 focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] min-h-[80px]',
            error && 'border-[var(--destructive)] focus:border-[var(--destructive)] focus:ring-[var(--destructive)]',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-[var(--destructive)]">{error}</p>}
      </div>
    )
  }
)
TextArea.displayName = 'TextArea'
