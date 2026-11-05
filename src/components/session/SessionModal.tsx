import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getLeadFilters } from '../../api/endpoints'
import { DEFAULT_SESSION_FILTERS, SESSION_SIZES, type SessionFilters } from '../../lib/callSession'
import { MultiSelect } from '../MultiSelect'
import { IconPlay, IconX } from '../icons'
import './session.css'

interface Props {
  onStart: (filters: SessionFilters, size: number, target: number | null) => void
  onClose: () => void
}

/** "Démarrer une session": filters, batch size, optional conversation target. */
export function SessionModal({ onStart, onClose }: Props) {
  const [filters, setFilters] = useState<SessionFilters>(DEFAULT_SESSION_FILTERS)
  const [size, setSize] = useState<number>(25)
  const [target, setTarget] = useState('')
  const firstRef = useRef<HTMLButtonElement>(null)
  const options = useQuery({ queryKey: ['lead-filters'], queryFn: getLeadFilters, staleTime: 5 * 60_000 })

  useEffect(() => {
    firstRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const opt = (list: string[] | undefined) => (list ?? []).map((v) => ({ value: v, label: v }))
  const set = <K extends keyof SessionFilters>(k: K, v: SessionFilters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  const t = target.trim() ? Number(target) : null

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="session-title">
        <header className="modal-head">
          <div>
            <h2 id="session-title">Démarrer une session</h2>
            <p className="muted small">Un lot de leads, un chrono, un résumé à la fin.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer">
            <IconX size={20} />
          </button>
        </header>
        <form
          className="modal-body stack"
          onSubmit={(e) => {
            e.preventDefault()
            onStart(filters, size, t && Number.isFinite(t) && t > 0 ? Math.round(t) : null)
          }}
        >
          <div className="session-filters">
            <div className="field">
              <span className="field-label">Types</span>
              <MultiSelect label="Tous les types" options={opt(options.data?.businessTypes)} value={filters.businessType} onChange={(v) => set('businessType', v)} />
            </div>
            <div className="field">
              <span className="field-label">Villes</span>
              <MultiSelect label="Toutes les villes" options={opt(options.data?.cities)} value={filters.city} onChange={(v) => set('city', v)} />
            </div>
            <div className="field">
              <span className="field-label">Sources</span>
              <MultiSelect label="Toutes les sources" options={opt(options.data?.dataSources)} value={filters.sourceIn} onChange={(v) => set('sourceIn', v)} />
            </div>
            <label className="field">
              <span>Qualité minimale</span>
              <select className="select" value={filters.minQualityScore ?? ''} onChange={(e) => set('minQualityScore', e.target.value ? Number(e.target.value) : null)}>
                <option value="">Toutes</option>
                <option value="40">40 et plus</option>
                <option value="60">60 et plus</option>
                <option value="80">80 et plus</option>
              </select>
            </label>
          </div>

          <div className="field">
            <span className="field-label">Quels leads</span>
            <div className="segmented" role="group" aria-label="Portée">
              {(
                [
                  ['all', 'Suivis puis nouveaux'],
                  ['new', 'Nouveaux seulement'],
                  ['followups', 'Suivis seulement'],
                ] as const
              ).map(([v, label]) => (
                <button key={v} type="button" aria-pressed={filters.scope === v} onClick={() => set('scope', v)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="session-row">
            <div className="field">
              <span className="field-label">Nombre de leads</span>
              <div className="segmented" role="group" aria-label="Nombre de leads">
                {SESSION_SIZES.map((n) => (
                  <button key={n} type="button" aria-pressed={size === n} onClick={() => setSize(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <label className="field" style={{ maxWidth: 200 }}>
              <span>Objectif de conversations (optionnel)</span>
              <input className="input num" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ''))} placeholder="ex. 5" />
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-lg" onClick={onClose}>
              Annuler
            </button>
            <button ref={firstRef} type="submit" className="btn btn-primary btn-lg">
              <IconPlay size={18} /> Démarrer
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
