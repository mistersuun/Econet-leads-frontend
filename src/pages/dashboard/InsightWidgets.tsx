// Addendum 3 dashboard cards: funnel, best hours, team today, conversion by
// type (what the queue learned) and the live activity feed.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getBestHours, getConversionByType, getFunnel, getTeamToday } from '../../api/endpoints'
import type { BestHourCell, DateRange, Funnel, PresenceStatus } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { Widget } from '../../components/Widget'
import { useLive } from '../../live/LiveProvider'
import { presenceLabel, type ActivityEvent } from '../../live/store'
import { formatDuration } from '../../lib/callSession'
import { formatNumber, formatPercent, formatRelative } from '../../lib/format'
import { OUTCOME_META, PALETTE } from '../../lib/status'
import { leadsHref } from '../../lib/leadFilters'
import { TENDER_STATUS_META } from '../../lib/tenders'

/* ------------------------------------------------------------- Funnel */

const STAGES: { key: keyof Funnel; label: string }[] = [
  { key: 'dials', label: 'Appels' },
  { key: 'connects', label: 'Joints' },
  { key: 'conversations', label: 'Conversations' },
  { key: 'interested', label: 'Intéressés' },
  { key: 'quotes', label: 'Devis' },
  { key: 'won', label: 'Gagnés' },
]

export function FunnelWidget({ range, className }: { range: DateRange; className: string }) {
  const q = useQuery({ queryKey: ['funnel', range], queryFn: () => getFunnel(range) })
  return (
    <Widget title="Entonnoir" hint="d’un appel à un contrat" className={className} query={q} minHeight={300} isEmpty={(d) => d.dials === 0} emptyTitle="Aucun appel sur cette période">
      {(f) => {
        const max = Math.max(1, f.dials)
        return (
          <ol className="funnel" aria-label="Entonnoir d’appels">
            {STAGES.map((s, i) => {
              const v = f[s.key]
              const prev = i > 0 ? f[STAGES[i - 1].key] : null
              const rate = prev ? (prev > 0 ? v / prev : 0) : null
              return (
                <li key={s.key}>
                  <span className="funnel-label">{s.label}</span>
                  <span className="funnel-track">
                    <span className="funnel-fill" style={{ width: `${Math.max(v > 0 ? 1.5 : 0, (v / max) * 100)}%`, opacity: 1 - i * 0.11 }} />
                  </span>
                  <span className="funnel-value num">{formatNumber(v)}</span>
                  <span className="funnel-rate num muted">{rate === null ? `${formatPercent(1, 0)}` : formatPercent(rate, 0)}</span>
                </li>
              )
            })}
            <li className="funnel-total xs muted">
              <span />
              <span>taux global : {f.dials ? formatPercent(f.won / f.dials, 1) : '—'} des appels deviennent des contrats</span>
            </li>
          </ol>
        )
      }}
    </Widget>
  )
}

/* --------------------------------------------------------- Best hours */

const DOW_LABEL = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i)

/** One quiet sequential scale from the brand green: cells get darker as the positive rate rises. */
function cellColor(rate: number | null, maxRate: number): string {
  if (rate === null) return 'var(--fill)'
  const t = maxRate > 0 ? Math.min(1, rate / maxRate) : 0
  const pct = Math.round(10 + t * 80)
  return `color-mix(in srgb, ${PALETTE.green} ${pct}%, white)`
}

