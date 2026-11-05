import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { claimLead, getContacts, getLead, getMyToday, getQueue, patchQualification, releaseLead, snoozeLead } from '../api/endpoints'
import type { BusinessDTO, LogCallRequest, LogCallResponse, Qualification, ScriptLanguage } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { CallHistory } from '../components/CallHistory'
import { EmailComposer } from '../components/EmailComposer'
import { LeadCard } from '../components/LeadCard'
import { OutcomeForm } from '../components/OutcomeForm'
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from '../components/States'
import { useToast } from '../components/Toast'
import { OpenNow, SnoozeMenu } from '../components/call/OpenNow'
import { QualificationForm } from '../components/call/QualificationForm'
import { COMPANY_NAME, ScriptPanel } from '../components/call/ScriptPanel'
import { TodayRing } from '../components/call/TodayRing'
import { SessionBar } from '../components/session/SessionBar'
import { SessionModal } from '../components/session/SessionModal'
import { SessionSummary } from '../components/session/SessionSummary'
import { IconCheck, IconChevronDown, IconMail, IconPhone, IconPlay, IconRefresh, IconScript, IconSkip, IconX } from '../components/icons'
import { useCallTimer } from '../hooks/useCallTimer'
import { useLiveEvent } from '../live/LiveProvider'
import {
  createSession,
  endSession,
  formatClock,
  loadSession,
  pauseSession,
  recordCall,
  recordSkip,
  resumeSession,
  saveSession,
  sessionQueueParams,
  type CallSession,
} from '../lib/callSession'
import { errorMessage } from '../lib/errors'
import { formatDateTime, toApiDateTime } from '../lib/format'
import './call.css'

const QUEUE_SIZE = 20
const CLAIM_REFRESH_MS = 4 * 60_000

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false))
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

