import React from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'outline' | 'ghost' | 'destructive' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ className, variant = 'default', size = 'md', ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center rounded-[var(--radius)] font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none'
  const variants = {
    default: 'bg-[var(--primary)] text-[var(--primary-fg)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)] active:scale-[0.99]',
    primary: 'bg-[var(--primary)] text-[var(--primary-fg)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)] active:scale-[0.99]',
    outline: 'border border-[var(--border)] bg-white text-[var(--fg)] hover:bg-[var(--accent)] hover:border-[var(--border-strong)] active:scale-[0.99]',
    ghost: 'text-[var(--fg-secondary)] hover:text-[var(--fg)] hover:bg-[var(--accent)] active:bg-[var(--accent-hover)]',
    destructive: 'bg-[var(--destructive)] text-[var(--destructive-fg)] hover:bg-red-800 active:scale-[0.99]',
    secondary: 'bg-[var(--accent)] text-[var(--fg)] border border-[var(--border)] hover:bg-[var(--accent-hover)] hover:border-[var(--border-strong)] active:scale-[0.99]',
  }
  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-9 px-4 text-sm',
    lg: 'h-11 px-5 text-base',
  }
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />
}
