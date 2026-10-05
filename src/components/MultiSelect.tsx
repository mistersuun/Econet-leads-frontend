import { useEffect, useId, useRef, useState } from 'react'
import { IconChevronDown } from './icons'

interface Option<T extends string> {
  value: T
  label: string
  color?: string
}

interface Props<T extends string> {
  label: string
  options: Option<T>[]
  value: T[]
  onChange: (v: T[]) => void
}

/** Small accessible dropdown of checkboxes. */
export function MultiSelect<T extends string>({ label, options, value, onChange }: Props<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()

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

  const summary =
    value.length === 0
      ? label
      : value.length === 1
        ? options.find((o) => o.value === value[0])?.label ?? value[0]
        : `${label} (${value.length})`

  return (
    <div className="multiselect" ref={ref}>
      <button
        type="button"
        className={`select multiselect-btn${value.length ? ' has-value' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate">{summary}</span>
        <IconChevronDown size={16} className="sr-only" />
      </button>
      {open && (
        <div className="multiselect-pop" id={id} role="group" aria-label={label}>
          {options.map((o) => (
            <label key={o.value} className="check multiselect-opt">
              <input
                type="checkbox"
                checked={value.includes(o.value)}
                onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value))}
              />
              {o.color && <span className="swatch" style={{ background: o.color, borderRadius: '50%' }} />}
              {o.label}
            </label>
          ))}
          {value.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} onClick={() => onChange([])}>
              Tout effacer
            </button>
          )}
        </div>
      )}
    </div>
  )
}
