import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { getEmailStatus, getMyPreferences, previewWeeklyReport, sendWeeklyReportNow, updateMyPreferences } from '../api/endpoints'
import type { WeeklyReportPreview } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { errorMessage } from '../lib/errors'
import { useToast } from './Toast'
import './weekly-report.css'

const SMTP_VARS = 'SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD'

/**
 * "Courriel hebdomadaire" preference: the Monday 7 h 30 coaching email. Everyone can turn it off and
 * preview it; an admin can also send it to the team right now. The integrator may move it into "Mon compte".
 */
export function WeeklyReportToggle() {
  const toast = useToast()
  const qc = useQueryClient()
  const { hasRole } = useAuth()
  const isAdmin = hasRole('ADMIN')
  const readOnly = hasRole('VIEWER')
  const prefs = useQuery({ queryKey: ['preferences'], queryFn: getMyPreferences })
  const email = useQuery({ queryKey: ['email-status'], queryFn: getEmailStatus, staleTime: 5 * 60_000 })
  const [preview, setPreview] = useState<WeeklyReportPreview | null>(null)

  const save = useMutation({
    mutationFn: (weeklyReport: boolean) => updateMyPreferences({ weeklyReport }),
    onSuccess: (p) => {
      qc.setQueryData(['preferences'], p)
      toast(p.weeklyReport ? 'Courriel hebdomadaire activé' : 'Courriel hebdomadaire désactivé')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const show = useMutation({
    mutationFn: previewWeeklyReport,
    onSuccess: setPreview,
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const sendNow = useMutation({
    mutationFn: sendWeeklyReportNow,
    onSuccess: () => toast('Envoi du courriel hebdomadaire lancé'),
    onError: (e) => toast(e instanceof ApiError && e.status === 503 ? `Courriel non configuré : définissez ${SMTP_VARS}.` : errorMessage(e), 'error'),
  })

  const notConfigured = email.data && !email.data.configured
  return (
    <section className="card card-pad weekly-report" aria-labelledby="weekly-report-title">
      <h3 id="weekly-report-title">Courriel hebdomadaire</h3>
      <p className="muted small">
        Chaque lundi à 7 h 30 : vos appels, conversations, taux de jointure, soumissions et contrats de la semaine passée, comparés à la semaine d’avant, avec vos meilleures plages et les objections les plus entendues.
      </p>
      <label className="check">
        <input type="checkbox" checked={prefs.data?.weeklyReport ?? true} disabled={prefs.isPending || readOnly || save.isPending} onChange={(e) => save.mutate(e.target.checked)} />
        Recevoir le courriel hebdomadaire
      </label>
      {notConfigured && (
        <p className="small weekly-report-note" role="note">
          Courriel non configuré sur le serveur : l’envoi automatique est en pause tant que {SMTP_VARS} ne sont pas définis.
        </p>
      )}
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn btn-sm" onClick={() => show.mutate()} disabled={show.isPending || readOnly}>
          {show.isPending ? 'Préparation…' : 'Voir un aperçu'}
        </button>
        {isAdmin && (
          <button type="button" className="btn btn-sm" onClick={() => sendNow.mutate()} disabled={sendNow.isPending || !!notConfigured} title={notConfigured ? 'Courriel non configuré' : undefined}>
            {sendNow.isPending ? 'Envoi…' : 'Envoyer maintenant à l’équipe'}
          </button>
        )}
      </div>
      {preview && (
        <div className="weekly-report-preview" aria-live="polite">
          <div className="row" style={{ alignItems: 'baseline' }}>
            <strong className="truncate">{preview.subject}</strong>
            <span className="spacer" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview(null)}>
              Fermer
            </button>
          </div>
          <pre>{preview.text}</pre>
        </div>
      )}
    </section>
  )
}
