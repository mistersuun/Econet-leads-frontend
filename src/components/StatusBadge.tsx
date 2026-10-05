import type { LeadStatus } from '../api/types'
import { STATUS_META } from '../lib/status'

/**
 * Lead status. `pill` (default) is a soft tinted badge for headers;
 * `dot` is a quiet dot + label for dense lists and tables.
 */
export function StatusBadge({ status, variant = 'pill' }: { status: LeadStatus; variant?: 'pill' | 'dot' }) {
  const meta = STATUS_META[status] ?? { label: status, color: '#a1a1a6' }
  if (variant === 'dot') {
    return (
      <span className="status-dot">
        <span className="dot" style={{ background: meta.color }} />
        {meta.label}
      </span>
    )
  }
  return (
    <span className="badge" style={{ background: `${meta.color}1a` }}>
      <span className="dot" style={{ background: meta.color }} />
      {meta.label}
    </span>
  )
}