export default function CallPage() {
  const { user, hasRole } = useAuth()
  const readOnly = hasRole('VIEWER')
  const qc = useQueryClient()
  const toast = useToast()
  const [sp, setSp] = useSearchParams()
  const pinnedId = sp.get('lead')

  // ---- session mode (client-side, survives a reload)
  const [session, setSessionState] = useState<CallSession | null>(() => loadSession())
  const [sessionModal, setSessionModal] = useState(false)
  const [summary, setSummary] = useState<CallSession | null>(null)
  const setSession = useCallback((next: CallSession | null) => {
    setSessionState(next)
    saveSession(next)
  }, [])

  const queueParams = useMemo(() => (session ? sessionQueueParams(session) : { size: QUEUE_SIZE }), [session])
  const queue = useQuery({ queryKey: ['queue', queueParams], queryFn: () => getQueue(queueParams), staleTime: 0 })
  const pinned = useQuery({ queryKey: ['lead', pinnedId], queryFn: () => getLead(pinnedId!), enabled: !!pinnedId })
  const today = useQuery({ queryKey: ['today', 'me'], queryFn: getMyToday, refetchInterval: 120_000 })

  const [handled, setHandled] = useState<Set<string>>(() => new Set())
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set())
  // Leads a teammate claimed since our last fetch (a fresh queue from the server is authoritative).
  const [claimedElsewhere, setClaimedElsewhere] = useState<Map<string, number>>(() => new Map())
  const refetchedFor = useRef<number | null>(null)

  useLiveEvent((e) => {
    if (e.type === 'lead.claimed' && e.data.userId !== user?.userId) {
      setClaimedElsewhere((m) => new Map(m).set(e.data.leadId, e.at))
    }
  })

  const done = useCallback(
    (id: string) =>
      handled.has(id) ||
      skipped.has(id) ||
      (claimedElsewhere.get(id) ?? 0) >= queue.dataUpdatedAt ||
      (session ? session.calls.some((c) => c.leadId === id) || session.skippedIds.includes(id) : false),
    [handled, skipped, claimedElsewhere, queue.dataUpdatedAt, session],
  )

  const remaining = useMemo(() => {
    const list = (queue.data ?? []).filter((l) => !done(l.id) && l.id !== pinnedId)
    if (pinned.data && !done(pinned.data.id) && pinned.data.phone) return [pinned.data, ...list]
    return list
  }, [queue.data, pinned.data, pinnedId, done])
  const lead = remaining[0]

  // When the local copy of the queue runs out, fetch a fresh one from the server (once per batch).
  useEffect(() => {
    if (!queue.data || queue.isFetching || remaining.length > 0 || queue.data.length === 0) return
    if (refetchedFor.current === queue.dataUpdatedAt) return
    refetchedFor.current = queue.dataUpdatedAt
    void queue.refetch().then(() => {
      setHandled(new Set())
      setSkipped(new Set())
    })
  }, [queue, remaining.length])

  // Prefetch the next lead's history so advancing feels instant.
  const nextLead = remaining[1]
  useEffect(() => {
    if (nextLead) void qc.prefetchQuery({ queryKey: ['contacts', nextLead.id], queryFn: () => getContacts(nextLead.id) })
  }, [nextLead, qc])

  const clearPinned = useCallback(() => {
    if (!pinnedId) return
    const n = new URLSearchParams(sp)
    n.delete('lead')
    setSp(n, { replace: true })
  }, [pinnedId, sp, setSp])

  const advance = (id: string, kind: 'handled' | 'skipped') => {
    if (kind === 'handled') setHandled((s) => new Set(s).add(id))
    else setSkipped((s) => new Set(s).add(id))
    if (id === pinnedId) clearPinned()
  }

  const onLogged = (res: LogCallResponse, durationSeconds: number | null) => {
    advance(res.lead.id, 'handled')
    if (session) {
      const next = recordCall(session, { leadId: res.lead.id, leadName: res.lead.businessName, outcome: res.contact.outcome as LogCallRequest['outcome'], durationSeconds, at: Date.now() })
      if (next.calls.length >= next.size) {
        const ended = endSession(next)
        setSession(null)
        setSummary(ended)
        toast('Session terminée — beau travail!')
      } else setSession(next)
    }
  }
  const onSkip = (id: string) => {
    advance(id, 'skipped')
    if (session) setSession(recordSkip(session, id))
  }

  const startSession: Parameters<typeof SessionModal>[0]['onStart'] = (filters, size, target) => {
    setSession(createSession(filters, size, target))
    setHandled(new Set())
    setSkipped(new Set())
    setSessionModal(false)
    toast(`Session de ${size} leads démarrée`)
  }
  const finishSession = () => {
    if (!session) return
    setSummary(endSession(session))
    setSession(null)
  }

  const position = queue.data ? Math.min(queue.data.length, queue.data.length - remaining.filter((l) => l.id !== pinnedId).length + 1) : 0
  const total = session ? session.size : (queue.data?.length ?? 0)

  return (
    <div className="page call-page v2">
      <div className="page-header call-head">
        <div className="call-title">
          <h1>Appeler</h1>
          <p className="subtitle">
            {session ? 'Session en cours · ' : ''}
            {queue.data ? `Lead ${position} sur ${total}` : 'File priorisée'}
            {skipped.size > 0 && ` · ${skipped.size} passé${skipped.size > 1 ? 's' : ''}`}
          </p>
        </div>
        <span className="spacer" />
        <TodayRing stats={today.data} />
        {!readOnly && !session && (
          <button type="button" className="btn" onClick={() => setSessionModal(true)}>
            <IconPlay size={16} /> Démarrer une session
          </button>
        )}
      </div>

      {session && (
        <SessionBar session={session} onPause={() => setSession(pauseSession(session))} onResume={() => setSession(resumeSession(session))} onEnd={finishSession} />
      )}

      {readOnly && (
        <div className="notice" role="note">
          Votre rôle est en <strong>lecture seule</strong> : vous pouvez consulter la file, mais pas enregistrer d’appels.
        </div>
      )}

      {queue.isPending || (pinnedId && pinned.isPending) ? (
        <div className="call-v2">
          <div className="card card-pad stack call-col">
            <Skeleton height={22} width={160} />
            <Skeleton height={34} width="70%" />
            <Skeleton height={64} />
            <SkeletonRows rows={4} />
          </div>
          <div className="card card-pad call-col hide-narrow">
            <SkeletonRows rows={8} height={16} />
          </div>
          <div className="card card-pad call-col">
            <SkeletonRows rows={6} height={40} />
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
            <EmptyState title={session ? 'Plus aucun lead pour cette session' : 'La file d’appels est vide'} icon={<IconCheck size={22} />}>
              <p>{session ? 'Les filtres choisis n’ont plus de leads à appeler.' : 'Aucun suivi dû et aucun nouveau lead avec téléphone. Beau travail!'}</p>
              <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
                {session ? (
                  <button type="button" className="btn btn-sm" onClick={finishSession}>
                    Voir le résumé
                  </button>
                ) : (
                  <button type="button" className="btn btn-sm" onClick={() => { setSkipped(new Set()); setHandled(new Set()); void queue.refetch() }}>
                    <IconRefresh size={16} /> Actualiser
                  </button>
                )}
                <Link className="btn btn-sm" to="/leads">
                  Parcourir les leads
                </Link>
              </div>
            </EmptyState>
          )}
        </div>
      ) : (
        <ActiveLead
          key={lead.id}
          lead={lead}
          readOnly={readOnly}
          paused={!!session?.pausedAt}
          callerName={user?.username ?? ''}
          onLogged={onLogged}
          onSkip={() => onSkip(lead.id)}
          onClaimConflict={() => onSkip(lead.id)}
          onSnoozed={() => onSkip(lead.id)}
        />
      )}

      {sessionModal && <SessionModal onStart={startSession} onClose={() => setSessionModal(false)} />}
      {summary && <SessionSummary session={summary} onClose={() => setSummary(null)} />}
    </div>
  )
}

