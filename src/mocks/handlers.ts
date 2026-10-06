import type {
  ActivityPoint,
  AuthResponse,
  BreakdownRow,
  BusinessDTO,
  CallOutcome,
  DashboardSummary,
  LeadStatus,
  LeaderboardRow,
  LogCallRequest,
  OutcomeCount,
  ScraperJobDTO,
  TenderDTO,
  TenderStatus,
} from '../api/types'
import { CALL_OUTCOMES, LEAD_STATUSES, TENDER_SOURCES, TENDER_STATUSES } from '../api/types'
import { CONVERSATION_OUTCOMES, TERMINAL, applyCall, createDb, parseLocal, queueFor, startOfDay, type Db } from './db'
import { USERS, isoLocal, makeLead, mockId, type MockUser } from './seed'
import { NEW_SOURCE_NAMES, makeImportedTender, makePermitLead, makeRegisterLead } from './seedSources'

const ACCESS_TTL_MS = 15 * 60_000

class HttpError extends Error {
  status: number
  fields?: Record<string, string>
  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

interface Req {
  method: string
  path: string
  query: URLSearchParams
  body: unknown
  headers: Headers
}

type Result = { status?: number; json?: unknown; text?: string; contentType?: string }

let db: Db | null = null
function getDb(): Db {
  if (!db) db = createDb(new Date())
  return db
}

// ---------- auth helpers
function issue(user: MockUser): AuthResponse {
  return {
    accessToken: `mock-access.${user.userId}.${Date.now() + ACCESS_TTL_MS}`,
    refreshToken: `mock-refresh.${user.userId}`,
    tokenType: 'Bearer',
    userId: user.userId,
    username: user.username,
    email: user.email,
    role: user.role,
  }
}

function authUser(req: Req): MockUser {
  const header = req.headers.get('Authorization') ?? ''
  const m = /^Bearer mock-access\.([^.]+)\.(\d+)$/.exec(header)
  if (!m) throw new HttpError(401, 'Authentification requise')
  if (Number(m[2]) < Date.now()) throw new HttpError(401, 'Jeton expiré')
  const user = USERS.find((u) => u.userId === m[1])
  if (!user) throw new HttpError(401, 'Utilisateur inconnu')
  return user
}

function requireRole(user: MockUser, ...roles: MockUser['role'][]) {
  if (!roles.includes(user.role)) throw new HttpError(403, 'Accès refusé pour votre rôle')
}

// ---------- lead filtering
function bool(q: URLSearchParams, k: string) {
  return q.get(k) === 'true'
}

function statusesParam(q: URLSearchParams): LeadStatus[] {
  return q
    .getAll('leadStatus')
    .flatMap((s) => s.split(','))
    .filter((s): s is LeadStatus => (LEAD_STATUSES as readonly string[]).includes(s))
}

function filterLeads(d: Db, q: URLSearchParams, user: MockUser, now: Date): BusinessDTO[] {
  const text = (q.get('q') ?? '').trim().toLowerCase()
  const digits = text.replace(/\D/g, '')
  const statuses = statusesParam(q)
  const type = q.get('businessType')
  const city = q.get('city')
  const source = q.get('dataSource')
  const assigned = q.get('assignedTo')
  const minQ = q.get('minQualityScore')
  return d.leads.filter((l) => {
    if (text) {
      const hay = `${l.businessName} ${l.addressCity ?? ''} ${l.phone ?? ''}`.toLowerCase()
      const phoneHit = digits.length >= 3 && (l.phone ?? '').includes(digits)
      if (!hay.includes(text) && !phoneHit) return false
    }
    if (statuses.length && !statuses.includes(l.leadStatus)) return false
    if (type && l.businessType !== type) return false
    if (city && l.addressCity !== city) return false
    if (source && l.dataSource !== source) return false
    if (q.get('hasPhone') === 'true' && !l.phone) return false
    if (q.get('hasPhone') === 'false' && l.phone) return false
    if (assigned) {
      const id = assigned === 'me' ? user.userId : assigned
      if (l.assignedToId !== id) return false
    }
    if (minQ && (l.dataQualityScore ?? 0) < Number(minQ)) return false
    if (bool(q, 'followUpDue') && !(l.nextFollowUpAt && parseLocal(l.nextFollowUpAt) <= now)) return false
    return true
  })
}

function sortLeads(list: BusinessDTO[], sortBy: string, dir: string) {
  const key = (sortBy || 'createdAt') as keyof BusinessDTO
  const sign = dir === 'ASC' ? 1 : -1
  return [...list].sort((a, b) => {
    const va = a[key]
    const vb = b[key]
    if (va === vb) return 0
    if (va === null || va === undefined) return 1 // nulls last
    if (vb === null || vb === undefined) return -1
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign
    return String(va).localeCompare(String(vb), 'fr') * sign
  })
}

function findLead(d: Db, id: string): BusinessDTO {
  const lead = d.leads.find((l) => l.id === id)
  if (!lead) throw new HttpError(404, 'Lead introuvable')
  return lead
}

// ---------- dashboard helpers
function rangeOf(q: URLSearchParams, now: Date): [Date, Date] {
  const to = q.get('to') ? parseLocal(q.get('to')!) : startOfDay(now)
  const from = q.get('from') ? parseLocal(q.get('from')!) : new Date(to.getTime() - 29 * 86400_000)
  const end = new Date(to)
  end.setHours(23, 59, 59, 999)
  return [startOfDay(from), end]
}

function callsIn(d: Db, from: Date, to: Date) {
  return d.contacts.filter((c) => {
    if (c.contactType !== 'APPEL') return false
    const t = parseLocal(c.contactDate)
    return t >= from && t <= to
  })
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// ---------- jobs
function progressJobs(d: Db, now: Date) {
  for (const job of d.jobs) {
    if (job.status !== 'RUNNING' && job.status !== 'PENDING') continue
    const started = parseLocal(job.startedAt ?? job.createdAt)
    const elapsed = (now.getTime() - started.getTime()) / 1000
    const total = 9 // seconds to complete
    if (elapsed < 1) {
      job.status = 'PENDING'
      continue
    }
    job.status = 'RUNNING'
    job.recordsProcessed = Math.min(420, Math.round((elapsed / total) * 420))
    if (elapsed >= total) {
      const added = d.r.int(3, 7)
      const source = d.sources.find((s) => s.id === job.source?.id)
      for (let i = 0; i < added; i++) {
        const name = source?.sourceName
        if (name === NEW_SOURCE_NAMES.canadabuys || name === NEW_SOURCE_NAMES.seao) {
          d.tenders.push(makeImportedTender(d.r, now, name === NEW_SOURCE_NAMES.seao ? 'SEAO' : 'CANADABUYS'))
          continue
        }
        const lead =
          name === NEW_SOURCE_NAMES.register ? makeRegisterLead(d.r, now) : name === NEW_SOURCE_NAMES.permits ? makePermitLead(d.r, now) : makeLead(d.r, now)
        if (source) lead.dataSource = source.sourceName
        d.leads.push(lead)
      }
      job.status = 'COMPLETED'
      job.completedAt = isoLocal(now)
      job.recordsProcessed = 420
      job.recordsAdded = added
      job.recordsUpdated = d.r.int(10, 60)
      job.durationSeconds = Math.round(elapsed)
      if (source) {
        source.lastSync = isoLocal(now)
        source.recordsCount = (source.recordsCount ?? 0) + added
      }
    }
  }
}

function isOpenTender(t: TenderDTO, now: Date): boolean {
  return !!t.closingAt && parseLocal(t.closingAt) >= now
}

function page<T>(items: T[], q: URLSearchParams, defaultSize = 20) {
  const size = Math.max(1, Math.min(200, Number(q.get('size') ?? defaultSize)))
  const number = Math.max(0, Number(q.get('page') ?? 0))
  return {
    content: items.slice(number * size, number * size + size),
    totalElements: items.length,
    totalPages: Math.ceil(items.length / size),
    number,
    size,
  }
}

// ---------- router
export function handle(req: Req): Result {
  const d = getDb()
  const now = new Date()
  const { method, path, query: q } = req
  let m: RegExpExecArray | null

  // Auth
  if (method === 'POST' && path === '/api/auth/login') {
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string }
    const user = USERS.find((u) => u.username === username?.trim().toLowerCase())
    if (!user || user.password !== password) throw new HttpError(401, "Nom d'utilisateur ou mot de passe invalide")
    return { json: issue(user) }
  }
  if (method === 'POST' && path === '/api/auth/refresh') {
    const { refreshToken } = (req.body ?? {}) as { refreshToken?: string }
    const user = USERS.find((u) => refreshToken === `mock-refresh.${u.userId}`)
    if (!user) throw new HttpError(401, 'Jeton de rafraîchissement invalide')
    return { json: issue(user) }
  }

  const user = authUser(req)

  if (method === 'GET' && path === '/api/auth/me') {
    return { json: { userId: user.userId, username: user.username, email: user.email, role: user.role } }
  }

  // Leads
  if (method === 'GET' && path === '/api/businesses') {
    const list = sortLeads(filterLeads(d, q, user, now), q.get('sortBy') ?? 'createdAt', q.get('sortDirection') ?? 'DESC')
    return { json: page(list, q) }
  }
  if (method === 'GET' && path === '/api/businesses/filters') {
    const uniq = (f: (l: BusinessDTO) => string | null) =>
      [...new Set(d.leads.map(f).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'fr'))
    return { json: { businessTypes: uniq((l) => l.businessType), cities: uniq((l) => l.addressCity), dataSources: uniq((l) => l.dataSource) } }
  }
  if (method === 'GET' && path === '/api/businesses/export.csv') {
    const list = sortLeads(filterLeads(d, q, user, now), q.get('sortBy') ?? 'createdAt', q.get('sortDirection') ?? 'DESC')
    const header = 'name,type,phone,email,website,street,city,postal_code,status,last_contacted,next_follow_up,quality,source'
    const rows = list.map((l) =>
      [l.businessName, l.businessType, l.phone, l.email, l.website, l.addressStreet, l.addressCity, l.postalCode, l.leadStatus, l.lastContactedAt, l.nextFollowUpAt, l.dataQualityScore, l.dataSource]
        .map(csvCell)
        .join(','),
    )
    return { text: '﻿' + [header, ...rows].join('\n'), contentType: 'text/csv; charset=utf-8' }
  }
  if ((m = /^\/api\/businesses\/([^/]+)\/status$/.exec(path)) && method === 'PATCH') {
    requireRole(user, 'ADMIN', 'USER')
    const lead = findLead(d, m[1])
    const { status, note } = (req.body ?? {}) as { status?: LeadStatus; note?: string }
    if (!status || !LEAD_STATUSES.includes(status)) throw new HttpError(400, 'Statut invalide', { status: 'Valeur inconnue' })
    lead.leadStatus = status
    if (TERMINAL.includes(status)) lead.nextFollowUpAt = null
    lead.updatedAt = isoLocal(now)
    if (note) {
      d.contacts.push({
        id: mockId('c'), businessId: lead.id, businessName: lead.businessName, contactDate: isoLocal(now), contactType: 'EMAIL',
        contactStatus: 'NOTE', contactPerson: null, notes: note, nextAction: null, nextActionDate: null,
        userId: user.userId, username: user.username, outcome: null, createdAt: isoLocal(now),
      })
    }
    return { json: lead }
  }
  if ((m = /^\/api\/businesses\/([^/]+)\/phone$/.exec(path)) && method === 'PATCH') {
    requireRole(user, 'ADMIN', 'USER')
    const lead = findLead(d, m[1])
    const { phone } = (req.body ?? {}) as { phone?: string }
    const all = String(phone ?? '').replace(/\D/g, '')
    const digits = all.length === 11 && all.startsWith('1') ? all.slice(1) : all
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) {
      throw new HttpError(400, 'Numéro de téléphone invalide : 10 chiffres attendus, ex. (514) 555-1234', { phone: 'Format invalide' })
    }
    // 555-0100…0199 is reserved for fiction: lets the demo show a server-side rejection.
    if (digits.slice(3, 8) === '55501') throw new HttpError(400, 'Numéro fictif (555-01xx) refusé par le serveur', { phone: 'Numéro fictif' })
    lead.phone = digits
    // A number found and checked by a person is a strong signal.
    lead.dataQualityScore = Math.min(100, (lead.dataQualityScore ?? 0) + 45)
    lead.updatedAt = isoLocal(now)
    d.contacts.push({
      id: mockId('c'), businessId: lead.id, businessName: lead.businessName, contactDate: isoLocal(now), contactType: 'NOTE',
      contactStatus: 'NOTE', contactPerson: null, notes: 'Numéro ajouté', nextAction: null, nextActionDate: null,
      userId: user.userId, username: user.username, outcome: null, createdAt: isoLocal(now),
    })
    return { json: lead }
  }
  if ((m = /^\/api\/businesses\/([^/]+)$/.exec(path))) {
    const lead = findLead(d, m[1])
    if (method === 'GET') return { json: lead }
    if (method === 'PUT') {
      requireRole(user, 'ADMIN', 'USER')
      const body = (req.body ?? {}) as Partial<BusinessDTO>
      const allowed: (keyof BusinessDTO)[] = ['businessName', 'businessType', 'addressStreet', 'addressCity', 'postalCode', 'phone', 'email', 'website', 'estimatedValue', 'assignedToId']
      for (const k of allowed) if (k in body) (lead as unknown as Record<string, unknown>)[k] = body[k]
      if ('assignedToId' in body) lead.assignedToName = USERS.find((u) => u.userId === body.assignedToId)?.username ?? null
      lead.updatedAt = isoLocal(now)
      return { json: lead }
    }
  }

