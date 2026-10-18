import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../../store/useApp'

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)

  if (!toasts.length) return null

  return (
    <div className="fixed z-[60] bottom-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 flex flex-col gap-2 w-[min(92vw,26rem)] safe-bottom">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-lg animate-slide-up',
            t.tone === 'error' && 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/60 dark:border-red-900 dark:text-red-100',
            t.tone === 'success' && 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-900 dark:text-emerald-100',
            t.tone === 'info' && 'bg-surface border-line text-content',
          )}
        >
          <span className="mt-0.5 shrink-0">
            {t.tone === 'error' ? (
              <AlertCircle size={16} />
            ) : t.tone === 'success' ? (
              <CheckCircle2 size={16} />
            ) : (
              <Info size={16} />
            )}
          </span>
          <span className="flex-1 leading-snug">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100 shrink-0">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}
