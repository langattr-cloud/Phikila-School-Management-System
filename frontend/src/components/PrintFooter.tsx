import { useEffect, useRef } from 'react'

const LOGO_SRC = '/brand/phikila-official.svg'

function formatGeneratedAt(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `Generated: ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Print-only footer shared by all application printouts. */
export function PrintFooter() {
  const generatedRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const update = () => {
      if (generatedRef.current) generatedRef.current.textContent = formatGeneratedAt(new Date())
    }

    update()
    const timer = window.setInterval(update, 30_000)
    window.addEventListener('beforeprint', update)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('beforeprint', update)
    }
  }, [])

  return (
    <>
      <style>{`
        @page {
          margin-bottom: 16mm;
        }

        .phikila-print-footer {
          display: none;
        }

        @media print {
          .phikila-print-footer {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 2147483647;
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            width: 100%;
            height: 13mm;
            padding: 0 8mm 2mm;
            box-sizing: border-box;
            background: #fff;
            color: #111;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 8pt;
            line-height: 1;
            pointer-events: none;
          }

          .phikila-print-footer__generated {
            padding-bottom: 1mm;
            white-space: nowrap;
          }

          .phikila-print-footer__logo {
            display: block;
            width: 18mm;
            height: 18mm;
            object-fit: contain;
            object-position: right bottom;
          }
        }
      `}</style>

      <footer className="phikila-print-footer" aria-hidden="true">
        <span ref={generatedRef} className="phikila-print-footer__generated" />
        <img
          className="phikila-print-footer__logo"
          src={LOGO_SRC}
          alt=""
        />
      </footer>
    </>
  )
}