  // Calling
  if (method === 'GET' && path === '/api/leads/queue') {
    return { json: queueFor(d, user, now, Number(q.get('size') ?? 20)) }
  }
  if ((m = /^\/api\/leads\/([^/]+)\/calls$/.exec(path)) && method === 'POST') {
    requireRole(user, 'ADMIN', 'USER')
    const lead = findLead(d, m[1])
    const body = (req.body ?? {}) as LogCallRequest
    if (!body.outcome || !CALL_OUTCOMES.includes(body.outcome)) throw new HttpError(400, 'Résultat d’appel requis', { outcome: 'Requis' })
    const contact = applyCall(d, lead, user, body, now)
    return { json: { lead, contact } }
  }
  if ((m = /^\/api\/contacts\/business\/([^/]+)$/.exec(path)) && method === 'GET') {
    const list = d.contacts.filter((c) => c.businessId === m![1]).sort((a, b) => b.contactDate.localeCompare(a.contactDate))
    return { json: list }
  }
  if (method === 'GET' && path === '/api/contacts/upcoming') {
    const days = Number(q.get('days') ?? 7)
    const until = new Date(now.getTime() + days * 86400_000)
    return {
      json: d.contacts.filter((c) => c.nextActionDate && parseLocal(c.nextActionDate) >= now && parseLocal(c.nextActionDate) <= until),
    }
  }

