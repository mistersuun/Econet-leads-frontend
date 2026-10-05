import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getJobStatistics,
  importDataSource,
  listDataSources,
  listJobs,
  listRunningJobs,
  setDataSourceActive,
} from '../api/endpoints'
import { jobSourceId, jobSourceName, type DataSource, type JobStatus, type ScraperJobDTO } from '../api/types'
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from '../components/States'
import { useToast } from '../components/Toast'
import { IconPlay, IconRefresh } from '../components/icons'
import { errorMessage } from '../lib/errors'
import { formatDateTime, formatNumber, formatRelative } from '../lib/format'
import './sources.css'

const JOB_STATUS: Record<JobStatus, { label: string; color: string }> = {
  PENDING: { label: 'En attente', color: '#a1a1a6' },
  RUNNING: { label: 'En cours', color: '#4a72b0' },
  COMPLETED: { label: 'Terminé', color: '#2f7a5c' },
  FAILED: { label: 'Échec', color: '#c4613f' },
  CANCELLED: { label: 'Annulé', color: '#48484a' },
}
const SOURCE_TYPE: Record<string, string> = { CKAN_API: 'API CKAN', WEB_SCRAPER: 'Scraper web', CSV_DOWNLOAD: 'Fichier CSV', MANUAL: 'Manuel' }
const FREQ: Record<string, string> = { DAILY: 'Quotidienne', WEEKLY: 'Hebdomadaire', MONTHLY: 'Mensuelle', MANUAL: 'Manuelle' }

function JobBadge({ status }: { status: JobStatus }) {
  const m = JOB_STATUS[status] ?? { label: status, color: '#a1a1a6' }
  return (
    <span className="badge" style={{ background: `${m.color}1f`, borderColor: `${m.color}40` }}>
      <span className={`dot${status === 'RUNNING' || status === 'PENDING' ? ' pulse' : ''}`} style={{ background: m.color }} />
      {m.label}
    </span>
  )
}

function duration(job: ScraperJobDTO): string {
  const s = job.durationSeconds
  if (s == null) return job.status === 'RUNNING' || job.status === 'PENDING' ? 'en cours…' : '—'
  if (s < 60) return `${s} s`
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
}

