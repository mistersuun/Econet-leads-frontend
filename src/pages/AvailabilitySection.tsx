import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAvailability, saveAvailability } from '../api/endpoints'
import type { AvailabilityWindow } from '../api/types'
import { EmptyState, ErrorState, SkeletonRows } from '../components/States'
import { useToast } from '../components/Toast'
import { errorMessage } from '../lib/errors'
import { findOverlap, plainWindow as plain, WEEKDAYS } from '../lib/quotes'
import './availability.css'

const SLOT_OPTIONS = [30, 45, 60, 90, 120]

/** Réglages > Disponibilités (ADMIN): the weekly windows the public booking page offers. */
export default function AvailabilitySection() {
  const query = useQuery({ queryKey: ['availability'], queryFn: getAvailability })
  if (query.isError) {
    return (
      <div className="card">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    )
  }
  if (!query.data) {
    return (
      <div className="card card-pad">
        <SkeletonRows rows={5} />
      </div>
    )
  }
  return <AvailabilityForm saved={query.data} />
}

function AvailabilityForm({ saved }: { saved: AvailabilityWindow[] }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [rows, setRows] = useState<AvailabilityWindow[]>(() => saved.map((w) => ({ ...w })))

  const save = useMutation({
    mutationFn: (windows: AvailabilityWindow[]) => saveAvailability(windows.map(plain)),
    onSuccess: (result) => {
      toast('Disponibilités enregistrées')
      qc.setQueryData(['availability'], result)
      setRows(result.map((w) => ({ ...w })))
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  const update = (index: number, patch: Partial<AvailabilityWindow>) => setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  const problem = findOverlap(rows)
  const dirty = JSON.stringify(rows.map(plain)) !== JSON.stringify(saved.map(plain))

  return (
    <div className="card card-pad stack availability">
      <div>
        <h2 style={{ fontSize: 'var(--text-lg)' }}>Disponibilités pour les visites</h2>
        <p className="small muted">
          Plages offertes au client sur la page de réservation (heure de Montréal). Un préavis de 24 h est toujours appliqué et les visites déjà réservées sont retirées.
        </p>
      </div>
      {rows.length === 0 && (
        <EmptyState title="Aucune plage définie">Le client verra qu’aucune heure n’est disponible. Ajoutez une plage pour ouvrir le calendrier.</EmptyState>
      )}
      {WEEKDAYS.map((d) => {
        const dayRows = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.weekday === d.weekday)
        return (
          <fieldset key={d.weekday} className="av-day">
            <legend>{d.label}</legend>
            {dayRows.length === 0 && <span className="small muted">Fermé</span>}
            {dayRows.map(({ r, i }) => (
              <div key={i} className="av-row">
                <label className="check">
                  <input type="checkbox" checked={r.active} onChange={(e) => update(i, { active: e.target.checked })} /> <span className="sr-only">{d.label} actif</span>
                  <span aria-hidden="true">Actif</span>
                </label>
                <label className="field">
                  <span className="sr-only">Début {d.label}</span>
                  <input type="time" className="input" value={r.startTime} onChange={(e) => update(i, { startTime: e.target.value })} aria-label={`Début ${d.label}`} />
                </label>
                <span aria-hidden="true">à</span>
                <label className="field">
                  <span className="sr-only">Fin {d.label}</span>
                  <input type="time" className="input" value={r.endTime} onChange={(e) => update(i, { endTime: e.target.value })} aria-label={`Fin ${d.label}`} />
                </label>
                <label className="field">
                  <span className="sr-only">Durée d’une visite {d.label}</span>
                  <select className="select" value={r.slotMinutes} onChange={(e) => update(i, { slotMinutes: Number(e.target.value) })} aria-label={`Durée d’une visite ${d.label}`}>
                    {(SLOT_OPTIONS.includes(r.slotMinutes) ? SLOT_OPTIONS : [...SLOT_OPTIONS, r.slotMinutes].sort((a, b) => a - b)).map((m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRows(rows.filter((_, k) => k !== i))} aria-label={`Retirer cette plage du ${d.label.toLowerCase()}`}>
                  Retirer
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setRows([...rows, { weekday: d.weekday, startTime: '09:00', endTime: '17:00', slotMinutes: 60, active: true }])}
            >
              Ajouter une plage
            </button>
          </fieldset>
        )
      })}
      {problem && (
        <div className="field-error" role="alert">
          {problem}
        </div>
      )}
      <div className="row">
        <button type="button" className="btn btn-primary" disabled={!dirty || !!problem || save.isPending} onClick={() => save.mutate(rows)}>
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {dirty && (
          <button type="button" className="btn btn-ghost" onClick={() => setRows(saved.map((w) => ({ ...w })))}>
            Annuler les changements
          </button>
        )}
      </div>
    </div>
  )
}
