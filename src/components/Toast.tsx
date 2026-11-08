import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { IconAlert, IconCheck, IconPhone, IconX } from './icons'

type Kind = 'success' | 'error' | 'info'
export interface ToastOptions {
  /** Stays until dismissed (or the action is taken). */
  sticky?: boolean
  /** A button inside the toast, e.g. "Appeler". */
  action?: { label: string; onClick: () => void }
}

interface Toast {
  id: number
  kind: Kind
  message: string
  opts?: ToastOptions
}

const ToastContext = createContext<((message: string, kind?: Kind, opts?: ToastOptions) => void) | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback((message: string, kind: Kind = 'success', opts?: ToastOptions) => {
    const id = nextId.current++
    // Sticky toasts are never pushed out by transient ones.
    setToasts((t) => [...t.filter((x) => x.opts?.sticky), ...t.filter((x) => !x.opts?.sticky).slice(-2), { id, kind, message, opts }].sort((a, b) => a.id - b.id))
    if (!opts?.sticky) setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3200)
  }, [dismiss])

  const value = useMemo(() => push, [push])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span className="toast-icon">{t.kind === 'error' ? <IconAlert size={18} /> : <IconCheck size={18} />}</span>
            <span className="toast-text">{t.message}</span>
            {t.opts?.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.opts?.action?.onClick()
                  dismiss(t.id)
                }}
              >
                <IconPhone size={14} /> {t.opts.action.label}
              </button>
            )}
            {t.opts?.sticky && (
              <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Fermer">
                <IconX size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
