import { useId, useState } from 'react'
import { PAIN_POINTS, type FrequencyWanted, type Qualification } from '../../api/types'
import './qualification.css'

interface Props {
  value: Qualification
  disabled?: boolean
  /** Local change (every keystroke). */
  onChange: (patch: Qualification) => void
  /** Field left (blur / chip toggle): persist this patch. */
  onCommit: (patch: Qualification) => void
}

const FREQ: { value: FrequencyWanted; label: string }[] = [
  { value: 'weekly', label: 'Hebdomadaire' },
  { value: 'bi-weekly', label: 'Aux deux semaines' },
  { value: 'monthly', label: 'Mensuelle' },
  { value: 'one-time', label: 'Une fois' },
]

type ProviderMode = 'unknown' | 'none' | 'in-house' | 'named'

function providerMode(v: string | null | undefined): ProviderMode {
  if (v === 'none') return 'none'
  if (v === 'in-house') return 'in-house'
  if (v) return 'named'
  return 'unknown'
}

/** Structured facts captured during the call. Every field is optional; saved on blur. */
export function QualificationForm({ value, disabled, onChange, onCommit }: Props) {
  const id = useId()
  const [mode, setMode] = useState<ProviderMode>(() => providerMode(value.currentProvider))

  const text = (key: keyof Qualification, label: string, placeholder?: string, type: 'text' | 'email' | 'tel' | 'date' = 'text') => (
    <label className="qf-field">
      <span>{label}</span>
      <input
        className="input"
        type={type}
        value={(value[key] as string | null | undefined) ?? ''}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => onChange({ [key]: e.target.value || null })}
        onBlur={(e) => onCommit({ [key]: e.target.value.trim() || null })}
      />
    </label>
  )
  const num = (key: 'sizeSqft' | 'employees', label: string, placeholder: string) => (
    <label className="qf-field">
      <span>{label}</span>
      <input
        className="input num"
        inputMode="numeric"
        value={value[key] ?? ''}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          const n = e.target.value.replace(/\D/g, '')
          onChange({ [key]: n ? Number(n) : null })
        }}
        onBlur={(e) => {
          const n = e.target.value.replace(/\D/g, '')
          onCommit({ [key]: n ? Number(n) : null })
        }}
      />
    </label>
  )

  const setProvider = (m: ProviderMode) => {
    setMode(m)
    if (m === 'none' || m === 'in-house') {
      onChange({ currentProvider: m })
      onCommit({ currentProvider: m })
    } else if (m === 'unknown') {
      onChange({ currentProvider: null })
      onCommit({ currentProvider: null })
    } else {
      const keep = value.currentProvider && value.currentProvider !== 'none' && value.currentProvider !== 'in-house' ? value.currentProvider : ''
      onChange({ currentProvider: keep || null })
    }
  }

  const pains = value.painPoints ?? []
  const togglePain = (p: string) => {
    const next = pains.includes(p) ? pains.filter((x) => x !== p) : [...pains, p]
    onChange({ painPoints: next })
    onCommit({ painPoints: next })
  }

  return (
    <div className="qf" aria-label="Qualification">
      <div className="qf-grid">
        {text('decisionMaker', 'Décideur', 'ex. Mme Gagnon')}
        {text('role', 'Rôle', 'ex. directrice')}
        {text('directPhone', 'Ligne directe', '(514) 555-1234', 'tel')}
        {text('email', 'Courriel', 'prenom@entreprise.ca', 'email')}
        <label className="qf-field" htmlFor={`${id}-prov`}>
          <span>Fournisseur actuel</span>
          <div className="row" style={{ gap: 6 }}>
            <select id={`${id}-prov`} className="select" value={mode} disabled={disabled} onChange={(e) => setProvider(e.target.value as ProviderMode)} style={{ flex: mode === 'named' ? '0 0 112px' : 1 }}>
              <option value="unknown">—</option>
              <option value="none">Aucun</option>
              <option value="in-house">À l’interne</option>
              <option value="named">Une firme…</option>
            </select>
            {mode === 'named' && (
              <input
                className="input"
                aria-label="Nom du fournisseur"
                placeholder="Nom de la firme"
                value={value.currentProvider === 'none' || value.currentProvider === 'in-house' ? '' : value.currentProvider ?? ''}
                disabled={disabled}
                onChange={(e) => onChange({ currentProvider: e.target.value || null })}
                onBlur={(e) => onCommit({ currentProvider: e.target.value.trim() || null })}
              />
            )}
          </div>
        </label>
        {text('contractEndsAt', 'Fin du contrat', undefined, 'date')}
        {num('sizeSqft', 'Superficie (pi²)', 'ex. 2500')}
        {num('employees', 'Employés', 'ex. 12')}
        <label className="qf-field">
          <span>Fréquence souhaitée</span>
          <select
            className="select"
            value={value.frequencyWanted ?? ''}
            disabled={disabled}
            onChange={(e) => {
              const v = (e.target.value || null) as FrequencyWanted | null
              onChange({ frequencyWanted: v })
              onCommit({ frequencyWanted: v })
            }}
          >
            <option value="">—</option>
            {FREQ.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        {text('bestTimeToCall', 'Meilleur moment', 'ex. mardi AM')}
      </div>
      <div className="qf-field">
        <span>Irritants</span>
        <div className="chips" role="group" aria-label="Irritants">
          {PAIN_POINTS.map((p) => (
            <button key={p} type="button" className="chip" aria-pressed={pains.includes(p)} disabled={disabled} onClick={() => togglePain(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
