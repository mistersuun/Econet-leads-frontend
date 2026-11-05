// Mock routes for contract addendum 3: claims, snooze, qualification, scripts,
// targets, today/team, funnel, best hours, email, pricing, notifications.
import type {
  AppNotification,
  BestHourCell,
  CallOutcome,
  CallScript,
  EmailTemplate,
  EstimateInput,
  Funnel,
  PresenceUser,
  Qualification,
  ScriptLanguage,
  ScriptUpsert,
  SendEmailRequest,
  TeamTodayRow,
  TodayStats,
  UserTargets,
} from '../api/types'
import { EMAIL_TEMPLATE_KEYS, SCRIPT_SECTION_KEYS } from '../api/types'
import {
  CLAIM_TTL_MS,
  CONVERSATION_OUTCOMES,
  DEFAULT_TARGETS,
  PRESENCE_IDLE_MS,
  TERMINAL,
  claimOf,
  conversionByType,
  mergeQualification,
  parseLocal,
  startOfDay,
  sweepClaims,
  unknownQualificationKeys,
  type Db,
} from './db'
import { renderEmail } from './email'
import { HttpError, type Req, type Result } from './http'
import { emit } from './live'
import { estimatePrice, pricingTables } from './pricing'
import { USERS, isoLocal, mockId, type MockUser } from './seed'
import { pickScript } from './seedScripts'
import { teammateFor } from './simulation'

const NO_CONNECT: CallOutcome[] = ['NO_ANSWER', 'VOICEMAIL', 'WRONG_NUMBER']
const POSITIVE: CallOutcome[] = ['INTERESTED', 'QUOTE_SENT', 'WON']

function requireRole(user: MockUser, ...roles: MockUser['role'][]) {
  if (!roles.includes(user.role)) throw new HttpError(403, 'Accès refusé pour votre rôle')
}

function findLead(d: Db, id: string) {
  const lead = d.leads.find((l) => l.id === id)
  if (!lead) throw new HttpError(404, 'Lead introuvable')
  return lead
}

export function targetsOf(d: Db, userId: string): UserTargets {
  return d.targets.get(userId) ?? DEFAULT_TARGETS
}

// ---------- presence

export function presenceUsers(d: Db, now: Date): PresenceUser[] {
  sweepClaims(d, now)
  return USERS.filter((u) => u.role !== 'VIEWER').map((u) => {
    const claim = [...d.claims.values()].find((c) => c.userId === u.userId)
    const last = d.lastActivity.get(u.userId) ?? 0
    const lead = claim ? d.leads.find((l) => l.id === claim.leadId) : null
    const status: PresenceUser['status'] = claim ? 'calling' : now.getTime() - last < PRESENCE_IDLE_MS ? 'idle' : 'offline'
    return {
      userId: u.userId,
      username: u.username,
      status,
      leadId: claim?.leadId ?? null,
      leadName: lead?.businessName ?? null,
      since: isoLocal(new Date(claim ? claim.expiresAt - CLAIM_TTL_MS : last || now.getTime())),
    }
  })
}

export function broadcastPresence(d: Db, now: Date): void {
  emit('presence', { users: presenceUsers(d, now) })
}

// ---------- today / team

function todayCalls(d: Db, now: Date) {
  const start = startOfDay(now).getTime()
  return d.contacts.filter((c) => c.contactType === 'APPEL' && parseLocal(c.contactDate).getTime() >= start)
}

