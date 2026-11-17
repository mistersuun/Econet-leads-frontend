import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getIntegrationsStatus, previewFollowUpSms, sendFollowUpSms } from '../api/endpoints'
import type { BusinessDTO, ScriptLanguage, SmsTemplateKey } from '../api/types'
import { errorMessage } from '../lib/errors'
import { smsPhone } from '../lib/smsPhone'
import { SkeletonRows } from './States'
import { useToast } from './Toast'
import { IconX } from './icons'
import './sms-sheet.css'

const SMS_TEMPLATES: { key: SmsTemplateKey; label: string }[] = [
  { key: 'missed_call', label: 'Appel manqué' },
  { key: 'after_voicemail', label: 'Après un message vocal' },
  { key: 'quote_followup', label: 'Suivi de soumission' },
]

export type SmsLead = Pick<BusinessDTO, 'id' | 'businessName' | 'phone' | 'qualification'>

interface Props {
  lead: SmsLead
  defaultTemplate?: SmsTemplateKey
  defaultLanguage?: ScriptLanguage
  onClose: () => void
  onSent?: () => void
}

/** Bottom sheet: template, language, preview of the exact text, consent checkbox, send. */
export function SmsFollowUpSheet({ lead, defaultTemplate, defaultLanguage, onClose, onSent }: Props) {
  const toast = useToast()
  const qc = useQueryClient()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [templateKey, setTemplateKey] = useState<SmsTemplateKey>(defaultTemplate ?? 'missed_call')
  const [language, setLanguage] = useState<ScriptLanguage>(defaultLanguage ?? lead.qualification?.language ?? 'fr')
  const [consent, setConsent] = useState(false)

  const status = useQuery({ queryKey: ['integrations-status'], queryFn: getIntegrationsStatus, staleTime: 5 * 60_000 })
  const preview = useQuery({
    queryKey: ['sms-preview', lead.id, templateKey, language],
    queryFn: ({ signal }) => previewFollowUpSms(lead.id, templateKey, language, signal),
    placeholderData: (prev) => prev,
  })
  const send = useMutation({
    mutationFn: () => sendFollowUpSms(lead.id, { templateKey, language, consent }),
    onSuccess: () => {
      toast(`Texto envoyé à ${lead.businessName}`)
      void qc.invalidateQueries({ queryKey: ['contacts', lead.id] })
      void qc.invalidateQueries({ queryKey: ['lead', lead.id] })
      onSent?.()
      onClose()
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const notConfigured = status.data?.sms === false
  const noPhone = !smsPhone(lead)
  const canSend = !notConfigured && !noPhone && consent && !send.isPending

  return (
    <>
      <div className="sheet-backdrop sms-backdrop" onClick={onClose} />
      <div className="sheet sms-sheet" role="dialog" aria-modal="true" aria-labelledby="sms-title">
        <div className="grabber" />
        <div className="sms-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="xs muted">Texto de suivi</div>
            <h2 id="sms-title" className="truncate" style={{ fontSize: 'var(--text-lg)' }}>
              {lead.businessName}
            </h2>
          </div>
          <button ref={closeRef} type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Fermer">
            <IconX size={18} />
          </button>
        </div>

        {notConfigured && (
          <div className="sms-banner" role="note">
            <strong>Textos non configurés.</strong> Définissez <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code> et <code>TWILIO_FROM</code> sur le serveur, puis redémarrez-le.
          </div>
        )}
        {noPhone && <div className="sms-banner">Ce lead n’a pas de numéro de téléphone.</div>}

        <div className="sms-row">
          <label className="field" style={{ flex: 1 }}>
            <span>Modèle</span>
            <select className="select" value={templateKey} onChange={(e) => setTemplateKey(e.target.value as SmsTemplateKey)}>
              {SMS_TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span className="field-label">Langue</span>
            <div className="segmented" role="group" aria-label="Langue du texto">
              <button type="button" aria-pressed={language === 'fr'} onClick={() => setLanguage('fr')} style={{ height: 36 }}>
                FR
              </button>
              <button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')} style={{ height: 36 }}>
                EN
              </button>
            </div>
          </div>
        </div>

        <div className="sms-preview" aria-live="polite" aria-label="Aperçu du texto">
          {preview.data ? preview.data.body : preview.isError ? <span className="text-danger">{errorMessage(preview.error)}</span> : <SkeletonRows rows={3} height={14} />}
        </div>

        <label className="check sms-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>Le client a accepté de recevoir un texto</span>
        </label>

        <div className="sms-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" disabled={!canSend} onClick={() => send.mutate()}>
            {send.isPending ? 'Envoi…' : 'Envoyer le texto'}
          </button>
        </div>
      </div>
    </>
  )
}
