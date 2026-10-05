import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getContacts, getQueue, getSummary } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'
import { CallHistory } from '../components/CallHistory'
import { LeadCard } from '../components/LeadCard'
import { OutcomeForm } from '../components/OutcomeForm'
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from '../components/States'
import { IconCheck, IconRefresh, IconSkip } from '../components/icons'
import { formatNumber } from '../lib/format'
import './call.css'

const QUEUE_SIZE = 20

export default function CallPage() {
  const { hasRole } = useAuth()
  const readOnly = hasRole('VIEWER')
  const qc = useQueryClient()
  const queue = useQuery({ queryKey: ['queue'], queryFn: () => getQueue(QUEUE_SIZE), staleTime: 0 })
  const summary = useQuery({ queryKey: ['summary', 'today'], queryFn: () => getSummary(), refetchInterval: 60_000 })
  const [handled, setHandled] = useState<Set<string>>(() => new Set())
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set())
  const [sessionCalls, setSessionCalls] = useState(0)
  const refetchedFor = useRef<number | null>(null)

  const remaining = useMemo(
    () => (queue.data ?? []).filter((l) => !handled.has(l.id) && !skipped.has(l.id)),
    [queue.data, handled, skipped],
  )
  const lead = remaining[0]

  // When the local copy of the queue runs out, fetch a fresh one from the server (once per batch).
  useEffect(() => {
    if (!queue.data || queue.isFetching || remaining.length > 0) return
    if (refetchedFor.current === queue.dataUpdatedAt) return
    if (queue.data.length === 0) return
    refetchedFor.current = queue.dataUpdatedAt
    void queue.refetch().then(() => {
      setHandled(new Set())
      setSkipped(new Set())
    })
  }, [queue, remaining.length])

  const contacts = useQuery({
    queryKey: ['contacts', lead?.id],
    queryFn: () => getContacts(lead!.id),
    enabled: !!lead,
  })

  // Prefetch the next lead's history so advancing feels instant.
  const nextLead = remaining[1]
  useEffect(() => {
    if (nextLead) void qc.prefetchQuery({ queryKey: ['contacts', nextLead.id], queryFn: () => getContacts(nextLead.id) })
  }, [nextLead, qc])

  const position = queue.data ? queue.data.length - remaining.length + 1 : 0
  const callsToday = summary.data?.callsToday

  const skip = () => lead && setSkipped((s) => new Set(s).add(lead.id))

  return (
    <div className="page call-page">
      <div className="page-header">
        <div>
          <h1>Appeler</h1>
          <p className="subtitle">File priorisée : suivis dus d’abord, puis nouveaux leads par qualité.</p>
        </div>
        <span className="spacer" />
        <div className="call-counters">
          <div className="counter">
            <strong className="num">{callsToday === undefined ? '…' : formatNumber(callsToday)}</strong>
            <span>appels aujourd’hui</span>
          </div>
          <div className="counter">
            <strong className="num">{sessionCalls}</strong>
            <span>cette session</span>
          </div>
        </div>
      </div>

      {readOnly && (
        <div className="notice" role="note">
          Votre rôle est en <strong>lecture seule</strong> : vous pouvez consulter la file, mais pas enregistrer d’appels.
        </div>
      )}

      {queue.isPending ? (
        <div className="call-grid">
          <div className="card card-pad stack">
            <Skeleton height={22} width={160} />
            <Skeleton height={34} width="70%" />
            <Skeleton height={72} />
            <SkeletonRows rows={3} />
          </div>
          <div className="card card-pad">
            <SkeletonRows rows={8} height={40} />
          </div>
        </div>
      ) : queue.isError ? (
        <div className="card">
          <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
        </div>
      ) : !lead ? (
        <div className="card">
          {queue.isFetching ? (
            <div className="state">
              <SkeletonRows rows={2} />
              <span>Chargement de nouveaux leads…</span>
            </div>
          ) : (
            <EmptyState title="La file d’appels est vide" icon={<IconCheck size={22} />}>
              <p>Aucun suivi dû et aucun nouveau lead avec téléphone. Beau travail!</p>
              <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
                <button type="button" className="btn btn-sm" onClick={() => { setSkipped(new Set()); setHandled(new Set()); void queue.refetch() }}>
                  <IconRefresh size={16} /> Actualiser
                </button>
                <Link className="btn btn-sm" to="/leads">
                  Parcourir les leads
                </Link>
              </div>
            </EmptyState>
          )}
        </div>
      ) : (
        <div className="call-grid">
          <section className="card card-pad call-lead" aria-label="Lead en cours">
            <div className="queue-pos xs muted">
              <span>
                Lead {position} sur {queue.data.length}
                {skipped.size > 0 && ` · ${skipped.size} passé${skipped.size > 1 ? 's' : ''}`}
              </span>
              <div className="queue-progress" aria-hidden="true">
                <span style={{ width: `${((position - 1) / Math.max(1, queue.data.length)) * 100}%` }} />
              </div>
            </div>
            <LeadCard lead={lead} />
          </section>

          <section className="card card-pad call-form" aria-label="Résultat de l'appel">
            <OutcomeForm
              key={lead.id}
              lead={lead}
              disabled={readOnly}
              shortcuts
              submitLabel="Enregistrer et suivant"
              onLogged={(res) => {
                setSessionCalls((n) => n + 1)
                setHandled((s) => new Set(s).add(res.lead.id))
              }}
              extraActions={
                <button type="button" className="btn btn-lg" onClick={skip} title="Passer au lead suivant sans enregistrer">
                  <IconSkip size={18} /> Passer
                </button>
              }
            />
          </section>

          <section className="card card-pad call-history-block" aria-label="Historique">
            <h3>Historique des appels</h3>
            {contacts.isPending ? (
              <SkeletonRows rows={3} />
            ) : contacts.isError ? (
              <ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} />
            ) : contacts.data.length === 0 ? (
              <p className="muted small">Premier contact avec ce lead.</p>
            ) : (
              <CallHistory contacts={contacts.data} compact />
            )}
          </section>
        </div>
      )}
    </div>
  )
}
