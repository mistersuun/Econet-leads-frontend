import { useId } from 'react'
import type { DateRange } from '../api/types'
import { PRESET_LABELS, type RangePreset } from '../lib/dates'

interface Props {
  preset: RangePreset
  range: DateRange
  onPreset: (p: Exclude<RangePreset, 'custom'>) => void
  onCustom: (r: DateRange) => void
}

export function DateRangePicker({ preset, range, onPreset, onCustom }: Props) {
  const id = useId()
  const presets = Object.keys(PRESET_LABELS) as Exclude<RangePreset, 'custom'>[]
  return (
    <div className="row wrap" style={{ gap: 10 }}>
      <div className="segmented" role="group" aria-label="Période">
        {presets.map((p) => (
          <button key={p} type="button" aria-pressed={preset === p} onClick={() => onPreset(p)}>
            {PRESET_LABELS[p]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={preset === 'custom'}
          onClick={() => onCustom(range)}
        >
          Personnalisée
        </button>
      </div>
      {preset === 'custom' && (
        <div className="row" style={{ gap: 6 }}>
          <label className="sr-only" htmlFor={`${id}-from`}>
            Du
          </label>
          <input
            id={`${id}-from`}
            type="date"
            className="input"
            style={{ width: 150, height: 36 }}
            value={range.from}
            max={range.to}
            onChange={(e) => e.target.value && onCustom({ ...range, from: e.target.value })}
          />
          <span className="muted">→</span>
          <label className="sr-only" htmlFor={`${id}-to`}>
            Au
          </label>
          <input
            id={`${id}-to`}
            type="date"
            className="input"
            style={{ width: 150, height: 36 }}
            value={range.to}
            min={range.from}
            onChange={(e) => e.target.value && onCustom({ ...range, to: e.target.value })}
          />
        </div>
      )}
    </div>
  )
}
