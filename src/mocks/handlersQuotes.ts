// Mock backend for P5: quotes (create / list / PDF / send), booking links, visits, availability.
// State lives in this module (a reload resets it, like the rest of the demo data).
import type { AvailabilityWindow, BookingLink, BusinessDTO, CreateQuoteRequest, Quote, QuoteLine, Visit, VisitStatus } from '../api/types'
import { parseLocal, type Db } from './db'
import { HttpError, type Req, type Result } from './http'
import { emit } from './live'
import { estimatePrice } from './pricing'
import { isoLocal, mockId, type MockUser } from './seed'

const quotes: Quote[] = []
const visits: Visit[] = []
let availability: AvailabilityWindow[] = [1, 2, 3, 4, 5].map((weekday) => ({
  id: mockId('w'),
  weekday,
  startTime: '09:00',
  endTime: '17:00',
  slotMinutes: 60,
  active: true,
}))

const SERVICE_FR: Record<string, string> = { residential: 'Entretien résidentiel', commercial: 'Entretien commercial', deep_cleaning: 'Grand ménage', post_construction: 'Après construction' }

function token(): string {
  return Array.from({ length: 43 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'[Math.floor(Math.random() * 64)]).join('')
}

function writer(user: MockUser) {
  if (user.role === 'VIEWER') throw new HttpError(403, 'Accès refusé pour votre rôle')
}

function lead(d: Db, id: string): BusinessDTO {
  const l = d.leads.find((x) => x.id === id)
  if (!l) throw new HttpError(404, 'Lead introuvable')
  return l
}

function note(d: Db, l: BusinessDTO, user: MockUser, notes: string, now: Date) {
  d.contacts.push({
    id: mockId('c'), businessId: l.id, businessName: l.businessName, contactDate: isoLocal(now), contactType: 'NOTE',
    contactStatus: 'NOTE', contactPerson: null, notes, nextAction: null, nextActionDate: null,
    userId: user.userId, username: user.username, outcome: null, createdAt: isoLocal(now),
  })
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function createQuote(d: Db, user: MockUser, leadId: string, body: CreateQuoteRequest, now: Date): Quote {
  const l = lead(d, leadId)
  if (!body?.estimate) throw new HttpError(400, 'estimate is required')
  if (body.estimate.service === 'post_construction') throw new HttpError(400, 'Ce service exige une soumission sur mesure')
  const e = estimatePrice(body.estimate)
  if (e.requiresQuote || e.subtotal === null || e.taxes === null || e.total === null || e.servicePrice === null) {
    throw new HttpError(400, 'Cette superficie exige une soumission sur mesure: elle ne peut pas être calculée automatiquement')
  }
  const lines: QuoteLine[] = [{ id: 'service', label: SERVICE_FR[e.service] ?? e.service, amount: e.servicePrice }]
  let running = e.servicePrice
  for (const a of e.addOns) {
    lines.push({ id: a.id, label: `+ ${a.labelFr}`, amount: a.price })
    running += a.price
  }
  const discount = Math.round((e.subtotal - running) * 100) / 100
  if (discount !== 0) lines.push({ id: 'discount', label: `Rabais fréquence (${Math.round(e.discountRate * 100)} %)`, amount: discount })
  const year = now.getFullYear()
  const seq = quotes.filter((q) => q.number.startsWith(`Q-${year}-`)).length + 1
  const t = token()
  const valid = new Date(now.getTime() + 30 * 86_400_000)
  const q: Quote = {
    id: mockId('q'),
    leadId,
    number: `Q-${year}-${String(seq).padStart(4, '0')}`,
    language: body.language ?? l.qualification?.language ?? 'fr',
    input: { ...body.estimate },
    lines,
    subtotal: e.subtotal,
    tax: e.taxes,
    total: e.total,
    status: 'draft',
    validUntil: `${valid.getFullYear()}-${pad(valid.getMonth() + 1)}-${pad(valid.getDate())}`,
    publicUrl: `https://econet-leads-api.onrender.com/public/quotes/${t}`,
    pdfUrl: `https://econet-leads-api.onrender.com/public/quotes/${t}/pdf`,
    createdBy: user.username,
    createdAt: isoLocal(now),
  }
  quotes.unshift(q)
  return q
}

function sendQuote(d: Db, user: MockUser, q: Quote, to: string | undefined, now: Date): Quote {
  const l = lead(d, q.leadId)
  const email = to?.trim() || l.qualification?.email || l.email
  if (!email) throw new HttpError(400, "Aucun destinataire : saisissez un courriel ou ajoutez-en un au lead")
  if (q.status === 'accepted' || q.status === 'declined') throw new HttpError(409, `Cette soumission est déjà ${q.status === 'accepted' ? 'acceptée' : 'refusée'}`)
  q.status = 'sent'
  q.sentAt = isoLocal(now)
  d.contacts.push({
    id: mockId('c'), businessId: l.id, businessName: l.businessName, contactDate: isoLocal(now), contactType: 'EMAIL',
    contactStatus: 'EMAIL_SENT', contactPerson: null, notes: `Soumission ${q.number} envoyée`, nextAction: null, nextActionDate: null,
    userId: user.userId, username: user.username, outcome: null, createdAt: isoLocal(now),
  })
  if (['NEW', 'CONTACTED', 'INTERESTED'].includes(l.leadStatus)) {
    l.leadStatus = 'QUOTE_SENT'
    emit('lead.updated', { leadId: l.id, leadStatus: l.leadStatus, nextFollowUpAt: l.nextFollowUpAt })
  }
  // Demo: the client opens the link and accepts a little later.
  setTimeout(() => {
    if (q.status !== 'sent') return
    const at = new Date()
    q.status = 'accepted'
    q.acceptedAt = isoLocal(at)
    q.acceptedName = 'Client (démo)'
    l.leadStatus = 'WON'
    l.nextFollowUpAt = null
    note(d, l, user, `Soumission ${q.number} acceptée en ligne par ${q.acceptedName}`, at)
    emit('lead.updated', { leadId: l.id, leadStatus: l.leadStatus, nextFollowUpAt: null })
    emit('quote.accepted', { leadId: l.id, leadName: l.businessName, quoteId: q.id, total: q.total })
  }, 20_000)
  return q
}

function pdfStub(q: Quote): Result {
  const text = `%PDF-1.4\n% Soumission ${q.number} (démo)\n%%EOF\n`
  return { status: 200, text, contentType: 'application/pdf' }
}

function createLink(d: Db, leadId: string, now: Date): BookingLink {
  lead(d, leadId)
  const exp = new Date(now.getTime() + 14 * 86_400_000)
  return { url: `https://econet-leads-api.onrender.com/public/book/${token()}`, expiresAt: isoLocal(exp) }
}

function seedVisits(d: Db, now: Date) {
  if (visits.length || d.leads.length === 0) return
  const l = d.leads[0]
  const start = new Date(now)
  start.setDate(start.getDate() + 2)
  start.setHours(10, 0, 0, 0)
  const end = new Date(start.getTime() + 3_600_000)
  visits.push({
    id: mockId('v'), leadId: l.id, leadName: l.businessName, leadPhone: l.phone, leadAddress: [l.addressStreet, l.addressCity].filter(Boolean).join(', ') || null,
    startsAt: isoLocal(start), endsAt: isoLocal(end), status: 'booked', bookedVia: 'link',
  })
}

function validateWindows(list: AvailabilityWindow[]) {
  if (!Array.isArray(list)) throw new HttpError(400, 'Une liste de plages est requise')
  for (const w of list) {
    if (w.weekday < 1 || w.weekday > 7) throw new HttpError(400, 'weekday must be between 1 (Monday) and 7 (Sunday)')
    if (!/^\d{2}:\d{2}$/.test(w.startTime) || !/^\d{2}:\d{2}$/.test(w.endTime)) throw new HttpError(400, 'startTime and endTime must be HH:mm')
    if (w.endTime <= w.startTime) throw new HttpError(400, 'endTime must be after startTime')
    if (w.slotMinutes < 15 || w.slotMinutes > 240) throw new HttpError(400, 'slotMinutes must be between 15 and 240')
  }
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++)
      if (list[i].weekday === list[j].weekday && list[i].startTime < list[j].endTime && list[j].startTime < list[i].endTime) {
        throw new HttpError(400, 'Windows of the same weekday must not overlap')
      }
}

export function handleQuotes(req: Req, d: Db, user: MockUser, now: Date): Result | null {
  const { method, path, query: q } = req
  let m: RegExpExecArray | null

  if ((m = /^\/api\/leads\/([^/]+)\/quotes$/.exec(path))) {
    writer(user)
    if (method === 'POST') return { status: 201, json: createQuote(d, user, m[1], (req.body ?? {}) as CreateQuoteRequest, now) }
    if (method === 'GET') {
      lead(d, m[1])
      return { json: quotes.filter((x) => x.leadId === m![1]) }
    }
  }
  if ((m = /^\/api\/quotes\/([^/]+)\/(pdf|send)$/.exec(path))) {
    writer(user)
    const quote = quotes.find((x) => x.id === m![1])
    if (!quote) throw new HttpError(404, 'Soumission introuvable')
    if (m[2] === 'pdf' && method === 'GET') return pdfStub(quote)
    if (m[2] === 'send' && method === 'POST') return { json: sendQuote(d, user, quote, (req.body as { to?: string } | undefined)?.to, now) }
  }
  if ((m = /^\/api\/leads\/([^/]+)\/booking-links$/.exec(path)) && method === 'POST') {
    writer(user)
    return { status: 201, json: createLink(d, m[1], now) }
  }
  if (method === 'GET' && path === '/api/visits') {
    writer(user)
    seedVisits(d, now)
    const from = q.get('from') ?? isoLocal(now).slice(0, 10)
    const to = q.get('to') ?? isoLocal(new Date(now.getTime() + 30 * 86_400_000)).slice(0, 10)
    return { json: visits.filter((v) => v.startsAt.slice(0, 10) >= from && v.startsAt.slice(0, 10) <= to).sort((a, b) => parseLocal(a.startsAt).getTime() - parseLocal(b.startsAt).getTime()) }
  }
  if ((m = /^\/api\/visits\/([^/]+)$/.exec(path)) && method === 'PATCH') {
    writer(user)
    const v = visits.find((x) => x.id === m![1])
    if (!v) throw new HttpError(404, 'Visite introuvable')
    const status = (req.body as { status?: string } | undefined)?.status
    if (status !== 'booked' && status !== 'done' && status !== 'cancelled') throw new HttpError(400, 'status must be booked, done or cancelled')
    v.status = status as VisitStatus
    return { json: v }
  }
  if (path === '/api/availability') {
    if (method === 'GET') return { json: availability }
    if (method === 'PUT') {
      if (user.role !== 'ADMIN') throw new HttpError(403, 'Accès refusé pour votre rôle')
      const list = (req.body ?? []) as AvailabilityWindow[]
      validateWindows(list)
      availability = list.map((w) => ({ id: mockId('w'), weekday: w.weekday, startTime: w.startTime, endTime: w.endTime, slotMinutes: w.slotMinutes, active: w.active }))
      return { json: availability }
    }
  }
  return null
}
