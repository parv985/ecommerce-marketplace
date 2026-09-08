import React from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && <label className="block text-sm font-medium text-[var(--fg)] mb-1.5">{label}</label>}
        <input
          ref={ref}
          className={cn(
            'w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] transition-all duration-150 focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--bg-subtle)]',
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
Input.displayName = 'Input'
