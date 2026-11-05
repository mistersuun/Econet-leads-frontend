import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDuration, sessionSummaryText, summarizeSession, type CallSession } from '../../lib/callSession'
import { formatPercent } from '../../lib/format'
import { OUTCOME_META } from '../../lib/status'
import { IconCheck, IconCopy, IconX } from '../icons'
import './session.css'

interface Props {
  session: CallSession
  onClose: () => void
}

/** End-of-session sheet: the numbers, the outcome mix, and a copy button. */
export function SessionSummary({ session, onClose }: Props) {
  const sum = useMemo(() => summarizeSession(session), [session])
  const [copied, setCopied] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = async () => {
    const text = sessionSummaryText(sum, session.startedAt)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copiez le résumé :', text)
    }
  }
  const max = Math.max(1, ...sum.outcomes.map((o) => o.count))
  const pct = (n: number, of: number) => (of ? formatPercent(n / of, 0) : '—')

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal summary" role="dialog" aria-modal="true" aria-labelledby="summary-title">
        <header className="modal-head">
          <div>
            <h2 id="summary-title">Résumé de la session</h2>
            <p className="muted small">
              {formatDuration(sum.elapsedSeconds)} actives
              {sum.dialsPerHour ? ` · ${sum.dialsPerHour.toLocaleString('fr-CA')} appels / h` : ''}
            </p>
          </div>
          <button ref={closeRef} type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer">
            <IconX size={20} />
          </button>
        </header>
        <div className="modal-body stack">
          <div className="card stats-strip" style={{ ['--cols' as string]: 4 }}>
            <div className="stat">
              <span className="kpi-label">Appels</span>
              <span className="stat-value num">{sum.dials}</span>
              {sum.skipped > 0 && <span className="xs muted">{sum.skipped} passé{sum.skipped > 1 ? 's' : ''}</span>}
            </div>
            <div className="stat">
              <span className="kpi-label">Joints</span>
              <span className="stat-value num">{sum.connects}</span>
              <span className="xs muted">{pct(sum.connects, sum.dials)} des appels</span>
            </div>
            <div className="stat">
              <span className="kpi-label">Conversations</span>
              <span className="stat-value num">
                {sum.conversations}
                {sum.target ? <span className="muted" style={{ fontSize: 'var(--text-base)', fontWeight: 500 }}> / {sum.target}</span> : null}
              </span>
              <span className="xs muted">{sum.target ? (sum.conversations >= sum.target ? 'objectif atteint' : 'objectif non atteint') : pct(sum.conversations, sum.dials) + ' des appels'}</span>
            </div>
            <div className="stat">
              <span className="kpi-label">Durée moyenne</span>
              <span className="stat-value num">{sum.avgCallSeconds ? formatDuration(sum.avgCallSeconds) : '—'}</span>
              <span className="xs muted">meilleure série positive : {sum.bestPositiveStreak}</span>
            </div>
          </div>

          {sum.outcomes.length > 0 ? (
            <ul className="sum-bars" aria-label="Résultats de la session">
              {sum.outcomes.map((o) => {
                const meta = OUTCOME_META[o.outcome]
                return (
                  <li key={o.outcome}>
                    <span className="sum-label">
                      <span className="swatch" style={{ background: meta.color }} />
                      {meta.label}
                    </span>
                    <span className="sum-track">
                      <span className="sum-fill" style={{ width: `${(o.count / max) * 100}%`, background: meta.color }} />
                    </span>
                    <span className="sum-value num">{o.count}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="muted small">Aucun appel enregistré pendant cette session.</p>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-lg" onClick={() => void copy()}>
              {copied ? <IconCheck size={18} /> : <IconCopy size={18} />} {copied ? 'Copié' : 'Copier le résumé'}
            </button>
            <button type="button" className="btn btn-primary btn-lg" onClick={onClose}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
