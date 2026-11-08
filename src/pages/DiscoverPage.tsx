import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { discoverOsm, importOsm } from '../api/endpoints'
import type { DiscoverCandidate, DiscoverCategory, DiscoverResponse } from '../api/types'
import { EmptyState, SkeletonRows } from '../components/States'
import { useToast } from '../components/Toast'
import { IconAlert, IconSearch } from '../components/icons'
import { errorMessage } from '../lib/errors'
import { formatNumber, formatPhone } from '../lib/format'
import './discover.css'

const CATEGORIES: { id: DiscoverCategory; label: string }[] = [
  { id: 'restaurant', label: 'Restaurants' },
  { id: 'clinic', label: 'Cliniques' },
  { id: 'daycare', label: 'Garderies' },
  { id: 'office', label: 'Bureaux' },
  { id: 'retail', label: 'Commerces' },
  { id: 'gym', label: 'Gyms' },
  { id: 'school', label: 'Écoles' },
  { id: 'hotel', label: 'Hôtels' },
  { id: 'senior', label: 'Résidences' },
  { id: 'pharmacy', label: 'Pharmacies' },
]
const CATEGORY_LABEL: Record<string, string> = {
  restaurant: 'Restaurant', clinic: 'Clinique', daycare: 'Garderie', office: 'Bureau', retail: 'Commerce',
  gym: 'Gym', school: 'École', hotel: 'Hôtel', senior: 'Résidence', pharmacy: 'Pharmacie',
}
const LIMITS = [50, 100, 200, 300]

function searchError(e: unknown): string {
  if (e instanceof ApiError && (e.status === 502 || e.status === 503 || e.status === 504)) return 'Service indisponible, réessayez.'
  return errorMessage(e)
}

