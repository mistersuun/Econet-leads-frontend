// Mock routes for clients after the sale: a client appears for every lead that is WON,
// like the server does when a lead moves to that status.
import type { BusinessDTO, ClientDTO, ClientFrequency, ClientStatus } from '../api/types'
import { FREQUENCIES, CLIENT_STATUSES, monthlyValue } from '../lib/clients'
import type { Db } from './db'
import { HttpError, type Req, type Result } from './http'
import { isoLocal, mockId, type MockUser } from './seed'

const REVIEW_URL = 'https://g.page/r/econet-demo/review'
const clientsByDb = new WeakMap<Db, ClientDTO[]>()

function clientsOf(d: Db): ClientDTO[] {
  let list = clientsByDb.get(d)
  if (!list) {
    list = []
    clientsByDb.set(d, list)
  }
  return list
}

const iso = (d: Date) => isoLocal(d)
const dateOnly = (d: Date) => isoLocal(d).slice(0, 10)
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 9, 0, 0)
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

/** Demo data: leads without a wanted frequency get a recurring one so the page has revenue to show. */
function frequencyOf(lead: BusinessDTO, h: number): ClientFrequency {
  const wanted = lead.qualification?.frequencyWanted
  return FREQUENCIES.includes(wanted as ClientFrequency) ? (wanted as ClientFrequency) : (['weekly', 'bi-weekly', 'monthly'] as const)[h % 3]
}
const VISITS_PER_YEAR: Record<ClientFrequency, number> = { weekly: 52, 'bi-weekly': 26, monthly: 12, 'one-time': 1 }

/** Creates the client of every WON lead that has none yet (idempotent). Seeded leads get some variety. */
export function syncClients(d: Db, now: Date): void {
  const list = clientsOf(d)
  const have = new Set(list.map((c) => c.businessId))
  for (const lead of d.leads) {
    if (lead.leadStatus !== 'WON' || have.has(lead.id)) continue
    const h = hash(lead.id)
    const frequency = frequencyOf(lead, h)
    // The CRM's estimated value is a yearly figure: spread it over the visits.
    const price = lead.estimatedValue && lead.estimatedValue > 0 ? Math.round(lead.estimatedValue / VISITS_PER_YEAR[frequency]) : 120 + (h % 6) * 40
    list.push({
      id: mockId('cl'),
      businessId: lead.id,
      businessName: lead.businessName,
      city: lead.addressCity,
      phone: lead.phone,
      email: lead.email,
      service: 'Entretien ménager',
      frequency,
      pricePerVisit: price,
      monthlyValue: monthlyValue(price, frequency),
      startDate: dateOnly(addDays(now, -(h % 60))),
      contractEndDate: h % 3 === 0 ? dateOnly(addDays(now, 5 + (h % 25))) : h % 3 === 1 ? dateOnly(addDays(now, 200)) : null,
      nextVisitAt: h % 4 === 0 ? iso(addDays(now, 0)) : null,
      status: 'active',
      firstCleaningDoneAt: h % 2 === 0 ? iso(addDays(now, -(8 + (h % 10)))) : null,
      reviewRequestedAt: null,
      notes: null,
      createdAt: iso(now),
      updatedAt: iso(now),
    })
  }
}

function find(d: Db, id: string): ClientDTO {
  const c = clientsOf(d).find((x) => x.id === id)
  if (!c) throw new HttpError(404, 'Client introuvable')
  return c
}

function touch(c: ClientDTO, now: Date) {
  c.monthlyValue = monthlyValue(c.pricePerVisit, c.frequency)
  c.updatedAt = iso(now)
}

