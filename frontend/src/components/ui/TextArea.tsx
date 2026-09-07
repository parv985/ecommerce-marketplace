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
        {label && <label className="block text-sm font-medium mb-1.5">{label}</label>}
        <textarea
          ref={ref}
          className={cn(
            'w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] min-h-[80px]',
            error && 'border-[var(--destructive)]',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-[var(--destructive)]">{error}</p>}
      </div>
    )
  }
)
TextArea.displayName = 'TextArea'
