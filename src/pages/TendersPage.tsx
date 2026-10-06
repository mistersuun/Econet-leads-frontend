import { Suspense, useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getTenderSummary, listTenders } from '../api/endpoints'
import { TENDER_SOURCES, TENDER_STATUSES, type TenderDTO, type TenderSource, type TenderStatus } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from '../components/States'
import { TenderStatusSelect } from '../components/TenderStatusSelect'
import { IconArrowDown, IconArrowUp, IconChevronLeft, IconChevronRight, IconExternalLink, IconSearch, IconX } from '../components/icons'
import { formatDate, formatNumber } from '../lib/format'
import {
  DEFAULT_TENDER_FILTERS,
  TENDER_SOURCE_LABEL,
  TENDER_STATUS_META,
  activeTenderFilterCount,
  closingCountdown,
  isAwardedContract,
  parseTenderFilters,
  serializeTenderFilters,
  toTenderParams,
  type TenderFilterState,
} from '../lib/tenders'
import './tenders.css'

function useTenderFilterState(): [TenderFilterState, (patch: Partial<TenderFilterState>) => void] {
  const [sp, setSp] = useSearchParams()
  const filters = useMemo(() => parseTenderFilters(sp), [sp])
  const update = (patch: Partial<TenderFilterState>) => {
    const resetPage = !('page' in patch)
    setSp(serializeTenderFilters({ ...filters, ...patch, ...(resetPage ? { page: 0 } : {}) }), { replace: true })
  }
  return [filters, update]
}

const STATS: { key: keyof Awaited<ReturnType<typeof getTenderSummary>>; label: string }[] = [
  { key: 'open', label: 'Ouverts' },
  { key: 'closingThisWeek', label: 'Clôture cette semaine' },
  { key: 'bidding', label: 'En préparation' },
  { key: 'submitted', label: 'Soumis' },
  { key: 'won', label: 'Gagnés' },
]

function ClosingCell({ tender, now }: { tender: TenderDTO; now: Date }) {
  const c = closingCountdown(tender.closingAt, now)
  const awarded = isAwardedContract(tender)
  return (
    <div className="closing" title={tender.closingAt ? formatDate(tender.closingAt, "d MMMM yyyy 'à' HH'h'mm") : undefined}>
      <span className="num">{tender.closingAt ? formatDate(tender.closingAt, 'd MMM yyyy') : '—'}</span>
      <span className={`xs${c.urgent ? ' text-danger' : ' muted'}`}>{awarded && !c.past ? `fin du contrat ${c.text}` : c.text}</span>
    </div>
  )
}

