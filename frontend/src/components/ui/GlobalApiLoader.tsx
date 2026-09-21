import { useLoadingStore } from '@/stores/loadingStore'
import { Loader2 } from 'lucide-react'

export function GlobalApiLoader() {
  const isLoading = useLoadingStore((state) => state.isLoading)

  if (!isLoading) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading content"
      className="pointer-events-none fixed inset-0 z-[99999] select-none"
    >
      <style>{`
        @keyframes globalApiProgressSlide {
          0% {
            transform: translateX(-100%);
          }
          50% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>

      {/* Top progress bar with warm brand gradient */}
      <div className="absolute top-0 left-0 right-0 h-[3px] overflow-hidden bg-orange-100/40">
        <div
          className="h-full w-full bg-gradient-to-r from-amber-500 via-rose-500 to-orange-600 shadow-[0_0_8px_rgba(234,88,12,0.6)]"
          style={{
            animation: 'globalApiProgressSlide 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite',
          }}
        />
      </div>

      {/* Discreet floating pill in the bottom right corner */}
      <div className="absolute bottom-5 right-5 flex items-center gap-2 rounded-full bg-slate-900/90 px-3.5 py-1.5 text-xs font-medium text-white shadow-xl backdrop-blur">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-400" />
        <span className="tracking-wide">Loading…</span>
      </div>
    </div>
  )
}