export function todayStats(d: Db, user: MockUser, now: Date): TodayStats {
  const mine = todayCalls(d, now).filter((c) => c.userId === user.userId)
  const t = targetsOf(d, user.userId)
  // Streak: consecutive business days ending today or yesterday with ≥ 1 call.
  const days = new Set(d.contacts.filter((c) => c.contactType === 'APPEL' && c.userId === user.userId).map((c) => c.contactDate.slice(0, 10)))
  let streak = 0
  const cursor = startOfDay(now)
  if (!days.has(isoLocal(cursor).slice(0, 10))) cursor.setDate(cursor.getDate() - 1)
  for (let i = 0; i < 60; i++) {
    const dow = cursor.getDay()
    if (dow === 0 || dow === 6) {
      cursor.setDate(cursor.getDate() - 1)
      continue
    }
    if (!days.has(isoLocal(cursor).slice(0, 10))) break
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  const perDay = new Map<string, number>()
  for (const c of d.contacts) if (c.contactType === 'APPEL' && c.userId === user.userId) perDay.set(c.contactDate.slice(0, 10), (perDay.get(c.contactDate.slice(0, 10)) ?? 0) + 1)
  const team = teamToday(d, now).filter((r) => r.callsToday > 0 || r.userId === user.userId)
  const sorted = [...team].sort((a, b) => b.callsToday - a.callsToday)
  const position = Math.max(1, sorted.findIndex((r) => r.userId === user.userId) + 1)
  return {
    callsToday: mine.length,
    conversationsToday: mine.filter((c) => CONVERSATION_OUTCOMES.includes(c.outcome as CallOutcome)).length,
    quotesToday: mine.filter((c) => c.outcome === 'QUOTE_SENT').length,
    wonToday: mine.filter((c) => c.outcome === 'WON').length,
    callTarget: t.callTarget,
    conversationTarget: t.conversationTarget,
    streakDays: streak,
    bestDayCalls: Math.max(0, ...perDay.values()),
    rankToday: { position, of: Math.max(sorted.length, 1) },
  }
}

export function teamToday(d: Db, now: Date): TeamTodayRow[] {
  const calls = todayCalls(d, now)
  const presence = presenceUsers(d, now)
  return presence.map((p) => {
    const mine = calls.filter((c) => c.userId === p.userId)
    return {
      userId: p.userId,
      username: p.username,
      callsToday: mine.length,
      conversationsToday: mine.filter((c) => CONVERSATION_OUTCOMES.includes(c.outcome as CallOutcome)).length,
      status: p.status,
      currentLeadName: p.leadName ?? null,
    }
  })
}

export function emitProgress(d: Db, user: MockUser, now: Date): void {
  const s = todayStats(d, user, now)
  emit('target.progress', { userId: user.userId, callsToday: s.callsToday, conversationsToday: s.conversationsToday, target: s.callTarget, conversationTarget: s.conversationTarget })
}

// ---------- notifications

function notificationsFor(d: Db, user: MockUser, now: Date): AppNotification[] {
  const out: AppNotification[] = []
  const today0 = startOfDay(now)
  const todayEnd = new Date(today0.getTime() + 86400_000 - 1)
  for (const l of d.leads) {
    if (!l.nextFollowUpAt || TERMINAL.includes(l.leadStatus)) continue
    if (l.assignedToId && l.assignedToId !== user.userId) continue
    const t = parseLocal(l.nextFollowUpAt)
    if (t > todayEnd) continue
    const overdue = t < today0
    out.push({
      id: `${overdue ? 'follow_up_overdue' : 'follow_up_due'}:${l.id}`,
      kind: overdue ? 'follow_up_overdue' : 'follow_up_due',
      title: l.businessName,
      body: overdue ? `Suivi en retard depuis le ${t.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })}` : `Suivi prévu à ${t.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}`,
      leadId: l.id,
      at: l.nextFollowUpAt,
    })
  }
  const soon = now.getTime() + 48 * 3600_000
  for (const t of d.tenders) {
    if (!t.closingAt || (t.status !== 'REVIEWING' && t.status !== 'BIDDING')) continue
    const c = parseLocal(t.closingAt).getTime()
    if (c < now.getTime() || c > soon) continue
    out.push({ id: `tender_closing:${t.id}`, kind: 'tender_closing', title: t.title, body: `Clôture ${new Date(c).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })} · ${t.buyer}`, tenderId: t.id, at: t.closingAt })
  }
  return out.sort((a, b) => a.at.localeCompare(b.at)).slice(0, 40)
}

// ---------- router

export function handle3(req: Req, d: Db, user: MockUser, now: Date): Result | null {
  const { method, path, query: q } = req
  let m: RegExpExecArray | null

  // Claims
  if ((m = /^\/api\/leads\/([^/]+)\/claim$/.exec(path))) {
    const lead = findLead(d, m[1])
    if (method === 'POST') {
      requireRole(user, 'ADMIN', 'USER')
      const held = claimOf(d, lead.id, now)
      if (held && held.userId !== user.userId) {
        throw new HttpError(409, `${held.username} est déjà sur ce lead`, undefined, {
          claimedBy: { userId: held.userId, username: held.username },
          expiresAt: isoLocal(new Date(held.expiresAt)),
        })
      }
      // One claim per user: moving to the next lead releases the previous one.
      for (const [id, c] of d.claims) if (c.userId === user.userId && id !== lead.id) {
        d.claims.delete(id)
        emit('lead.released', { leadId: id, userId: user.userId })
      }
      const fresh = !held
      const claim = { leadId: lead.id, userId: user.userId, username: user.username, expiresAt: now.getTime() + CLAIM_TTL_MS }
      d.claims.set(lead.id, claim)
      // Demo of the race the contract describes: right after a queue fetch, a teammate
      // silently takes the lead that follows this one (as if the lead.claimed event was
      // missed), so the 409 → "X est déjà sur ce lead" path shows. At most three times.
      if (fresh && d.sneakyPending && d.sneakyCount < 3) {
        d.sneakyPending = false
        const ids = d.lastQueue.get(user.userId) ?? []
        const nextId = ids[ids.indexOf(lead.id) + 1]
        if (nextId && !d.claims.has(nextId)) {
          d.sneakyCount++
          const mate = teammateFor(user.userId)
          d.claims.set(nextId, { leadId: nextId, userId: mate.userId, username: mate.username, expiresAt: now.getTime() + CLAIM_TTL_MS })
        }
      }
      if (fresh) {
        emit('lead.claimed', { leadId: lead.id, leadName: lead.businessName, userId: user.userId, username: user.username, expiresAt: isoLocal(new Date(claim.expiresAt)) })
        broadcastPresence(d, now)
      }
      return { json: { leadId: lead.id, userId: user.userId, username: user.username, expiresAt: isoLocal(new Date(claim.expiresAt)) } }
    }
    if (method === 'DELETE') {
      const held = claimOf(d, lead.id, now)
      if (held && held.userId === user.userId) {
        d.claims.delete(lead.id)
        emit('lead.released', { leadId: lead.id, userId: user.userId })
        broadcastPresence(d, now)
      }
      return { status: 204 }
    }
  }

  // Snooze
  if ((m = /^\/api\/leads\/([^/]+)\/snooze$/.exec(path)) && method === 'POST') {
    requireRole(user, 'ADMIN', 'USER')
    const lead = findLead(d, m[1])
    const { until, reason } = (req.body ?? {}) as { until?: string; reason?: string }
    if (!until) throw new HttpError(400, 'Date de report requise', { until: 'Requis' })
    if (parseLocal(until) <= now) throw new HttpError(400, 'La date de report doit être dans le futur', { until: 'Doit être dans le futur' })
    if (!['NEW', 'CONTACTED', 'INTERESTED', 'QUOTE_SENT'].includes(lead.leadStatus)) throw new HttpError(400, 'Ce lead ne peut pas être reporté')
    lead.nextFollowUpAt = until
    lead.updatedAt = isoLocal(now)
    const when = parseLocal(until).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })
    d.contacts.push({
      id: mockId('c'), businessId: lead.id, businessName: lead.businessName, contactDate: isoLocal(now), contactType: 'NOTE', contactStatus: 'SNOOZED',
      contactPerson: null, notes: `Reporté au ${when}${reason ? ` — ${reason}` : ''}`, nextAction: 'Rappeler', nextActionDate: until,
      userId: user.userId, username: user.username, outcome: null, createdAt: isoLocal(now),
    })
    if (d.claims.get(lead.id)?.userId === user.userId) {
      d.claims.delete(lead.id)
      emit('lead.released', { leadId: lead.id, userId: user.userId })
    }
    emit('lead.updated', { leadId: lead.id, leadStatus: lead.leadStatus, nextFollowUpAt: lead.nextFollowUpAt })
    broadcastPresence(d, now)
    return { json: lead }
  }

  // Qualification
  if ((m = /^\/api\/businesses\/([^/]+)\/qualification$/.exec(path))) {
    const lead = findLead(d, m[1])
    if (method === 'GET') return { json: lead.qualification ?? {} }
    if (method === 'PATCH') {
      requireRole(user, 'ADMIN', 'USER')
      const body = (req.body ?? {}) as Qualification
      const unknown = unknownQualificationKeys(body)
      if (unknown.length) throw new HttpError(400, `Champ inconnu : ${unknown.join(', ')}`)
      if (body.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) throw new HttpError(400, 'Courriel invalide', { email: 'Format invalide' })
      lead.updatedAt = isoLocal(now)
      return { json: mergeQualification(lead, body) }
    }
  }

  // Scripts
  if (path === '/api/scripts' && method === 'GET') {
    const language = (q.get('language') === 'en' ? 'en' : 'fr') as ScriptLanguage
    return { json: pickScript(d.scripts, q.get('businessType'), language) }
  }
  if (path === '/api/scripts/all' && method === 'GET') return { json: d.scripts }
  if (path === '/api/scripts' && method === 'POST') {
    requireRole(user, 'ADMIN')
    const body = validateScript(req.body)
    const script: CallScript = { id: mockId('sc'), ...body, active: body.active ?? true, updatedAt: isoLocal(now) }
    d.scripts.push(script)
    return { status: 201, json: script }
  }
  if ((m = /^\/api\/scripts\/([^/]+)$/.exec(path)) && method === 'PUT') {
    requireRole(user, 'ADMIN')
    const script = d.scripts.find((s) => s.id === m![1])
    if (!script) throw new HttpError(404, 'Script introuvable')
    Object.assign(script, validateScript(req.body), { updatedAt: isoLocal(now) })
    return { json: script }
  }

  // Targets
  if (path === '/api/me/targets') {
    if (method === 'GET') return { json: targetsOf(d, user.userId) }
    if (method === 'PUT') {
      requireRole(user, 'ADMIN', 'USER')
      d.targets.set(user.userId, validateTargets(req.body))
      return { json: targetsOf(d, user.userId) }
    }
  }
  if ((m = /^\/api\/users\/([^/]+)\/targets$/.exec(path))) {
    requireRole(user, 'ADMIN')
    if (!USERS.some((u) => u.userId === m![1])) throw new HttpError(404, 'Utilisateur introuvable')
    if (method === 'GET') return { json: targetsOf(d, m[1]) }
    if (method === 'PUT') {
      d.targets.set(m[1], validateTargets(req.body))
      return { json: targetsOf(d, m[1]) }
    }
  }

  // Dashboard additions
  if (path === '/api/dashboard/me/today' && method === 'GET') return { json: todayStats(d, user, now) }
  if (path === '/api/dashboard/team/today' && method === 'GET') return { json: teamToday(d, now) }
  if (path === '/api/dashboard/conversion-by-type' && method === 'GET') {
    const rows = [...conversionByType(d, now).entries()]
      .map(([businessType, r]) => ({ businessType, ...r, rate: Math.round(r.rate * 1000) / 1000 }))
      .sort((a, b) => b.rate - a.rate)
    return { json: rows }
  }
  if ((path === '/api/dashboard/funnel' || path === '/api/dashboard/best-hours') && method === 'GET') {
    const to = q.get('to') ? parseLocal(q.get('to')!) : startOfDay(now)
    const from = q.get('from') ? parseLocal(q.get('from')!) : new Date(to.getTime() - 29 * 86400_000)
    const end = new Date(to)
    end.setHours(23, 59, 59, 999)
    const calls = d.contacts.filter((c) => {
      if (c.contactType !== 'APPEL') return false
      const t = parseLocal(c.contactDate)
      return t >= startOfDay(from) && t <= end
    })
    if (path === '/api/dashboard/funnel') {
      const funnel: Funnel = {
        dials: calls.length,
        connects: calls.filter((c) => !NO_CONNECT.includes(c.outcome as CallOutcome)).length,
        conversations: calls.filter((c) => CONVERSATION_OUTCOMES.includes(c.outcome as CallOutcome)).length,
        interested: calls.filter((c) => POSITIVE.includes(c.outcome as CallOutcome)).length,
        quotes: calls.filter((c) => c.outcome === 'QUOTE_SENT' || c.outcome === 'WON').length,
        won: calls.filter((c) => c.outcome === 'WON').length,
      }
      return { json: funnel }
    }
    const cells: BestHourCell[] = []
    for (let dow = 1; dow <= 5; dow++) for (let hour = 8; hour <= 18; hour++) cells.push({ dow, hour, calls: 0, connects: 0, positive: 0 })
    for (const c of calls) {
      const t = parseLocal(c.contactDate)
      const dow = ((t.getDay() + 6) % 7) + 1
      const cell = cells.find((x) => x.dow === dow && x.hour === t.getHours())
      if (!cell) continue
      cell.calls++
      if (!NO_CONNECT.includes(c.outcome as CallOutcome)) cell.connects++
      if (POSITIVE.includes(c.outcome as CallOutcome)) cell.positive++
    }
    return { json: cells }
  }

  // Email
  if (path === '/api/email/status' && method === 'GET') return { json: { configured: true, from: 'EcoNet Propreté <bonjour@econet.ca>' } }
  if (path === '/api/email/templates' && method === 'GET') return { json: d.templates }
  if ((m = /^\/api\/email\/templates\/([^/]+)$/.exec(path)) && method === 'PUT') {
    requireRole(user, 'ADMIN')
    const t = d.templates.find((x) => x.id === m![1])
    if (!t) throw new HttpError(404, 'Modèle introuvable')
    const body = (req.body ?? {}) as Partial<EmailTemplate>
    if (body.subject !== undefined) {
      if (!body.subject.trim()) throw new HttpError(400, 'Objet requis', { subject: 'Requis' })
      t.subject = body.subject
    }
    if (body.body !== undefined) {
      if (!body.body.trim()) throw new HttpError(400, 'Corps requis', { body: 'Requis' })
      t.body = body.body
    }
    if (body.active !== undefined) t.active = !!body.active
    return { json: t }
  }
  if (path === '/api/pricing' && method === 'GET') return { json: pricingTables() }
  if (path === '/api/pricing/estimate' && method === 'POST') {
    const body = (req.body ?? {}) as Partial<EstimateInput>
    if (body.service === 'post_construction') throw new HttpError(400, 'Le nettoyage après construction n’est pas réservable en ligne : soumission requise', { service: 'Non réservable' })
    return { json: estimatePrice({ service: body.service ?? '', area: body.area ?? '', propertyType: body.propertyType ?? '', addOnIds: body.addOnIds ?? [], frequency: body.frequency ?? 'one-time' }) }
  }
  if ((m = /^\/api\/leads\/([^/]+)\/emails(\/preview)?$/.exec(path)) && method === 'POST') {
    requireRole(user, 'ADMIN', 'USER')
    const lead = findLead(d, m[1])
    const body = (req.body ?? {}) as Partial<SendEmailRequest>
    if (!body.templateKey || !EMAIL_TEMPLATE_KEYS.includes(body.templateKey)) throw new HttpError(400, 'Modèle inconnu', { templateKey: 'Valeur inconnue' })
    const language: ScriptLanguage = body.language === 'en' || body.language === 'fr' ? body.language : (lead.qualification?.language ?? 'fr')
    const template = d.templates.find((t) => t.key === body.templateKey && t.language === language && t.active) ?? d.templates.find((t) => t.key === body.templateKey && t.active)
    if (!template) throw new HttpError(404, 'Aucun modèle actif pour cette langue')
    if (body.templateKey === 'visit_confirmation' && !body.visitAt) throw new HttpError(400, 'Une date de visite est requise pour ce modèle', { visitAt: 'Requis' })
    const req3: SendEmailRequest = { templateKey: body.templateKey, language, to: body.to, estimate: body.estimate, visitAt: body.visitAt, extraNote: body.extraNote }
    const rendered = renderEmail(template, lead, user.username, req3)
    if (m[2]) return { json: rendered }
    const to = (body.to ?? lead.qualification?.email ?? lead.email ?? '').trim()
    if (!to) throw new HttpError(400, 'Aucune adresse courriel pour ce lead', { to: 'Requis' })
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new HttpError(400, 'Adresse courriel invalide', { to: 'Format invalide' })
    const sent = (d.emailsSent.get(user.userId) ?? []).filter((t) => t > now.getTime() - 3600_000)
    if (sent.length >= 20) throw new HttpError(429, 'Limite de 20 courriels par heure atteinte')
    sent.push(now.getTime())
    d.emailsSent.set(user.userId, sent)
    const contact = {
      id: mockId('c'), businessId: lead.id, businessName: lead.businessName, contactDate: isoLocal(now), contactType: 'EMAIL' as const, contactStatus: 'EMAIL_SENT',
      contactPerson: to, notes: `${rendered.subject}\n\n${rendered.body}`, nextAction: null, nextActionDate: null,
      userId: user.userId, username: user.username, outcome: null, createdAt: isoLocal(now), durationSeconds: null,
    }
    d.contacts.push(contact)
    lead.lastContactedAt = isoLocal(now)
    lead.contactCount += 1
    lead.updatedAt = isoLocal(now)
    if (lead.leadStatus === 'NEW') lead.leadStatus = 'CONTACTED'
    emit('lead.updated', { leadId: lead.id, leadStatus: lead.leadStatus, nextFollowUpAt: lead.nextFollowUpAt })
    return { json: { contact, preview: rendered } }
  }

  // Notifications
  if (path === '/api/notifications' && method === 'GET') return { json: notificationsFor(d, user, now) }

  return null
}

