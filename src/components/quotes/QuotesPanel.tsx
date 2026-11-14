import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { saveBlob } from '../../api/client'
import { createQuote, downloadQuotePdf, estimatePricing, getEmailStatus, listQuotes, sendQuote } from '../../api/endpoints'
import type { BusinessDTO, EstimateInput, Quote, ScriptLanguage } from '../../api/types'
import { copyText } from '../../lib/copyText'
import { errorMessage } from '../../lib/errors'
import { formatCurrency, formatDate } from '../../lib/format'
import { DEFAULT_ESTIMATE, QUOTE_STATUS, sizeToArea } from '../../lib/quotes'
import { ErrorState, SkeletonRows } from '../States'
import { useToast } from '../Toast'
import { IconSend } from '../icons'
import { EstimateForm } from './EstimateForm'
import './quotes.css'

/** "Soumission": quotes of a lead (create from the estimate, PDF, send by email, copy the accept link). */
export function QuotesPanel({ lead, canEdit }: { lead: BusinessDTO; canEdit: boolean }) {
  const toast = useToast()
  const qc = useQueryClient()
  const quotes = useQuery({ queryKey: ['quotes', lead.id], queryFn: () => listQuotes(lead.id) })
  const emailStatus = useQuery({ queryKey: ['email-status'], queryFn: getEmailStatus, staleTime: 5 * 60_000 })
  const [creating, setCreating] = useState(false)
  const [estimate, setEstimate] = useState<EstimateInput>(() => ({
    ...DEFAULT_ESTIMATE,
    area: lead.qualification?.sizeSqft ? sizeToArea(lead.qualification.sizeSqft) : DEFAULT_ESTIMATE.area,
    frequency: lead.qualification?.frequencyWanted ?? DEFAULT_ESTIMATE.frequency,
  }))
  const [language, setLanguage] = useState<ScriptLanguage>(lead.qualification?.language ?? 'fr')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [to, setTo] = useState(lead.qualification?.email || lead.email || '')

  const priced = useQuery({ queryKey: ['estimate', estimate], queryFn: () => estimatePricing(estimate), enabled: creating, staleTime: 60_000 })

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['quotes', lead.id] })
    void qc.invalidateQueries({ queryKey: ['contacts', lead.id] })
    void qc.invalidateQueries({ queryKey: ['lead', lead.id] })
    void qc.invalidateQueries({ queryKey: ['leads'] })
  }

  const create = useMutation({
    mutationFn: () => createQuote(lead.id, { estimate, language }),
    onSuccess: (q) => {
      toast(`Soumission ${q.number} créée`)
      setCreating(false)
      refresh()
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const send = useMutation({
    mutationFn: (q: Quote) => sendQuote(q.id, to.trim() || undefined),
    onSuccess: (q) => {
      toast(`Soumission ${q.number} envoyée`)
      setSendingId(null)
      refresh()
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const pdf = useMutation({
    mutationFn: async (q: Quote) => saveBlob(await downloadQuotePdf(q.id), `${q.number}.pdf`),
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const copyLink = async (q: Quote) => toast((await copyText(q.publicUrl)) ? 'Lien copié' : 'Copiez le lien manuellement', 'info')

  const smtpOff = emailStatus.data?.configured === false
  const requiresQuote = priced.data?.requiresQuote === true

  return (
    <section className="card card-pad sales-panel" aria-labelledby={`quotes-${lead.id}`}>
      <div className="row">
        <h3 id={`quotes-${lead.id}`}>Soumission</h3>
        <span className="spacer" />
        {!creating && (
          <button type="button" className="btn btn-sm" onClick={() => setCreating(true)} disabled={!canEdit} title={canEdit ? undefined : 'Lecture seule'}>
            Nouvelle soumission
          </button>
        )}
      </div>

      {creating && (
        <div className="sales-form" role="group" aria-label="Nouvelle soumission">
          <EstimateForm value={estimate} onChange={setEstimate} idPrefix={`quote-${lead.id}`} />
          <div className="row wrap">
            <div className="segmented" role="group" aria-label="Langue de la soumission">
              <button type="button" aria-pressed={language === 'fr'} onClick={() => setLanguage('fr')} style={{ height: 32 }}>
                FR
              </button>
              <button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')} style={{ height: 32 }}>
                EN
              </button>
            </div>
            <span className="spacer" />
            <span className="small" aria-live="polite">
              {priced.data && !requiresQuote ? (
                <>
                  Total <strong className="num">{formatCurrency(priced.data.total)}</strong> <span className="muted">taxes incluses</span>
                </>
              ) : priced.isError ? (
                <span className="text-danger">{errorMessage(priced.error)}</span>
              ) : (
                <span className="muted">calcul…</span>
              )}
            </span>
          </div>
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => create.mutate()} disabled={create.isPending || !priced.data || requiresQuote}>
              {create.isPending ? 'Création…' : 'Créer la soumission'}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCreating(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {quotes.isPending ? (
        <SkeletonRows rows={2} height={32} />
      ) : quotes.isError ? (
        <ErrorState error={quotes.error} onRetry={() => void quotes.refetch()} />
      ) : quotes.data.length === 0 ? (
        !creating && <p className="muted small">Aucune soumission pour ce lead.</p>
      ) : (
        <ul className="sales-list">
          {quotes.data.map((q) => {
            const meta = QUOTE_STATUS[q.status]
            const canSend = canEdit && (q.status === 'draft' || q.status === 'sent')
            return (
              <li key={q.id} className="sales-item">
                <div className="row wrap">
                  <strong className="num">{q.number}</strong>
                  <span className="badge" style={{ background: `${meta.color}1a` }}>
                    <span className="dot" style={{ background: meta.color }} aria-hidden="true" />
                    {meta.label}
                  </span>
                  <span className="spacer" />
                  <span className="num">{formatCurrency(q.total)}</span>
                </div>
                <div className="xs muted">
                  {q.status === 'accepted' && q.acceptedAt
                    ? `Acceptée par ${q.acceptedName ?? 'le client'} le ${formatDate(q.acceptedAt)}`
                    : q.status === 'declined'
                      ? `Refusée${q.declineReason ? ` : ${q.declineReason}` : ''}`
                      : `Valide jusqu’au ${formatDate(q.validUntil)}${q.sentAt ? ` · envoyée le ${formatDate(q.sentAt)}` : ''}`}
                </div>
                <div className="row wrap sales-actions">
                  <button type="button" className="btn btn-sm" onClick={() => pdf.mutate(q)} disabled={pdf.isPending}>
                    PDF
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => void copyLink(q)}>
                    Copier le lien
                  </button>
                  {canSend && sendingId !== q.id && (
                    <button type="button" className="btn btn-sm" onClick={() => setSendingId(q.id)} disabled={smtpOff} title={smtpOff ? 'Courriel non configuré' : undefined}>
                      <IconSend size={14} /> {q.status === 'sent' ? 'Renvoyer' : 'Envoyer'}
                    </button>
                  )}
                </div>
                {sendingId === q.id && (
                  <form
                    className="row wrap sales-send"
                    onSubmit={(e) => {
                      e.preventDefault()
                      send.mutate(q)
                    }}
                  >
                    <label className="field" style={{ flex: 1, minWidth: 200 }}>
                      <span className="sr-only">Destinataire</span>
                      <input type="email" className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Courriel du client" required autoComplete="off" />
                    </label>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={send.isPending || !to.trim()}>
                      {send.isPending ? 'Envoi…' : 'Envoyer avec le PDF'}
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSendingId(null)}>
                      Annuler
                    </button>
                  </form>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {smtpOff && (
        <p className="xs muted" role="note">
          Envoi par courriel désactivé : définissez <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USERNAME</code> et <code>SMTP_PASSWORD</code>. Vous pouvez quand même copier le lien.
        </p>
      )}
    </section>
  )
}
