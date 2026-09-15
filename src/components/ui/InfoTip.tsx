// Mała ikonka „i" — po najechaniu pokazuje wyjaśnienie.
// Popup renderowany portalem na document.body z position:fixed — karty (glass-card) mają
// backdrop-filter, czyli własny stacking context, i tooltip osadzony w karcie chowałby się
// pod sąsiednimi kartami niezależnie od z-index.
import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const GAP = 6
const MARGIN = 8

export default function InfoTip({ text, side = 'bottom', width = 270 }: {
  text: ReactNode
  side?: 'top' | 'bottom'
  width?: number
}) {
  const iconRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Pozycja liczona po wyrenderowaniu popupu (znamy jego wysokość) i dociśnięta do viewportu
  useLayoutEffect(() => {
    if (!open || !iconRef.current || !tipRef.current) return
    const r = iconRef.current.getBoundingClientRect()
    const h = tipRef.current.offsetHeight
    const vw = window.innerWidth, vh = window.innerHeight
    let left = r.left
    if (left + width > vw - MARGIN) left = vw - MARGIN - width
    if (left < MARGIN) left = MARGIN
    let top = side === 'top' ? r.top - GAP - h : r.bottom + GAP
    if (top + h > vh - MARGIN) top = r.top - GAP - h       // nie mieści się pod → nad
    if (top < MARGIN) top = r.bottom + GAP                  // nie mieści się nad → pod
    setPos({ top, left })
  }, [open, side, width])

  // Scroll dowolnego kontenera lub zmiana rozmiaru okna → chowamy, żeby popup nie „odjechał" od ikonki
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <>
      <span
        ref={iconRef}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className={`ml-1 w-3.5 h-3.5 rounded-full border text-[9px] font-bold leading-none inline-flex items-center justify-center
          cursor-help select-none align-middle transition-colors
          ${open ? 'border-finance-green text-finance-green' : 'border-gray-500 text-gray-400'}`}
        aria-label="Wyjaśnienie"
      >
        i
      </span>
      {open && createPortal(
        <div
          ref={tipRef}
          role="tooltip"
          className="pointer-events-none fixed text-[11px] leading-snug text-gray-200 font-normal normal-case tracking-normal text-left whitespace-normal rounded-lg px-3 py-2"
          style={{
            top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, zIndex: 9999,
            background: '#0d1117', border: '1px solid rgba(16,185,129,0.35)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  )
}
