// In-memory "server" state for mock mode. Implements the contract's business
// rules (queue ordering, status transitions, default follow-ups, dashboard
// aggregates) so the UI behaves like it would against the real backend.
import type {
  BusinessDTO,
  CallOutcome,
  CallScript,
  ContactDTO,
  DataSource,
  EmailTemplate,
  LeadStatus,
  LogCallRequest,
  Qualification,
  QueueParams,
  ScraperJobDTO,
  TenderDTO,
  UserTargets,
} from '../api/types'
import {
  CONTACT_PEOPLE,
  NOTES,
  USERS,
  estimateValue,
  isoLocal,
  makeHistoricalJobs,
  makeLead,
  makeSources,
  mockId,
  rng,
  type MockUser,
  type Rng,
} from './seed'
import { makeEnrichLeads, makeNewSources, makeTenders, NEW_SOURCE_NAMES } from './seedSources'
import { makeEmailTemplates, makeScripts } from './seedScripts'

export const WEBSITE_SOURCE_NAME = 'Site web – demandes'

export const TERMINAL: LeadStatus[] = ['WON', 'LOST', 'DO_NOT_CALL']
export const CONVERSATION_OUTCOMES: CallOutcome[] = ['INTERESTED', 'QUOTE_SENT', 'WON', 'NOT_INTERESTED', 'CALLBACK']

export interface Claim {
  leadId: string
  userId: string
  username: string
  /** Epoch ms */
  expiresAt: number
}

export const CLAIM_TTL_MS = 10 * 60_000
export const PRESENCE_IDLE_MS = 10 * 60_000

export interface Db {
  leads: BusinessDTO[]
  contacts: ContactDTO[]
  sources: DataSource[]
  jobs: ScraperJobDTO[]
  tenders: TenderDTO[]
  r: Rng
  // Addendum 3
  claims: Map<string, Claim>
  /** Last authenticated request per user (presence). */
  lastActivity: Map<string, number>
  targets: Map<string, UserTargets>
  scripts: CallScript[]
  templates: EmailTemplate[]
  /** Lead ids last served by /api/leads/queue, per user (the simulation picks from here). */
  lastQueue: Map<string, string[]>
  /** Demo of the 409 path: after each queue fetch, the first claim silently hands the next lead to a teammate (3× max). */
  sneakyPending: boolean
  sneakyCount: number
  emailsSent: Map<string, number[]>
}

export const DEFAULT_TARGETS: UserTargets = { callTarget: 40, conversationTarget: 6 }

export function sweepClaims(db: Db, now: Date): void {
  for (const [id, c] of db.claims) if (c.expiresAt <= now.getTime()) db.claims.delete(id)
}

export function claimOf(db: Db, leadId: string, now: Date): Claim | null {
  const c = db.claims.get(leadId)
  if (!c) return null
  if (c.expiresAt <= now.getTime()) {
    db.claims.delete(leadId)
    return null
  }
  return c
}

const QUALIFICATION_KEYS = ['decisionMaker', 'role', 'directPhone', 'email', 'currentProvider', 'contractEndsAt', 'sizeSqft', 'employees', 'frequencyWanted', 'painPoints', 'language', 'bestTimeToCall', 'notes']

/** PATCH semantics: merge; null or blank removes the key; unknown keys are rejected by the caller. */
export function mergeQualification(lead: BusinessDTO, patch: Qualification): Qualification {
  const next: Record<string, unknown> = { ...(lead.qualification ?? {}) }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    if (v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0)) delete next[k]
    else next[k] = typeof v === 'string' ? v.trim() : v
  }
  lead.qualification = Object.keys(next).length ? (next as Qualification) : null
  return lead.qualification ?? {}
}

export function unknownQualificationKeys(patch: object): string[] {
  return Object.keys(patch).filter((k) => !QUALIFICATION_KEYS.includes(k))
}

