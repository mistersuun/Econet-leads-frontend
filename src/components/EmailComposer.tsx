import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { estimatePricing, getEmailStatus, previewEmail, sendEmail } from '../api/endpoints'
import type { AreaRange, BusinessDTO, EmailTemplateKey, Estimate, EstimateInput, PropertyType, ScriptLanguage, SendEmailRequest, ServiceId } from '../api/types'
import { errorMessage } from '../lib/errors'
import { formatCurrency, toApiDateTime, toInputDateTime } from '../lib/format'
import { SkeletonRows } from './States'
import { useToast } from './Toast'
import { IconSend, IconX } from './icons'
import './email-composer.css'

const TEMPLATES: { key: EmailTemplateKey; label: string; hint: string }[] = [
  { key: 'intro', label: 'Présentation', hint: 'après un premier contact' },
  { key: 'quote_followup', label: 'Suivi de devis', hint: 'avec une estimation' },
  { key: 'visit_confirmation', label: 'Confirmation de visite', hint: 'ajoute une invitation calendrier' },
  { key: 'missed_you', label: 'Tentative d’appel', hint: 'pas de réponse' },
]
const SERVICES: { value: ServiceId; label: string }[] = [
  { value: 'commercial', label: 'Entretien commercial' },
  { value: 'residential', label: 'Entretien résidentiel' },
  { value: 'deep_cleaning', label: 'Grand ménage' },
  { value: 'post_construction', label: 'Après construction' },
]
const AREAS: { value: AreaRange; label: string }[] = [
  { value: 'under_800', label: 'Moins de 800 pi²' },
  { value: '800_1500', label: '800 à 1 500 pi²' },
  { value: '1500_2500', label: '1 500 à 2 500 pi²' },
  { value: 'over_2500', label: 'Plus de 2 500 pi² (devis)' },
]
const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'office', label: 'Bureau' },
  { value: 'retail', label: 'Commerce' },
  { value: 'apartment', label: 'Appartement' },
  { value: 'house', label: 'Maison' },
  { value: 'townhouse', label: 'Maison de ville' },
]
const ADD_ONS: { id: string; label: string }[] = [
  { id: 'windows', label: 'Fenêtres' },
  { id: 'oven', label: 'Four' },
  { id: 'fridge', label: 'Réfrigérateur' },
  { id: 'basement', label: 'Sous-sol' },
  { id: 'garage', label: 'Garage' },
]
const FREQUENCIES: { value: string; label: string }[] = [
  { value: 'one-time', label: 'Une fois' },
  { value: 'monthly', label: 'Mensuelle (−5 %)' },
  { value: 'bi-weekly', label: 'Aux deux semaines (−10 %)' },
  { value: 'weekly', label: 'Hebdomadaire (−15 %)' },
]

