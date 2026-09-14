import { useEffect, useRef } from 'react'

function formatGeneratedAt(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `Printed: ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Print-only footer shared by application printouts. */
export function PrintFooter() {
  const generatedRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const update = () => {
      if (generatedRef.current) generatedRef.current.textContent = formatGeneratedAt(new Date())
    }

    update()
    window.addEventListener('beforeprint', update)
    return () => window.removeEventListener('beforeprint', update)
  }, [])

  return (
    <>
      <style>{`
        @page { margin-bottom: 8mm; }
        .phikila-print-footer { display: none; }
        @media print {
          .phikila-print-footer {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 2147483647;
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            height: 6mm;
            padding: 0 8mm;
            box-sizing: border-box;
            background: #fff;
            color: #111;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 7pt;
            line-height: 1;
            pointer-events: none;
          }
          .phikila-print-footer__generated { white-space: nowrap; }
          .phikila-print-footer__brand { font-weight: 700; letter-spacing: .02em; }
        }
      `}</style>
      <footer className="phikila-print-footer" aria-hidden="true">
        <span ref={generatedRef} className="phikila-print-footer__generated" />
        <span className="phikila-print-footer__brand">@PhikilaTimetable</span>
      </footer>
    </>
  )
}
