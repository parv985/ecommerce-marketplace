import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { IconButton, Tooltip } from '@mui/material'

interface CopyButtonProps {
  /** Value placed on the clipboard. */
  value: string
  /** Accessible/tooltip label, e.g. "Copy actor id". */
  label?: string
  size?: 'small' | 'medium'
}

/**
 * Small copy-to-clipboard affordance for ids on the audit page.
 * Shows a one-and-a-half second "Copied" confirmation. Uses the async
 * clipboard API with a textarea fallback for non-secure contexts.
 */
export function CopyButton({ value, label = 'Copy to clipboard', size = 'small' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const copy = async (event: React.MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        const scratch = document.createElement('textarea')
        scratch.value = value
        scratch.style.position = 'fixed'
        scratch.style.opacity = '0'
        document.body.appendChild(scratch)
        scratch.select()
        document.execCommand('copy')
        document.body.removeChild(scratch)
      }
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      /* Clipboard unavailable (permissions) — fail silently. */
    }
  }

  return (
    <Tooltip title={copied ? 'Copied!' : label} placement="top" arrow>
      <IconButton
        size={size}
        aria-label={copied ? 'Copied' : label}
        onClick={copy}
        sx={{
          p: '3px',
          color: copied ? 'success.main' : 'inherit',
          transition: 'color 150ms',
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </IconButton>
    </Tooltip>
  )
}