/** Observed conversion by business type over the last 180 days, Laplace-smoothed (contract §3). */
export function conversionByType(db: Db, now: Date): Map<string, { leadsCalled: number; conversations: number; positive: number; rate: number }> {
  const since = now.getTime() - 180 * 86400_000
  const byType = new Map<string, { leads: Set<string>; conversations: number; positive: number }>()
  const typeOf = new Map(db.leads.map((l) => [l.id, l.businessType ?? '(inconnu)']))
  for (const c of db.contacts) {
    if (c.contactType !== 'APPEL' || parseLocal(c.contactDate).getTime() < since) continue
    const t = typeOf.get(c.businessId) ?? '(inconnu)'
    const row = byType.get(t) ?? { leads: new Set<string>(), conversations: 0, positive: 0 }
    row.leads.add(c.businessId)
    if (CONVERSATION_OUTCOMES.includes(c.outcome as CallOutcome)) row.conversations++
    if (c.outcome === 'WON' || c.outcome === 'INTERESTED' || c.outcome === 'QUOTE_SENT') row.positive++
    byType.set(t, row)
  }
  const out = new Map<string, { leadsCalled: number; conversations: number; positive: number; rate: number }>()
  for (const [t, row] of byType) {
    out.set(t, { leadsCalled: row.leads.size, conversations: row.conversations, positive: row.positive, rate: (row.positive + 2) / (row.leads.size + 10) })
  }
  return out
}

export function priorityScore(lead: BusinessDTO, rates: ReturnType<typeof conversionByType>): number {
  const rate = rates.get(lead.businessType ?? '(inconnu)')?.rate ?? 2 / 10
  return Math.round((0.5 * (lead.dataQualityScore ?? 0) + 0.5 * 100 * rate) * 10) / 10
}

export function parseLocal(iso: string): Date {
  // "YYYY-MM-DDTHH:mm:ss" without offset → local time
  const [d, t = '00:00:00'] = iso.split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [hh, mm, ss] = t.split(':').map(Number)
  return new Date(y, m - 1, day, hh || 0, mm || 0, ss || 0)
}

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addBusinessDays(d: Date, n: number): Date {
  const x = new Date(d)
  while (n > 0) {
    x.setDate(x.getDate() + 1)
    if (x.getDay() !== 0 && x.getDay() !== 6) n--
  }
  return x
}

function at10(d: Date): Date {
  const x = new Date(d)
  x.setHours(10, 0, 0, 0)
  return x
}

export function defaultFollowUp(outcome: CallOutcome, now: Date): string | null {
  switch (outcome) {
    case 'CALLBACK':
    case 'NO_ANSWER':
    case 'VOICEMAIL':
      return isoLocal(at10(addBusinessDays(now, 2)))
    case 'INTERESTED':
    case 'QUOTE_SENT': {
      const x = new Date(now)
      x.setDate(x.getDate() + 3)
      return isoLocal(at10(x))
    }
    default:
      return null
  }
}

export function nextStatus(current: LeadStatus, outcome: CallOutcome): LeadStatus {
  switch (outcome) {
    case 'NO_ANSWER':
    case 'VOICEMAIL':
    case 'CALLBACK':
      return current === 'INTERESTED' || current === 'QUOTE_SENT' ? current : 'CONTACTED'
    case 'INTERESTED':
      return 'INTERESTED'
    case 'QUOTE_SENT':
      return 'QUOTE_SENT'
    case 'WON':
      return 'WON'
    case 'NOT_INTERESTED':
      return 'LOST'
    case 'WRONG_NUMBER':
    case 'DO_NOT_CALL':
      return 'DO_NOT_CALL'
  }
}

