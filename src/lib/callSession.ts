// Session mode: a timed batch of calls with its own filters and summary. Lives
// entirely in the browser (localStorage) so a reload resumes where it left off.
import type { CallOutcome, QueueParams } from '../api/types'
import { OUTCOME_META, outcomeLabel } from './status'

export const SESSION_STORAGE_KEY = 'econet.callSession'
export const SESSION_SIZES = [10, 25, 50] as const

export interface SessionFilters {
  businessType: string[]
  city: string[]
  sourceIn: string[]
  /** 'all' | 'new' | 'followups' */
  scope: 'all' | 'new' | 'followups'
  minQualityScore: number | null
}

export interface SessionCall {
  leadId: string
  leadName: string
  outcome: CallOutcome
  durationSeconds: number | null
  /** Epoch ms */
  at: number
}

export interface CallSession {
  id: string
  /** Epoch ms */
  startedAt: number
  endedAt: number | null
  filters: SessionFilters
  size: number
  /** Optional goal: number of conversations for this session. */
  target: number | null
  calls: SessionCall[]
  /** Leads passed without an outcome. */
  skippedIds: string[]
  pausedAt: number | null
  /** Total ms spent paused (completed pauses only). */
  pausedMs: number
}

export const DEFAULT_SESSION_FILTERS: SessionFilters = { businessType: [], city: [], sourceIn: [], scope: 'all', minQualityScore: null }

export function createSession(filters: SessionFilters, size: number, target: number | null, now = Date.now()): CallSession {
  return {
    id: `s-${now.toString(36)}`,
    startedAt: now,
    endedAt: null,
    filters,
    size,
    target,
    calls: [],
    skippedIds: [],
    pausedAt: null,
    pausedMs: 0,
  }
}

export function sessionQueueParams(s: Pick<CallSession, 'filters' | 'size'>): QueueParams {
  return {
    size: s.size,
    businessType: s.filters.businessType,
    city: s.filters.city,
    sourceIn: s.filters.sourceIn,
    minQualityScore: s.filters.minQualityScore ?? undefined,
    newOnly: s.filters.scope === 'new',
    followUpsOnly: s.filters.scope === 'followups',
  }
}

export function recordCall(s: CallSession, call: SessionCall): CallSession {
  return { ...s, calls: [...s.calls, call] }
}

export function recordSkip(s: CallSession, leadId: string): CallSession {
  return s.skippedIds.includes(leadId) ? s : { ...s, skippedIds: [...s.skippedIds, leadId] }
}

export function pauseSession(s: CallSession, now = Date.now()): CallSession {
  return s.pausedAt ? s : { ...s, pausedAt: now }
}

export function resumeSession(s: CallSession, now = Date.now()): CallSession {
  if (!s.pausedAt) return s
  return { ...s, pausedAt: null, pausedMs: s.pausedMs + (now - s.pausedAt) }
}

export function endSession(s: CallSession, now = Date.now()): CallSession {
  const resumed = resumeSession(s, now)
  return { ...resumed, endedAt: now }
}

/** Active (not paused) seconds since the session started. */
export function sessionElapsedSeconds(s: CallSession, now = Date.now()): number {
  const end = s.endedAt ?? now
  const paused = s.pausedMs + (s.pausedAt ? end - s.pausedAt : 0)
  return Math.max(0, Math.round((end - s.startedAt - paused) / 1000))
}

export const NO_CONNECT: readonly CallOutcome[] = ['NO_ANSWER', 'VOICEMAIL', 'WRONG_NUMBER']
export const CONVERSATION: readonly CallOutcome[] = ['INTERESTED', 'QUOTE_SENT', 'WON', 'NOT_INTERESTED', 'CALLBACK']
export const POSITIVE: readonly CallOutcome[] = ['INTERESTED', 'QUOTE_SENT', 'WON']

