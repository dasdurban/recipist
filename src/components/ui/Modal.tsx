import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import clsx from 'clsx'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  // Portalled to <body>: several triggers sit inside the sticky header, whose
  // `backdrop-blur` would otherwise become the containing block for this
  // `fixed` overlay (and trap its z-index), pushing the panel off screen.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={clsx(
          'relative w-full bg-surface border border-line shadow-2xl animate-slide-up',
          'rounded-t-2xl sm:rounded-2xl max-h-[94vh] flex flex-col',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-xl',
          size === 'lg' && 'sm:max-w-2xl',
          size === 'xl' && 'sm:max-w-4xl',
        )}
      >
        {title && (
          <header className="flex items-center gap-3 px-5 py-4 border-b border-line shrink-0">
            <h2 className="text-base font-semibold flex-1 min-w-0 truncate">{title}</h2>
            <button className="btn-ghost !p-2 rounded-full" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </header>
        )}
        <div className="px-5 pt-4 pb-6 overflow-y-auto safe-bottom">{children}</div>
        {footer && (
          <footer className="px-5 py-3.5 border-t border-line flex items-center justify-end gap-2 shrink-0">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