export default function SourcesPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const sources = useQuery({ queryKey: ['sources'], queryFn: listDataSources })
  const stats = useQuery({ queryKey: ['job-stats'], queryFn: getJobStatistics })
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => listJobs(0, 15) })
  const running = useQuery({
    queryKey: ['jobs-running'],
    queryFn: listRunningJobs,
    refetchInterval: (q) => ((q.state.data?.length ?? 0) > 0 ? 3000 : false),
  })

  // When the set of running jobs shrinks, a job finished: refresh everything that depends on it.
  const prevRunning = useRef<number>(0)
  useEffect(() => {
    const n = running.data?.length ?? 0
    if (n < prevRunning.current) {
      for (const k of ['jobs', 'job-stats', 'sources', 'leads', 'summary', 'lead-filters', 'queue', 'breakdown', 'pipeline']) void qc.invalidateQueries({ queryKey: [k] })
      toast('Importation terminée')
    }
    prevRunning.current = n
  }, [running.data, qc, toast])

  const runningIds = new Set((running.data ?? []).map((j) => jobSourceId(j)))

  const importMut = useMutation({
    mutationFn: (s: DataSource) => importDataSource(s.id),
    onSuccess: (job, s) => {
      toast(`Importation lancée : ${s.sourceName}`)
      qc.setQueryData<ScraperJobDTO[]>(['jobs-running'], (old) => [...(old ?? []), job])
      void qc.invalidateQueries({ queryKey: ['jobs-running'] })
      void qc.invalidateQueries({ queryKey: ['jobs'] })
      void qc.invalidateQueries({ queryKey: ['job-stats'] })
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const [toggling, setToggling] = useState<string | null>(null)
  const activeMut = useMutation({
    mutationFn: (s: DataSource) => setDataSourceActive(s.id, !s.active),
    onMutate: (s) => setToggling(s.id),
    onSuccess: (updated) => {
      qc.setQueryData<DataSource[]>(['sources'], (old) => old?.map((x) => (x.id === updated.id ? { ...x, active: updated.active } : x)))
      toast(updated.active ? 'Source activée' : 'Source désactivée')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
    onSettled: () => setToggling(null),
  })

  // Show running jobs on top of the history even before the history refetches.
  const jobRows: ScraperJobDTO[] = (() => {
    const hist = jobs.data?.content ?? []
    const live = running.data ?? []
    const ids = new Set(live.map((j) => j.id))
    return [...live, ...hist.filter((j) => !ids.has(j.id))]
  })()

  const STATS: { label: string; value: (s: NonNullable<typeof stats.data>) => number }[] = [
    { label: 'Importations', value: (s) => s.total },
    { label: 'Réussies', value: (s) => s.completed },
    { label: 'Échecs', value: (s) => s.failed },
    { label: 'Dernières 24 h', value: (s) => s.last24Hours },
    { label: 'Fiches traitées', value: (s) => s.totalRecordsProcessed },
    { label: 'Fiches ajoutées', value: (s) => s.totalRecordsAdded },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Sources de données</h1>
          <p className="subtitle">Imports depuis les données ouvertes du Québec et autres sources.</p>
        </div>
        <span className="spacer" />
        {(running.data?.length ?? 0) > 0 && (
          <span className="chip">
            <span className="dot pulse" style={{ background: '#4a72b0', width: 8, height: 8, borderRadius: '50%' }} />
            {running.data!.length} importation{running.data!.length > 1 ? 's' : ''} en cours
          </span>
        )}
      </div>

      <div className="grid stats-grid">
        {STATS.map((st) => (
          <div key={st.label} className="card kpi">
            <span className="kpi-label">{st.label}</span>
            {stats.data ? <span className="kpi-value" style={{ fontSize: '1.4rem' }}>{formatNumber(st.value(stats.data))}</span> : stats.isError ? <span className="muted">—</span> : <Skeleton height={26} width="50%" />}
          </div>
        ))}
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <header className="widget-head" style={{ paddingBottom: 12 }}>
          <h2>Sources</h2>
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => void sources.refetch()} aria-label="Actualiser les sources">
            <IconRefresh size={16} />
          </button>
        </header>
        {sources.isPending ? (
          <div style={{ padding: 20 }}>
            <SkeletonRows rows={5} height={24} />
          </div>
        ) : sources.isError ? (
          <ErrorState error={sources.error} onRetry={() => void sources.refetch()} />
        ) : sources.data.length === 0 ? (
          <EmptyState title="Aucune source configurée" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th className="hide-sm">Type</th>
                  <th className="hide-md">Fréquence</th>
                  <th>Dernière synchro</th>
                  <th className="num hide-sm">Fiches</th>
                  <th>Active</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sources.data.map((s) => {
                  const isRunning = runningIds.has(s.id)
                  return (
                    <tr key={s.id}>
                      <td>
                        <div className="lead-name">{s.sourceName}</div>
                        {s.sourceUrl && (
                          <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="xs source-url">
                            {s.sourceUrl.replace(/^https?:\/\//, '')}
                          </a>
                        )}
                      </td>
                      <td className="hide-sm nowrap">{SOURCE_TYPE[s.sourceType] ?? s.sourceType}</td>
                      <td className="hide-md">{s.syncFrequency ? FREQ[s.syncFrequency] ?? s.syncFrequency : '—'}</td>
                      <td className="nowrap" title={formatDateTime(s.lastSync)}>
                        {s.lastSync ? formatRelative(s.lastSync) : <span className="muted">Jamais</span>}
                      </td>
                      <td className="num hide-sm">{formatNumber(s.recordsCount ?? 0)}</td>
                      <td>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={s.active}
                          aria-label={`${s.active ? 'Désactiver' : 'Activer'} ${s.sourceName}`}
                          className="switch"
                          disabled={toggling === s.id}
                          onClick={() => activeMut.mutate(s)}
                        >
                          <span />
                        </button>
                      </td>
                      <td className="num">
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={!s.active || isRunning || (importMut.isPending && importMut.variables?.id === s.id)}
                          onClick={() => importMut.mutate(s)}
                          title={!s.active ? 'Activez la source pour importer' : undefined}
                        >
                          <IconPlay size={14} /> {isRunning ? 'En cours…' : 'Importer'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <header className="widget-head" style={{ paddingBottom: 12 }}>
          <h2>Historique des importations</h2>
          <span className="hint">{(running.data?.length ?? 0) > 0 ? 'actualisation toutes les 3 s' : '15 plus récentes'}</span>
        </header>
        {jobs.isPending ? (
          <div style={{ padding: 20 }}>
            <SkeletonRows rows={6} height={24} />
          </div>
        ) : jobs.isError ? (
          <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />
        ) : jobRows.length === 0 ? (
          <EmptyState title="Aucune importation pour l’instant" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Statut</th>
                  <th className="hide-sm">Début</th>
                  <th className="hide-md">Durée</th>
                  <th className="num">Traitées</th>
                  <th className="num hide-sm">Ajoutées</th>
                  <th className="num hide-md">Mises à jour</th>
                </tr>
              </thead>
              <tbody>
                {jobRows.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <div className="lead-name">{jobSourceName(j)}</div>
                      {j.errors && <div className="xs text-danger job-error">{j.errors}</div>}
                    </td>
                    <td>
                      <JobBadge status={j.status} />
                    </td>
                    <td className="hide-sm nowrap" title={formatDateTime(j.startedAt ?? j.createdAt)}>
                      {formatRelative(j.startedAt ?? j.createdAt)}
                    </td>
                    <td className="hide-md nowrap">{duration(j)}</td>
                    <td className="num">{formatNumber(j.recordsProcessed ?? 0)}</td>
                    <td className="num hide-sm">{formatNumber(j.recordsAdded ?? 0)}</td>
                    <td className="num hide-md">{formatNumber(j.recordsUpdated ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
