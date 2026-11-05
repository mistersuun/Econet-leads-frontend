import { useEffect, useRef, useState } from 'react'
import { laterToday, openStatus, tomorrowAt } from '../../lib/businessHours'
import { formatDateTime, toInputDateTime } from '../../lib/format'
import { IconChevronDown, IconClock } from '../icons'

interface OpenNowProps {
  businessType: string | null
  /** Snooze to the suggested time. */
  onSnooze: (until: Date, reason: string) => void
  disabled?: boolean
}

/** "Ouvert maintenant ?" line with a one-click snooze when it is a bad time. */
export function OpenNow({ businessType, onSnooze, disabled }: OpenNowProps) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  const s = openStatus(businessType, now)
  return (
    <div className={`open-now ${s.goodTime ? 'good' : s.open ? 'meh' : 'closed'}`} title={s.detail}>
      <span className="dot" aria-hidden="true" />
      <span className="open-now-label">{s.label}</span>
      {s.suggestion && (
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => onSnooze(s.suggestion!, s.open ? 'Heure peu propice' : 'Fermé à cette heure')} title={`Reporter à ${s.suggestionLabel}`}>
          <IconClock size={14} /> Reporter · {s.suggestionLabel}
        </button>
      )}
    </div>
  )
}

interface SnoozeProps {
  onSnooze: (until: Date, reason: string) => void
  disabled?: boolean
  pending?: boolean
  size?: 'sm' | 'lg'
}

/** Snooze menu: later today, tomorrow 9 h, or pick a time. */
export function SnoozeMenu({ onSnooze, disabled, pending, size = 'lg' }: SnoozeProps) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (d: Date, reason: string) => {
    setOpen(false)
    onSnooze(d, reason)
  }
  const later = laterToday()
  const tomorrow = tomorrowAt(9)

  return (
    <div className="snooze" ref={ref}>
      <button type="button" className={`btn btn-${size}`} disabled={disabled || pending} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title="Reporter ce lead sans enregistrer d’appel">
        <IconClock size={size === 'sm' ? 14 : 18} /> {pending ? 'Report…' : 'Reporter'} <IconChevronDown size={14} className="muted" />
      </button>
      {open && (
        <div className="snooze-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => pick(later, 'Plus tard aujourd’hui')}>
            Plus tard aujourd’hui <span className="muted">+3 h · {formatDateTime(later).split(' à ')[1]}</span>
          </button>
          <button type="button" role="menuitem" onClick={() => pick(tomorrow, 'Demain matin')}>
            Demain 9 h <span className="muted">{formatDateTime(tomorrow).split(' à ')[0]}</span>
          </button>
          <div className="snooze-custom">
            <label className="field">
              <span>Choisir…</span>
              <input type="datetime-local" className="input" value={custom} min={toInputDateTime(new Date())} onChange={(e) => setCustom(e.target.value)} />
            </label>
            <button type="button" className="btn btn-primary btn-sm" disabled={!custom} onClick={() => custom && pick(new Date(custom), 'Date choisie')}>
              Reporter
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
