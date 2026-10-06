import { TENDER_STATUSES, type TenderDTO, type TenderStatus } from '../api/types'
import { useUpdateTender } from '../hooks/useUpdateTender'
import { TENDER_STATUS_META } from '../lib/tenders'
import './tender-status.css'

/** Status as dot + label; the label is a borderless select that saves on change. */
export function TenderStatusSelect({ tender, disabled, size = 'sm' }: { tender: TenderDTO; disabled?: boolean; size?: 'sm' | 'md' }) {
  const m = useUpdateTender()
  const meta = TENDER_STATUS_META[tender.status] ?? { label: tender.status, color: '#a1a1a6' }
  return (
    <span className={`status-select ${size}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <span className="dot" style={{ background: meta.color }} aria-hidden="true" />
      <select
        className="select"
        value={tender.status}
        disabled={disabled}
        aria-label={`Statut de « ${tender.title} »`}
        onChange={(e) => m.mutate({ id: tender.id, status: e.target.value as TenderStatus })}
      >
        {TENDER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {TENDER_STATUS_META[s].label}
          </option>
        ))}
      </select>
    </span>
  )
}
