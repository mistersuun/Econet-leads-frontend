import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { addDays, endOfDay, startOfDay } from 'date-fns'
import { listLeads } from '../api/endpoints'
import type { BusinessDTO, LeadListParams } from '../api/types'
import { EmptyState, ErrorState, SkeletonRows } from '../components/States'
import { StatusBadge } from '../components/StatusBadge'
import { IconCheck, IconPhone } from '../components/icons'
import { formatDate, formatPhone, formatRelative, telHref, toDate } from '../lib/format'
import { useAuth } from '../auth/AuthContext'
import './followups.css'

const ACTIVE: LeadListParams['leadStatus'] = ['NEW', 'CONTACTED', 'INTERESTED', 'QUOTE_SENT']

interface Group {
  key: 'overdue' | 'today' | 'week'
  title: string
  tone: string
  leads: BusinessDTO[]
}

export default function FollowUpsPage() {
  const { hasRole } = useAuth()
  const canCall = hasRole('ADMIN', 'USER')
  const due = useQuery({
    queryKey: ['followups', 'due'],
    queryFn: () => listLeads({ followUpDue: true, leadStatus: ACTIVE, sortBy: 'nextFollowUpAt', sortDirection: 'ASC', size: 200 }),
  })
  const upcoming = useQuery({
    queryKey: ['followups', 'upcoming'],
    queryFn: () => listLeads({ leadStatus: ACTIVE, sortBy: 'nextFollowUpAt', sortDirection: 'ASC', size: 200 }),
  })

  const groups = useMemo<Group[] | null>(() => {
    if (!due.data || !upcoming.data) return null
    const now = new Date()
    const today0 = startOfDay(now)
    const todayEnd = endOfDay(now)
    const weekEnd = endOfDay(addDays(now, 7))
    const seen = new Set<string>()
    const all = [...due.data.content, ...upcoming.data.content].filter((l) => {
      if (seen.has(l.id) || !l.nextFollowUpAt) return false
      seen.add(l.id)
      return true
    })
    const at = (l: BusinessDTO) => toDate(l.nextFollowUpAt)!
    const sort = (a: BusinessDTO, b: BusinessDTO) => at(a).getTime() - at(b).getTime()
    return [
      { key: 'overdue', title: 'En retard', tone: '#c4613f', leads: all.filter((l) => at(l) < today0).sort(sort) },
      { key: 'today', title: 'Aujourd’hui', tone: '#c98a1f', leads: all.filter((l) => at(l) >= today0 && at(l) <= todayEnd).sort(sort) },
      { key: 'week', title: 'Cette semaine', tone: '#6b9080', leads: all.filter((l) => at(l) > todayEnd && at(l) <= weekEnd).sort(sort) },
    ]
  }, [due.data, upcoming.data])

  const error = due.error ?? upcoming.error
  const total = groups?.reduce((s, g) => s + g.leads.length, 0) ?? 0

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Suivis</h1>
          <p className="subtitle">Rappels prévus, du plus ancien au plus récent.</p>
        </div>
        <span className="spacer" />
        {canCall && (
          <Link to="/call" className="btn btn-primary">
            <IconPhone size={17} /> Lancer la file d’appels
          </Link>
        )}
      </div>

      {error ? (
        <div className="card">
          <ErrorState error={error} onRetry={() => { void due.refetch(); void upcoming.refetch() }} />
        </div>
      ) : !groups ? (
        <div className="fu-columns">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card card-pad">
              <SkeletonRows rows={6} height={28} />
            </div>
          ))}
        </div>
      ) : total === 0 ? (
        <div className="card">
          <EmptyState title="Aucun suivi prévu cette semaine" icon={<IconCheck size={22} />}>
            Tous les rappels sont à jour.
          </EmptyState>
        </div>
      ) : (
        <div className="fu-columns">
          {groups.map((g) => (
            <section key={g.key} className={`card fu-group fu-${g.key}`} aria-labelledby={`fu-${g.key}`}>
              <header className="fu-head">
                <span className="dot" style={{ background: g.tone }} aria-hidden="true" />
                <h2 id={`fu-${g.key}`}>{g.title}</h2>
                <span className="fu-count" aria-label={`${g.leads.length} leads`}>{g.leads.length}</span>
              </header>
              {g.leads.length === 0 ? (
                <p className="muted small fu-empty">Rien ici.</p>
              ) : (
                <ul className="fu-list">
                  {g.leads.map((l) => (
                    <li key={l.id} className="fu-item">
                      <div className="fu-main">
                        <Link to={`/leads/${l.id}`} className="lead-name fu-name">
                          {l.businessName}
                        </Link>
                        <div className="xs muted truncate">
                          {l.businessType} · {l.addressCity}
                          {l.assignedToName && ` · ${l.assignedToName}`}
                        </div>
                        <div className="fu-meta">
                          <StatusBadge status={l.leadStatus} variant="dot" />
                          <span className={`fu-when ${g.key === 'overdue' ? 'text-danger' : ''}`} title={formatDate(l.nextFollowUpAt, "d MMM yyyy 'à' HH'h'mm")}>
                            {g.key === 'week' ? formatDate(l.nextFollowUpAt, "EEE d MMM, HH'h'mm") : formatRelative(l.nextFollowUpAt)}
                          </span>
                        </div>
                      </div>
                      <div className="fu-actions">
                        {l.phone && (
                          <a className="btn btn-sm" href={telHref(l.phone)} aria-label={`Appeler ${l.businessName} au ${formatPhone(l.phone)}`}>
                            <IconPhone size={15} />
                            <span className="fu-phone num">{formatPhone(l.phone)}</span>
                          </a>
                        )}
                        <Link className="btn btn-sm btn-ghost" to={`/leads/${l.id}`}>
                          Ouvrir
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
