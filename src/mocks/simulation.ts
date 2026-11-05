// A fake teammate who works the queue while a stream is open: claims a lead,
// then logs a call ~8 s later, every ~20 s. Now and then they claim a lead from
// the current user's own queue so the "removed from queue" path is visible.
import type { CallOutcome } from '../api/types'
import { CLAIM_TTL_MS, applyCall, queueFor, type Db } from './db'
import { emit } from './live'
import { broadcastPresence, emitProgress } from './handlers3'
import { CONTACT_PEOPLE, NOTES, USERS, isoLocal, type MockUser } from './seed'

const CYCLE_MS = 20_000
const CLAIM_TO_CALL_MS = 8_000
const FIRST_DELAY_MS = 3_000
const OUTCOMES: CallOutcome[] = ['CALLBACK', 'INTERESTED', 'WON', 'NO_ANSWER', 'QUOTE_SENT', 'VOICEMAIL', 'INTERESTED', 'NOT_INTERESTED']

let timer: ReturnType<typeof setTimeout> | null = null
let cycle = 0
let running = false

export function teammateFor(userId: string): MockUser {
  return USERS.find((u) => u.role === 'USER' && u.userId !== userId) ?? USERS[1]
}

export function startSimulation(getDb: () => Db, forUserId: string): void {
  if (running) return
  running = true
  const mate = teammateFor(forUserId)
  const schedule = (ms: number, fn: () => void) => {
    timer = setTimeout(() => {
      timer = null
      if (running) fn()
    }, ms)
  }

  const step = () => {
    const d = getDb()
    const now = new Date()
    d.lastActivity.set(mate.userId, now.getTime())
    cycle++
    // Every third cycle, take a lead the current user was just shown.
    let lead = null
    if (cycle % 3 === 0) {
      const ids = d.lastQueue.get(forUserId) ?? []
      const id = ids[2]
      const candidate = id ? d.leads.find((l) => l.id === id) : undefined
      if (candidate && !d.claims.has(candidate.id)) lead = candidate
    }
    if (!lead) lead = queueFor(d, mate, now, 6).find((l) => !d.claims.has(l.id)) ?? null
    if (!lead) {
      schedule(CYCLE_MS, step)
      return
    }
    const claim = { leadId: lead.id, userId: mate.userId, username: mate.username, expiresAt: now.getTime() + CLAIM_TTL_MS }
    d.claims.set(lead.id, claim)
    emit('lead.claimed', { leadId: lead.id, leadName: lead.businessName, userId: mate.userId, username: mate.username, expiresAt: isoLocal(new Date(claim.expiresAt)) })
    broadcastPresence(d, now)
    const leadId = lead.id

    schedule(CLAIM_TO_CALL_MS, () => {
      const d2 = getDb()
      const t = new Date()
      const l = d2.leads.find((x) => x.id === leadId)
      if (!l) return
      const outcome = OUTCOMES[cycle % OUTCOMES.length]
      const duration = outcome === 'NO_ANSWER' || outcome === 'VOICEMAIL' ? d2.r.int(10, 40) : d2.r.int(90, 420)
      const contact = applyCall(d2, l, mate, { outcome, notes: d2.r.pick(NOTES[outcome]) || undefined, contactPerson: d2.r.pick(CONTACT_PEOPLE) || undefined, durationSeconds: duration }, t)
      emit('call.logged', { contactId: contact.id, leadId: l.id, leadName: l.businessName, userId: mate.userId, username: mate.username, outcome, durationSeconds: duration, at: contact.contactDate })
      emit('lead.updated', { leadId: l.id, leadStatus: l.leadStatus, nextFollowUpAt: l.nextFollowUpAt })
      emit('lead.released', { leadId: l.id, userId: mate.userId })
      emitProgress(d2, mate, t)
      broadcastPresence(d2, t)
      schedule(CYCLE_MS - CLAIM_TO_CALL_MS, step)
    })
  }

  schedule(FIRST_DELAY_MS, step)
}

export function stopSimulation(): void {
  running = false
  if (timer) clearTimeout(timer)
  timer = null
}