  // Dashboard
  if (path.startsWith('/api/dashboard/') && method === 'GET') {
    const [from, to] = rangeOf(q, now)
    const calls = callsIn(d, from, to)
    const todayStart = startOfDay(now)
    const todayEnd = new Date(todayStart.getTime() + 86400_000 - 1)
    switch (path) {
      case '/api/dashboard/summary': {
        const leadIds = new Set(calls.map((c) => c.businessId))
        const won = calls.filter((c) => c.outcome === 'WON').length
        const summary: DashboardSummary = {
          totalLeads: d.leads.length,
          callableLeads: d.leads.filter((l) => l.phone && !TERMINAL.includes(l.leadStatus)).length,
          newLeads: d.leads.filter((l) => {
            const t = parseLocal(l.createdAt)
            return t >= from && t <= to
          }).length,
          calls: calls.length,
          callsToday: callsIn(d, todayStart, todayEnd).length,
          conversations: calls.filter((c) => CONVERSATION_OUTCOMES.includes(c.outcome as CallOutcome)).length,
          quotesSent: calls.filter((c) => c.outcome === 'QUOTE_SENT').length,
          won,
          conversionRate: leadIds.size ? won / leadIds.size : 0,
          followUpsDue: d.leads.filter((l) => {
            if (!l.nextFollowUpAt || TERMINAL.includes(l.leadStatus)) return false
            const t = parseLocal(l.nextFollowUpAt)
            return t >= todayStart && t <= todayEnd
          }).length,
          followUpsOverdue: d.leads.filter(
            (l) => l.nextFollowUpAt && !TERMINAL.includes(l.leadStatus) && parseLocal(l.nextFollowUpAt) < todayStart,
          ).length,
          pipelineValue: d.leads
            .filter((l) => l.leadStatus === 'INTERESTED' || l.leadStatus === 'QUOTE_SENT')
            .reduce((s, l) => s + (l.estimatedValue ?? 0), 0),
          toEnrich: d.leads.filter((l) => !l.phone && !TERMINAL.includes(l.leadStatus)).length,
        }
        return { json: summary }
      }
      case '/api/dashboard/pipeline':
        return { json: LEAD_STATUSES.map((status) => ({ status, count: d.leads.filter((l) => l.leadStatus === status).length })) }
      case '/api/dashboard/activity': {
        const out: ActivityPoint[] = []
        for (let day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
          const key = isoLocal(day).slice(0, 10)
          const dayCalls = calls.filter((c) => c.contactDate.startsWith(key))
          out.push({
            date: key,
            calls: dayCalls.length,
            conversations: dayCalls.filter((c) => CONVERSATION_OUTCOMES.includes(c.outcome as CallOutcome)).length,
            won: dayCalls.filter((c) => c.outcome === 'WON').length,
          })
        }
        return { json: out }
      }
      case '/api/dashboard/breakdown': {
        const dim = q.get('dimension') ?? 'type'
        const limit = Number(q.get('limit') ?? 10)
        const keyOf = (l: BusinessDTO) => (dim === 'city' ? l.addressCity : dim === 'source' ? l.dataSource : l.businessType) ?? '(inconnu)'
        const map = new Map<string, BreakdownRow>()
        for (const l of d.leads) {
          const k = keyOf(l)
          const row = map.get(k) ?? { label: k, total: 0, contacted: 0, won: 0 }
          row.total++
          if (l.contactCount > 0) row.contacted++
          if (l.leadStatus === 'WON') row.won++
          map.set(k, row)
        }
        return { json: [...map.values()].sort((a, b) => b.total - a.total).slice(0, limit) }
      }
      case '/api/dashboard/outcomes': {
        const out: OutcomeCount[] = CALL_OUTCOMES.map((outcome) => ({ outcome, count: calls.filter((c) => c.outcome === outcome).length }))
        return { json: out }
      }
      case '/api/dashboard/leaderboard': {
        const rows: LeaderboardRow[] = USERS.filter((u) => u.role !== 'VIEWER').map((u) => {
          const mine = calls.filter((c) => c.userId === u.userId)
          return {
            userId: u.userId,
            username: u.username,
            calls: mine.length,
            conversations: mine.filter((c) => CONVERSATION_OUTCOMES.includes(c.outcome as CallOutcome)).length,
            won: mine.filter((c) => c.outcome === 'WON').length,
          }
        })
        return { json: rows.filter((r) => r.calls > 0).sort((a, b) => b.calls - a.calls) }
      }
    }
  }