export default function TendersPage() {
  const [filters, update] = useTenderFilterState()
  const navigate = useNavigate()
  const { id: openId } = useParams()
  const [sp] = useSearchParams()
  const { hasRole } = useAuth()
  const canEdit = hasRole('ADMIN', 'USER')
  const [search, setSearch] = useState(filters.q)

  useEffect(() => {
    if (search === filters.q) return
    const t = setTimeout(() => update({ q: search }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const params = toTenderParams(filters)
  const tenders = useQuery({ queryKey: ['tenders', params], queryFn: () => listTenders(params), placeholderData: keepPreviousData })
  const summary = useQuery({ queryKey: ['tender-summary'], queryFn: getTenderSummary })
  const page = tenders.data
  const now = new Date()
  const activeCount = activeTenderFilterCount(filters)
  const open = (t: TenderDTO) => navigate({ pathname: `/tenders/${t.id}`, search: sp.toString() })

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Appels d’offres</h1>
          <p className="subtitle">Contrats publics d’entretien ménager repérés sur CanadaBuys et SEAO.</p>
        </div>
      </div>

      <div className="card stats-strip" style={{ ['--cols' as string]: STATS.length }}>
        {STATS.map((st) => (
          <div key={st.key} className="stat">
            <span className="kpi-label">{st.label}</span>
            {summary.data ? (
              <span className="stat-value">{formatNumber(summary.data[st.key])}</span>
            ) : summary.isError ? (
              <span className="muted">—</span>
            ) : (
              <Skeleton height={28} width="50%" />
            )}
          </div>
        ))}
      </div>

      <div className="card filters" role="search" style={{ marginTop: 16 }}>
        <div className="input-icon filters-search">
          <IconSearch size={17} />
          <input
            className="input"
            type="search"
            placeholder="Titre, organisme ou numéro…"
            aria-label="Rechercher"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={`select${filters.status ? ' has-value' : ''}`}
          aria-label="Statut"
          value={filters.status}
          onChange={(e) => update({ status: e.target.value as TenderStatus | '' })}
        >
          <option value="">Tous les statuts</option>
          {TENDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TENDER_STATUS_META[s].label}
            </option>
          ))}
        </select>
        <select
          className={`select${filters.source ? ' has-value' : ''}`}
          aria-label="Source"
          value={filters.source}
          onChange={(e) => update({ source: e.target.value as TenderSource | '' })}
        >
          <option value="">Toutes les sources</option>
          {TENDER_SOURCES.map((s) => (
            <option key={s} value={s}>
              {TENDER_SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
        <div className="filters-checks">
          <label className="check">
            <input type="checkbox" checked={filters.open} onChange={(e) => update({ open: e.target.checked })} /> Ouverts seulement
          </label>
          {activeCount > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearch('')
                update({ ...DEFAULT_TENDER_FILTERS, dir: filters.dir, size: filters.size })
              }}
            >
              <IconX size={15} /> Réinitialiser
            </button>
          )}
        </div>
      </div>

      <div className="card tenders-card" aria-busy={tenders.isFetching}>
        {tenders.isPending ? (
          <div style={{ padding: 20 }}>
            <SkeletonRows rows={10} height={22} />
          </div>
        ) : tenders.isError ? (
          <ErrorState error={tenders.error} onRetry={() => void tenders.refetch()} />
        ) : page!.content.length === 0 ? (
          <EmptyState title="Aucun appel d’offres ne correspond à ces filtres">
            {filters.open ? 'Décochez « Ouverts seulement » pour voir aussi les avis fermés.' : 'Essayez d’élargir votre recherche.'}
          </EmptyState>
        ) : (
          <>
            <div className={`table-wrap${tenders.isPlaceholderData ? ' is-stale' : ''}`}>
              <table className="table tenders-table">
                <thead>
                  <tr>
                    <th>Avis</th>
                    <th className="hide-sm">Source</th>
                    <th className="hide-md">Région</th>
                    <th aria-sort={filters.dir === 'ASC' ? 'ascending' : 'descending'}>
                      <button type="button" className="sort-btn" onClick={() => update({ dir: filters.dir === 'ASC' ? 'DESC' : 'ASC' })}>
                        Clôture
                        {filters.dir === 'ASC' ? <IconArrowUp size={13} /> : <IconArrowDown size={13} />}
                      </button>
                    </th>
                    <th className="hide-lg">Mots-clés</th>
                    <th className="hide-sm">Statut</th>
                    <th className="hide-sm">
                      <span className="sr-only">Lien</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page!.content.map((t) => {
                    const meta = TENDER_STATUS_META[t.status]
                    return (
                      <tr
                        key={t.id}
                        className={`clickable${openId === t.id ? ' selected' : ''}`}
                        tabIndex={0}
                        onClick={() => open(t)}
                        onKeyDown={(e) => {
                          if (e.target !== e.currentTarget) return
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            open(t)
                          }
                        }}
                      >
                        <td className="tender-main">
                          <div className="lead-name tender-title">{t.title}</div>
                          <div className="xs muted">
                            {isAwardedContract(t) && <>Contrat octroyé · </>}
                            {t.buyer}
                          </div>
                          <div className="show-sm tender-meta xs">
                            <span className="status-dot">
                              <span className="dot" style={{ background: meta.color }} />
                              {meta.label}
                            </span>
                            <span className="muted"> · {TENDER_SOURCE_LABEL[t.source]}</span>
                          </div>
                        </td>
                        <td className="hide-sm nowrap">{TENDER_SOURCE_LABEL[t.source] ?? t.source}</td>
                        <td className="hide-md tender-region">{t.region ?? <span className="muted">—</span>}</td>
                        <td className="nowrap">
                          <ClosingCell tender={t} now={now} />
                        </td>
                        <td className="hide-lg muted small tender-keywords">{t.matchedKeywords.join(', ') || '—'}</td>
                        <td className="hide-sm">
                          <TenderStatusSelect tender={t} disabled={!canEdit} />
                        </td>
                        <td className="hide-sm num">
                          <a
                            className="tender-link small"
                            href={t.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            Voir l’avis <IconExternalLink size={13} />
                          </a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span className="num">
                {formatNumber(page!.number * page!.size + 1)}–{formatNumber(page!.number * page!.size + page!.content.length)} sur {formatNumber(page!.totalElements)}
              </span>
              <span className="spacer" />
              <button type="button" className="btn btn-sm btn-icon" aria-label="Page précédente" disabled={page!.number === 0} onClick={() => update({ page: page!.number - 1 })}>
                <IconChevronLeft size={16} />
              </button>
              <span className="num">
                {page!.number + 1} / {Math.max(1, page!.totalPages)}
              </span>
              <button type="button" className="btn btn-sm btn-icon" aria-label="Page suivante" disabled={page!.number + 1 >= page!.totalPages} onClick={() => update({ page: page!.number + 1 })}>
                <IconChevronRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </div>
  )
}
