import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { format, parseISO, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  getActivity,
  getBreakdown,
  getLeaderboard,
  getOutcomes,
  getPipeline,
  getSummary,
} from '../api/endpoints'
import type { ActivityPoint, BreakdownDimension, DashboardSummary, DateRange } from '../api/types'
import { DateRangePicker } from '../components/DateRangePicker'
import { ErrorState, Skeleton } from '../components/States'
import { Widget } from '../components/Widget'
import { IconAlert, IconArrowDown, IconArrowUp } from '../components/icons'
import { presetRange, previousRange, rangeLength, type RangePreset } from '../lib/dates'
import { formatCurrency, formatDate, formatNumber, formatPercent } from '../lib/format'
import { leadsHref } from '../lib/leadFilters'
import { OUTCOME_META, PALETTE, STATUS_META } from '../lib/status'
import './dashboard.css'

const SERIES = {
  calls: { label: 'Appels', color: PALETTE.blue },
  conversations: { label: 'Conversations', color: PALETTE.amber },
  won: { label: 'Contrats gagnés', color: PALETTE.green },
} as const

function useDashboardRange(): [RangePreset, DateRange, (p: RangePreset, r?: DateRange) => void] {
  const [sp, setSp] = useSearchParams()
  const p = (sp.get('p') as RangePreset | null) ?? '30d'
  const preset: RangePreset = ['7d', '30d', '90d', 'ytd', 'custom'].includes(p) ? p : '30d'
  const range =
    preset === 'custom' && sp.get('from') && sp.get('to')
      ? { from: sp.get('from')!, to: sp.get('to')! }
      : presetRange(preset === 'custom' ? '30d' : preset)
  const set = (next: RangePreset, r?: DateRange) => {
    const n = new URLSearchParams()
    if (next !== '30d') n.set('p', next)
    if (next === 'custom' && r) {
      n.set('from', r.from)
      n.set('to', r.to)
    }
    setSp(n, { replace: true })
  }
  return [preset, range, set]
}