/* ------------------------------------------------------------ Active lead */

interface ActiveProps {
  lead: BusinessDTO
  readOnly: boolean
  paused: boolean
  callerName: string
  onLogged: (res: LogCallResponse, durationSeconds: number | null) => void
  onSkip: () => void
  onClaimConflict: () => void
  onSnoozed: () => void
}

function ActiveLead({ lead, readOnly, paused, callerName, onLogged, onSkip, onClaimConflict, onSnoozed }: ActiveProps) {
  const qc = useQueryClient()
  const toast = useToast()
  const narrow = useMediaQuery('(max-width: 1080px)')
  const timer = useCallTimer()
  const durationRef = useRef<number | null>(null)
  const [composer, setComposer] = useState(false)
  const [scriptSheet, setScriptSheet] = useState(false)
  const [qualOpen, setQualOpen] = useState(!narrow)

  const contacts = useQuery({ queryKey: ['contacts', lead.id], queryFn: () => getContacts(lead.id) })

  // ---- claim: take it now, refresh every 4 min, release when leaving.
  const conflictRef = useRef(onClaimConflict)
  useEffect(() => {
    conflictRef.current = onClaimConflict
  })
  useEffect(() => {
    if (readOnly) return
    let alive = true
    const claim = () =>
      claimLead(lead.id).catch((e: unknown) => {
        if (!alive) return
        if (e instanceof ApiError && e.status === 409) {
          const by = (e.data?.claimedBy as { username?: string } | undefined)?.username ?? 'Un collègue'
          toast(`${by} est déjà sur ce lead`, 'info')
          conflictRef.current()
        }
      })
    void claim()
    const id = setInterval(() => void claim(), CLAIM_REFRESH_MS)
    return () => {
      alive = false
      clearInterval(id)
      void releaseLead(lead.id).catch(() => undefined)
    }
  }, [lead.id, readOnly, toast])

  // ---- qualification: local copy, PATCH on blur, diff sent with the call.
  const saved = useRef<Qualification>(lead.qualification ?? {})
  const [qual, setQual] = useState<Qualification>(() => ({ ...(lead.qualification ?? {}) }))
  const qualRef = useRef(qual)
  useEffect(() => {
    qualRef.current = qual
  })
  const save = useMutation({
    mutationFn: (patch: Qualification) => patchQualification(lead.id, patch),
    onSuccess: (q) => {
      saved.current = q
      qc.setQueryData<BusinessDTO>(['lead', lead.id], (old) => (old ? { ...old, qualification: q } : old))
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const commit = (patch: Qualification) => {
    if (readOnly) return
    const diff: Qualification = {}
    for (const [k, v] of Object.entries(patch) as [keyof Qualification, unknown][]) {
      if (JSON.stringify(v ?? null) !== JSON.stringify(saved.current[k] ?? null)) (diff as Record<string, unknown>)[k] = v
    }
    if (Object.keys(diff).length) save.mutate(diff)
  }
  const dirtyQualification = (): Qualification | undefined => {
    const diff: Qualification = {}
    for (const [k, v] of Object.entries(qualRef.current) as [keyof Qualification, unknown][]) {
      if (JSON.stringify(v ?? null) !== JSON.stringify(saved.current[k] ?? null)) (diff as Record<string, unknown>)[k] = v
    }
    return Object.keys(diff).length ? diff : undefined
  }
  const language: ScriptLanguage = qual.language ?? 'fr'
  const setLanguage = (l: ScriptLanguage) => {
    setQual((q) => ({ ...q, language: l }))
    commit({ language: l })
  }

  // ---- snooze
  const snooze = useMutation({
    mutationFn: ({ until, reason }: { until: Date; reason: string }) => snoozeLead(lead.id, { until: toApiDateTime(until), reason }),
    onSuccess: (l) => {
      toast(`Reporté au ${formatDateTime(l.nextFollowUpAt)}`)
      qc.setQueryData(['lead', l.id], l)
      for (const key of ['followups', 'leads', 'summary', 'notifications', 'contacts']) void qc.invalidateQueries({ queryKey: [key] })
      onSnoozed()
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const doSnooze = (until: Date, reason: string) => {
    if (readOnly) return
    snooze.mutate({ until, reason })
  }

  const disabled = readOnly || paused
  const placeholders = { businessName: lead.businessName, city: lead.addressCity, callerName, companyName: COMPANY_NAME, decisionMaker: qual.decisionMaker }

  const history = contacts.isPending ? (
    <SkeletonRows rows={3} />
  ) : contacts.isError ? (
    <ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} />
  ) : contacts.data.length === 0 ? (
    <p className="muted small">Premier contact avec ce lead.</p>
  ) : (
    <CallHistory contacts={contacts.data} compact />
  )

  const timerBlock = (
    <div className={`call-timer${timer.running ? ' running' : ''}`}>
      <div className="call-timer-main">
        <span className="call-timer-clock num" aria-live="off">
          {formatClock(timer.elapsed)}
        </span>
        <span className="call-timer-label xs muted">{timer.running ? 'appel en cours' : timer.started ? 'durée de l’appel' : narrow ? 'démarre en touchant le numéro' : 'chrono'}</span>
      </div>
      {!timer.started ? (
        <button type="button" className="btn btn-sm hide-narrow" onClick={timer.start} disabled={disabled}>
          <IconPhone size={14} /> Appel lancé
        </button>
      ) : timer.running ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => (durationRef.current = timer.stop())}>
          Raccroché
        </button>
      ) : null}
    </div>
  )

  return (
    <>
      <div className="call-v2">
        <section className="call-col col-lead" aria-label="Lead en cours">
          <div className="card card-pad stack call-lead-card">
            <LeadCard lead={lead} compact onCall={timer.start} />
            <div className="row wrap call-lead-actions">
              <button type="button" className="btn btn-sm" onClick={() => setComposer(true)} disabled={readOnly}>
                <IconMail size={15} /> Envoyer un courriel
              </button>
              {narrow && (
                <button type="button" className="btn btn-sm" onClick={() => setScriptSheet(true)}>
                  <IconScript size={15} /> Script
                </button>
              )}
            </div>
          </div>

          {narrow && (
            <div className="card card-pad call-outcome-card">
              {timerBlock}
              <OpenNow businessType={lead.businessType} onSnooze={doSnooze} disabled={disabled || snooze.isPending} />
              <OutcomeForm
                lead={lead}
                disabled={disabled}
                shortcuts
                compact
                submitLabel="Enregistrer et suivant"
                extras={() => ({ durationSeconds: durationRef.current ?? (timer.started ? timer.elapsed : undefined) ?? undefined, qualification: dirtyQualification() })}
                onOutcomeChosen={() => {
                  if (timer.running) durationRef.current = timer.stop()
                }}
                onLogged={(res) => onLogged(res, durationRef.current)}
                extraActions={
                  <>
                    <button type="button" className="btn btn-lg" onClick={onSkip} title="Passer au lead suivant sans enregistrer">
                      <IconSkip size={18} /> Passer
                    </button>
                    <SnoozeMenu onSnooze={doSnooze} disabled={disabled} pending={snooze.isPending} />
                  </>
                }
              />
            </div>
          )}

          <div className="card call-qual-card">
            <button type="button" className="call-section-toggle" aria-expanded={qualOpen} onClick={() => setQualOpen((o) => !o)}>
              <span>Qualification</span>
              <span className="xs muted">{countFilled(qual)} / 11 champs</span>
              <IconChevronDown size={16} className={qualOpen ? 'open' : undefined} />
            </button>
            {qualOpen && (
              <div className="card-pad" style={{ paddingTop: 0 }}>
                <QualificationForm value={qual} disabled={readOnly} onChange={(patch) => setQual((q) => ({ ...q, ...patch }))} onCommit={commit} />
              </div>
            )}
          </div>

          <div className="card card-pad call-history-block">
            <h3>Historique</h3>
            {history}
          </div>
        </section>

        {!narrow && (
          <section className="call-col col-script card card-pad" aria-label="Script d’appel">
            <ScriptPanel businessType={lead.businessType} language={language} onLanguageChange={setLanguage} values={placeholders} hotkeys={!composer} />
          </section>
        )}

        {!narrow && (
          <section className="call-col col-outcome card card-pad" aria-label="Résultat de l’appel">
            {timerBlock}
            <OpenNow businessType={lead.businessType} onSnooze={doSnooze} disabled={disabled || snooze.isPending} />
            <OutcomeForm
              lead={lead}
              disabled={disabled}
              shortcuts={!composer}
              compact
              submitLabel="Enregistrer et suivant"
              extras={() => ({ durationSeconds: durationRef.current ?? (timer.started ? timer.elapsed : undefined) ?? undefined, qualification: dirtyQualification() })}
              onOutcomeChosen={() => {
                if (timer.running) durationRef.current = timer.stop()
              }}
              onLogged={(res) => onLogged(res, durationRef.current)}
              extraActions={
                <>
                  <button type="button" className="btn btn-lg" onClick={onSkip} title="Passer au lead suivant sans enregistrer">
                    <IconSkip size={18} /> Passer
                  </button>
                  <SnoozeMenu onSnooze={doSnooze} disabled={disabled} pending={snooze.isPending} />
                </>
              }
            />
          </section>
        )}
      </div>

      {narrow && scriptSheet && (
        <>
          <div className="sheet-backdrop" onClick={() => setScriptSheet(false)} />
          <div className="sheet script-sheet" role="dialog" aria-modal="true" aria-label="Script d’appel" onKeyDown={(e) => e.key === 'Escape' && setScriptSheet(false)}>
            <div className="grabber" />
            <div className="script-sheet-head">
              <strong>Script</strong>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setScriptSheet(false)} aria-label="Fermer">
                <IconX size={18} />
              </button>
            </div>
            <ScriptPanel businessType={lead.businessType} language={language} onLanguageChange={setLanguage} values={placeholders} hotkeys={false} />
          </div>
        </>
      )}
      {narrow && !scriptSheet && (
        <button type="button" className="script-fab" onClick={() => setScriptSheet(true)} aria-label="Ouvrir le script">
          <IconScript size={18} /> Script
        </button>
      )}

      {composer && (
        <EmailComposer
          lead={lead}
          defaultTo={qual.email}
          defaultLanguage={language}
          onClose={() => setComposer(false)}
          onSent={() => {
            if (qual.email && qual.email !== saved.current.email) commit({ email: qual.email })
          }}
        />
      )}
    </>
  )
}

function countFilled(q: Qualification): number {
  const keys: (keyof Qualification)[] = ['decisionMaker', 'role', 'directPhone', 'email', 'currentProvider', 'contractEndsAt', 'sizeSqft', 'employees', 'frequencyWanted', 'painPoints', 'bestTimeToCall']
  return keys.filter((k) => {
    const v = q[k]
    return Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== ''
  }).length
}
