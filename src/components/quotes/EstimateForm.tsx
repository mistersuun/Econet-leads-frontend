import type { AreaRange, EstimateInput, PropertyType, ServiceId } from '../../api/types'

// Same options as the website estimator. The two options the server cannot price online
// (after construction, more than 2 500 sq ft) are listed but disabled: they need a custom quote.
const SERVICES: { value: ServiceId; label: string; disabled?: boolean }[] = [
  { value: 'commercial', label: 'Entretien commercial' },
  { value: 'residential', label: 'Entretien résidentiel' },
  { value: 'deep_cleaning', label: 'Grand ménage' },
  { value: 'post_construction', label: 'Après construction (sur mesure)', disabled: true },
]
const AREAS: { value: AreaRange; label: string; disabled?: boolean }[] = [
  { value: 'under_800', label: 'Moins de 800 pi²' },
  { value: '800_1500', label: '800 à 1 500 pi²' },
  { value: '1500_2500', label: '1 500 à 2 500 pi²' },
  { value: 'over_2500', label: 'Plus de 2 500 pi² (sur mesure)', disabled: true },
]
const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'office', label: 'Bureau' },
  { value: 'retail', label: 'Commerce' },
  { value: 'apartment', label: 'Appartement' },
  { value: 'house', label: 'Maison' },
  { value: 'townhouse', label: 'Maison de ville' },
]
const ADD_ONS: { id: string; label: string }[] = [
  { id: 'windows', label: 'Fenêtres' },
  { id: 'oven', label: 'Four' },
  { id: 'fridge', label: 'Réfrigérateur' },
  { id: 'basement', label: 'Sous-sol' },
  { id: 'garage', label: 'Garage' },
]
const FREQUENCIES: { value: string; label: string }[] = [
  { value: 'one-time', label: 'Une fois' },
  { value: 'monthly', label: 'Mensuelle (−5 %)' },
  { value: 'bi-weekly', label: 'Aux deux semaines (−10 %)' },
  { value: 'weekly', label: 'Hebdomadaire (−15 %)' },
]

/** The four estimate selects and the extras chips (controlled). */
export function EstimateForm({ value, onChange, idPrefix }: { value: EstimateInput; onChange: (next: EstimateInput) => void; idPrefix: string }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="estimate-grid">
        <label className="field" htmlFor={`${idPrefix}-service`}>
          <span>Service</span>
          <select id={`${idPrefix}-service`} className="select" value={value.service ?? ''} onChange={(e) => onChange({ ...value, service: e.target.value as ServiceId })}>
            {SERVICES.map((s) => (
              <option key={s.value} value={s.value} disabled={s.disabled}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor={`${idPrefix}-area`}>
          <span>Superficie</span>
          <select id={`${idPrefix}-area`} className="select" value={value.area ?? ''} onChange={(e) => onChange({ ...value, area: e.target.value as AreaRange })}>
            {AREAS.map((a) => (
              <option key={a.value} value={a.value} disabled={a.disabled}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor={`${idPrefix}-type`}>
          <span>Type de propriété</span>
          <select id={`${idPrefix}-type`} className="select" value={value.propertyType ?? ''} onChange={(e) => onChange({ ...value, propertyType: e.target.value as PropertyType })}>
            {PROPERTY_TYPES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor={`${idPrefix}-freq`}>
          <span>Fréquence</span>
          <select id={`${idPrefix}-freq`} className="select" value={value.frequency} onChange={(e) => onChange({ ...value, frequency: e.target.value })}>
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field">
        <span className="field-label">Extras</span>
        <div className="chips">
          {ADD_ONS.map((a) => {
            const on = value.addOnIds.includes(a.id)
            return (
              <button
                key={a.id}
                type="button"
                className="chip"
                aria-pressed={on}
                onClick={() => onChange({ ...value, addOnIds: on ? value.addOnIds.filter((x) => x !== a.id) : [...value.addOnIds, a.id] })}
              >
                {a.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
