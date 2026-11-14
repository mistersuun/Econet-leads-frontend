import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getClientsSummary, listClients } from '../api/endpoints'
import type { ClientDTO, ClientFrequency, ClientStatus } from '../api/types'
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from '../components/States'
import { IconBriefcase, IconSearch } from '../components/icons'
import { CLIENT_STATUS_COLOR, CLIENT_STATUS_LABEL, FREQUENCIES, FREQUENCY_LABEL, renewalInfo } from '../lib/clients'
import { formatCurrency, formatDate, formatNumber } from '../lib/format'
import './clients.css'

type StatusFilter = ClientStatus | 'all'
const FILTER_LABEL: Record<StatusFilter, string> = { active: 'Actifs', paused: 'En pause', ended: 'Terminés', all: 'Tous' }

export function ClientStatusDot({ status }: { status: ClientStatus }) {
  return (
    <span className="status-dot">
      <span className="dot" style={{ background: CLIENT_STATUS_COLOR[status] }} aria-hidden="true" />
      {CLIENT_STATUS_LABEL[status]}
    </span>
  )
}

export function RenewalBadge({ date, className = '' }: { date: string | null; className?: string }) {
  const r = renewalInfo(date)
  if (!r) return <span className="muted">—</span>
  return (
    <span className={`cl-renewal ${r.tone === 'none' ? '' : `note ${r.tone}`} ${className}`} title={`Fin du contrat : ${formatDate(date)}`}>
      {formatDate(date)}
      <span className={r.tone === 'none' ? 'muted xs' : 'xs'}> · {r.label}</span>
    </span>
  )
}

export default function ClientsPage() {
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()
  const [status, setStatus] = useState<StatusFilter>('active')
  const [frequency, setFrequency] = useState<ClientFrequency | ''>('')
  const [renewalSoon, setRenewalSoon] = useState(false)
  const [search, setSearch] = useState('')

  const list = useQuery({ queryKey: ['clients', 'list'], queryFn: () => listClients() })
  const summary = useQuery({ queryKey: ['clients', 'summary'], queryFn: getClientsSummary })

  // Notifications and lead links point at /clients?lead=<businessId>: open that client's drawer.
  const leadParam = sp.get('lead')
  useEffect(() => {
    if (!leadParam || !list.data) return
    const c = list.data.find((x) => x.businessId === leadParam)
    if (c) navigate(`/clients/${c.id}`, { replace: true })
    else setSp({}, { replace: true })
  }, [leadParam, list.data, navigate, setSp])

  const rows = useMemo<ClientDTO[]>(() => {
    const term = search.trim().toLowerCase()
    return (list.data ?? []).filter((c) => {
      if (status !== 'all' && c.status !== status) return false
      if (frequency && c.frequency !== frequency) return false
      if (renewalSoon) {
        const r = renewalInfo(c.contractEndDate)
        if (!r || r.days > 30) return false
      }
      if (term && !`${c.businessName} ${c.city ?? ''} ${c.service}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [list.data, status, frequency, renewalSoon, search])

  const s = summary.data
  const open = (c: ClientDTO) => navigate(`/clients/${c.id}`)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Clients</h1>
          <p className="subtitle">Les contrats gagnés : service, fréquence, renouvellements et avis Google.</p>
        </div>
      </div>

      <section className="card card-pad cl-summary" aria-label="Résumé des clients">
        <div>
          <span className="tile-label">Revenu mensuel récurrent</span>
          {s ? <span className="cl-figure num" data-testid="mrr">{formatCurrency(s.monthlyRecurringRevenue)}</span> : <Skeleton height={40} width={140} />}
        </div>
        <div>
          <span className="tile-label">Clients actifs</span>
          {s ? <span className="cl-figure num">{formatNumber(s.active)}</span> : <Skeleton height={40} width={64} />}
        </div>
        <div>
          <span className="tile-label">Renouvellements d’ici 30 jours</span>
          {s ? <span className="cl-figure num">{formatNumber(s.renewalsNext30Days)}</span> : <Skeleton height={40} width={64} />}
        </div>
        <div>
          <span className="tile-label">Avis Google à demander</span>
          {s ? <span className="cl-figure num">{formatNumber(s.reviewsPending)}</span> : <Skeleton height={40} width={64} />}
        </div>
      </section>

      <div className="cl-filters">
        <nav className="segmented" aria-label="Filtrer par statut">
          {(['active', 'paused', 'ended', 'all'] as StatusFilter[]).map((k) => (
            <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)}>
              {FILTER_LABEL[k]}
            </button>
          ))}
        </nav>
        <label className="input-icon cl-search">
          <IconSearch size={16} />
          <input className="input" type="search" placeholder="Rechercher un client" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher un client" />
        </label>
        <select className="select cl-freq" value={frequency} onChange={(e) => setFrequency(e.target.value as ClientFrequency | '')} aria-label="Fréquence">
          <option value="">Toutes les fréquences</option>
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABEL[f]}
            </option>
          ))}
        </select>
        <label className="cl-check">
          <input type="checkbox" checked={renewalSoon} onChange={(e) => setRenewalSoon(e.target.checked)} />
          Renouvellement dans 30 jours
        </label>
      </div>

      <div className="card leads-table-card">
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.isPending ? (
          <div className="card-pad">
            <SkeletonRows rows={6} height={28} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title={list.data.length === 0 ? 'Aucun client pour l’instant' : 'Aucun client ne correspond'} icon={<IconBriefcase size={22} />}>
            {list.data.length === 0 ? 'Un lead qui passe au statut « Gagné » devient automatiquement un client.' : 'Essayez d’élargir les filtres.'}
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap cl-table">
              <table className="table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Statut</th>
                    <th>Service</th>
                    <th>Fréquence</th>
                    <th className="num">Prix / visite</th>
                    <th className="num">Par mois</th>
                    <th>Renouvellement</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr
                      key={c.id}
                      className="clickable"
                      tabIndex={0}
                      onClick={() => open(c)}
                      onKeyDown={(e) => e.key === 'Enter' && open(c)}
                    >
                      <td>
                        <Link to={`/clients/${c.id}`} className="lead-name" onClick={(e) => e.stopPropagation()}>
                          {c.businessName}
                        </Link>
                        <div className="xs muted truncate">{c.city ?? '—'}</div>
                      </td>
                      <td><ClientStatusDot status={c.status} /></td>
                      <td>{c.service}</td>
                      <td>{FREQUENCY_LABEL[c.frequency]}</td>
                      <td className="num">{formatCurrency(c.pricePerVisit)}</td>
                      <td className="num">{c.monthlyValue > 0 ? formatCurrency(c.monthlyValue) : '—'}</td>
                      <td><RenewalBadge date={c.contractEndDate} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="cl-cards">
              {rows.map((c) => (
                <li key={c.id}>
                  <Link to={`/clients/${c.id}`} className="cl-card">
                    <div className="cl-card-top">
                      <strong className="truncate">{c.businessName}</strong>
                      <ClientStatusDot status={c.status} />
                    </div>
                    <div className="small muted truncate">
                      {c.service} · {FREQUENCY_LABEL[c.frequency]}
                    </div>
                    <div className="cl-card-bottom">
                      <span className="num">
                        {formatCurrency(c.pricePerVisit)} / visite
                        {c.monthlyValue > 0 && <span className="muted"> · {formatCurrency(c.monthlyValue)} / mois</span>}
                      </span>
                      <RenewalBadge date={c.contractEndDate} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <Outlet />
    </div>
  )
}
