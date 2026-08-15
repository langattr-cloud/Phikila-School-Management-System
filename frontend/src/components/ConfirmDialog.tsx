import { useEffect, useRef } from 'react'

/**
 * Accessible confirmation dialog for destructive actions.
 *
 * Focus moves into the dialog on open, is trapped while it is open, Escape
 * cancels, and focus returns to the trigger on close.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement | null
    document.body.classList.add('body--locked')
    // Focus the confirm action, but Cancel is first in the DOM so Shift+Tab
    // reaches the safer choice immediately.
    confirmRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'),
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('body--locked')
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused.current?.focus()
    }
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="dialog-overlay" onClick={onCancel} role="presentation">
      <div
        ref={dialogRef}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="dialog__title" id="confirm-title">
          {title}
        </h2>
        <p className="dialog__description" id="confirm-description">
          {description}
        </p>
        <div className="dialog__actions">
          <button type="button" className="button button--secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`button ${destructive ? 'button--danger' : 'button--primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
