import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createSavedSearch, deleteSavedSearch, getJob, getUsers, listSavedSearches, runSavedSearch, updateSavedSearch } from '../api/endpoints'
import type { DiscoverCategory, SavedSearch, SavedSearchFrequency } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { CATEGORY_LABELS } from '../lib/discover'
import { errorMessage } from '../lib/errors'
import { dedupeMessage } from '../lib/messages'
import { formatDate, formatRelative } from '../lib/format'
import { EmptyState, ErrorState, SkeletonRows } from './States'
import { useToast } from './Toast'
import './saved-searches.css'

const FREQUENCY_LABEL: Record<SavedSearchFrequency, string> = { monthly: 'Chaque mois', weekly: 'Chaque semaine' }

/** Inline form under the discovery filters: saves the current city / categories / maximum as a recurring search. */
export function SaveSearchPanel({ city, categories, maxResults, onSaved }: { city: string; categories: DiscoverCategory[]; maxResults: number; onSaved?: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [frequency, setFrequency] = useState<SavedSearchFrequency>('monthly')
  const [assignTo, setAssignTo] = useState('')
  const { hasRole } = useAuth()
  const isAdmin = hasRole('ADMIN')
  // GET /api/users is admin-only: other roles cannot pick an assignee.
  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, enabled: open && isAdmin, staleTime: 5 * 60_000 })

  const save = useMutation({
    mutationFn: () => createSavedSearch({ name: name.trim(), city: city.trim(), categories, maxResults, frequency, assignToUserId: assignTo || null }),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: ['saved-searches'] })
      toast(`Recherche « ${s.name} » enregistrée`)
      setOpen(false)
      setName('')
      onSaved?.()
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  const ready = city.trim().length > 0 && categories.length > 0
  if (!open) {
    return (
      <div className="save-search-toggle">
        <button type="button" className="btn btn-sm" onClick={() => { setName(`${city.trim()} · ${categories.map((c) => CATEGORY_LABELS[c] ?? c).join(', ')}`.slice(0, 150)); setOpen(true) }} disabled={!ready}>
          Enregistrer cette recherche
        </button>
        {!ready && <span className="xs muted">Choisissez une ville et au moins une catégorie.</span>}
      </div>
    )
  }
  return (
    <form className="save-search-form" onSubmit={(e) => { e.preventDefault(); if (name.trim() && !save.isPending) save.mutate() }} aria-label="Enregistrer cette recherche">
      <label className="field">
        <span>Nom de la recherche</span>
        <input className="input" value={name} maxLength={150} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="field">
        <span>Fréquence</span>
        <select className="select" value={frequency} onChange={(e) => setFrequency(e.target.value as SavedSearchFrequency)}>
          <option value="monthly">Chaque mois</option>
          <option value="weekly">Chaque semaine</option>
        </select>
      </label>
      {isAdmin ? (
        <label className="field">
          <span>Assigner les nouveaux leads à</span>
          <select className="select" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
            <option value="">Personne (file commune)</option>
            {(users.data ?? []).filter((u) => u.role !== 'VIEWER').map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
          </select>
        </label>
      ) : (
        <p className="xs muted">Les nouveaux leads iront dans la file commune. Seul un administrateur peut les assigner à une personne.</p>
      )}
      <div className="save-search-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim() || save.isPending}>{save.isPending ? 'Enregistrement…' : 'Enregistrer'}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Annuler</button>
      </div>
      <p className="xs muted save-search-note">Seuls les nouveaux commerces (pas déjà des leads) sont ajoutés, tous les jours à 6 h si la recherche est due.</p>
    </form>
  )
}

