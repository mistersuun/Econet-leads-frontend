import type { BusinessDTO } from '../api/types'
import './lead-card.css'

/** Source-specific facts (permit cost, NEQ, sector…) as a quiet definition list. */
export function SourceDetails({ lead, caption = true, className = '' }: { lead: BusinessDTO; caption?: boolean; className?: string }) {
  const entries = Object.entries(lead.sourceDetails ?? {}).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
  if (!entries.length) return null
  return (
    <div className={`source-details ${className}`}>
      {caption && <div className="source-details-caption">{lead.dataSource ?? 'Source'}</div>}
      <dl className="lead-facts">
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className={/^[\d\s.,$%-]+$/.test(String(v)) ? 'num' : undefined}>{String(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
