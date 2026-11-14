import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clientFirstCleaningDone, clientReviewRequest, deleteClient, getClient, getClientReviewConfig, patchClient } from '../api/endpoints'
import type { ClientDTO, ClientFrequency, ClientPatch, ClientStatus, ReviewResult } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { ErrorState, SkeletonRows } from '../components/States'
import { useToast } from '../components/Toast'
import { IconCheck, IconCopy, IconMail, IconPhone, IconX } from '../components/icons'
import { CLIENT_STATUSES, CLIENT_STATUS_LABEL, FREQUENCIES, FREQUENCY_LABEL, monthlyValue } from '../lib/clients'
import { errorMessage } from '../lib/errors'
import { formatCurrency, formatDate, formatDateTime, formatPhone, telHref, toInputDateTime } from '../lib/format'
import { ClientStatusDot } from './ClientsPage'
import './clients.css'

function useRefreshClients() {
  const qc = useQueryClient()
  return (c?: ClientDTO) => {
    if (c) qc.setQueryData(['client', c.id], c)
    void qc.invalidateQueries({ queryKey: ['clients'] })
    void qc.invalidateQueries({ queryKey: ['notifications'] })
  }
}

function EditForm({ client, canEdit }: { client: ClientDTO; canEdit: boolean }) {
  const toast = useToast()
  const refresh = useRefreshClients()
  const [service, setService] = useState(client.service)
  const [frequency, setFrequency] = useState<ClientFrequency>(client.frequency)
  const [price, setPrice] = useState(String(client.pricePerVisit))
  const [startDate, setStartDate] = useState(client.startDate)
  const [contractEnd, setContractEnd] = useState(client.contractEndDate ?? '')
  const [nextVisit, setNextVisit] = useState(toInputDateTime(client.nextVisitAt))
  const [status, setStatus] = useState<ClientStatus>(client.status)
  const [notes, setNotes] = useState(client.notes ?? '')

  const parsedPrice = Number(price.replace(/\s/g, '').replace(',', '.'))
  const priceOk = price.trim() !== '' && Number.isFinite(parsedPrice) && parsedPrice >= 0
  const serviceOk = service.trim().length > 0

  const save = useMutation({
    mutationFn: () => {
      const body: ClientPatch = {
        service: service.trim(),
        frequency,
        pricePerVisit: parsedPrice,
        startDate,
        contractEndDate: contractEnd || null,
        nextVisitAt: nextVisit || null,
        status,
        notes: notes.trim() || null,
      }
      return patchClient(client.id, body)
    },
    onSuccess: (c) => {
      refresh(c)
      toast('Fiche client enregistrée')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  return (
    <form
      className="stack cl-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (canEdit && priceOk && serviceOk) save.mutate()
      }}
    >
      <label className="field">
        <span>Service</span>
        <input className="input" value={service} onChange={(e) => setService(e.target.value)} disabled={!canEdit} aria-invalid={!serviceOk} maxLength={200} />
      </label>
      <div className="cl-two">
        <label className="field">
          <span>Fréquence</span>
          <select className="select" value={frequency} onChange={(e) => setFrequency(e.target.value as ClientFrequency)} disabled={!canEdit}>
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Prix par visite (CAD)</span>
          <input className="input num" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!canEdit} aria-invalid={!priceOk} />
          {priceOk && <span className="xs muted">{formatCurrency(monthlyValue(parsedPrice, frequency))} par mois</span>}
        </label>
      </div>
      <div className="cl-two">
        <label className="field">
          <span>Début du service</span>
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!canEdit} required />
        </label>
        <label className="field">
          <span>Fin du contrat</span>
          <input className="input" type="date" value={contractEnd} onChange={(e) => setContractEnd(e.target.value)} disabled={!canEdit} />
        </label>
      </div>
      <div className="cl-two">
        <label className="field">
          <span>Prochaine visite</span>
          <input className="input" type="datetime-local" value={nextVisit} onChange={(e) => setNextVisit(e.target.value)} disabled={!canEdit} />
        </label>
        <label className="field">
          <span>Statut</span>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as ClientStatus)} disabled={!canEdit}>
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CLIENT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} placeholder="Accès, clés, consignes…" />
      </label>
      {canEdit && (
        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={save.isPending || !priceOk || !serviceOk}>
            {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      )}
    </form>
  )
}

