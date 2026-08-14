import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className="modal-header">
        <h2 className="modal-title">{title}</h2>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  )
}
