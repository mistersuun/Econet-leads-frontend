import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays } from 'date-fns'
import { listVisits, updateVisitStatus } from '../api/endpoints'
import type { Visit, VisitStatus } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { errorMessage } from '../lib/errors'
import { formatDate, toApiDate } from '../lib/format'
import { ErrorState, SkeletonRows } from './States'
import { useToast } from './Toast'
import './upcoming-visits.css'

/** "Visites à venir": booked visits over the next 14 days (booked by the client or by hand). */
export function UpcomingVisits({ days = 14 }: { days?: number }) {
  const { hasRole } = useAuth()
  const canEdit = hasRole('ADMIN', 'USER')
  const toast = useToast()
  const qc = useQueryClient()
  const today = new Date()
  const from = toApiDate(today)
  const to = toApiDate(addDays(today, days))
  const visits = useQuery({ queryKey: ['visits', from, to], queryFn: () => listVisits(from, to), enabled: canEdit })
  const change = useMutation({
    mutationFn: ({ v, status }: { v: Visit; status: VisitStatus }) => updateVisitStatus(v.id, status),
    onSuccess: (v) => {
      toast(v.status === 'done' ? 'Visite marquée comme faite' : 'Visite annulée')
      void qc.invalidateQueries({ queryKey: ['visits'] })
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  if (!canEdit) return null

  const booked = (visits.data ?? []).filter((v) => v.status === 'booked')
  return (
    <section className="card card-pad upcoming-visits" aria-labelledby="upcoming-visits-title">
      <div className="row">
        <h2 id="upcoming-visits-title" style={{ fontSize: 'var(--text-lg)' }}>
          Visites à venir
        </h2>
        <span className="spacer" />
        {visits.data && <span className="xs muted">{booked.length} dans les {days} prochains jours</span>}
      </div>
      {visits.isPending ? (
        <SkeletonRows rows={2} height={28} />
      ) : visits.isError ? (
        <ErrorState error={visits.error} onRetry={() => void visits.refetch()} />
      ) : booked.length === 0 ? (
        <p className="muted small">Aucune visite réservée. Créez un lien de réservation depuis la fiche d’un lead.</p>
      ) : (
        <ul className="uv-list">
          {booked.map((v) => (
            <li key={v.id} className="uv-item">
              <div className="uv-when num">
                <strong>{formatDate(v.startsAt, 'EEE d MMM')}</strong>
                <span>{formatDate(v.startsAt, "HH'h'mm")}</span>
              </div>
              <div className="uv-main">
                <Link to={`/leads/${v.leadId}`} className="lead-name">
                  {v.leadName}
                </Link>
                {v.leadAddress && <div className="xs muted truncate">{v.leadAddress}</div>}
              </div>
              <div className="row uv-actions">
                <button type="button" className="btn btn-sm" onClick={() => change.mutate({ v, status: 'done' })} disabled={change.isPending}>
                  Fait
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => change.mutate({ v, status: 'cancelled' })} disabled={change.isPending}>
                  Annuler
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