function validateScript(raw: unknown): ScriptUpsert {
  const b = (raw ?? {}) as Partial<ScriptUpsert>
  if (!b.name?.trim()) throw new HttpError(400, 'Nom requis', { name: 'Requis' })
  if (b.language !== 'fr' && b.language !== 'en') throw new HttpError(400, 'Langue invalide', { language: 'fr ou en' })
  if (!Array.isArray(b.sections) || !b.sections.length) throw new HttpError(400, 'Sections requises', { sections: 'Requis' })
  for (const s of b.sections) if (!SCRIPT_SECTION_KEYS.includes(s.key)) throw new HttpError(400, `Section inconnue : ${s.key}`)
  return { name: b.name.trim(), businessType: b.businessType?.trim() || null, language: b.language, sections: b.sections.map((s) => ({ key: s.key, title: s.title ?? '', body: s.body ?? '' })), active: b.active }
}

function validateTargets(raw: unknown): UserTargets {
  const b = (raw ?? {}) as Partial<UserTargets>
  const calls = Number(b.callTarget)
  const conv = Number(b.conversationTarget)
  if (!Number.isInteger(calls) || calls < 1 || calls > 500) throw new HttpError(400, 'Objectif d’appels invalide (1–500)', { callTarget: 'Entre 1 et 500' })
  if (!Number.isInteger(conv) || conv < 1 || conv > 500) throw new HttpError(400, 'Objectif de conversations invalide (1–500)', { conversationTarget: 'Entre 1 et 500' })
  return { callTarget: calls, conversationTarget: conv }
}