  // Tenders
  if (path === '/api/tenders/summary' && method === 'GET') {
    const open = d.tenders.filter((t) => isOpenTender(t, now) && !['WON', 'LOST', 'IGNORED'].includes(t.status))
    const weekEnd = new Date(now.getTime() + 7 * 86400_000)
    return {
      json: {
        open: open.length,
        closingThisWeek: open.filter((t) => parseLocal(t.closingAt!) <= weekEnd).length,
        bidding: d.tenders.filter((t) => t.status === 'BIDDING').length,
        submitted: d.tenders.filter((t) => t.status === 'SUBMITTED').length,
        won: d.tenders.filter((t) => t.status === 'WON').length,
      },
    }
  }
  if (path === '/api/tenders' && method === 'GET') {
    const text = (q.get('q') ?? '').trim().toLowerCase()
    const status = q.get('status')
    const source = q.get('source')
    if (status && !TENDER_STATUSES.includes(status as TenderStatus)) throw new HttpError(400, 'Statut inconnu')
    if (source && !(TENDER_SOURCES as readonly string[]).includes(source)) throw new HttpError(400, 'Source inconnue')
    const list = d.tenders.filter((t) => {
      if (text && !`${t.title} ${t.buyer} ${t.externalId} ${t.region ?? ''}`.toLowerCase().includes(text)) return false
      if (status && t.status !== status) return false
      if (source && t.source !== source) return false
      if (bool(q, 'openOnly') && !isOpenTender(t, now)) return false
      return true
    })
    const key = (q.get('sortBy') ?? 'closingAt') as 'closingAt' | 'publishedAt' | 'createdAt'
    const sign = (q.get('sortDirection') ?? 'ASC') === 'DESC' ? -1 : 1
    list.sort((a, b) => {
      const va = a[key]
      const vb = b[key]
      if (va === vb) return 0
      if (!va) return 1
      if (!vb) return -1
      return va.localeCompare(vb) * sign
    })
    return { json: page(list, q) }
  }
  if ((m = /^\/api\/tenders\/([^/]+)$/.exec(path))) {
    const tender = d.tenders.find((t) => t.id === m![1])
    if (!tender) throw new HttpError(404, 'Appel d’offres introuvable')
    if (method === 'GET') return { json: tender }
    if (method === 'PATCH') {
      requireRole(user, 'ADMIN', 'USER')
      const body = (req.body ?? {}) as { status?: string; notes?: string | null }
      if (body.status !== undefined) {
        if (!TENDER_STATUSES.includes(body.status as TenderStatus)) throw new HttpError(400, 'Statut invalide', { status: 'Valeur inconnue' })
        tender.status = body.status as TenderStatus
      }
      if (body.notes !== undefined) {
        if (body.notes && body.notes.length > 4000) throw new HttpError(400, 'Notes trop longues (4000 caractères max.)', { notes: 'Trop long' })
        tender.notes = body.notes?.trim() ? body.notes : null
      }
      tender.updatedAt = isoLocal(now)
      return { json: tender }
    }
  }

