// In-memory "server" state for mock mode. Implements the contract's business
// rules (queue ordering, status transitions, default follow-ups, dashboard
// aggregates) so the UI behaves like it would against the real backend.
import type {
  BusinessDTO,
  CallOutcome,
  ContactDTO,
  DataSource,
  LeadStatus,
  LogCallRequest,
  ScraperJobDTO,
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

export const TERMINAL: LeadStatus[] = ['WON', 'LOST', 'DO_NOT_CALL']
export const CONVERSATION_OUTCOMES: CallOutcome[] = ['INTERESTED', 'QUOTE_SENT', 'WON', 'NOT_INTERESTED', 'CALLBACK']

export interface Db {
  leads: BusinessDTO[]
  contacts: ContactDTO[]
  sources: DataSource[]
  jobs: ScraperJobDTO[]
  r: Rng
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
  }
  db.contacts.push(contact)
  return contact
}

/** Queue per contract: follow-ups due (oldest first), then NEW with phone by quality desc, createdAt asc. */
export function queueFor(db: Db, user: MockUser, now: Date, size: number): BusinessDTO[] {
  const eligible = db.leads.filter(
    (l) => l.phone && !TERMINAL.includes(l.leadStatus) && (!l.assignedToId || l.assignedToId === user.userId),
  )
  const due = eligible
    .filter((l) => l.nextFollowUpAt && parseLocal(l.nextFollowUpAt) <= now)
    .sort((a, b) => a.nextFollowUpAt!.localeCompare(b.nextFollowUpAt!))
  const fresh = eligible
    .filter((l) => l.leadStatus === 'NEW' && !(l.nextFollowUpAt && parseLocal(l.nextFollowUpAt) <= now))
    .sort((a, b) => (b.dataQualityScore ?? 0) - (a.dataQualityScore ?? 0) || a.createdAt.localeCompare(b.createdAt))
  return [...due, ...fresh].slice(0, size)
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
  const db: Db = { leads, contacts: [], sources, jobs: makeHistoricalJobs(sources, now, r), r }

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
  // Recompute source record counts from leads.
  for (const s of db.sources) s.recordsCount = db.leads.filter((l) => l.dataSource === s.sourceName).length * 9 + r.int(10, 90)
  return db
}

export { USERS }
