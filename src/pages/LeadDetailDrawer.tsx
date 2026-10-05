import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getContacts, getLead, updateLead, updateLeadStatus } from '../api/endpoints'
import { LEAD_STATUSES, type BusinessDTO, type LeadStatus } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { CallHistory } from '../components/CallHistory'
import { LeadCard } from '../components/LeadCard'
import { OutcomeForm } from '../components/OutcomeForm'
import { EmptyState, ErrorState, SkeletonRows } from '../components/States'
import { useToast } from '../components/Toast'
import { IconPhone, IconX } from '../components/icons'
import { errorMessage } from '../lib/errors'
import { formatCurrency, formatDateTime } from '../lib/format'
import { STATUS_META } from '../lib/status'
import './lead-detail.css'

function useInvalidateLead() {
  const qc = useQueryClient()
  return (lead: BusinessDTO) => {
    qc.setQueryData(['lead', lead.id], lead)
    for (const key of ['leads', 'summary', 'pipeline', 'breakdown', 'followups', 'queue']) void qc.invalidateQueries({ queryKey: [key] })
  }
}

function StatusEditor({ lead, canEdit }: { lead: BusinessDTO; canEdit: boolean }) {
  const [status, setStatus] = useState<LeadStatus>(lead.leadStatus)
  const [note, setNote] = useState('')
  const toast = useToast()
  const invalidate = useInvalidateLead()
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: () => updateLeadStatus(lead.id, { status, note: note.trim() || undefined }),
    onSuccess: (l) => {
      invalidate(l)
      void qc.invalidateQueries({ queryKey: ['contacts', l.id] })
      setNote('')
      toast(`Statut : ${STATUS_META[l.leadStatus].label}`)
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const dirty = status !== lead.leadStatus
  return (
    <div className="stack" style={{ gap: 10 }}>
      <label className="field">
        <span>Statut</span>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)} disabled={!canEdit}>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
      </label>
      {dirty && (
        <>
          <label className="field">
            <span>Note (optionnelle)</span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Raison du changement" />
          </label>
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => m.mutate()} disabled={m.isPending}>
              {m.isPending ? 'Enregistrement…' : 'Changer le statut'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStatus(lead.leadStatus)}>
              Annuler
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function DealEditor({ lead, canEdit }: { lead: BusinessDTO; canEdit: boolean }) {
  const { user } = useAuth()
  const [value, setValue] = useState(lead.estimatedValue != null ? String(lead.estimatedValue) : '')
  const toast = useToast()
  const invalidate = useInvalidateLead()
  const m = useMutation({
    mutationFn: (body: Parameters<typeof updateLead>[1]) => updateLead(lead.id, body),
    onSuccess: (l) => {
      invalidate(l)
      toast('Lead mis à jour')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const parsed = value.trim() ? Number(value.replace(/\s/g, '').replace(',', '.')) : null
  const valid = parsed === null || Number.isFinite(parsed)
  const assignedToMe = lead.assignedToId === user?.userId
  return (
    <div className="stack" style={{ gap: 10 }}>
      <label className="field">
        <span>Valeur estimée (CAD / an)</span>
        <div className="row">
          <input
            className="input num"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!canEdit}
            aria-invalid={!valid}
            placeholder="—"
          />
          {canEdit && parsed !== lead.estimatedValue && valid && (
            <button type="button" className="btn btn-sm" onClick={() => m.mutate({ estimatedValue: parsed })} disabled={m.isPending}>
              Enregistrer
            </button>
          )}
        </div>
      </label>
      <div className="field">
        <span className="field-label">Assigné à</span>
        <div className="row wrap">
          <span className="assignee">{lead.assignedToName ?? 'Non assigné'}</span>
          {canEdit && !assignedToMe && (
            <button type="button" className="btn btn-sm" onClick={() => m.mutate({ assignedToId: user!.userId })} disabled={m.isPending}>
              M’assigner
            </button>
          )}
          {canEdit && lead.assignedToId && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => m.mutate({ assignedToId: null })} disabled={m.isPending}>
              Retirer
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const FIELDS: { label: string; get: (l: BusinessDTO) => string | null | undefined }[] = [
  { label: 'Adresse', get: (l) => l.addressStreet },
  { label: 'Ville', get: (l) => l.addressCity },
  { label: 'Province', get: (l) => l.addressProvince },
  { label: 'Code postal', get: (l) => l.postalCode },
  { label: 'Type', get: (l) => l.businessType },
  { label: 'Source', get: (l) => l.dataSource },
  { label: 'ID externe', get: (l) => l.externalId },
  { label: 'Coordonnées', get: (l) => (l.latitude != null && l.longitude != null ? `${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)}` : null) },
  { label: 'Valeur estimée', get: (l) => (l.estimatedValue != null ? formatCurrency(l.estimatedValue) : null) },
  { label: 'Prochain suivi', get: (l) => (l.nextFollowUpAt ? formatDateTime(l.nextFollowUpAt) : null) },
  { label: 'Dernier contact', get: (l) => (l.lastContactedAt ? formatDateTime(l.lastContactedAt) : null) },
  { label: 'Créé le', get: (l) => formatDateTime(l.createdAt) },
  { label: 'Mis à jour', get: (l) => formatDateTime(l.updatedAt) },
  { label: 'Vérifié le', get: (l) => (l.lastVerified ? formatDateTime(l.lastVerified) : null) },
]

export default function LeadDetailDrawer() {
  const { id } = useParams<{ id: string }>()
  const [sp] = useSearchParams()
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const canEdit = hasRole('ADMIN', 'USER')
  const [calling, setCalling] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  const lead = useQuery({ queryKey: ['lead', id], queryFn: () => getLead(id!), enabled: !!id })
  const contacts = useQuery({ queryKey: ['contacts', id], queryFn: () => getContacts(id!), enabled: !!id })

  const close = () => navigate({ pathname: '/leads', search: sp.toString() })

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate({ pathname: '/leads', search: window.location.search })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <>
      <div className="drawer-backdrop" onClick={close} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="lead-drawer-title">
        <header className="drawer-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="xs muted">Fiche lead</div>
            <h2 id="lead-drawer-title" className="truncate" style={{ fontSize: '1.15rem' }}>
              {lead.data?.businessName ?? 'Chargement…'}
            </h2>
          </div>
          <button ref={closeRef} type="button" className="btn btn-ghost btn-icon" onClick={close} aria-label="Fermer">
            <IconX size={20} />
          </button>
        </header>
        <div className="drawer-body">
          {lead.isPending ? (
            <div className="card card-pad">
              <SkeletonRows rows={8} />
            </div>
          ) : lead.isError ? (
            <div className="card">
              <ErrorState error={lead.error} onRetry={() => void lead.refetch()} />
            </div>
          ) : (
            <div className="stack">
              <section className="card card-pad">
                <LeadCard lead={lead.data} />
                <div className="row" style={{ marginTop: 16 }}>
                  {!calling ? (
                    <button type="button" className="btn btn-primary" onClick={() => setCalling(true)} disabled={!canEdit} title={canEdit ? undefined : 'Lecture seule'}>
                      <IconPhone size={17} /> Appeler maintenant
                    </button>
                  ) : (
                    <span className="small muted">Enregistrez le résultat ci-dessous.</span>
                  )}
                </div>
              </section>

              {calling && (
                <section className="card card-pad" aria-label="Enregistrer un appel">
                  <h3 style={{ marginBottom: 14 }}>Enregistrer l’appel</h3>
                  <OutcomeForm
                    key={lead.data.id}
                    lead={lead.data}
                    disabled={!canEdit}
                    onLogged={() => setCalling(false)}
                    extraActions={
                      <button type="button" className="btn btn-lg btn-ghost" onClick={() => setCalling(false)}>
                        Annuler
                      </button>
                    }
                  />
                </section>
              )}

              <section className="card card-pad detail-two">
                <StatusEditor key={`s-${lead.data.leadStatus}`} lead={lead.data} canEdit={canEdit} />
                <DealEditor key={`d-${lead.data.estimatedValue}-${lead.data.assignedToId}`} lead={lead.data} canEdit={canEdit} />
              </section>

              <section className="card card-pad">
                <h3 style={{ marginBottom: 14 }}>Historique</h3>
                {contacts.isPending ? (
                  <SkeletonRows rows={4} />
                ) : contacts.isError ? (
                  <ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} />
                ) : contacts.data.length === 0 ? (
                  <EmptyState title="Aucun contact pour l’instant" />
                ) : (
                  <CallHistory contacts={contacts.data} />
                )}
              </section>

              <section className="card card-pad">
                <h3 style={{ marginBottom: 12 }}>Informations</h3>
                <dl className="fields">
                  {FIELDS.map((f) => (
                    <div key={f.label}>
                      <dt>{f.label}</dt>
                      <dd>{f.get(lead.data) || <span className="muted">—</span>}</dd>
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
