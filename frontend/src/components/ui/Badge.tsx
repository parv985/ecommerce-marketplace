import React from 'react'
import { cn } from '@/lib/utils'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'secondary' | 'brand'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'bg-[var(--bg-subtle)] text-[var(--fg-secondary)] border border-[var(--border)]',
    success: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border border-amber-200',
    error: 'bg-rose-50 text-rose-800 border border-rose-200',
    secondary: 'bg-sky-50 text-sky-800 border border-sky-200',
    brand: 'bg-[var(--primary-subtle)] text-[var(--primary)] border border-[var(--primary)]/20',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[var(--radius-sm)] px-2 py-0.5 text-xs font-medium tracking-tight',
        variants[variant],
        className
      )}
      {...props}
    />
  )
}