export function applyCall(db: Db, lead: BusinessDTO, user: MockUser, req: LogCallRequest, now: Date): ContactDTO {
  const nowIso = isoLocal(now)
  const status = nextStatus(lead.leadStatus, req.outcome)
  const followUp = req.nextFollowUpAt ?? (TERMINAL.includes(status) ? null : defaultFollowUp(req.outcome, now))
  lead.leadStatus = status
  lead.lastContactedAt = nowIso
  lead.contactCount += 1
  lead.nextFollowUpAt = TERMINAL.includes(status) ? (req.nextFollowUpAt ?? null) : followUp
  if (req.estimatedValue !== undefined && req.estimatedValue !== null) lead.estimatedValue = req.estimatedValue
  if (req.qualification) mergeQualification(lead, req.qualification)
  if (req.snoozeUntil && (req.outcome === 'NO_ANSWER' || req.outcome === 'VOICEMAIL' || req.outcome === 'CALLBACK')) {
    lead.nextFollowUpAt = req.snoozeUntil
  }
  if (!lead.assignedToId) {
    lead.assignedToId = user.userId
    lead.assignedToName = user.username
  }
  lead.updatedAt = nowIso
  const contact: ContactDTO = {
    id: mockId('c'),
    businessId: lead.id,
    businessName: lead.businessName,
    contactDate: nowIso,
    contactType: 'APPEL',
    contactStatus: 'EFFECTUE',
    contactPerson: req.contactPerson || null,
    notes: req.notes || null,
    nextAction: lead.nextFollowUpAt ? 'Rappeler' : null,
    nextActionDate: lead.nextFollowUpAt,
    userId: user.userId,
    username: user.username,
    outcome: req.outcome,
    createdAt: nowIso,
    durationSeconds: req.durationSeconds ?? null,
  }
  db.contacts.push(contact)
  db.claims.delete(lead.id)
  return contact
}

/**
 * Queue per contract: follow-ups due (oldest first), then NEW with phone by
 * priority desc, createdAt asc. Leads claimed by someone else are excluded.
 * Addendum 3 filters apply to both halves.
 */
export function queueFor(db: Db, user: MockUser, now: Date, size: number, f: QueueParams = {}): BusinessDTO[] {
  sweepClaims(db, now)
  const rates = conversionByType(db, now)
  const eligible = db.leads.filter((l) => {
    if (!l.phone || TERMINAL.includes(l.leadStatus)) return false
    if (l.assignedToId && l.assignedToId !== user.userId) return false
    const claim = db.claims.get(l.id)
    if (claim && claim.userId !== user.userId) return false
    if (f.businessType?.length && !f.businessType.includes(l.businessType ?? '')) return false
    if (f.city?.length && !f.city.includes(l.addressCity ?? '')) return false
    if (f.sourceIn?.length && !f.sourceIn.includes(l.dataSource ?? '')) return false
    if (f.minQualityScore != null && (l.dataQualityScore ?? 0) < f.minQualityScore) return false
    return true
  })
  const isDue = (l: BusinessDTO) => !!l.nextFollowUpAt && parseLocal(l.nextFollowUpAt) <= now
  // Website requests are the hottest leads: due ones go before every other follow-up.
  const inbound = (l: BusinessDTO) => (l.dataSource === 'Site web' ? 0 : 1)
  const due = f.newOnly
    ? []
    : eligible.filter(isDue).sort((a, b) => inbound(a) - inbound(b) || a.nextFollowUpAt!.localeCompare(b.nextFollowUpAt!))
  const fresh = f.followUpsOnly
    ? []
    : eligible
        .filter((l) => l.leadStatus === 'NEW' && !isDue(l))
        .sort((a, b) => priorityScore(b, rates) - priorityScore(a, rates) || a.createdAt.localeCompare(b.createdAt))
  return [...due, ...fresh].slice(0, size).map((l) => {
    l.priorityScore = priorityScore(l, rates)
    const c = db.claims.get(l.id)
    l.claimedBy = c ? { userId: c.userId, username: c.username } : null
    return l
  })
}

