import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getTender } from '../api/endpoints'
import type { TenderDTO } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { ErrorState, SkeletonRows } from '../components/States'
import { TenderStatusSelect } from '../components/TenderStatusSelect'
import { IconExternalLink, IconX } from '../components/icons'
import { useUpdateTender } from '../hooks/useUpdateTender'
import { errorMessage } from '../lib/errors'
import { formatCurrency, formatDate, formatDateTime } from '../lib/format'
import { TENDER_SOURCE_LABEL, closingCountdown, isAwardedContract } from '../lib/tenders'
import './lead-detail.css'
import './tenders.css'

function NotesEditor({ tender, canEdit }: { tender: TenderDTO; canEdit: boolean }) {
  const saved = tender.notes ?? ''
  const [value, setValue] = useState(saved)
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; message?: string }>({ kind: 'idle' })
  const m = useUpdateTender()
  const lastSent = useRef(saved)

  const save = () => {
    if (!canEdit || value === lastSent.current) return
    lastSent.current = value
    setState({ kind: 'saving' })
    m.mutate(
      { id: tender.id, notes: value.trim() ? value : null },
      {
        onSuccess: () => setState({ kind: 'saved' }),
        onError: (e) => {
          lastSent.current = saved
          setState({ kind: 'error', message: errorMessage(e) })
        },
      },
    )
  }

  return (
    <label className="field">
      <span>Notes</span>
      <textarea
        className="textarea"
        rows={5}
        value={value}
        disabled={!canEdit}
        placeholder="Visite des lieux, garanties exigées, prix visé, qui s’en occupe…"
        aria-invalid={state.kind === 'error'}
        onChange={(e) => {
          setValue(e.target.value)
          if (state.kind !== 'idle' && state.kind !== 'saving') setState({ kind: 'idle' })
        }}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            save()
          }
        }}
      />
      <span className={state.kind === 'error' ? 'field-error' : 'notes-status'} role={state.kind === 'error' ? 'alert' : 'status'}>
        {state.kind === 'saving'
          ? 'Enregistrement…'
          : state.kind === 'saved'
            ? 'Notes enregistrées'
            : state.kind === 'error'
              ? state.message
              : canEdit
                ? value !== saved
                  ? 'Enregistré en quittant le champ, ou ⌘/Ctrl + Entrée'
                  : ''
                : 'Lecture seule'}
      </span>
    </label>
  )
}

export default function TenderDetailDrawer() {
  const { id } = useParams<{ id: string }>()
  const [sp] = useSearchParams()
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const canEdit = hasRole('ADMIN', 'USER')
  const closeRef = useRef<HTMLButtonElement>(null)
  const tender = useQuery({ queryKey: ['tender', id], queryFn: () => getTender(id!), enabled: !!id })

  const close = () => navigate({ pathname: '/tenders', search: sp.toString() })

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Blur first so pending notes are saved before the drawer unmounts.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      navigate({ pathname: '/tenders', search: window.location.search })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const t = tender.data
  const countdown = t ? closingCountdown(t.closingAt) : null
  const awarded = t ? isAwardedContract(t) : false

  return (
    <>
      <div className="drawer-backdrop" onClick={close} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="tender-drawer-title">
        <header className="drawer-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="xs muted">{awarded ? 'Contrat octroyé' : 'Appel d’offres'}</div>
            <div id="tender-drawer-title" className="truncate" style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>
              {t ? `${TENDER_SOURCE_LABEL[t.source]} · ${t.externalId}` : 'Chargement…'}
            </div>
          </div>
          <button ref={closeRef} type="button" className="btn btn-ghost btn-icon" onClick={close} aria-label="Fermer">
            <IconX size={20} />
          </button>
        </header>
        <div className="drawer-body">
          {tender.isPending ? (
            <div className="card card-pad">
              <SkeletonRows rows={8} />
            </div>
          ) : tender.isError ? (
            <div className="card">
              <ErrorState error={tender.error} onRetry={() => void tender.refetch()} />
            </div>
          ) : (
            <div className="stack">
              <section className="card card-pad stack" style={{ gap: 20 }}>
                <div className="tender-head">
                  <h2>{t!.title}</h2>
                  <div className="tender-buyer">{t!.buyer}</div>
                </div>
                <div className="tender-closing">
                  <span className="small muted">{awarded ? 'Fin du contrat' : 'Clôture'}</span>
                  <strong className="num">{t!.closingAt ? formatDateTime(t!.closingAt) : '—'}</strong>
                  <span className={`small${countdown!.urgent ? ' text-danger' : ' muted'}`}>{countdown!.text}</span>
                </div>
                <div className="row wrap">
                  <a className="btn btn-primary" href={t!.url} target="_blank" rel="noreferrer">
                    Voir l’avis <IconExternalLink size={15} />
                  </a>
                  <span className="small muted">sur {t!.source === 'SEAO' ? 'seao.gouv.qc.ca' : 'canadabuys.canada.ca'}</span>
                </div>
              </section>

              <section className="card card-pad stack">
                <div className="field">
                  <span className="field-label">Statut</span>
                  <TenderStatusSelect tender={t!} disabled={!canEdit} size="md" />
                </div>
                <NotesEditor key={t!.id} tender={t!} canEdit={canEdit} />
              </section>

              <section className="card card-pad">
                <h3 style={{ marginBottom: 16 }}>Informations</h3>
                <dl className="fields">
                  {[
                    ['Organisme', t!.buyer],
                    ['Source', TENDER_SOURCE_LABEL[t!.source]],
                    ['Numéro', t!.externalId],
                    ['Région', t!.region],
                    ['Catégorie', t!.category],
                    ['Valeur estimée', t!.estimatedValue != null ? formatCurrency(t!.estimatedValue) : null],
                    ['Publié le', t!.publishedAt ? formatDate(t!.publishedAt, 'd MMMM yyyy') : null],
                    ['Mots-clés', t!.matchedKeywords.join(', ')],
                    ['Ajouté le', formatDateTime(t!.createdAt)],
                    ['Mis à jour', formatDateTime(t!.updatedAt)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value || <span className="muted">—</span>}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
