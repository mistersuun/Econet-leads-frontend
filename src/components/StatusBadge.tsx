import type { LeadStatus } from '../api/types'
import { STATUS_META } from '../lib/status'

export function StatusBadge({ status }: { status: LeadStatus }) {
  const meta = STATUS_META[status] ?? { label: status, color: '#a1a1a6' }
  return (
    <span className="badge" style={{ background: `${meta.color}1f`, color: '#1d1d1f', borderColor: `${meta.color}40` }}>
      <span className="dot" style={{ background: meta.color }} />
      {meta.label}
    </span>
  )
}