export default function DiscoverPage() {
  const toast = useToast()
  const qc = useQueryClient()
  const [city, setCity] = useState('Montréal')
  const [cats, setCats] = useState<DiscoverCategory[]>([])
  const [limit, setLimit] = useState(100)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [assignToMe, setAssignToMe] = useState(false)
  // Candidates saved from the current results now "exist" without searching again.
  const [saved, setSaved] = useState<Map<string, string>>(new Map())
  const [added, setAdded] = useState<{ n: number; skipped: number; source: string } | null>(null)

  const search = useMutation({
    mutationFn: () => discoverOsm({ city: city.trim(), categories: cats, limit }),
    onMutate: () => { setPicked(new Set()); setAdded(null); setSaved(new Map()) },
  })
  const result: DiscoverResponse | undefined = search.data
  const candidates = useMemo(() => result?.candidates ?? [], [result])
  const existingId = (c: DiscoverCandidate) => c.existingLeadId ?? saved.get(c.osmId) ?? null
  const selectable = (c: DiscoverCandidate) => !existingId(c)
  const withPhone = candidates.filter((c) => selectable(c) && c.phone)

  const toggle = (id: string) => setPicked((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const selectedCandidates = candidates.filter((c) => picked.has(c.osmId))
  const allSelectable = candidates.filter(selectable)
  const allChecked = allSelectable.length > 0 && allSelectable.every((c) => picked.has(c.osmId))

  const add = useMutation({
    mutationFn: () => importOsm(selectedCandidates, assignToMe),
    onSuccess: (res) => {
      for (const k of ['leads', 'summary', 'lead-filters', 'queue', 'sources']) void qc.invalidateQueries({ queryKey: [k] })
      setSaved((m) => {
        const n = new Map(m)
        for (const l of res.leads) if (l.externalId) n.set(l.externalId, l.id)
        return n
      })
      setPicked(new Set())
      setAdded({ n: res.added, skipped: res.skipped, source: 'OpenStreetMap' })
      toast(`${res.added} lead${res.added > 1 ? 's' : ''} ajouté${res.added > 1 ? 's' : ''}`)
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  const canSearch = city.trim().length > 0 && !search.isPending

  return (
    <div className="page discover-page">
      <div className="page-header">
        <div>
          <h1>Trouver des entreprises</h1>
          <p className="subtitle">Repérez des commerces sur la carte (OpenStreetMap) et ajoutez-les comme leads.</p>
        </div>
      </div>

      <form className="card discover-form" onSubmit={(e) => { e.preventDefault(); if (canSearch) search.mutate() }}>
        <div className="discover-row">
          <div className="field">
            <label htmlFor="dc-city" className="field-label">Ville</label>
            <input id="dc-city" className="input" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="off" />
          </div>
          <div className="field dc-limit">
            <label htmlFor="dc-limit" className="field-label">Maximum</label>
            <select id="dc-limit" className="select" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              {LIMITS.map((n) => <option key={n} value={n}>{n} résultats</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-primary dc-go" disabled={!canSearch}>
            <IconSearch size={17} /> {search.isPending ? 'Recherche…' : 'Chercher'}
          </button>
        </div>
        <div className="field">
          <span className="field-label" id="dc-cats">Catégories <span className="muted">(aucune = toutes)</span></span>
          <div className="chips" role="group" aria-labelledby="dc-cats">
            {CATEGORIES.map((c) => (
              <button key={c.id} type="button" className="chip" aria-pressed={cats.includes(c.id)} onClick={() => setCats((l) => (l.includes(c.id) ? l.filter((x) => x !== c.id) : [...l, c.id]))}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </form>

      <section className="card discover-results" aria-live="polite">
        {search.isPending ? (
          <div style={{ padding: 24 }}><SkeletonRows rows={6} height={22} /></div>
        ) : search.isError ? (
          <div className="state error" role="alert">
            <div className="state-icon"><IconAlert size={22} /></div>
            <strong>{searchError(search.error)}</strong>
            <div className="small">La carte publique est parfois lente à répondre.</div>
            <button type="button" className="btn btn-sm" onClick={() => search.mutate()} style={{ marginTop: 6 }}>Réessayer</button>
          </div>
        ) : !result ? (
          <EmptyState title="Lancez une recherche" icon={<IconSearch size={22} />}>
            Choisissez une ville et, si vous voulez, quelques catégories.
          </EmptyState>
        ) : candidates.length === 0 ? (
          <EmptyState title="Aucune entreprise trouvée" icon={<IconSearch size={22} />}>
            Essayez une autre ville ou retirez des catégories.
          </EmptyState>
        ) : (
          <>
            <div className="discover-bar">
              <strong className="num">{formatNumber(candidates.length)} résultat{candidates.length > 1 ? 's' : ''}</strong>
              <span className="muted small">{withPhone.length} avec téléphone, {allSelectable.length - withPhone.length} sans numéro</span>
              <span className="spacer" />
              <button type="button" className="btn btn-sm" onClick={() => setPicked(new Set(withPhone.map((c) => c.osmId)))} disabled={withPhone.length === 0}>
                Sélectionner ceux avec téléphone
              </button>
              {picked.size > 0 && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPicked(new Set())}>Tout désélectionner</button>
              )}
            </div>
            <div className="table-wrap">
              <table className="table discover-table">
                <thead>
                  <tr>
                    <th className="dc-check">
                      <input type="checkbox" aria-label="Tout sélectionner" checked={allChecked} onChange={() => setPicked(allChecked ? new Set() : new Set(allSelectable.map((c) => c.osmId)))} />
                    </th>
                    <th>Nom</th>
                    <th className="hide-sm">Catégorie</th>
                    <th>Téléphone</th>
                    <th className="hide-md">Adresse</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => {
                    const exists = !!existingId(c)
                    return (
                      <tr key={c.osmId} className={exists ? 'is-existing' : undefined}>
                        <td className="dc-check">
                          <input type="checkbox" aria-label={`Sélectionner ${c.name}`} checked={picked.has(c.osmId)} disabled={exists} onChange={() => toggle(c.osmId)} />
                        </td>
                        <td>
                          <div className="lead-name">{c.name}</div>
                          <div className="xs muted show-sm-block">{CATEGORY_LABEL[c.category] ?? c.category}</div>
                          {exists && (
                            <Link className="existing xs" to={`/leads/${existingId(c)}`}>
                              <span className="dot" aria-hidden="true" /> existe déjà
                            </Link>
                          )}
                        </td>
                        <td className="hide-sm nowrap">{CATEGORY_LABEL[c.category] ?? c.category}</td>
                        <td className="nowrap">{c.phone ? formatPhone(c.phone) : <span className="muted">sans numéro</span>}</td>
                        <td className="hide-md">
                          <span className="small">{[c.addressStreet, c.addressCity].filter(Boolean).join(', ') || <span className="muted">—</span>}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {(candidates.length > 0 || added) && (
        <div className="discover-foot">
          {added ? (
            <p className="small" role="status">
              <strong>{added.n} lead{added.n > 1 ? 's' : ''} ajouté{added.n > 1 ? 's' : ''}</strong>
              {added.skipped > 0 && <span className="muted"> · {added.skipped} ignoré{added.skipped > 1 ? 's' : ''}</span>}
              {' · '}
              <Link to={`/leads?source=${encodeURIComponent(added.source)}`}>Voir les leads</Link>
            </p>
          ) : <span />}
          <span className="spacer" />
          <label className="check"><input type="checkbox" checked={assignToMe} onChange={(e) => setAssignToMe(e.target.checked)} /> Me les assigner</label>
          <button type="button" className="btn btn-primary" disabled={picked.size === 0 || add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? 'Ajout…' : `Ajouter ${picked.size} lead${picked.size > 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      <p className="attribution xs muted">Données © OpenStreetMap contributors</p>
    </div>
  )
}
