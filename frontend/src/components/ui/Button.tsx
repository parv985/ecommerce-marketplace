import React from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ className, variant = 'default', size = 'md', ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer'
  const variants = {
    default: 'bg-[var(--primary)] text-[var(--primary-fg)] hover:bg-zinc-800',
    outline: 'border border-[var(--border)] bg-transparent hover:bg-[var(--accent)]',
    ghost: 'hover:bg-[var(--accent)]',
    destructive: 'bg-[var(--destructive)] text-[var(--destructive-fg)] hover:bg-red-600',
    secondary: 'bg-[var(--accent)] text-[var(--fg)] hover:bg-zinc-200',
  }
  const sizes = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
  }
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />
}