export function handle5(req: Req, d: Db, user: MockUser, now: Date): Result | null {
  const { method, path, query: q } = req
  if (!path.startsWith('/api/clients') && path !== '/api/dashboard/clients') return null
  syncClients(d, now)
  const list = clientsOf(d)
  const writer = () => {
    if (user.role === 'VIEWER') throw new HttpError(403, 'Accès refusé pour votre rôle')
  }
  let m: RegExpExecArray | null

  if (method === 'GET' && path === '/api/dashboard/clients') {
    const active = list.filter((c) => c.status === 'active')
    const soon = active.filter((c) => c.contractEndDate && c.contractEndDate >= dateOnly(now) && c.contractEndDate <= dateOnly(addDays(now, 30)))
    return {
      json: {
        active: active.length,
        monthlyRecurringRevenue: Math.round(active.reduce((s, c) => s + c.monthlyValue, 0) * 100) / 100,
        renewalsNext30Days: soon.length,
        reviewsPending: active.filter((c) => c.firstCleaningDoneAt && !c.reviewRequestedAt).length,
      },
    }
  }
  if (method === 'GET' && path === '/api/clients') {
    const status = q.get('status')
    if (status && !CLIENT_STATUSES.includes(status as ClientStatus)) throw new HttpError(400, 'Statut invalide')
    const businessId = q.get('businessId')
    return { json: list.filter((c) => (!status || c.status === status) && (!businessId || c.businessId === businessId)) }
  }
  if (method === 'GET' && path === '/api/clients/review-config') return { json: { googleReviewUrl: true, smtp: true } }
  if ((m = /^\/api\/clients\/([^/]+)$/.exec(path))) {
    const c = find(d, m[1])
    if (method === 'GET') return { json: c }
    if (method === 'PATCH') {
      writer()
      const b = (req.body ?? {}) as Partial<ClientDTO>
      if (b.frequency !== undefined) {
        if (!FREQUENCIES.includes(b.frequency)) throw new HttpError(400, 'Fréquence invalide')
        c.frequency = b.frequency
      }
      if (b.pricePerVisit !== undefined) {
        if (typeof b.pricePerVisit !== 'number' || b.pricePerVisit < 0) throw new HttpError(400, 'Le prix par visite doit être un nombre positif')
        c.pricePerVisit = b.pricePerVisit
      }
      if (b.status !== undefined) {
        if (!CLIENT_STATUSES.includes(b.status)) throw new HttpError(400, 'Statut invalide')
        c.status = b.status
      }
      if (b.service !== undefined) {
        if (!b.service.trim()) throw new HttpError(400, 'Le service est requis')
        c.service = b.service.trim()
      }
      if (b.startDate !== undefined && b.startDate) c.startDate = b.startDate
      if ('contractEndDate' in b) c.contractEndDate = b.contractEndDate || null
      if ('nextVisitAt' in b) c.nextVisitAt = b.nextVisitAt ? (b.nextVisitAt.length === 16 ? `${b.nextVisitAt}:00` : b.nextVisitAt) : null
      if ('notes' in b) c.notes = b.notes || null
      touch(c, now)
      return { json: c }
    }
    if (method === 'DELETE') {
      if (user.role !== 'ADMIN') throw new HttpError(403, 'Accès refusé pour votre rôle')
      list.splice(list.indexOf(c), 1)
      return { status: 204 }
    }
  }
  if ((m = /^\/api\/clients\/([^/]+)\/first-cleaning-done$/.exec(path)) && method === 'POST') {
    writer()
    const c = find(d, m[1])
    if (!c.firstCleaningDoneAt) {
      c.firstCleaningDoneAt = iso(now)
      touch(c, now)
    }
    return { json: c }
  }
  if ((m = /^\/api\/clients\/([^/]+)\/review-request$/.exec(path)) && method === 'POST') {
    writer()
    const c = find(d, m[1])
    const channel = (req.body as { channel?: string } | undefined)?.channel
    if (channel !== 'email' && channel !== 'link') throw new HttpError(400, 'Canal invalide (courriel ou lien)')
    if (channel === 'email' && !c.email) throw new HttpError(400, 'Aucune adresse courriel pour ce client')
    c.reviewRequestedAt = iso(now)
    touch(c, now)
    return {
      json: {
        channel,
        url: REVIEW_URL,
        message: `Bonjour,\n\nMerci de votre confiance. Si notre service vous satisfait, un court avis Google nous aiderait beaucoup : ${REVIEW_URL}\n\nL'équipe EcoNet Propreté`,
        requestedAt: c.reviewRequestedAt,
      },
    }
  }
  return null
}
