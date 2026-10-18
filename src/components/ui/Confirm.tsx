import { useState } from 'react'
import { Modal } from './Modal'

interface ConfirmProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function Confirm({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive,
  onConfirm,
  onClose,
}: ConfirmProps) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-content-muted leading-relaxed">{message}</p>
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-soft" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className={destructive ? 'btn-danger' : 'btn-primary'}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm()
            } finally {
              setBusy(false)
            }
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
