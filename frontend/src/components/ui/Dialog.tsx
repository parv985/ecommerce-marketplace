import React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-[#191816]/60 transition-opacity" onClick={onClose} />
      <div
        className={cn(
          'relative bg-white rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] border border-[var(--border)] max-w-lg w-full max-h-[90vh] overflow-auto',
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
            <h2 className="text-base md:text-lg font-semibold tracking-tight text-[var(--fg)]">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-[var(--accent)] rounded-[var(--radius-sm)] text-[var(--fg-secondary)] hover:text-[var(--fg)] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
