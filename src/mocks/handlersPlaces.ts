// Mock backend for Google Places enrichment and saved searches.
import type { BusinessDTO, DiscoverCategory, PlacesData, SavedSearch, SavedSearchInput, ScraperJobDTO } from '../api/types'
import type { Db } from './db'
import { HttpError, type Req, type Result } from './http'
import { isoLocal, mockId, USERS, type MockUser } from './seed'

const DAILY_LIMIT = 100
const CATEGORIES: DiscoverCategory[] = ['restaurant', 'clinic', 'daycare', 'office', 'retail', 'gym', 'school', 'hotel', 'senior', 'pharmacy']

interface State {
  searches: SavedSearch[]
  used: number
}
const states = new WeakMap<Db, State>()

/** Today's Places calls and the daily limit, also reported by the mock /api/integrations/status. */
export function placesUsage(d: Db, now: Date): { used: number; dailyLimit: number } {
  return { used: state(d, now).used, dailyLimit: DAILY_LIMIT }
}

function state(d: Db, now: Date): State {
  let s = states.get(d)
  if (!s) {
    s = {
      used: 12,
      searches: [
        {
          id: mockId('ss'), name: 'Restaurants du Plateau', city: 'Montréal', categories: ['restaurant'], maxResults: 100, frequency: 'monthly',
          assignToUserId: null, assignToName: null, active: true, lastRunAt: isoLocal(new Date(now.getTime() - 12 * 86400_000)), lastAdded: 14,
          nextRunAt: isoLocal(new Date(now.getTime() + 18 * 86400_000)), createdByName: 'admin', createdAt: isoLocal(new Date(now.getTime() - 40 * 86400_000)),
        },
      ],
    }
    states.set(d, s)
  }
  return s
}

function doneJob(d: Db, now: Date, name: string, processed: number, added: number, updated: number): ScraperJobDTO {
  const job: ScraperJobDTO = {
    id: mockId('j'),
    source: { id: mockId('d'), sourceName: name, sourceType: 'MANUAL', sourceUrl: null },
    jobType: 'MANUAL_SCRAPE', status: 'COMPLETED', startedAt: isoLocal(now), completedAt: isoLocal(now),
    recordsProcessed: processed, recordsAdded: added, recordsUpdated: updated, errors: null, log: null, durationSeconds: 1, createdAt: isoLocal(now),
  }
  d.jobs.unshift(job)
  return job
}

function fakePlaces(lead: BusinessDTO, now: Date): PlacesData {
  const seed = [...lead.id].reduce((a, c) => a + c.charCodeAt(0), 0)
  const dirty = seed % 3 === 0
  return {
    placeId: `ChIJmock${seed}`,
    rating: 3.4 + (seed % 15) / 10,
    reviewCount: 20 + (seed % 300),
    mapsUrl: `https://maps.google.com/?q=${encodeURIComponent(lead.businessName)}`,
    website: lead.website,
    phone: lead.phone,
    openingHours: ['lundi : 9 h 00 – 17 h 00', 'mardi : 9 h 00 – 17 h 00', 'mercredi : 9 h 00 – 17 h 00', 'jeudi : 9 h 00 – 17 h 00', 'vendredi : 9 h 00 – 17 h 00', 'samedi : fermé', 'dimanche : fermé'],
    businessStatus: 'OPERATIONAL',
    cleanlinessSignals: dirty
      ? [
          { text: 'Les toilettes étaient sales et il y avait de la poussière partout.', rating: 2, publishedAt: isoLocal(new Date(now.getTime() - 60 * 86400_000)) },
          { text: 'Service correct mais l’endroit manque de propreté.', rating: 3, publishedAt: isoLocal(new Date(now.getTime() - 200 * 86400_000)) },
        ]
      : [],
    fetchedAt: isoLocal(now),
  }
}

function validate(b: Partial<SavedSearchInput>): void {
  if (!b.name?.trim()) throw new HttpError(400, 'name est requis (150 caractères maximum)')
  if (!b.city?.trim()) throw new HttpError(400, 'city est requis (100 caractères maximum)')
  if (!b.categories?.length || b.categories.some((c) => !CATEGORIES.includes(c))) throw new HttpError(400, 'categories est requis')
  if (b.frequency !== 'monthly' && b.frequency !== 'weekly') throw new HttpError(400, 'frequency doit être monthly ou weekly')
}

