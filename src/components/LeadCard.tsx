import type { BusinessDTO } from '../api/types'
import { formatPhone, formatRelative, telHref, toDate } from '../lib/format'
import { StatusBadge } from './StatusBadge'
import { IconClock, IconGlobe, IconMail, IconMapPin, IconPhone } from './icons'
import './lead-card.css'

export function QualityMeter({ score }: { score: number | null }) {
  const s = score ?? 0
  const color = s >= 70 ? '#2f7a5c' : s >= 45 ? '#c98a1f' : '#c4613f'
  return (
    <span className="quality" title={`Qualité des données : ${s}/100`}>
      <span className="quality-track" aria-hidden="true">
        <span style={{ width: `${s}%`, background: color }} />
      </span>
      <span className="num">{score ?? '—'}</span>
    </span>
  )
}

export function FollowUpReason({ lead, now = new Date() }: { lead: BusinessDTO; now?: Date }) {
  const next = toDate(lead.nextFollowUpAt)
  if (next && next <= now) {
    const overdue = next.getTime() < new Date(now).setHours(0, 0, 0, 0)
    return (
      <span className={`chip ${overdue ? 'danger' : 'warn'}`}>
        <IconClock size={14} /> Suivi prévu · {formatRelative(next, now)}
      </span>
    )
  }
  if (lead.leadStatus === 'NEW') return <span className="chip">Nouveau lead</span>
  if (next) return <span className="chip">Suivi {formatRelative(next, now)}</span>
  return null
}

function mapsHref(lead: BusinessDTO) {
  const q = [lead.addressStreet, lead.addressCity, lead.addressProvince, lead.postalCode].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

export function LeadCard({ lead }: { lead: BusinessDTO }) {
  const address = [lead.addressStreet, lead.addressCity].filter(Boolean).join(', ')
  return (
    <div className="lead-card">
      <div className="row wrap" style={{ gap: 8 }}>
        <FollowUpReason lead={lead} />
        <StatusBadge status={lead.leadStatus} />
      </div>
      <div>
        <h2 className="lead-card-name">{lead.businessName}</h2>
        <div className="lead-card-type muted">
          {lead.businessType ?? 'Type inconnu'}
          {lead.dataSource && <> · {lead.dataSource}</>}
        </div>
      </div>
      {lead.phone ? (
        <a className="phone-cta" href={telHref(lead.phone)}>
          <span className="phone-cta-icon">
            <IconPhone size={22} />
          </span>
          <span>
            <span className="phone-cta-number num">{formatPhone(lead.phone)}</span>
            <span className="phone-cta-hint">Toucher pour appeler</span>
          </span>
        </a>
      ) : (
        <div className="chip warn">Aucun numéro de téléphone</div>
      )}
      <ul className="lead-meta">
        {address && (
          <li>
            <IconMapPin size={16} />
            <a href={mapsHref(lead)} target="_blank" rel="noreferrer">
              {address}
              {lead.postalCode && <span className="muted"> {lead.postalCode}</span>}
            </a>
          </li>
        )}
        {lead.email && (
          <li>
            <IconMail size={16} />
            <a href={`mailto:${lead.email}`}>{lead.email}</a>
          </li>
        )}
        {lead.website && (
          <li>
            <IconGlobe size={16} />
            <a href={lead.website} target="_blank" rel="noreferrer">
              {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          </li>
        )}
      </ul>
      <dl className="lead-facts">
        <div>
          <dt>Qualité</dt>
          <dd>
            <QualityMeter score={lead.dataQualityScore} />
          </dd>
        </div>
        <div>
          <dt>Appels</dt>
          <dd className="num">{lead.contactCount}</dd>
        </div>
        <div>
          <dt>Dernier contact</dt>
          <dd>{lead.lastContactedAt ? formatRelative(lead.lastContactedAt) : 'Jamais'}</dd>
        </div>
        <div>
          <dt>Assigné à</dt>
          <dd className="truncate">{lead.assignedToName ?? '—'}</dd>
        </div>
      </dl>
    </div>
  )
}
