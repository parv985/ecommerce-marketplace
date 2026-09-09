import React from 'react'
import { PackageOpen } from 'lucide-react'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-[var(--muted)] mb-4">
        {icon || <PackageOpen size={48} strokeWidth={1.5} />}
      </div>
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      {description && <p className="text-sm text-[var(--muted)] max-w-sm">{description}</p>}
      {action && (
        <Button onClick={action.onClick} className="mt-4">
          {action.label}
        </Button>
      )}
    </div>
  )
}
