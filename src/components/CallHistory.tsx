import type { ContactDTO } from '../api/types'
import { formatDateTime, formatRelative } from '../lib/format'
import { outcomeColor, outcomeLabel } from '../lib/status'
import { IconCalendarClock, IconUser } from './icons'
import './call-history.css'

const TYPE_LABEL: Record<string, string> = { APPEL: 'Appel', EMAIL: 'Courriel', VISITE: 'Visite' }

export function CallHistory({ contacts, compact }: { contacts: ContactDTO[]; compact?: boolean }) {
  return (
    <ol className={`timeline${compact ? ' compact' : ''}`}>
      {contacts.map((c) => (
        <li key={c.id}>
          <span className="tl-dot" style={{ background: outcomeColor(c.outcome) }} aria-hidden="true" />
          <div className="tl-body">
            <div className="tl-head">
              <strong>{c.outcome ? outcomeLabel(c.outcome) : TYPE_LABEL[c.contactType] ?? c.contactType}</strong>
              <span className="muted xs" title={formatDateTime(c.contactDate)}>
                {formatRelative(c.contactDate)} · {formatDateTime(c.contactDate)}
              </span>
            </div>
            {(c.username || c.contactPerson) && (
              <div className="xs muted row wrap" style={{ gap: 10 }}>
                {c.username && <span>par {c.username}</span>}
                {c.contactPerson && (
                  <span className="row" style={{ gap: 4 }}>
                    <IconUser size={13} /> {c.contactPerson}
                  </span>
                )}
              </div>
            )}
            {c.notes && <p className="tl-notes">{c.notes}</p>}
            {c.nextActionDate && (
              <div className="xs muted row" style={{ gap: 4 }}>
                <IconCalendarClock size={13} /> {c.nextAction ?? 'Suivi'} · {formatDateTime(c.nextActionDate)}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
