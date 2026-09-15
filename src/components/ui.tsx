import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

// Modal: Schließen links, primäre Aktion rechts. Fokus springt hinein,
// Escape schließt, Tab bleibt drin.
export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const prev = document.activeElement as HTMLElement | null
    const first = el.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])')
    ;(first ?? el).focus()
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose()
      if (ev.key === 'Tab') {
        const focusable = Array.from(
          el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'),
        )
        if (!focusable.length) return
        const a = focusable[0]
        const z = focusable[focusable.length - 1]
        if (ev.shiftKey && document.activeElement === a) {
          ev.preventDefault()
          z.focus()
        } else if (!ev.shiftKey && document.activeElement === z) {
          ev.preventDefault()
          a.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="flex items-center justify-between mb-4">
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close" data-close>
            <X size={18} />
          </button>
          <h2 id={titleId} className="text-[15px] font-semibold">
            {title}
          </h2>
          <span className="w-9" />
        </div>
        {children}
        {footer && <div className="flex justify-end gap-2 mt-5">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  const id = useId()
  return (
    <label className="block mb-3" htmlFor={id}>
      <span className="block text-[13px] font-medium text-[var(--text-muted)] mb-1">{label}</span>
      <FieldId.Provider value={id}>{children}</FieldId.Provider>
      {hint && <span className="block text-[12px] text-[var(--text-faint)] mt-1">{hint}</span>}
    </label>
  )
}

const FieldId = createContext<string | undefined>(undefined)
export function useFieldId() {
  return useContext(FieldId)
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useFieldId()
  return <input id={id} className="input" {...props} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useFieldId()
  return <textarea id={id} className="input" {...props} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useFieldId()
  return <select id={id} className="input" {...props} />
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[14px] text-[var(--text-muted)] py-6 text-center">{children}</p>
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-[13px] text-[var(--danger)] mt-2">
      {children}
    </p>
  )
}

export function Skeleton({ h = 16, w = '100%', className = '' }: { h?: number; w?: string | number; className?: string }) {
  return <div className={`skeleton ${className}`} style={{ height: h, width: w }} aria-hidden="true" />
}
