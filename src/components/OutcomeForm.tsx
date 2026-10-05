import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { logCall } from '../api/endpoints'
import { CALL_OUTCOMES, type BusinessDTO, type CallOutcome, type LogCallResponse } from '../api/types'
import { defaultFollowUp } from '../lib/dates'
import { errorMessage } from '../lib/errors'
import { toApiDateTime, toInputDateTime } from '../lib/format'
import { OUTCOME_META } from '../lib/status'
import { useToast } from './Toast'
import { IconX } from './icons'
import './outcome-form.css'

interface Props {
  lead: BusinessDTO
  disabled?: boolean
  /** Enable 1–9 keyboard shortcuts on the whole window (call screen). */
  shortcuts?: boolean
  submitLabel?: string
  onLogged?: (res: LogCallResponse) => void
  extraActions?: ReactNode
}

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

export function OutcomeForm({ lead, disabled, shortcuts, submitLabel = 'Enregistrer l’appel', onLogged, extraActions }: Props) {
  const id = useId()
  const toast = useToast()
  const qc = useQueryClient()
  const formRef = useRef<HTMLFormElement>(null)
  const [outcome, setOutcome] = useState<CallOutcome | null>(null)
  const [notes, setNotes] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [followUpTouched, setFollowUpTouched] = useState(false)
  const [value, setValue] = useState(lead.estimatedValue != null ? String(lead.estimatedValue) : '')

  const choose = (o: CallOutcome) => {
    setOutcome(o)
    if (!followUpTouched) {
      const d = defaultFollowUp(o)
      setFollowUp(d ? toInputDateTime(d) : '')
    }
  }

  const mutation = useMutation({
    mutationFn: () => {
      const meta = OUTCOME_META[outcome!]
      const v = value.trim() ? Number(value.replace(/\s/g, '').replace(',', '.')) : undefined
      return logCall(lead.id, {
        outcome: outcome!,
        notes: notes.trim() || undefined,
        contactPerson: contactPerson.trim() || undefined,
        nextFollowUpAt: followUp ? toApiDateTime(new Date(followUp)) : undefined,
        estimatedValue: meta.withValue && v !== undefined && Number.isFinite(v) ? v : undefined,
      })
    },
    onSuccess: (res) => {
      toast(`${OUTCOME_META[outcome!].label} — ${res.lead.businessName}`)
      qc.setQueryData(['lead', res.lead.id], res.lead)
      void qc.invalidateQueries({ queryKey: ['contacts', res.lead.id] })
      for (const key of ['summary', 'leads', 'pipeline', 'activity', 'outcomes', 'leaderboard', 'breakdown', 'followups']) {
        void qc.invalidateQueries({ queryKey: [key] })
      }
      onLogged?.(res)
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!outcome || disabled || mutation.isPending) return
    mutation.mutate()
  }

  // Global shortcuts: 1–9 choose an outcome, Ctrl/⌘+Enter submits.
  const submitRef = useRef(submit)
  const chooseRef = useRef(choose)
  useEffect(() => {
    submitRef.current = submit
    chooseRef.current = choose
  })
  useEffect(() => {
    if (!shortcuts || disabled) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        submitRef.current()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      const n = Number(e.key)
      if (n >= 1 && n <= 9) {
        e.preventDefault()
        chooseRef.current(CALL_OUTCOMES[n - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcuts, disabled])

  const meta = outcome ? OUTCOME_META[outcome] : null

  return (
    <form ref={formRef} className="outcome-form" onSubmit={submit} aria-disabled={disabled}>
      <fieldset className="outcomes-grid" disabled={disabled}>
        <legend className="field-label">Résultat de l’appel</legend>
        {CALL_OUTCOMES.map((o, i) => {
          const m = OUTCOME_META[o]
          return (
            <button
              key={o}
              type="button"
              className={`outcome-btn tone-${m.tone}`}
              aria-pressed={outcome === o}
              onClick={() => choose(o)}
              style={{ ['--oc' as string]: m.color }}
            >
              <span className="outcome-dot" aria-hidden="true" />
              <span className="outcome-label">{m.label}</span>
              {shortcuts && <kbd aria-hidden="true">{i + 1}</kbd>}
            </button>
          )
        })}
      </fieldset>

      <div className="outcome-fields">
        <label className="field">
          <span>Personne jointe</span>
          <input
            className="input"
            id={`${id}-person`}
            value={contactPerson}
            onChange={(e) => setContactPerson(e.target.value)}
            placeholder="ex. Mme Gagnon, directrice"
            disabled={disabled}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>
            Prochain suivi {meta && !meta.followUp && <em className="muted xs">(aucun par défaut)</em>}
          </span>
          <div className="row" style={{ gap: 6 }}>
            <input
              type="datetime-local"
              className="input"
              style={{ flex: 1, minWidth: 0 }}
              value={followUp}
              onChange={(e) => {
                setFollowUp(e.target.value)
                setFollowUpTouched(true)
              }}
              disabled={disabled}
            />
            {followUp && (
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon"
                aria-label="Effacer le suivi"
                title="Aucun suivi"
                onClick={() => {
                  setFollowUp('')
                  setFollowUpTouched(true)
                }}
                disabled={disabled}
              >
                <IconX size={16} />
              </button>
            )}
          </div>
        </label>
        {meta?.withValue && (
          <label className="field">
            <span>Valeur estimée (CAD / an)</span>
            <input
              className="input num"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="ex. 12000"
              disabled={disabled}
            />
          </label>
        )}
        <label className="field span-all">
          <span>Notes</span>
          <textarea
            className="textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ce qui a été dit, objections, prochaine étape…"
            disabled={disabled}
            rows={3}
          />
        </label>
      </div>

      <div className="outcome-actions">
        {extraActions}
        <span className="spacer" />
        {shortcuts && (
          <span className="submit-hint hide-mobile" aria-hidden="true">
            <kbd>⌘/Ctrl</kbd>
            <kbd>Entrée</kbd>
          </span>
        )}
        <button type="submit" className="btn btn-primary btn-lg" disabled={!outcome || disabled || mutation.isPending}>
          {mutation.isPending ? 'Enregistrement…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
