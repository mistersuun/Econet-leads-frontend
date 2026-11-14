import { useEffect, useRef } from 'react'
import { formatClock } from '../../lib/callSession'
import { QUICK_LABEL, type DetailedChoice, type QuickOutcome } from '../../lib/quickOutcomes'
import { IconX } from '../icons'
import './quick-outcome.css'

interface Props {
  leadName: string
  /** Seconds, when the timer ran. */
  durationSeconds: number | null
  /** A log is being sent. */
  busy?: boolean
  onQuick: (outcome: QuickOutcome) => void
  onDetailed: (choice: DetailedChoice) => void
  onClose: () => void
}

/**
 * Bottom sheet opened when the caller comes back from the phone app: six large buttons.
 * "A parlé" and "Rappeler" hand over to the detailed form; the others log immediately.
 */
export function QuickOutcomeSheet({ leadName, durationSeconds, busy, onQuick, onDetailed, onClose }: Props) {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    first.current?.focus()
  }, [])

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet quick-outcome" role="dialog" aria-modal="true" aria-label="Résultat de l’appel" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="grabber" />
        <div className="quick-head">
          <div className="quick-title">
            <strong>Comment s’est passé l’appel?</strong>
            <span className="xs muted truncate">
              {leadName}
              {durationSeconds ? ` · ${formatClock(durationSeconds)}` : ''}
            </span>
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Fermer">
            <IconX size={18} />
          </button>
        </div>
        <div className="quick-grid">
          <button ref={first} type="button" className="quick-btn" disabled={busy} onClick={() => onQuick('NO_ANSWER')}>
            {QUICK_LABEL.NO_ANSWER}
          </button>
          <button type="button" className="quick-btn" disabled={busy} onClick={() => onQuick('VOICEMAIL')}>
            {QUICK_LABEL.VOICEMAIL}
          </button>
          <button type="button" className="quick-btn emphasis" disabled={busy} onClick={() => onDetailed('SPOKE')}>
            A parlé
          </button>
          <button type="button" className="quick-btn emphasis" disabled={busy} onClick={() => onDetailed('CALLBACK')}>
            Rappeler
          </button>
          <button type="button" className="quick-btn" disabled={busy} onClick={() => onQuick('NOT_INTERESTED')}>
            {QUICK_LABEL.NOT_INTERESTED}
          </button>
          <button type="button" className="quick-btn" disabled={busy} onClick={() => onQuick('WRONG_NUMBER')}>
            {QUICK_LABEL.WRONG_NUMBER}
          </button>
        </div>
        <p className="xs muted quick-hint">Les boutons du haut enregistrent tout de suite, avec la durée. « A parlé » et « Rappeler » ouvrent le formulaire détaillé.</p>
      </div>
    </>
  )
}