function ReviewSection({ client, canEdit }: { client: ClientDTO; canEdit: boolean }) {
  const toast = useToast()
  const refresh = useRefreshClients()
  const config = useQuery({ queryKey: ['clients', 'review-config'], queryFn: getClientReviewConfig, staleTime: 5 * 60_000 })
  const [result, setResult] = useState<ReviewResult | null>(null)
  const ask = useMutation({
    mutationFn: (channel: 'email' | 'link') => clientReviewRequest(client.id, channel),
    onSuccess: (r) => {
      refresh()
      if (r.channel === 'email') toast('Demande d’avis envoyée par courriel')
      else setResult(r)
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Copié')
    } catch {
      window.prompt('Copiez le message :', text)
    }
  }

  const noUrl = config.data && !config.data.googleReviewUrl
  const noSmtp = config.data && !config.data.smtp
  const hasEmail = !!client.email

  return (
    <section className="card card-pad stack" aria-labelledby="cl-review">
      <h3 id="cl-review">Avis Google</h3>
      <p className="small muted" style={{ margin: 0 }}>
        {client.reviewRequestedAt ? `Demandé le ${formatDate(client.reviewRequestedAt)}.` : 'Pas encore demandé.'}
        {!client.firstCleaningDoneAt && ' À demander une semaine après le premier ménage.'}
      </p>
      {noUrl ? (
        <p className="cl-notice small">
          Lien d’avis non configuré. Définissez <code>GOOGLE_REVIEW_URL</code> sur le serveur pour activer cette demande.
        </p>
      ) : (
        canEdit && (
          <div className="row wrap">
            <button type="button" className="btn" onClick={() => ask.mutate('email')} disabled={ask.isPending || !!noSmtp || !hasEmail} title={noSmtp ? 'Courriel non configuré' : !hasEmail ? 'Aucune adresse courriel' : undefined}>
              <IconMail size={16} /> Envoyer par courriel
            </button>
            <button type="button" className="btn" onClick={() => ask.mutate('link')} disabled={ask.isPending}>
              <IconCopy size={16} /> Obtenir le message à copier
            </button>
          </div>
        )
      )}
      {!noUrl && noSmtp && <p className="xs muted" style={{ margin: 0 }}>Envoi par courriel non configuré (<code>SMTP_HOST</code>, <code>SMTP_USERNAME</code>, <code>SMTP_PASSWORD</code>).</p>}
      {!noUrl && !noSmtp && !hasEmail && <p className="xs muted" style={{ margin: 0 }}>Aucune adresse courriel pour ce client : utilisez le message à copier.</p>}
      {result && (
        <div className="stack" style={{ gap: 8 }}>
          <textarea className="textarea" rows={5} readOnly value={result.message} aria-label="Message de demande d’avis" />
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={() => void copy(result.message)}>
              <IconCopy size={14} /> Copier le message
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => void copy(result.url)}>
              Copier le lien
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export default function ClientDetailDrawer() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const canEdit = hasRole('ADMIN', 'USER')
  const isAdmin = hasRole('ADMIN')
  const toast = useToast()
  const refresh = useRefreshClients()
  const closeRef = useRef<HTMLButtonElement>(null)

  const client = useQuery({ queryKey: ['client', id], queryFn: () => getClient(id!), enabled: !!id })
  const close = () => navigate('/clients')

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && navigate('/clients')
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const firstCleaning = useMutation({
    mutationFn: () => clientFirstCleaningDone(id!),
    onSuccess: (c) => {
      refresh(c)
      toast('Premier ménage noté')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const remove = useMutation({
    mutationFn: () => deleteClient(id!),
    onSuccess: () => {
      refresh()
      toast('Fiche client supprimée')
      navigate('/clients')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  const c = client.data
  return (
    <>
      <div className="drawer-backdrop" onClick={close} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="client-drawer-title">
        <header className="drawer-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="xs muted">Fiche client</div>
            <h2 id="client-drawer-title" className="truncate" style={{ fontSize: 'var(--text-lg)' }}>
              {c?.businessName ?? 'Chargement…'}
            </h2>
          </div>
          <button ref={closeRef} type="button" className="btn btn-ghost btn-icon" onClick={close} aria-label="Fermer">
            <IconX size={20} />
          </button>
        </header>
        <div className="drawer-body">
          {client.isPending ? (
            <div className="card card-pad">
              <SkeletonRows rows={8} />
            </div>
          ) : client.isError ? (
            <div className="card">
              <ErrorState error={client.error} onRetry={() => void client.refetch()} />
            </div>
          ) : (
            <div className="stack">
              <section className="card card-pad stack" style={{ gap: 12 }}>
                <div className="row wrap">
                  <ClientStatusDot status={c!.status} />
                  <span className="spacer" />
                  <Link to={`/leads/${c!.businessId}`} className="btn btn-sm btn-ghost">
                    Voir le lead
                  </Link>
                </div>
                <div className="small">
                  {c!.city ?? '—'}
                  {c!.phone && (
                    <>
                      {' · '}
                      <a href={telHref(c!.phone)} className="num">
                        <IconPhone size={13} /> {formatPhone(c!.phone)}
                      </a>
                    </>
                  )}
                  {c!.email && <> · {c!.email}</>}
                </div>
                <div className="small muted">Client depuis le {formatDate(c!.startDate, 'd MMMM yyyy')}</div>
              </section>

              <section className="card card-pad stack" aria-labelledby="cl-first">
                <h3 id="cl-first">Premier ménage</h3>
                {c!.firstCleaningDoneAt ? (
                  <p className="note" style={{ margin: 0 }}>
                    <IconCheck size={16} /> Fait le {formatDateTime(c!.firstCleaningDoneAt)}
                  </p>
                ) : (
                  <>
                    <p className="small muted" style={{ margin: 0 }}>Une fois fait, un rappel vous invite à demander l’avis Google après 7 jours.</p>
                    {canEdit && (
                      <div className="row">
                        <button type="button" className="btn btn-primary" onClick={() => firstCleaning.mutate()} disabled={firstCleaning.isPending}>
                          {firstCleaning.isPending ? 'Enregistrement…' : 'Premier ménage fait'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>

              <ReviewSection client={c!} canEdit={canEdit} />

              <section className="card card-pad">
                <h3 style={{ marginBottom: 16 }}>Contrat</h3>
                <EditForm key={c!.updatedAt} client={c!} canEdit={canEdit} />
              </section>

              {isAdmin && (
                <section className="card card-pad stack">
                  <h3>Supprimer la fiche</h3>
                  <p className="small muted" style={{ margin: 0 }}>Le lead et son historique sont conservés. Préférez le statut « Terminé » pour garder la trace d’un client perdu.</p>
                  <div className="row">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => window.confirm(`Supprimer la fiche client de ${c!.businessName} ?`) && remove.mutate()}
                      disabled={remove.isPending}
                    >
                      Supprimer la fiche client
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
