import { useMutation, useQuery } from '@tanstack/react-query'
import { getIntegrationsStatus, sendTestAlert } from '../api/endpoints'
import type { IntegrationsStatus } from '../api/types'
import { ErrorState, SkeletonRows } from '../components/States'
import { useToast } from '../components/Toast'
import { errorMessage } from '../lib/errors'
import './integrations.css'

interface Row {
  key: string
  label: string
  help: string
  ok: boolean
  env: string[]
  detail?: string
}

function rows(s: IntegrationsStatus): Row[] {
  return [
    { key: 'smtp', label: 'Courriel (SMTP)', help: 'Envoi des courriels de suivi et des alertes par courriel.', ok: s.smtp, env: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'MAIL_FROM'] },
    { key: 'sms', label: 'Textos (Twilio)', help: 'Textos de suivi aux prospects et alertes par texto.', ok: s.sms, env: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'] },
    { key: 'alertsPhone', label: 'Alertes par texto', help: 'Un texto par nouvelle demande du site, jusqu’à 30 par jour.', ok: s.alertsPhone && s.sms, env: ['ALERT_PHONE'], detail: s.alertsPhone && !s.sms ? 'Numéro défini, mais les textos (Twilio) ne sont pas configurés.' : undefined },
    { key: 'alertsEmail', label: 'Alertes par courriel', help: 'Un courriel par nouvelle demande du site.', ok: s.alertsEmail && s.smtp, env: ['ALERT_EMAIL'], detail: s.alertsEmail && !s.smtp ? 'Adresse définie, mais le SMTP n’est pas configuré.' : undefined },
    { key: 'places', label: 'Google Places', help: 'Fiches Google des entreprises (note, avis, heures).', ok: s.places, env: ['GOOGLE_PLACES_API_KEY', 'PLACES_DAILY_LIMIT'], detail: s.places ? `${s.placesUsedToday} / ${s.placesDailyLimit} appels aujourd’hui` : undefined },
    { key: 'review', label: 'Lien d’avis Google', help: 'Lien envoyé aux clients pour demander un avis.', ok: s.googleReviewUrl, env: ['GOOGLE_REVIEW_URL'] },
    { key: 'website', label: 'Base de données du site web', help: 'Importe les demandes de réservation et de contact du site.', ok: s.websiteDb, env: ['WEBSITE_DB_URL', 'WEBSITE_DB_USERNAME', 'WEBSITE_DB_PASSWORD'] },
  ]
}

/** Réglages > Intégrations (ADMIN): which optional providers are configured, and a test alert. */
export default function IntegrationsSection() {
  const toast = useToast()
  const status = useQuery({ queryKey: ['integrations-status'], queryFn: getIntegrationsStatus })
  const test = useMutation({
    mutationFn: sendTestAlert,
    onSuccess: (r) => {
      const parts: string[] = []
      if (r.smsTargets > 0) parts.push(`${r.smsSent} / ${r.smsTargets} texto${r.smsTargets > 1 ? 's' : ''}`)
      if (r.emailTargets > 0) parts.push(`${r.emailSent} / ${r.emailTargets} courriel${r.emailTargets > 1 ? 's' : ''}`)
      const failed = r.smsSent < r.smsTargets || r.emailSent < r.emailTargets
      toast(`Alerte test envoyée : ${parts.join(', ')}`, failed ? 'error' : 'success')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  if (status.isLoading) return <div className="card card-pad"><SkeletonRows rows={6} /></div>
  if (status.isError || !status.data) return <div className="card"><ErrorState error={status.error} onRetry={() => void status.refetch()} /></div>
  const s = status.data
  const list = rows(s)
  const canTest = (s.alertsPhone && s.sms) || (s.alertsEmail && s.smtp)

  return (
    <div className="stack">
      <section className="card integrations">
        <header className="integrations-head">
          <div>
            <h2>Intégrations</h2>
            <p className="hint">Chaque service est facultatif. Pour en activer un, définissez ses variables d’environnement sur le serveur (Render), puis redémarrez-le.</p>
          </div>
          <button type="button" className="btn" onClick={() => test.mutate()} disabled={!canTest || test.isPending} title={canTest ? undefined : 'Aucune alerte configurée'}>
            {test.isPending ? 'Envoi…' : 'Envoyer une alerte test'}
          </button>
        </header>
        <ul className="integrations-list">
          {list.map((r) => (
            <li key={r.key} className="integration-row">
              <div className="integration-main">
                <div className="integration-title">
                  <strong>{r.label}</strong>
                  <span className={`status-dot ${r.ok ? 'is-ok' : 'is-off'}`}>
                    <span className="dot" aria-hidden="true" />
                    {r.ok ? 'Configuré' : 'Non configuré'}
                  </span>
                </div>
                <div className="small muted">{r.help}</div>
                {r.detail && <div className="small">{r.detail}</div>}
              </div>
              <div className="integration-env" aria-label="Variables d’environnement">
                {r.env.map((v) => (
                  <code key={v}>{v}</code>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="card card-pad integrations-urls">
        <h3>Adresses</h3>
        <dl>
          <div>
            <dt>
              Adresse publique du serveur <code>APP_PUBLIC_URL</code>
            </dt>
            <dd>{s.publicUrl}</dd>
          </div>
          <div>
            <dt>
              Adresse du CRM <code>CRM_URL</code>
            </dt>
            <dd>{s.crmUrl}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