interface Props {
  lead: BusinessDTO
  /** Current (possibly unsaved) qualification email, when the call screen has one. */
  defaultTo?: string | null
  defaultLanguage?: ScriptLanguage
  defaultTemplate?: EmailTemplateKey
  onClose: () => void
  onSent?: () => void
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

/** Drawer: template, language, recipient, optional estimate + visit, live preview, send. */
export function EmailComposer({ lead, defaultTo, defaultLanguage, defaultTemplate, onClose, onSent }: Props) {
  const toast = useToast()
  const qc = useQueryClient()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [templateKey, setTemplateKey] = useState<EmailTemplateKey>(defaultTemplate ?? 'intro')
  const [language, setLanguage] = useState<ScriptLanguage>(defaultLanguage ?? lead.qualification?.language ?? 'fr')
  const [to, setTo] = useState(defaultTo || lead.qualification?.email || lead.email || '')
  const [withEstimate, setWithEstimate] = useState(defaultTemplate === 'quote_followup')
  const [estimate, setEstimate] = useState<EstimateInput>({
    service: 'commercial',
    area: lead.qualification?.sizeSqft ? sizeToArea(lead.qualification.sizeSqft) : '800_1500',
    propertyType: 'office',
    addOnIds: [],
    frequency: lead.qualification?.frequencyWanted ?? 'weekly',
  })
  const [withVisit, setWithVisit] = useState(defaultTemplate === 'visit_confirmation')
  const [visitAt, setVisitAt] = useState('')
  const [extraNote, setExtraNote] = useState('')

  const status = useQuery({ queryKey: ['email-status'], queryFn: getEmailStatus, staleTime: 5 * 60_000 })

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const chooseTemplate = (key: EmailTemplateKey) => {
    setTemplateKey(key)
    if (key === 'quote_followup') setWithEstimate(true)
    if (key === 'visit_confirmation') setWithVisit(true)
  }

  const body: SendEmailRequest = useMemo(
    () => ({
      templateKey,
      language,
      to: to.trim() || undefined,
      estimate: withEstimate ? estimate : undefined,
      visitAt: withVisit && visitAt ? toApiDateTime(new Date(visitAt)) : undefined,
      extraNote: extraNote.trim() || undefined,
    }),
    [templateKey, language, to, withEstimate, estimate, withVisit, visitAt, extraNote],
  )
  const debounced = useDebounced(body, 400)

  const preview = useQuery({
    queryKey: ['email-preview', lead.id, debounced],
    queryFn: ({ signal }) => previewEmail(lead.id, debounced, signal),
    placeholderData: (prev) => prev,
  })
  const priced = useQuery({
    queryKey: ['estimate', estimate],
    queryFn: () => estimatePricing(estimate),
    enabled: withEstimate,
    staleTime: 60_000,
  })

  const send = useMutation({
    mutationFn: () => sendEmail(lead.id, body),
    onSuccess: (res) => {
      toast(`Courriel envoyé à ${res.contact.contactPerson ?? to}`)
      void qc.invalidateQueries({ queryKey: ['contacts', lead.id] })
      void qc.invalidateQueries({ queryKey: ['lead', lead.id] })
      void qc.invalidateQueries({ queryKey: ['leads'] })
      onSent?.()
      onClose()
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  const configured = status.data?.configured !== false
  const toError = send.error instanceof ApiError ? send.error.fields?.to : undefined
  const canSend = configured && !!to.trim() && !send.isPending && (!withVisit || !!visitAt)

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer composer" role="dialog" aria-modal="true" aria-labelledby="composer-title">
        <header className="drawer-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="xs muted">Envoyer un courriel</div>
            <h2 id="composer-title" className="truncate" style={{ fontSize: 'var(--text-lg)' }}>
              {lead.businessName}
            </h2>
          </div>
          <button ref={closeRef} type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer">
            <IconX size={20} />
          </button>
        </header>
        <div className="drawer-body composer-body">
          <section className="card card-pad stack composer-form">
            <div className="composer-row">
              <label className="field" style={{ flex: 2 }}>
                <span>Modèle</span>
                <select className="select" value={templateKey} onChange={(e) => chooseTemplate(e.target.value as EmailTemplateKey)}>
                  {TEMPLATES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label} — {t.hint}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field">
                <span className="field-label">Langue</span>
                <div className="segmented" role="group" aria-label="Langue">
                  <button type="button" aria-pressed={language === 'fr'} onClick={() => setLanguage('fr')} style={{ height: 36 }}>
                    FR
                  </button>
                  <button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')} style={{ height: 36 }}>
                    EN
                  </button>
                </div>
              </div>
            </div>
            <label className="field">
              <span>Destinataire</span>
              <input type="email" className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="prenom@entreprise.ca" aria-invalid={!!toError} autoComplete="off" />
              {toError && <span className="field-error">{toError}</span>}
              {!to && <span className="xs muted">Aucune adresse connue pour ce lead : saisissez-la (elle sera aussi utile dans la qualification).</span>}
            </label>

            <label className="check">
              <input type="checkbox" checked={withEstimate} onChange={(e) => setWithEstimate(e.target.checked)} /> Inclure une estimation
            </label>
            {withEstimate && (
              <div className="estimate">
                <div className="estimate-grid">
                  <label className="field">
                    <span>Service</span>
                    <select className="select" value={estimate.service ?? ''} onChange={(e) => setEstimate({ ...estimate, service: e.target.value as ServiceId })}>
                      {SERVICES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Superficie</span>
                    <select className="select" value={estimate.area ?? ''} onChange={(e) => setEstimate({ ...estimate, area: e.target.value as AreaRange })}>
                      {AREAS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Type de propriété</span>
                    <select className="select" value={estimate.propertyType ?? ''} onChange={(e) => setEstimate({ ...estimate, propertyType: e.target.value as PropertyType })}>
                      {PROPERTY_TYPES.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Fréquence</span>
                    <select className="select" value={estimate.frequency} onChange={(e) => setEstimate({ ...estimate, frequency: e.target.value })}>
                      {FREQUENCIES.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="field">
                  <span className="field-label">Extras</span>
                  <div className="chips">
                    {ADD_ONS.map((a) => {
                      const on = estimate.addOnIds.includes(a.id)
                      return (
                        <button key={a.id} type="button" className="chip" aria-pressed={on} onClick={() => setEstimate({ ...estimate, addOnIds: on ? estimate.addOnIds.filter((x) => x !== a.id) : [...estimate.addOnIds, a.id] })}>
                          {a.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <dl className="estimate-lines" aria-live="polite">
                  {priced.data ? (
                    <EstimateLines e={priced.data} />
                  ) : priced.isError ? (
                    <div className="xs text-danger span">{errorMessage(priced.error)}</div>
                  ) : (
                    <div className="span">
                      <SkeletonRows rows={3} height={14} />
                    </div>
                  )}
                </dl>
              </div>
            )}

            <label className="check">
              <input type="checkbox" checked={withVisit} onChange={(e) => setWithVisit(e.target.checked)} /> Proposer une visite (ajoute une invitation .ics)
            </label>
            {withVisit && (
              <label className="field">
                <span>Date et heure de la visite</span>
                <input type="datetime-local" className="input" value={visitAt} min={toInputDateTime(new Date())} onChange={(e) => setVisitAt(e.target.value)} />
              </label>
            )}
            <label className="field">
              <span>Note supplémentaire (optionnelle)</span>
              <textarea className="textarea" rows={2} value={extraNote} onChange={(e) => setExtraNote(e.target.value)} placeholder="Une phrase personnalisée insérée dans le courriel." style={{ minHeight: 64 }} />
            </label>
          </section>

          <section className="card card-pad composer-preview" aria-live="polite" aria-busy={preview.isFetching}>
            <div className="row" style={{ marginBottom: 12 }}>
              <h3>Aperçu</h3>
              <span className="spacer" />
              {preview.isFetching && <span className="xs muted">mise à jour…</span>}
            </div>
            {preview.data ? (
              <>
                <div className="preview-subject">{preview.data.subject}</div>
                <pre className="preview-body">{preview.data.body}</pre>
              </>
            ) : preview.isError ? (
              <div className="small text-danger">{errorMessage(preview.error)}</div>
            ) : (
              <SkeletonRows rows={6} />
            )}
          </section>
        </div>
        <footer className="composer-foot">
          {status.data && !status.data.configured ? (
            <div className="composer-banner" role="note">
              <strong>Envoi désactivé.</strong> Le serveur n’a pas de SMTP configuré : définissez <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USERNAME</code>, <code>SMTP_PASSWORD</code> et, au besoin, <code>MAIL_FROM</code> / <code>MAIL_FROM_NAME</code>, puis redémarrez le backend. L’aperçu reste utilisable pour copier le texte.
            </div>
          ) : (
            <>
              <span className="xs muted">{status.data?.from ? `De : ${status.data.from}` : ''}</span>
              <span className="spacer" />
              <button type="button" className="btn" onClick={onClose}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary" disabled={!canSend} onClick={() => send.mutate()}>
                <IconSend size={16} /> {send.isPending ? 'Envoi…' : 'Envoyer'}
              </button>
            </>
          )}
        </footer>
      </aside>
    </>
  )
}

function EstimateLines({ e }: { e: Estimate }) {
  const money = (n: number | null) => (n === null ? '—' : formatCurrency(n))
  const factors = [e.areaMultiplier && e.areaMultiplier !== 1 ? `superficie ×${e.areaMultiplier}` : null, e.propertyTypeMultiplier && e.propertyTypeMultiplier !== 1 ? `type ×${e.propertyTypeMultiplier}` : null].filter(Boolean)
  return (
    <>
      <div>
        <dt>Prix de base</dt>
        <dd className="num">{money(e.basePrice)}</dd>
      </div>
      {factors.length > 0 && (
        <div>
          <dt>Service ajusté ({factors.join(', ')})</dt>
          <dd className="num">{money(e.servicePrice)}</dd>
        </div>
      )}
      {e.addOns.map((a) => (
        <div key={a.id}>
          <dt>{a.labelFr || ADD_ONS.find((x) => x.id === a.id)?.label || a.id}</dt>
          <dd className="num">{formatCurrency(a.price)}</dd>
        </div>
      ))}
      {e.discountRate > 0 && (
        <div>
          <dt>Rabais fréquence ({Math.round(e.discountRate * 100)} %)</dt>
          <dd className="num">{e.discountAmount === null ? '—' : `−${formatCurrency(e.discountAmount)}`}</dd>
        </div>
      )}
      <div>
        <dt>Sous-total</dt>
        <dd className="num">{money(e.subtotal)}</dd>
      </div>
      <div>
        <dt>Taxes (TPS + TVQ)</dt>
        <dd className="num">{money(e.taxes)}</dd>
      </div>
      <div className="total">
        <dt>Total par visite</dt>
        <dd className="num">{money(e.total)}</dd>
      </div>
      {e.requiresQuote && <div className="xs muted span">Plus de 2 500 pi² : prix confirmé après une visite (soumission).</div>}
    </>
  )
}

function sizeToArea(sqft: number): AreaRange {
  if (sqft < 800) return 'under_800'
  if (sqft < 1500) return '800_1500'
  if (sqft <= 2500) return '1500_2500'
  return 'over_2500'
}