export default function DashboardPage() {
  const [preset, range, setRange] = useDashboardRange()
  const prev = useMemo(() => previousRange(range), [range])

  const summary = useQuery({ queryKey: ['summary', range], queryFn: () => getSummary(range) })
  const prevSummary = useQuery({ queryKey: ['summary', prev], queryFn: () => getSummary(prev) })

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Tableau de bord</h1>
          <p className="subtitle">
            Du {formatDate(range.from, 'd MMMM yyyy')} au {formatDate(range.to, 'd MMMM yyyy')} · comparé aux {rangeLength(range)} jours précédents
          </p>
        </div>
        <span className="spacer" />
        <DateRangePicker
          preset={preset}
          range={range}
          onPreset={(p) => setRange(p)}
          onCustom={(r) => setRange('custom', r)}
        />
      </div>

      <KpiRow summary={summary} prev={prevSummary.data} />

      <div className="grid dash-grid" style={{ marginTop: 16 }}>
        <ActivityWidget range={range} className="span-8" />
        <PipelineWidget className="span-4" />
        <OutcomesWidget range={range} className="span-5" />
        <LeaderboardWidget range={range} className="span-7" />
        <BreakdownWidget className="span-12" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ KPIs */

type Delta = { kind: 'count' | 'points'; current: number; previous: number | undefined }

function DeltaPill({ d }: { d: Delta }) {
  if (d.previous === undefined) return null
  let text: string
  let dir: 'up' | 'down' | 'flat'
  if (d.kind === 'points') {
    const diff = (d.current - d.previous) * 100
    dir = Math.abs(diff) < 0.05 ? 'flat' : diff > 0 ? 'up' : 'down'
    text = `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff).toLocaleString('fr-CA', { maximumFractionDigits: 1 })} pts`
  } else {
    if (d.previous === 0) {
      dir = d.current > 0 ? 'up' : 'flat'
      text = d.current > 0 ? 'nouveau' : '0 %'
    } else {
      const pct = (d.current - d.previous) / d.previous
      dir = Math.abs(pct) < 0.005 ? 'flat' : pct > 0 ? 'up' : 'down'
      text = `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${formatPercent(Math.abs(pct), 0)}`
    }
  }
  const Icon = dir === 'up' ? IconArrowUp : dir === 'down' ? IconArrowDown : null
  return (
    <span className={`delta ${dir}`} title={`Période précédente : ${d.kind === 'points' ? formatPercent(d.previous) : formatNumber(d.previous)}`}>
      {Icon && <Icon size={12} strokeWidth={2.5} />}
      {text}
    </span>
  )
}

interface KpiDef {
  label: string
  value: (s: DashboardSummary) => string
  delta?: (s: DashboardSummary, p?: DashboardSummary) => Delta
  foot?: (s: DashboardSummary) => ReactNode
  to?: string
  alert?: (s: DashboardSummary) => boolean
}

const KPIS: KpiDef[] = [
  { label: 'Appels', value: (s) => formatNumber(s.calls), delta: (s, p) => ({ kind: 'count', current: s.calls, previous: p?.calls }), foot: (s) => `${formatNumber(s.callsToday)} aujourd’hui` },
  { label: 'Conversations', value: (s) => formatNumber(s.conversations), delta: (s, p) => ({ kind: 'count', current: s.conversations, previous: p?.conversations }), foot: (s) => (s.calls ? `${formatPercent(s.conversations / s.calls, 0)} des appels` : '') },
  { label: 'Devis envoyés', value: (s) => formatNumber(s.quotesSent), delta: (s, p) => ({ kind: 'count', current: s.quotesSent, previous: p?.quotesSent }) },
  { label: 'Contrats gagnés', value: (s) => formatNumber(s.won), delta: (s, p) => ({ kind: 'count', current: s.won, previous: p?.won }) },
  { label: 'Taux de conversion', value: (s) => formatPercent(s.conversionRate), delta: (s, p) => ({ kind: 'points', current: s.conversionRate, previous: p?.conversionRate }), foot: () => 'gagnés / leads appelés' },
  { label: 'Valeur du pipeline', value: (s) => formatCurrency(s.pipelineValue, { compact: true }), foot: () => 'Intéressés + devis envoyés', to: leadsHref({ status: ['INTERESTED', 'QUOTE_SENT'] }) },
  { label: 'Leads à appeler', value: (s) => formatNumber(s.callableLeads), foot: (s) => `+${formatNumber(s.newLeads)} nouveaux sur la période`, to: '/call' },
  {
    label: 'Suivis en retard',
    value: (s) => formatNumber(s.followUpsOverdue),
    foot: (s) => `${formatNumber(s.followUpsDue)} prévus aujourd’hui`,
    to: '/follow-ups',
    alert: (s) => s.followUpsOverdue > 0,
  },
]

function KpiRow({ summary, prev }: { summary: UseQueryResult<DashboardSummary>; prev?: DashboardSummary }) {
  if (summary.isError) {
    return (
      <div className="card">
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      </div>
    )
  }
  return (
    <div className="grid kpi-grid">
      {KPIS.map((k) => {
        const s = summary.data
        const content = (
          <>
            <span className="kpi-label">
              {k.label}
              {s && k.alert?.(s) && <IconAlert size={14} style={{ color: 'var(--danger)' }} />}
            </span>
            {s ? <span className="kpi-value">{k.value(s)}</span> : <Skeleton height={32} width="60%" />}
            <span className="kpi-foot">
              {s ? (
                <>
                  {k.delta && <DeltaPill d={k.delta(s, prev)} />}
                  <span className="truncate">{k.foot?.(s) ?? (k.delta ? 'vs période préc.' : '')}</span>
                </>
              ) : (
                <Skeleton height={12} width="45%" />
              )}
            </span>
          </>
        )
        const cls = `card kpi${s && k.alert?.(s) ? ' alert' : ''}`
        return k.to ? (
          <Link key={k.label} to={k.to} className={cls}>
            {content}
          </Link>
        ) : (
          <div key={k.label} className={cls}>
            {content}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------- Activity */

function bucketActivity(points: ActivityPoint[]): { key: string; label: string; calls: number; conversations: number; won: number }[] {
  const weekly = points.length > 100
  if (!weekly) {
    return points.map((p) => ({ key: p.date, label: format(parseISO(p.date), points.length > 31 ? 'd MMM' : 'EEE d', { locale: fr }), calls: p.calls, conversations: p.conversations, won: p.won }))
  }
  const map = new Map<string, { key: string; label: string; calls: number; conversations: number; won: number }>()
  for (const p of points) {
    const wk = startOfWeek(parseISO(p.date), { weekStartsOn: 1 })
    const key = format(wk, 'yyyy-MM-dd')
    const row = map.get(key) ?? { key, label: `sem. ${format(wk, 'd MMM', { locale: fr })}`, calls: 0, conversations: 0, won: 0 }
    row.calls += p.calls
    row.conversations += p.conversations
    row.won += p.won
    map.set(key, row)
  }
  return [...map.values()]
}

interface TipPayload {
  dataKey?: string | number
  value?: number | string
  color?: string
  name?: string
  payload?: { label?: string }
}

function ChartTooltip({ active, payload, title }: { active?: boolean; payload?: readonly TipPayload[]; title?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{title ?? payload[0].payload?.label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="chart-tip-row">
          <span className="swatch" style={{ background: p.color }} />
          <span>{p.name}</span>
          <strong className="num">{formatNumber(Number(p.value))}</strong>
        </div>
      ))}
    </div>
  )
}

function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="legend" aria-hidden="true">
      {items.map((i) => (
        <span key={i.label}>
          <span className={i.line ? 'swatch line' : 'swatch'} style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

function ActivityWidget({ range, className }: { range: DateRange; className: string }) {
  const q = useQuery({ queryKey: ['activity', range], queryFn: () => getActivity(range) })
  const [showTable, setShowTable] = useState(false)
  return (
    <Widget
      title="Activité"
      hint={q.data && q.data.length > 100 ? 'par semaine' : 'par jour'}
      className={className}
      query={q}
      minHeight={300}
      isEmpty={(d) => d.every((p) => p.calls === 0)}
      emptyTitle="Aucun appel sur cette période"
      skeleton={<Skeleton height={260} />}
      actions={
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
          {showTable ? 'Graphique' : 'Tableau'}
        </button>
      }
    >
      {(data) => {
        const rows = bucketActivity(data)
        if (showTable) {
          return (
            <div className="table-wrap" style={{ maxHeight: 280 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="num">Appels</th>
                    <th className="num">Conversations</th>
                    <th className="num">Gagnés</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td className="num">{r.calls}</td>
                      <td className="num">{r.conversations}</td>
                      <td className="num">{r.won}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        return (
          <>
            <Legend
              items={[
                { label: SERIES.calls.label, color: SERIES.calls.color },
                { label: SERIES.conversations.label, color: SERIES.conversations.color, line: true },
                { label: SERIES.won.label, color: SERIES.won.color, line: true },
              ]}
            />
            <div style={{ height: 250 }} role="img" aria-label="Graphique d'activité : appels, conversations et contrats gagnés">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap="22%">
                  <CartesianGrid vertical={false} stroke="#ececf0" />
                  <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#d2d2d7' }} tick={{ fontSize: 11, fill: '#6e6e73' }} minTickGap={16} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6e6e73' }} width={44} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="calls" name={SERIES.calls.label} fill={SERIES.calls.color} fillOpacity={0.85} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Line dataKey="conversations" name={SERIES.conversations.label} stroke={SERIES.conversations.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} type="monotone" />
                  <Line dataKey="won" name={SERIES.won.label} stroke={SERIES.won.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} type="monotone" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )
      }}
    </Widget>
  )
}

/* ------------------------------------------------------------- Pipeline */

function PipelineWidget({ className }: { className: string }) {
  const q = useQuery({ queryKey: ['pipeline'], queryFn: () => getPipeline() })
  return (
    <Widget
      title="Pipeline"
      hint="état actuel"
      className={className}
      query={q}
      minHeight={300}
      isEmpty={(d) => d.every((p) => p.count === 0)}
      emptyTitle="Aucun lead"
    >
      {(data) => {
        const max = Math.max(1, ...data.map((d) => d.count))
        const total = data.reduce((s, d) => s + d.count, 0)
        return (
          <ul className="hbars" aria-label="Leads par statut">
            {data.map((d) => {
              const meta = STATUS_META[d.status]
              return (
                <li key={d.status}>
                  <Link to={leadsHref({ status: [d.status] })} className="hbar-row" title={`Voir les leads « ${meta.label} »`}>
                    <span className="hbar-label">
                      <span className="swatch" style={{ background: meta.color }} />
                      {meta.label}
                    </span>
                    <span className="hbar-track">
                      <span className="hbar-fill" style={{ width: `${(d.count / max) * 100}%`, background: meta.color }} />
                    </span>
                    <span className="hbar-value num">
                      {formatNumber(d.count)}
                      <span className="muted xs"> {total ? formatPercent(d.count / total, 0) : ''}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )
      }}
    </Widget>
  )
}

/* ------------------------------------------------------------- Outcomes */

const OUTCOME_GROUPS = [
  { key: 'positive', label: 'Positifs', color: PALETTE.green },
  { key: 'neutral', label: 'À relancer', color: PALETTE.blue },
  { key: 'negative', label: 'Négatifs', color: PALETTE.terracotta },
] as const

function OutcomesWidget({ range, className }: { range: DateRange; className: string }) {
  const q = useQuery({ queryKey: ['outcomes', range], queryFn: () => getOutcomes(range) })
  return (
    <Widget
      title="Résultats d’appels"
      className={className}
      query={q}
      minHeight={300}
      isEmpty={(d) => d.every((o) => o.count === 0)}
      emptyTitle="Aucun appel sur cette période"
    >
      {(data) => {
        const total = data.reduce((s, o) => s + o.count, 0)
        const groups = OUTCOME_GROUPS.map((g) => ({
          ...g,
          value: data.filter((o) => OUTCOME_META[o.outcome]?.tone === g.key).reduce((s, o) => s + o.count, 0),
        }))
        const rows = [...data].filter((o) => o.count > 0).sort((a, b) => b.count - a.count)
        const max = Math.max(1, ...rows.map((r) => r.count))
        return (
          <div className="outcomes">
            <div className="donut">
              <div style={{ width: 150, height: 150, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={groups} dataKey="value" nameKey="label" innerRadius={50} outerRadius={72} paddingAngle={2} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                      {groups.map((g) => (
                        <Cell key={g.key} fill={g.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip title="Résultats" />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <strong className="num">{formatNumber(total)}</strong>
                  <span>appels</span>
                </div>
              </div>
              <ul className="donut-legend">
                {groups.map((g) => (
                  <li key={g.key}>
                    <span className="swatch" style={{ background: g.color }} />
                    {g.label}
                    <strong className="num">{total ? formatPercent(g.value / total, 0) : '—'}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <ul className="hbars compact" aria-label="Appels par résultat">
              {rows.map((o) => {
                const meta = OUTCOME_META[o.outcome]
                return (
                  <li key={o.outcome} className="hbar-row static">
                    <span className="hbar-label">{meta?.label ?? o.outcome}</span>
                    <span className="hbar-track">
                      <span className="hbar-fill" style={{ width: `${(o.count / max) * 100}%`, background: OUTCOME_GROUPS.find((g) => g.key === meta?.tone)?.color ?? PALETTE.gray }} />
                    </span>
                    <span className="hbar-value num">{formatNumber(o.count)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      }}
    </Widget>
  )
}

/* ------------------------------------------------------------ Breakdown */

const DIMENSIONS: { key: BreakdownDimension; label: string; filter: 'type' | 'city' | 'source' }[] = [
  { key: 'type', label: 'Type', filter: 'type' },
  { key: 'city', label: 'Ville', filter: 'city' },
  { key: 'source', label: 'Source', filter: 'source' },
]

function BreakdownWidget({ className }: { className: string }) {
  const [dim, setDim] = useState<BreakdownDimension>('type')
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['breakdown', dim], queryFn: () => getBreakdown(dim, undefined, 10) })
  const filterKey = DIMENSIONS.find((d) => d.key === dim)!.filter
  return (
    <Widget
      title="Répartition des leads"
      hint="top 10 · cliquez une ligne pour filtrer"
      className={className}
      query={q}
      minHeight={200}
      isEmpty={(d) => d.length === 0}
      emptyTitle="Aucun lead"
      actions={
        <div className="segmented" role="group" aria-label="Dimension">
          {DIMENSIONS.map((d) => (
            <button key={d.key} type="button" aria-pressed={dim === d.key} onClick={() => setDim(d.key)}>
              {d.label}
            </button>
          ))}
        </div>
      }
    >
      {(data) => {
        const max = Math.max(1, ...data.map((r) => r.total))
        return (
          <div className="table-wrap">
            <table className="table breakdown">
              <thead>
                <tr>
                  <th>{DIMENSIONS.find((d) => d.key === dim)!.label}</th>
                  <th className="hide-sm" style={{ width: '34%' }}>
                    <span className="legend inline">
                      <span><span className="swatch" style={{ background: '#d9dfe9' }} />Total</span>
                      <span><span className="swatch" style={{ background: PALETTE.blue }} />Contactés</span>
                      <span><span className="swatch" style={{ background: PALETTE.green }} />Gagnés</span>
                    </span>
                  </th>
                  <th className="num">Total</th>
                  <th className="num">Contactés</th>
                  <th className="num">Gagnés</th>
                  <th className="num">Taux de gain</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr
                    key={r.label}
                    className="clickable"
                    tabIndex={0}
                    onClick={() => navigate(leadsHref({ [filterKey]: r.label }))}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(leadsHref({ [filterKey]: r.label }))}
                  >
                    <td className="lead-name">{r.label}</td>
                    <td className="hide-sm">
                      <span className="stackbar" style={{ width: `${(r.total / max) * 100}%` }}>
                        <span style={{ width: `${(Math.max(0, r.contacted - r.won) / Math.max(1, r.total)) * 100}%`, background: PALETTE.blue }} />
                        <span style={{ width: `${(r.won / Math.max(1, r.total)) * 100}%`, background: PALETTE.green }} />
                      </span>
                    </td>
                    <td className="num">{formatNumber(r.total)}</td>
                    <td className="num">{formatNumber(r.contacted)}</td>
                    <td className="num">{formatNumber(r.won)}</td>
                    <td className="num">{r.contacted ? formatPercent(r.won / r.contacted) : '—'}</td>
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

/* ---------------------------------------------------------- Leaderboard */

function LeaderboardWidget({ range, className }: { range: DateRange; className: string }) {
  const q = useQuery({ queryKey: ['leaderboard', range], queryFn: () => getLeaderboard(range) })
  return (
    <Widget
      title="Classement de l’équipe"
      className={className}
      query={q}
      minHeight={300}
      isEmpty={(d) => d.length === 0}
      emptyTitle="Aucun appel sur cette période"
    >
      {(data) => {
        const max = Math.max(1, ...data.map((r) => r.calls))
        return (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Agent</th>
                  <th className="hide-sm" style={{ width: '30%' }} aria-label="Barre d'appels" />
                  <th className="num">Appels</th>
                  <th className="num">Conv.</th>
                  <th className="num">Gagnés</th>
                  <th className="num hide-sm">Conv. / appel</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <tr key={r.userId}>
                    <td className="num muted">{i + 1}</td>
                    <td>
                      <span className="row">
                        <span className="avatar sm">{r.username.slice(0, 2)}</span>
                        <span className="lead-name">{r.username}</span>
                      </span>
                    </td>
                    <td className="hide-sm">
                      <span className="minibar" style={{ width: `${(r.calls / max) * 100}%` }} />
                    </td>
                    <td className="num">{formatNumber(r.calls)}</td>
                    <td className="num">{formatNumber(r.conversations)}</td>
                    <td className="num">{formatNumber(r.won)}</td>
                    <td className="num hide-sm">{r.calls ? formatPercent(r.conversations / r.calls, 0) : '—'}</td>
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