function SavedSearchRow({ s }: { s: SavedSearch }) {
  const toast = useToast()
  const qc = useQueryClient()
  const { hasRole } = useAuth()
  const [jobId, setJobId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const finished = useRef<string | null>(null)
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['saved-searches'] })
    for (const k of ['leads', 'summary', 'lead-filters', 'queue', 'sources']) void qc.invalidateQueries({ queryKey: [k] })
  }

  const run = useMutation({
    mutationFn: () => runSavedSearch(s.id),
    onSuccess: (job) => setJobId(job.id),
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const job = useQuery({
    queryKey: ['saved-search-job', jobId],
    queryFn: () => getJob(jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(q.state.data.status) ? false : 1500),
  })
  useEffect(() => {
    const j = job.data
    if (!j || finished.current === j.id) return
    if (j.status === 'COMPLETED') {
      finished.current = j.id
      const n = j.recordsAdded ?? 0
      toast(n === 0 ? `« ${s.name} » : aucun nouveau lead` : `« ${s.name} » : ${n} nouveau${n > 1 ? 'x' : ''} lead${n > 1 ? 's' : ''}`)
      refresh()
    } else if (j.status === 'FAILED' || j.status === 'CANCELLED') {
      finished.current = j.id
      toast(dedupeMessage(j.errors) ?? 'La recherche a échoué', 'error')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.data])

  const toggle = useMutation({
    mutationFn: () => updateSavedSearch(s.id, { name: s.name, city: s.city, categories: s.categories, maxResults: s.maxResults, frequency: s.frequency, assignToUserId: s.assignToUserId, active: !s.active }),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const remove = useMutation({
    mutationFn: () => deleteSavedSearch(s.id),
    onSuccess: () => { toast('Recherche supprimée'); refresh() },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  const jobDone = !!job.data && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.data.status)
  const running = run.isPending || (!!jobId && !jobDone)
  return (
    <li className={`saved-search${s.active ? '' : ' is-paused'}`}>
      <div className="saved-search-main">
        <div className="saved-search-name">{s.name}{!s.active && <span className="saved-search-paused small muted"> · en pause</span>}</div>
        <div className="small muted">
          {s.city} · {s.categories.map((c) => CATEGORY_LABELS[c] ?? c).join(', ')} · {FREQUENCY_LABEL[s.frequency].toLowerCase()}
          {s.assignToName ? ` · pour ${s.assignToName}` : ''}
        </div>
        <div className="xs muted">
          {s.lastRunAt ? `Dernière exécution ${formatRelative(s.lastRunAt)} : ${s.lastAdded ?? 0} nouveau${(s.lastAdded ?? 0) > 1 ? 'x' : ''} lead${(s.lastAdded ?? 0) > 1 ? 's' : ''}` : 'Jamais exécutée'}
          {s.active && s.nextRunAt ? ` · prochaine le ${formatDate(s.nextRunAt, 'd MMM')}` : ''}
        </div>
      </div>
      <div className="saved-search-actions">
        <button type="button" className="btn btn-sm" onClick={() => run.mutate()} disabled={running}>{running ? 'En cours…' : 'Lancer maintenant'}</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => toggle.mutate()} disabled={toggle.isPending}>{s.active ? 'Mettre en pause' : 'Reprendre'}</button>
        {hasRole('ADMIN') && (confirming ? (
          <>
            <button type="button" className="btn btn-sm btn-confirm-delete" onClick={() => remove.mutate()} disabled={remove.isPending}>Confirmer la suppression</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirming(false)}>Annuler</button>
          </>
        ) : (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirming(true)}>Supprimer</button>
        ))}
      </div>
    </li>
  )
}

export function SavedSearchList() {
  const q = useQuery({ queryKey: ['saved-searches'], queryFn: listSavedSearches })
  return (
    <section className="card saved-searches" aria-label="Recherches enregistrées">
      <header className="saved-searches-head">
        <h3>Recherches enregistrées</h3>
        <span className="small muted">Relancées automatiquement, seuls les nouveaux commerces sont ajoutés.</span>
      </header>
      {q.isPending ? (
        <div style={{ padding: 20 }}><SkeletonRows rows={3} /></div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState title="Aucune recherche enregistrée">Lancez une recherche puis choisissez « Enregistrer cette recherche ».</EmptyState>
      ) : (
        <ul className="saved-search-list">{q.data.map((s) => <SavedSearchRow key={s.id} s={s} />)}</ul>
      )}
    </section>
  )
}
