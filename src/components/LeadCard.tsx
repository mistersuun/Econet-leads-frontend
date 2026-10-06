import type { BusinessDTO } from '../api/types'
import { formatPhone, formatRelative, telHref, toDate } from '../lib/format'
import { AddPhone } from './AddPhone'
import { SourceDetails } from './SourceDetails'
import { StatusBadge } from './StatusBadge'
import { IconClock, IconPhone } from './icons'
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
      <span className={`note ${overdue ? 'danger' : 'warn'}`}>
        <IconClock size={14} /> Suivi prévu {formatRelative(next, now)}
      </span>
    )
  }
  if (lead.leadStatus === 'NEW') return <span className="note">Nouveau lead</span>
  if (next) return <span className="note">Suivi {formatRelative(next, now)}</span>
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
      <div className="lead-card-head">
        <div className="lead-card-tags">
          <StatusBadge status={lead.leadStatus} />
          <FollowUpReason lead={lead} />
        </div>
        <h2 className="lead-card-name">{lead.businessName}</h2>
        <div className="lead-card-type">
          {lead.businessType ?? 'Type inconnu'}
          {lead.dataSource && <> · {lead.dataSource}</>}
        </div>
      </div>
      {lead.phone ? (
        <a className="phone-cta" href={telHref(lead.phone)} aria-label={`Appeler le ${formatPhone(lead.phone)}`}>
          <span className="phone-cta-number num">{formatPhone(lead.phone)}</span>
          <span className="phone-cta-icon" aria-hidden="true">
            <IconPhone size={20} />
          </span>
        </a>
      ) : (
        <AddPhone key={lead.id} lead={lead} />
      )}
      <dl className="lead-facts">
        {address && (
          <div>
            <dt>Adresse</dt>
            <dd>
              <a href={mapsHref(lead)} target="_blank" rel="noreferrer">
                {address}
                {lead.postalCode && <span className="muted"> {lead.postalCode}</span>}
              </a>
            </dd>
          </div>
        )}
        {lead.email && (
          <div>
            <dt>Courriel</dt>
            <dd>
              <a href={`mailto:${lead.email}`}>{lead.email}</a>
            </dd>
          </div>
        )}
        {lead.website && (
          <div>
            <dt>Site web</dt>
            <dd>
              <a href={lead.website} target="_blank" rel="noreferrer">
                {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
              </a>
            </dd>
          </div>
        )}
        <div>
          <dt>Dernier contact</dt>
          <dd>
            {lead.lastContactedAt ? formatRelative(lead.lastContactedAt) : 'Jamais'}
            <span className="muted">
              {' · '}
              {lead.contactCount} appel{lead.contactCount > 1 ? 's' : ''}
            </span>
          </dd>
        </div>
        <div>
          <dt>Assigné à</dt>
          <dd className="truncate">{lead.assignedToName ?? <span className="muted">Personne</span>}</dd>
        </div>
        <div>
          <dt>Qualité</dt>
          <dd>
            <QualityMeter score={lead.dataQualityScore} />
          </dd>
        </div>
      </dl>
      <SourceDetails lead={lead} />
    </div>
  )
}