export function BestHoursWidget({ range, className }: { range: DateRange; className: string }) {
  const q = useQuery({ queryKey: ['best-hours', range], queryFn: () => getBestHours(range) })
  const [tip, setTip] = useState<{ cell: BestHourCell; x: number; y: number } | null>(null)
  return (
    <Widget title="Meilleures heures" hint="taux de résultats positifs par créneau" className={className} query={q} minHeight={300} isEmpty={(d) => d.every((c) => c.calls === 0)} emptyTitle="Aucun appel sur cette période">
      {(cells) => {
        const byKey = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c]))
        const rates = cells.filter((c) => c.calls >= 2).map((c) => c.positive / c.calls)
        const maxRate = Math.max(0.01, ...rates)
        const best = [...cells].filter((c) => c.calls >= 3).sort((a, b) => b.positive / b.calls - a.positive / a.calls || b.calls - a.calls)[0]
        return (
          <div className="heat-wrap" onMouseLeave={() => setTip(null)}>
            <div className="heat" role="table" aria-label="Taux de résultats positifs par jour et heure">
              <div className="heat-corner" />
              {HOURS.map((h) => (
                <div key={h} className="heat-h xs muted" role="columnheader">
                  {h} h
                </div>
              ))}
              {[1, 2, 3, 4, 5].map((dow) => (
                <div key={dow} className="heat-row" role="row">
                  <div className="heat-d xs muted" role="rowheader">
                    {DOW_LABEL[dow]}
                  </div>
                  {HOURS.map((h) => {
                    const c = byKey.get(`${dow}-${h}`) ?? { dow, hour: h, calls: 0, connects: 0, positive: 0 }
                    const rate = c.calls > 0 ? c.positive / c.calls : null
                    return (
                      <div
                        key={h}
                        role="cell"
                        className="heat-cell"
                        style={{ background: cellColor(rate, maxRate) }}
                        aria-label={`${DOW_LABEL[dow]} ${h} h : ${c.calls} appels, ${c.positive} positifs`}
                        onMouseEnter={(e) => {
                          const r = (e.currentTarget.parentElement!.parentElement as HTMLElement).getBoundingClientRect()
                          const me = e.currentTarget.getBoundingClientRect()
                          setTip({ cell: c, x: me.left - r.left + me.width / 2, y: me.top - r.top })
                        }}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
            {tip && (
              <div className="chart-tip heat-tip" style={{ left: tip.x, top: tip.y }}>
                <div className="chart-tip-title">
                  {DOW_LABEL[tip.cell.dow]} {tip.cell.hour} h–{tip.cell.hour + 1} h
                </div>
                <div className="chart-tip-row">
                  <span>Appels</span>
                  <strong className="num">{tip.cell.calls}</strong>
                </div>
                <div className="chart-tip-row">
                  <span>Joints</span>
                  <strong className="num">{tip.cell.connects}</strong>
                </div>
                <div className="chart-tip-row">
                  <span>Positifs</span>
                  <strong className="num">
                    {tip.cell.positive}
                    {tip.cell.calls ? ` (${formatPercent(tip.cell.positive / tip.cell.calls, 0)})` : ''}
                  </strong>
                </div>
              </div>
            )}
            <div className="heat-foot xs muted">
              <span className="heat-scale" aria-hidden="true">
                <span style={{ background: cellColor(0, 1) }} />
                <span style={{ background: cellColor(0.5, 1) }} />
                <span style={{ background: cellColor(1, 1) }} />
              </span>
              <span>plus foncé = meilleur taux</span>
              <span className="spacer" />
              {best && (
                <span>
                  Meilleur créneau : <strong>{DOW_LABEL[best.dow]} {best.hour} h</strong> ({formatPercent(best.positive / best.calls, 0)} sur {best.calls} appels)
                </span>
              )}
            </div>
          </div>
        )
      }}
    </Widget>
  )
}

/* --------------------------------------------------------- Team today */

const STATUS_COLOR: Record<PresenceStatus, string> = { calling: PALETTE.green, idle: PALETTE.sage, offline: '#c7c7cc' }

export function TeamTodayWidget({ className }: { className: string }) {
  const q = useQuery({ queryKey: ['team-today'], queryFn: getTeamToday, refetchInterval: 120_000 })
  const { presence } = useLive()
  return (
    <Widget title="Équipe aujourd’hui" hint="en direct" className={className} query={q} minHeight={240} isEmpty={(d) => d.length === 0} emptyTitle="Aucun agent">
      {(rows) => {
        const max = Math.max(1, ...rows.map((r) => r.callsToday))
        return (
          <ul className="team-today">
            {[...rows]
              .sort((a, b) => b.callsToday - a.callsToday)
              .map((r) => {
                const live = presence.find((p) => p.userId === r.userId)
                const status = live?.status ?? r.status
                const label = live ? presenceLabel(live) : r.currentLeadName ? `en appel · ${r.currentLeadName}` : r.status === 'idle' ? 'en ligne' : 'hors ligne'
                return (
                  <li key={r.userId}>
                    <span className="avatar sm">{r.username.slice(0, 2).toUpperCase()}</span>
                    <span className="team-main">
                      <span className="lead-name">{r.username}</span>
                      <span className="status-dot xs">
                        <span className={`dot${status === 'calling' ? ' pulse' : ''}`} style={{ background: STATUS_COLOR[status] }} />
                        <span className="truncate">{label}</span>
                      </span>
                    </span>
                    <span className="team-bar" aria-hidden="true">
                      <span style={{ width: `${(r.callsToday / max) * 100}%` }} />
                    </span>
                    <span className="team-nums num">
                      <strong>{r.callsToday}</strong> <span className="muted xs">appels</span> · <strong>{r.conversationsToday}</strong> <span className="muted xs">conv.</span>
                    </span>
                  </li>
                )
              })}
          </ul>
        )
      }}
    </Widget>
  )
}

/* ----------------------------------------------------- Conversion by type */

export function ConversionByTypeWidget({ className }: { className: string }) {
  const q = useQuery({ queryKey: ['conversion-by-type'], queryFn: getConversionByType })
  return (
    <Widget title="Ce que la file a appris" hint="taux positif lissé par type, 180 jours · pondère la priorité" className={className} query={q} minHeight={240} isEmpty={(d) => d.length === 0} emptyTitle="Pas encore d’appels">
      {(rows) => {
        const max = Math.max(0.01, ...rows.map((r) => r.rate))
        return (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th className="hide-sm" style={{ width: '28%' }} aria-label="Taux" />
                  <th className="num">Taux</th>
                  <th className="num">Appelés</th>
                  <th className="num hide-sm">Conv.</th>
                  <th className="num">Positifs</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.businessType}>
                    <td>
                      <Link to={leadsHref({ type: r.businessType })} className="lead-name">
                        {r.businessType}
                      </Link>
                    </td>
                    <td className="hide-sm">
                      <span className="minibar" style={{ width: `${(r.rate / max) * 100}%`, background: `color-mix(in srgb, ${PALETTE.green} 70%, white)` }} />
                    </td>
                    <td className="num">
                      <strong>{formatPercent(r.rate, 0)}</strong>
                    </td>
                    <td className="num">{formatNumber(r.leadsCalled)}</td>
                    <td className="num hide-sm">{formatNumber(r.conversations)}</td>
                    <td className="num">{formatNumber(r.positive)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }}
    </Widget>
  )
}

/* ------------------------------------------------------------ Live feed */

function describe(e: ActivityEvent): { who: string; what: string; color: string; link?: string } {
  switch (e.type) {
    case 'call.logged': {
      const meta = OUTCOME_META[e.data.outcome]
      return {
        who: e.data.username,
        what: `${meta?.label ?? e.data.outcome} · ${e.data.leadName}${e.data.durationSeconds ? ` · ${formatDuration(e.data.durationSeconds)}` : ''}`,
        color: meta?.color ?? PALETTE.gray,
        link: `/leads/${e.data.leadId}`,
      }
    }
    case 'lead.claimed':
      return { who: e.data.username, what: `appelle ${e.data.leadName}`, color: PALETTE.sage, link: `/leads/${e.data.leadId}` }
    case 'tender.updated':
      return { who: 'Appel d’offres', what: `→ ${TENDER_STATUS_META[e.data.status]?.label ?? e.data.status}`, color: PALETTE.blue, link: `/tenders/${e.data.tenderId}` }
  }
}

export function LiveFeedWidget({ className }: { className: string }) {
  const { activity, connected } = useLive()
  const { user } = useAuth()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  const items = useMemo(() => activity.slice(0, 12), [activity])
  return (
    <section className={`card widget live-feed ${className}`}>
      <header className="widget-head">
        <h2>En direct</h2>
        <span className="hint row" style={{ gap: 6 }}>
          <span className={`dot${connected ? ' live' : ''}`} aria-hidden="true" />
          {connected ? 'flux connecté' : 'reconnexion…'}
        </span>
      </header>
      <div className="widget-body" style={{ minHeight: 240 }}>
        {items.length === 0 ? (
          <p className="muted small" style={{ padding: '8px 0' }}>
            Les appels de l’équipe apparaîtront ici au fil de la matinée.
          </p>
        ) : (
          <ul className="feed">
            {items.map((e) => {
              const d = describe(e)
              const mine = 'userId' in e.data && e.data.userId === user?.userId
              return (
                <li key={e.id || e.at}>
                  <span className="feed-dot" style={{ background: d.color }} aria-hidden="true" />
                  <span className="feed-text">
                    <strong>{mine ? 'Vous' : d.who}</strong> {d.link ? <Link to={d.link}>{d.what}</Link> : d.what}
                  </span>
                  <span className="feed-when xs muted">{formatRelative(new Date(e.at), now)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