export interface SessionSummary {
  dials: number
  connects: number
  conversations: number
  positive: number
  won: number
  outcomes: { outcome: CallOutcome; count: number }[]
  /** Mean over calls that had a timer running; null when none did. */
  avgCallSeconds: number | null
  bestPositiveStreak: number
  elapsedSeconds: number
  /** Dials per active hour, null when the session is too short to say. */
  dialsPerHour: number | null
  skipped: number
  target: number | null
}

export function summarizeSession(s: CallSession, now = Date.now()): SessionSummary {
  const outcomes = new Map<CallOutcome, number>()
  let streak = 0
  let best = 0
  let durationSum = 0
  let durationN = 0
  for (const c of s.calls) {
    outcomes.set(c.outcome, (outcomes.get(c.outcome) ?? 0) + 1)
    if (POSITIVE.includes(c.outcome)) {
      streak++
      best = Math.max(best, streak)
    } else streak = 0
    if (c.durationSeconds && c.durationSeconds > 0) {
      durationSum += c.durationSeconds
      durationN++
    }
  }
  const elapsedSeconds = sessionElapsedSeconds(s, now)
  const dials = s.calls.length
  return {
    dials,
    connects: s.calls.filter((c) => !NO_CONNECT.includes(c.outcome)).length,
    conversations: s.calls.filter((c) => CONVERSATION.includes(c.outcome)).length,
    positive: s.calls.filter((c) => POSITIVE.includes(c.outcome)).length,
    won: outcomes.get('WON') ?? 0,
    outcomes: [...outcomes.entries()].map(([outcome, count]) => ({ outcome, count })).sort((a, b) => b.count - a.count),
    avgCallSeconds: durationN ? Math.round(durationSum / durationN) : null,
    bestPositiveStreak: best,
    elapsedSeconds,
    dialsPerHour: elapsedSeconds >= 300 && dials > 0 ? Math.round((dials / elapsedSeconds) * 3600 * 10) / 10 : null,
    skipped: s.skippedIds.length,
    target: s.target,
  }
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** "2 min 10 s", "45 s", "1 h 05" */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined) return '—'
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s} s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')}`
  const sec = s % 60
  return sec ? `${m} min ${String(sec).padStart(2, '0')} s` : `${m} min`
}

/** Plain-text summary for the clipboard (French). */
export function sessionSummaryText(sum: SessionSummary, startedAt: number): string {
  const when = new Date(startedAt).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })
  const lines = [
    `Session d’appels — ${when}`,
    `Durée : ${formatDuration(sum.elapsedSeconds)}${sum.dialsPerHour ? ` · ${sum.dialsPerHour} appels/h` : ''}`,
    `Appels : ${sum.dials} · joints : ${sum.connects} · conversations : ${sum.conversations}${sum.target ? ` / ${sum.target}` : ''}`,
    `Positifs : ${sum.positive} (gagnés : ${sum.won}) · meilleure série : ${sum.bestPositiveStreak}`,
    `Durée moyenne d’appel : ${sum.avgCallSeconds ? formatDuration(sum.avgCallSeconds) : '—'}`,
  ]
  if (sum.outcomes.length) {
    lines.push('Résultats :')
    for (const o of sum.outcomes) lines.push(`  - ${OUTCOME_META[o.outcome]?.label ?? outcomeLabel(o.outcome)} : ${o.count}`)
  }
  if (sum.skipped) lines.push(`Passés sans résultat : ${sum.skipped}`)
  return lines.join('\n')
}

// ---- persistence

export function loadSession(): CallSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as CallSession
    if (!s || typeof s.startedAt !== 'number' || !Array.isArray(s.calls)) return null
    // Forget sessions older than 12 h: a reload the next morning should start clean.
    if (Date.now() - s.startedAt > 12 * 3600_000) {
      localStorage.removeItem(SESSION_STORAGE_KEY)
      return null
    }
    return s
  } catch {
    return null
  }
}

export function saveSession(s: CallSession | null): void {
  try {
    if (s) localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(s))
    else localStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    /* storage unavailable */
  }
}
