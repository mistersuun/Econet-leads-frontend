import { Suspense, useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { exportLeadsCsv, getLeadFilters, listLeads } from '../api/endpoints'
import { saveBlob } from '../api/client'
import { LEAD_STATUSES, type BusinessDTO, type LeadSortField } from '../api/types'
import { QualityMeter } from '../components/LeadCard'
import { MultiSelect } from '../components/MultiSelect'
import { EmptyState, ErrorState, SkeletonRows } from '../components/States'
import { StatusBadge } from '../components/StatusBadge'
import { useToast } from '../components/Toast'
import { IconArrowDown, IconArrowUp, IconChevronLeft, IconChevronRight, IconDownload, IconSearch, IconX } from '../components/icons'
import { errorMessage } from '../lib/errors'
import { formatCurrency, formatDate, formatNumber, formatPhone, formatRelative, toApiDate, toDate } from '../lib/format'
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  parseLeadFilters,
  serializeLeadFilters,
  toListParams,
  type LeadFilterState,
} from '../lib/leadFilters'
import { STATUS_META } from '../lib/status'
import './leads.css'

function useLeadFilterState(): [LeadFilterState, (patch: Partial<LeadFilterState>) => void] {
  const [sp, setSp] = useSearchParams()
  const filters = useMemo(() => parseLeadFilters(sp), [sp])
  const update = (patch: Partial<LeadFilterState>) => {
    // Any change other than paging resets to the first page.
    const resetPage = !('page' in patch)
    setSp(serializeLeadFilters({ ...filters, ...patch, ...(resetPage ? { page: 0 } : {}) }), { replace: true })
  }
  return [filters, update]
}