export function handlePlaces(req: Req, d: Db, user: MockUser, now: Date): Result | null {
  const { method, path } = req
  const s = state(d, now)
  let m: RegExpExecArray | null
  const writer = () => {
    if (user.role === 'VIEWER') throw new HttpError(403, 'Accès refusé pour votre rôle')
  }

  if (method === 'GET' && path === '/api/places/status') {
    return { json: { configured: true, usedToday: s.used, dailyLimit: DAILY_LIMIT, attribution: 'Données Google' } }
  }
  if ((m = /^\/api\/businesses\/([^/]+)\/enrich\/places$/.exec(path)) && method === 'POST') {
    writer()
    const lead = d.leads.find((l) => l.id === m![1])
    if (!lead) throw new HttpError(404, 'Lead introuvable')
    if (s.used >= DAILY_LIMIT) throw new HttpError(429, 'Limite quotidienne Google Places atteinte (100 appels par jour, PLACES_DAILY_LIMIT)')
    s.used++
    lead.places = fakePlaces(lead, now)
    return { json: lead }
  }
  if (method === 'POST' && path === '/api/businesses/enrich/places') {
    writer()
    const ids = ((req.body ?? {}) as { ids?: string[] }).ids ?? []
    if (!ids.length) throw new HttpError(400, 'ids est requis')
    if (ids.length > 50) throw new HttpError(400, 'Au plus 50 leads à la fois')
    let enriched = 0
    for (const id of ids) {
      const lead = d.leads.find((l) => l.id === id)
      if (!lead || (lead.places && !lead.places.expired) || s.used >= DAILY_LIMIT) continue
      s.used++
      lead.places = fakePlaces(lead, now)
      enriched++
    }
    return { status: 202, json: doneJob(d, now, 'Google Places – enrichissement', ids.length, 0, enriched) }
  }

  if (method === 'GET' && path === '/api/saved-searches') return { json: s.searches }
  if (method === 'POST' && path === '/api/saved-searches') {
    writer()
    const b = (req.body ?? {}) as SavedSearchInput
    validate(b)
    const assignee = b.assignToUserId ? USERS.find((u) => u.userId === b.assignToUserId) : null
    const created: SavedSearch = {
      id: mockId('ss'), name: b.name.trim(), city: b.city.trim(), categories: b.categories, maxResults: b.maxResults ?? 100, frequency: b.frequency,
      assignToUserId: assignee?.userId ?? null, assignToName: assignee?.username ?? null, active: true, lastRunAt: null, lastAdded: null,
      nextRunAt: isoLocal(now), createdByName: user.username, createdAt: isoLocal(now),
    }
    s.searches.unshift(created)
    return { status: 201, json: created }
  }
  if ((m = /^\/api\/saved-searches\/([^/]+)$/.exec(path))) {
    const found = s.searches.find((x) => x.id === m![1])
    if (!found) throw new HttpError(404, 'Recherche enregistrée introuvable')
    if (method === 'PUT') {
      writer()
      const b = (req.body ?? {}) as SavedSearchInput
      validate(b)
      const assignee = b.assignToUserId ? USERS.find((u) => u.userId === b.assignToUserId) : null
      Object.assign(found, {
        name: b.name.trim(), city: b.city.trim(), categories: b.categories, maxResults: b.maxResults ?? found.maxResults, frequency: b.frequency,
        assignToUserId: assignee?.userId ?? null, assignToName: assignee?.username ?? null, active: b.active ?? found.active,
      })
      found.nextRunAt = found.active ? found.nextRunAt ?? isoLocal(now) : null
      return { json: found }
    }
    if (method === 'DELETE') {
      if (user.role !== 'ADMIN') throw new HttpError(403, 'Accès refusé pour votre rôle')
      s.searches = s.searches.filter((x) => x.id !== found.id)
      return { status: 204 }
    }
  }
  if ((m = /^\/api\/saved-searches\/([^/]+)\/run$/.exec(path)) && method === 'POST') {
    writer()
    const found = s.searches.find((x) => x.id === m![1])
    if (!found) throw new HttpError(404, 'Recherche enregistrée introuvable')
    const added = Math.floor(Math.random() * 6)
    found.lastRunAt = isoLocal(now)
    found.lastAdded = added
    return { status: 202, json: doneJob(d, now, 'Recherches enregistrées', added + 8, added, 0) }
  }
  return null
}