function pickOutcome(r: Rng, status: LeadStatus): CallOutcome {
  if (status === 'QUOTE_SENT')
    return r.weighted<CallOutcome>([['WON', 30], ['NOT_INTERESTED', 15], ['CALLBACK', 30], ['VOICEMAIL', 25]])
  if (status === 'INTERESTED')
    return r.weighted<CallOutcome>([['QUOTE_SENT', 50], ['CALLBACK', 20], ['NOT_INTERESTED', 12], ['WON', 6], ['VOICEMAIL', 12]])
  return r.weighted<CallOutcome>([
    ['NO_ANSWER', 30],
    ['VOICEMAIL', 22],
    ['CALLBACK', 14],
    ['INTERESTED', 15],
    ['NOT_INTERESTED', 8],
    ['QUOTE_SENT', 2],
    ['WRONG_NUMBER', 5],
    ['DO_NOT_CALL', 3],
  ])
}

export function createDb(now: Date = new Date()): Db {
  const r = rng(20261005)
  const sources = makeSources(now)
  const leads: BusinessDTO[] = []
  // Imported leads: spread over the last 120 days, a bit denser recently.
  for (let i = 0; i < 150; i++) {
    const created = new Date(now)
    const daysAgo = i < 120 ? r.int(30, 120) : r.int(0, 29)
    created.setDate(created.getDate() - daysAgo)
    created.setHours(3, r.int(0, 59), r.int(0, 59), 0)
    leads.push(makeLead(r, created))
  }
  const db: Db = {
    leads,
    contacts: [],
    sources,
    jobs: makeHistoricalJobs(sources, now, r),
    tenders: [],
    r,
    claims: new Map(),
    lastActivity: new Map(),
    targets: new Map(),
    scripts: makeScripts(now),
    templates: makeEmailTemplates(),
    lastQueue: new Map(),
    sneakyPending: false,
    sneakyCount: 0,
    emailsSent: new Map(),
  }

  // Simulate the last 60 days of calling by the two agents (and the admin now and then).
  const callers = USERS.filter((u) => u.role !== 'VIEWER')
  const start = startOfDay(now)
  start.setDate(start.getDate() - 60)
  for (let day = new Date(start); day <= now; day.setDate(day.getDate() + 1)) {
    if (day.getDay() === 0 || day.getDay() === 6) continue
    for (const caller of callers) {
      const n = caller.role === 'ADMIN' ? r.int(0, 2) : r.int(1, 4)
      for (let k = 0; k < n; k++) {
        const t = new Date(day)
        t.setHours(9 + r.int(0, 7), r.int(0, 59), r.int(0, 59), 0)
        if (t > now) continue
        const visible = db.leads.filter((l) => parseLocal(l.createdAt) <= t)
        const queue = queueFor({ ...db, leads: visible }, caller, t, 5)
        if (!queue.length) continue
        // Leave some follow-ups untouched so there are overdue ones to work on.
        const lead = r.chance(0.8) ? queue[0] : r.pick(queue)
        const outcome = pickOutcome(r, lead.leadStatus)
        const meta = { notes: r.pick(NOTES[outcome]), contactPerson: r.pick(CONTACT_PEOPLE) }
        const withValue = outcome === 'INTERESTED' || outcome === 'QUOTE_SENT' || outcome === 'WON'
        const estimatedValue = withValue ? lead.estimatedValue ?? estimateValue(r, lead.businessType) : undefined
        // Some follow-ups are rescheduled further out by the agent.
        // Quotes and interested prospects take a while to decide.
        const custom =
          outcome === 'INTERESTED' || outcome === 'QUOTE_SENT'
            ? new Date(t.getTime() + r.int(6, 18) * 86400_000)
            : outcome === 'CALLBACK' && r.chance(0.3)
              ? new Date(t.getTime() + r.int(1, 10) * 86400_000)
              : null
        if (custom) custom.setHours(r.pick([9, 10, 11, 13, 14, 15]), 0, 0, 0)
        applyCall(db, lead, caller, {
          outcome,
          notes: meta.notes || undefined,
          contactPerson: meta.contactPerson || undefined,
          estimatedValue,
          nextFollowUpAt: custom ? isoLocal(custom) : undefined,
        }, t)
        // Mark contact time as the simulated time
        const c = db.contacts[db.contacts.length - 1]
        c.contactDate = c.createdAt = isoLocal(t)
      }
    }
  }
  // Agents never get through everything: leave some follow-ups overdue and some due later today.
  const active = db.leads.filter((l) => l.nextFollowUpAt && !TERMINAL.includes(l.leadStatus) && parseLocal(l.nextFollowUpAt) > now)
  active.forEach((l, i) => {
    const d = startOfDay(now)
    if (i % 3 === 0 && i < 24) {
      d.setDate(d.getDate() - (1 + (i % 5)))
      d.setHours(10 + (i % 4), 0, 0, 0)
    } else if (i % 3 === 1 && i < 16) {
      d.setHours(9 + (i % 8), 30, 0, 0)
    } else return
    l.nextFollowUpAt = isoLocal(d)
  })
  // Addendum 2 sources: leads without a phone (to enrich) and public tenders.
  // Separate generator so the base data above stays identical.
  const r2 = rng(20261006)
  db.sources.push(...makeNewSources(now))
  // Addendum 4: the website database is not configured in the demo (no WEBSITE_DB_* settings).
  db.sources.push({ id: mockId('d'), sourceName: WEBSITE_SOURCE_NAME, sourceType: 'WEBSITE_DB', sourceUrl: null, lastSync: null, syncFrequency: 'MANUAL', active: false, recordsCount: 0, configured: false })
  for (const s of db.sources) s.configured = s.configured ?? true
  db.leads.push(...makeEnrichLeads(r2, now))
  db.tenders = makeTenders(r2, now)

  // Facts captured on earlier calls, so the qualification form shows previous values.
  const PROVIDERS = ['none', 'in-house', 'Entretien Pro-Net', 'GDI', 'Services ménagers Roy', 'none', 'Nettoyage Lavoie']
  const DECIDERS = ['Mme Gagnon', 'M. Tremblay', 'Sylvie Côté', 'Dre Pelletier', 'Marc-André Roy', 'M. Haddad']
  const ROLES = ['directrice', 'propriétaire', 'gérant', 'directrice générale', 'adjointe administrative']
  db.leads
    .filter((l) => l.leadStatus === 'INTERESTED' || l.leadStatus === 'QUOTE_SENT' || (l.leadStatus === 'CONTACTED' && r.chance(0.3)))
    .forEach((l, i) => {
      const end = new Date(now)
      end.setMonth(end.getMonth() + 1 + (i % 9))
      const q: Qualification = {
        decisionMaker: DECIDERS[i % DECIDERS.length],
        role: ROLES[i % ROLES.length],
        currentProvider: PROVIDERS[i % PROVIDERS.length],
        employees: [6, 12, 25, 40, 80][i % 5],
        frequencyWanted: (['weekly', 'bi-weekly', 'weekly', 'monthly'] as const)[i % 4],
        painPoints: [['qualité'], ['prix', 'fiabilité'], ['horaire'], []][i % 4],
        language: i % 7 === 3 ? 'en' : 'fr',
        bestTimeToCall: ['mardi AM', 'après 14 h', null, 'lundi ou jeudi'][i % 4],
      }
      if (q.currentProvider !== 'none' && q.currentProvider !== 'in-house') q.contractEndsAt = end.toISOString().slice(0, 10)
      if (i % 3 === 0 && l.email) q.email = l.email.replace('info@', 'direction@')
      l.qualification = q
    })

  // Recompute source record counts from leads.
  for (const s of db.sources) s.recordsCount = db.leads.filter((l) => l.dataSource === s.sourceName).length * 9 + r.int(10, 90)
  for (const s of db.sources) if (s.sourceType === 'WEBSITE_DB') s.recordsCount = 0
  const tenderSource = { [NEW_SOURCE_NAMES.canadabuys]: 'CANADABUYS', [NEW_SOURCE_NAMES.seao]: 'SEAO' } as Record<string, string>
  for (const s of db.sources) {
    if (tenderSource[s.sourceName]) s.recordsCount = db.tenders.filter((t) => t.source === tenderSource[s.sourceName]).length
  }
  return db
}

export { USERS }