function SortHeader({ field, label, filters, onSort, className }: { field: LeadSortField; label: string; filters: LeadFilterState; onSort: (f: LeadSortField) => void; className?: string }) {
  const active = filters.sort === field
  return (
    <th className={className} aria-sort={active ? (filters.dir === 'ASC' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sort-btn" onClick={() => onSort(field)}>
        {label}
        {active ? filters.dir === 'ASC' ? <IconArrowUp size={13} /> : <IconArrowDown size={13} /> : null}
      </button>
    </th>
  )
}

function FollowUpCell({ lead }: { lead: BusinessDTO }) {
  const d = toDate(lead.nextFollowUpAt)
  if (!d) return <span className="muted">—</span>
  const now = new Date()
  const overdue = d < now
  return (
    <span className={overdue ? 'text-danger' : undefined} title={formatDate(d, "d MMM yyyy 'à' HH'h'mm")}>
      {formatRelative(d, now)}
    </span>
  )
}

export default function LeadsPage() {
  const [filters, update] = useLeadFilterState()
  const navigate = useNavigate()
  const { id: openId } = useParams()
  const [sp] = useSearchParams()
  const toast = useToast()
  const [search, setSearch] = useState(filters.q)
  const [exporting, setExporting] = useState(false)

  // Debounce the search box into the URL.
  useEffect(() => {
    if (search === filters.q) return
    const t = setTimeout(() => update({ q: search }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const params = toListParams(filters)
  const leads = useQuery({ queryKey: ['leads', params], queryFn: () => listLeads(params), placeholderData: keepPreviousData })
  const options = useQuery({ queryKey: ['lead-filters'], queryFn: getLeadFilters, staleTime: 5 * 60_000 })

  const onSort = (field: LeadSortField) => {
    if (filters.sort === field) update({ dir: filters.dir === 'ASC' ? 'DESC' : 'ASC' })
    else update({ sort: field, dir: field === 'businessName' || field === 'addressCity' || field === 'nextFollowUpAt' ? 'ASC' : 'DESC' })
  }

  const doExport = async () => {
    setExporting(true)
    try {
      const blob = await exportLeadsCsv(params)
      saveBlob(blob, `leads-econet-${toApiDate(new Date())}.csv`)
      toast('Export CSV téléchargé')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setExporting(false)
    }
  }

  const open = (lead: BusinessDTO) => navigate({ pathname: `/leads/${lead.id}`, search: sp.toString() })
  const activeCount = activeFilterCount(filters)
  const page = leads.data

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Leads</h1>
          <p className="subtitle">
            {page ? `${formatNumber(page.totalElements)} lead${page.totalElements > 1 ? 's' : ''}` : 'Chargement…'}
            {activeCount > 0 && ` · ${activeCount} filtre${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''}`}
          </p>
        </div>
        <span className="spacer" />
        <button type="button" className="btn" onClick={doExport} disabled={exporting}>
          <IconDownload size={17} /> {exporting ? 'Export…' : 'Exporter CSV'}
        </button>
      </div>

      <div className="card filters" role="search">
        <div className="input-icon filters-search">
          <IconSearch size={17} />
          <input
            className="input"
            type="search"
            placeholder="Nom, téléphone ou ville…"
            aria-label="Rechercher"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <MultiSelect
          label="Statut"
          options={LEAD_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label, color: STATUS_META[s].color }))}
          value={filters.status}
          onChange={(status) => update({ status })}
        />
        <select className={`select${filters.type ? ' has-value' : ''}`} aria-label="Type" value={filters.type} onChange={(e) => update({ type: e.target.value })}>
          <option value="">Tous les types</option>
          {options.data?.businessTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
          {filters.type && !options.data?.businessTypes.includes(filters.type) && <option value={filters.type}>{filters.type}</option>}
        </select>
        <select className={`select${filters.city ? ' has-value' : ''}`} aria-label="Ville" value={filters.city} onChange={(e) => update({ city: e.target.value })}>
          <option value="">Toutes les villes</option>
          {options.data?.cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          {filters.city && !options.data?.cities.includes(filters.city) && <option value={filters.city}>{filters.city}</option>}
        </select>
        <select className={`select${filters.source ? ' has-value' : ''}`} aria-label="Source" value={filters.source} onChange={(e) => update({ source: e.target.value })}>
          <option value="">Toutes les sources</option>
          {options.data?.dataSources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
          {filters.source && !options.data?.dataSources.includes(filters.source) && <option value={filters.source}>{filters.source}</option>}
        </select>
        <div className="filters-checks">
          <label className="check">
            <input type="checkbox" checked={filters.phone} onChange={(e) => update({ phone: e.target.checked })} /> Avec téléphone
          </label>
          <label className="check">
            <input type="checkbox" checked={filters.mine} onChange={(e) => update({ mine: e.target.checked })} /> Mes leads
          </label>
          <label className="check">
            <input type="checkbox" checked={filters.due} onChange={(e) => update({ due: e.target.checked })} /> Suivi dû
          </label>
          {activeCount > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearch('')
                update({ ...DEFAULT_FILTERS, sort: filters.sort, dir: filters.dir, size: filters.size })
              }}
            >
              <IconX size={15} /> Réinitialiser
            </button>
          )}
        </div>
      </div>

      <div className="card leads-table-card" aria-busy={leads.isFetching}>
        {leads.isPending ? (
          <div style={{ padding: 20 }}>
            <SkeletonRows rows={10} height={22} />
          </div>
        ) : leads.isError ? (
          <ErrorState error={leads.error} onRetry={() => void leads.refetch()} />
        ) : page!.content.length === 0 ? (
          <EmptyState title="Aucun lead ne correspond à ces filtres">Essayez d’élargir votre recherche.</EmptyState>
        ) : (
          <>
            <div className={`table-wrap${leads.isPlaceholderData ? ' is-stale' : ''}`}>
              <table className="table leads-table">
                <thead>
                  <tr>
                    <SortHeader field="businessName" label="Entreprise" filters={filters} onSort={onSort} />
                    <SortHeader field="addressCity" label="Ville" filters={filters} onSort={onSort} className="hide-sm" />
                    <th className="hide-sm">Téléphone</th>
                    <th>Statut</th>
                    <SortHeader field="dataQualityScore" label="Qualité" filters={filters} onSort={onSort} className="hide-md" />
                    <SortHeader field="lastContactedAt" label="Dernier contact" filters={filters} onSort={onSort} className="hide-md" />
                    <SortHeader field="nextFollowUpAt" label="Prochain suivi" filters={filters} onSort={onSort} className="hide-sm" />
                    <th className="hide-lg">Assigné</th>
                    <th className="num hide-lg">Valeur</th>
                    <SortHeader field="createdAt" label="Ajouté" filters={filters} onSort={onSort} className="hide-lg" />
                  </tr>
                </thead>
                <tbody>
                  {page!.content.map((l) => (
                    <tr
                      key={l.id}
                      className={`clickable${openId === l.id ? ' selected' : ''}`}
                      tabIndex={0}
                      onClick={() => open(l)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          open(l)
                        }
                      }}
                    >
                      <td>
                        <div className="lead-name">{l.businessName}</div>
                        <div className="xs muted">
                          {l.businessType}
                          <span className="show-sm"> · {l.addressCity}</span>
                        </div>
                      </td>
                      <td className="hide-sm">{l.addressCity ?? '—'}</td>
                      <td className="hide-sm nowrap num">{formatPhone(l.phone)}</td>
                      <td>
                        <StatusBadge status={l.leadStatus} />
                      </td>
                      <td className="hide-md">
                        <QualityMeter score={l.dataQualityScore} />
                      </td>
                      <td className="hide-md nowrap">{l.lastContactedAt ? formatRelative(l.lastContactedAt) : <span className="muted">Jamais</span>}</td>
                      <td className="hide-sm nowrap">
                        <FollowUpCell lead={l} />
                      </td>
                      <td className="hide-lg">{l.assignedToName ?? <span className="muted">—</span>}</td>
                      <td className="num hide-lg">{l.estimatedValue != null ? formatCurrency(l.estimatedValue) : <span className="muted">—</span>}</td>
                      <td className="hide-lg nowrap muted">{formatDate(l.createdAt, 'd MMM yy')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span className="num">
                {formatNumber(page!.number * page!.size + 1)}–{formatNumber(page!.number * page!.size + page!.content.length)} sur {formatNumber(page!.totalElements)}
              </span>
              <span className="spacer" />
              <label className="row" style={{ gap: 6 }}>
                <span className="hide-sm">Par page</span>
                <select className="select" style={{ height: 32, width: 76 }} value={filters.size} onChange={(e) => update({ size: Number(e.target.value) })} aria-label="Leads par page">
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
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