  // Data sources & jobs (ADMIN)
  if (path.startsWith('/api/data-sources') || path.startsWith('/api/scraper-jobs')) {
    requireRole(user, 'ADMIN')
    progressJobs(d, now)
    if (method === 'GET' && path === '/api/data-sources') return { json: d.sources }
    if ((m = /^\/api\/data-sources\/([^/]+)\/(import|upload)$/.exec(path)) && method === 'POST') {
      const s = d.sources.find((x) => x.id === m![1])
      if (!s) throw new HttpError(404, 'Source introuvable')
      if (m[2] === 'upload') {
        const file = (req.body ?? {}) as { name?: string; size?: number }
        if (s.sourceType !== 'BULK_FILE') throw new HttpError(400, 'Cette source n’accepte pas de fichier')
        if (!file.name?.toLowerCase().endsWith('.zip')) throw new HttpError(400, 'Fichier ZIP attendu (registre des entreprises)', { file: 'Format invalide' })
      }
      if (!s.active) throw new HttpError(400, 'Data source is not active')
      if (d.jobs.some((j) => j.source?.id === s.id && (j.status === 'RUNNING' || j.status === 'PENDING')))
        throw new HttpError(409, 'Une importation est déjà en cours pour cette source')
      const job: ScraperJobDTO = {
        id: mockId('j'),
        source: { id: s.id, sourceName: s.sourceName, sourceType: s.sourceType, sourceUrl: s.sourceUrl },
        jobType: m[2] === 'upload' ? 'FULL_SYNC' : 'MANUAL_SCRAPE',
        status: 'PENDING',
        startedAt: isoLocal(now),
        completedAt: null,
        recordsProcessed: 0,
        recordsAdded: 0,
        recordsUpdated: 0,
        errors: null,
        durationSeconds: null,
        createdAt: isoLocal(now),
      }
      d.jobs.unshift(job)
      return { json: job }
    }
    if ((m = /^\/api\/data-sources\/([^/]+)\/active$/.exec(path)) && method === 'PATCH') {
      const s = d.sources.find((x) => x.id === m![1])
      if (!s) throw new HttpError(404, 'Source introuvable')
      s.active = q.get('active') === 'true'
      return { json: s }
    }
    const sorted = () => [...d.jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (method === 'GET' && path === '/api/scraper-jobs') return { json: page(sorted(), q) }
    if (method === 'GET' && path === '/api/scraper-jobs/running') return { json: d.jobs.filter((j) => j.status === 'RUNNING' || j.status === 'PENDING') }
    if (method === 'GET' && path === '/api/scraper-jobs/statistics') {
      const count = (s: string) => d.jobs.filter((j) => j.status === s).length
      const completed = d.jobs.filter((j) => j.status === 'COMPLETED')
      const sum = (f: (j: ScraperJobDTO) => number | null) => completed.reduce((acc, j) => acc + (f(j) ?? 0), 0)
      return {
        json: {
          pending: count('PENDING'),
          running: count('RUNNING'),
          completed: count('COMPLETED'),
          failed: count('FAILED'),
          cancelled: count('CANCELLED'),
          total: d.jobs.length,
          last24Hours: d.jobs.filter((j) => parseLocal(j.createdAt).getTime() > now.getTime() - 86400_000).length,
          totalRecordsProcessed: sum((j) => j.recordsProcessed),
          totalRecordsAdded: sum((j) => j.recordsAdded),
          totalRecordsUpdated: sum((j) => j.recordsUpdated),
        },
      }
    }
  }

  throw new HttpError(404, `Route simulée inconnue : ${method} ${path}`)
}

export function toResponse(fn: () => Result): Response {
  try {
    const res = fn()
    if (res.text !== undefined) {
      return new Response(res.text, { status: res.status ?? 200, headers: { 'Content-Type': res.contentType ?? 'text/plain' } })
    }
    return new Response(JSON.stringify(res.json ?? null), {
      status: res.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    if (e instanceof HttpError) {
      return new Response(JSON.stringify({ error: e.message, ...(e.fields ? { fields: e.fields } : {}) }), {
        status: e.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    console.error('[mock]', e)
    return new Response(JSON.stringify({ error: 'Erreur interne (mock)' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
