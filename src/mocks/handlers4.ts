// Mock backend for contract addendum 4: manual leads + duplicate detection,
// file imports, OpenStreetMap discovery, website (inbound) requests.
import type {
  BusinessDTO,
  BusinessCreateRequest,
  DiscoverCandidate,
  ImportMapping,
  ImportRunRequest,
  ImportUpload,
  LeadStatus,
  ScraperJobDTO,
} from '../api/types'
import { IMPORT_FIELDS, LEAD_STATUSES } from '../api/types'
import { normalizeHeader, parseDelimited, sniffDelimiter, suggestMapping } from '../lib/importHelpers'
import { TERMINAL, parseLocal, type Db } from './db'
import { HttpError, type Req, type Result } from './http'
import { emit } from './live'
import { isoLocal, mockId, type MockUser } from './seed'

// ---------------------------------------------------------------- duplicates

const LEGAL = /\b(inc|ltee|ltd|enr|senc|sencrl|s e n c|s e n c r l|cie|corp|llc)\b/g

export function normName(s: string): string {
  return normalizeHeader(s).replace(LEGAL, ' ').replace(/\s+/g, ' ').trim()
}

export function normPhone(s: string | null | undefined): string {
  const d = (s ?? '').replace(/\D/g, '')
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d
}

function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeHeader(a ?? '') === normalizeHeader(b ?? '')
}

function tokens(s: string): Set<string> {
  return new Set(normName(s).split(' ').filter((t) => t.length > 1))
}

function similar(a: string, b: string): boolean {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size < 2 || tb.size < 2) return false
  const inter = [...ta].filter((t) => tb.has(t)).length
  return inter / (ta.size + tb.size - inter) >= 0.7
}

/** Exact = what a 409 is raised for: same phone in the same city, or same name in the same city. */
export function exactDuplicate(d: Db, p: { name?: string | null; phone?: string | null; city?: string | null }): BusinessDTO | null {
  const phone = normPhone(p.phone)
  const name = normName(p.name ?? '')
  return (
    d.leads.find((l) => {
      if (!sameCity(l.addressCity, p.city)) return false
      if (phone.length === 10 && normPhone(l.phone) === phone) return true
      return !!name && normName(l.businessName) === name
    }) ?? null
  )
}

export function findDuplicates(d: Db, p: { name?: string | null; phone?: string | null; city?: string | null }): BusinessDTO[] {
  const phone = normPhone(p.phone)
  const name = normName(p.name ?? '')
  const out: BusinessDTO[] = []
  for (const l of d.leads) {
    const cityOk = !p.city || sameCity(l.addressCity, p.city)
    const hit =
      (phone.length === 10 && normPhone(l.phone) === phone) ||
      (!!name && cityOk && normName(l.businessName) === name) ||
      (!!name && cityOk && name.length >= 5 && similar(l.businessName, p.name ?? ''))
    if (hit) out.push(l)
    if (out.length === 5) break
  }
  return out
}

function qualityScore(l: Pick<BusinessDTO, 'phone' | 'email' | 'website'>): number {
  return Math.min(100, (l.phone ? 40 : 10) + (l.email ? 20 : 0) + (l.website ? 15 : 0) + 15)
}

function blank(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s || null
}

function newLead(now: Date, p: Partial<BusinessDTO> & { businessName: string }): BusinessDTO {
  const iso = isoLocal(now)
  const lead: BusinessDTO = {
    id: mockId('b'),
    businessType: 'Autre',
    addressStreet: null,
    addressCity: null,
    addressProvince: 'QC',
    postalCode: null,
    phone: null,
    email: null,
    website: null,
    latitude: null,
    longitude: null,
    dataSource: null,
    externalId: null,
    dataQualityScore: null,
    leadStatus: 'NEW',
    assignedToId: null,
    assignedToName: null,
    lastContactedAt: null,
    nextFollowUpAt: null,
    contactCount: 0,
    estimatedValue: null,
    createdAt: iso,
    updatedAt: iso,
    lastVerified: iso,
    ...p,
  }
  lead.dataQualityScore = lead.dataQualityScore ?? qualityScore(lead)
  return lead
}

function noteContact(d: Db, lead: BusinessDTO, user: MockUser, notes: string, now: Date) {
  d.contacts.push({
    id: mockId('c'), businessId: lead.id, businessName: lead.businessName, contactDate: isoLocal(now), contactType: 'NOTE',
    contactStatus: 'NOTE', contactPerson: null, notes, nextAction: null, nextActionDate: null,
    userId: user.userId, username: user.username, outcome: null, createdAt: isoLocal(now),
  })
}

function phoneOrThrow(raw: string | null | undefined): string | null {
  if (!blank(raw)) return null
  const p = normPhone(raw)
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(p)) throw new HttpError(400, 'Numéro de téléphone invalide : 10 chiffres attendus', { phone: 'Format invalide' })
  return p
}

function createManual(d: Db, user: MockUser, body: BusinessCreateRequest, now: Date): BusinessDTO {
  const name = blank(body.businessName)
  if (!name) throw new HttpError(400, 'Le nom est requis', { businessName: 'Requis' })
  const phone = phoneOrThrow(body.phone)
  const city = blank(body.addressCity)
  if (!body.force) {
    const dup = exactDuplicate(d, { name, phone, city })
    if (dup) throw new HttpError(409, `Ce lead existe déjà : ${dup.businessName}`, undefined, { duplicate: dup })
  }
  const status: LeadStatus = body.leadStatus && LEAD_STATUSES.includes(body.leadStatus) && !TERMINAL.includes(body.leadStatus) ? body.leadStatus : 'NEW'
  const origin = blank(body.leadSource)
  const lead = newLead(now, {
    businessName: name,
    businessType: blank(body.businessType) ?? 'Autre',
    phone,
    email: blank(body.email),
    website: blank(body.website),
    addressStreet: blank(body.addressStreet),
    addressCity: city,
    postalCode: blank(body.postalCode)?.toUpperCase() ?? null,
    dataSource: 'Manuel',
    leadStatus: status,
    assignedToId: user.userId,
    assignedToName: user.username,
    sourceDetails: { 'Ajouté par': user.username, ...(origin ? { Origine: origin } : {}) },
    qualification: body.qualification && Object.keys(body.qualification).length ? body.qualification : null,
  })
  d.leads.push(lead)
  const notes = blank(body.notes)
  if (notes) noteContact(d, lead, user, notes, now)
  return lead
}

// ---------------------------------------------------------------- imports

interface StoredImport extends ImportUpload {
  rows: string[][]
  expiresAt: number
}
const imports = new Map<string, StoredImport>()

interface ImportRun {
  importId: string
  upload: StoredImport
  req: ImportRunRequest
  user: MockUser
  sourceName: string
  total: number
}
const runs = new Map<string, ImportRun>()
const IMPORT_JOB_MS = 3200

const FAKE_SHEET: string[][] = [
  ['Entreprise', 'Téléphone', 'Ville', 'Adresse', 'Courriel', 'Catégorie'],
  ['Garderie Les Petits Pas', '450 681-2290', 'Laval', '1840 boul. des Laurentides', 'info@petitspas.ca', 'Garderie'],
  ['Clinique vétérinaire Berri', '(514) 273-5518', 'Montréal', '3012 rue Berri', '', 'Clinique'],
  ['Bureau Tessier & Associés', '', 'Montréal', '455 rue Saint-Antoine O.', 'contact@tessier.ca', 'Bureau'],
  ['', '514 555 8812', 'Montréal', '', '', ''],
  ['Gym Atlas', '438 380 1177', 'Montréal', '9 av. Van Horne', '', 'Gym'],
  ['Résidence Les Cèdres', '450 667-0021', 'Laval', '55 rue Cartier', 'dir@lescedres.ca', 'Résidence'],
]

function storeUpload(name: string, size: number, text: string | null): ImportUpload {
  if (size > 10 * 1024 * 1024) throw new HttpError(413, 'Fichier trop volumineux (10 Mo max.)')
  if (!/\.(csv|tsv|txt|xlsx)$/i.test(name)) throw new HttpError(400, 'Format non supporté : CSV, TSV, TXT ou XLSX attendu', { file: 'Format invalide' })
  let rows: string[][]
  if (/\.xlsx$/i.test(name)) rows = FAKE_SHEET // no spreadsheet parser in the mock: pretend the first sheet looks like this
  else rows = parseDelimited(text ?? '', sniffDelimiter(text ?? ''))
  if (rows.length < 2) throw new HttpError(400, 'Le fichier doit contenir une ligne d’en-têtes et au moins une ligne de données', { file: 'Vide' })
  const columns = rows[0].map((c, i) => c || `Colonne ${i + 1}`)
  const data = rows.slice(1).map((r) => columns.map((_, i) => r[i] ?? ''))
  const up: StoredImport = {
    importId: mockId('i'),
    fileName: name,
    rowCount: data.length,
    columns,
    sampleRows: data.slice(0, 5),
    suggestedMapping: suggestMapping(columns),
    rows: data,
    expiresAt: Date.now() + 3600_000,
  }
  imports.set(up.importId, up)
  return publicUpload(up)
}

function publicUpload(u: StoredImport): ImportUpload {
  return { importId: u.importId, fileName: u.fileName, rowCount: u.rowCount, columns: u.columns, sampleRows: u.sampleRows, suggestedMapping: u.suggestedMapping }
}

function startImport(d: Db, user: MockUser, importId: string, req: ImportRunRequest, now: Date): ScraperJobDTO {
  const up = imports.get(importId)
  if (!up || up.expiresAt < Date.now()) throw new HttpError(404, 'Import introuvable ou expiré, renvoyez le fichier')
  const sourceName = (req.defaults?.sourceName ?? '').trim()
  if (!sourceName) throw new HttpError(400, 'Nom de la source requis', { sourceName: 'Requis' })
  const mapping: ImportMapping = req.mapping ?? {}
  if (!mapping.businessName) throw new HttpError(400, 'Associez une colonne au nom de l’entreprise', { businessName: 'Requis' })
  for (const f of IMPORT_FIELDS) if (mapping[f] && !up.columns.includes(mapping[f]!)) throw new HttpError(400, `Colonne inconnue : ${mapping[f]}`, { [f]: 'Colonne inconnue' })
  const full = `Import – ${sourceName}`
  let source = d.sources.find((s) => s.sourceName === full)
  if (!source) {
    source = { id: mockId('d'), sourceName: full, sourceType: 'MANUAL_FILE', sourceUrl: null, lastSync: null, syncFrequency: 'MANUAL', active: false, recordsCount: 0, configured: true }
    d.sources.push(source)
  }
  const job: ScraperJobDTO = {
    id: mockId('j'),
    source: { id: source.id, sourceName: source.sourceName, sourceType: source.sourceType, sourceUrl: null },
    jobType: 'MANUAL_SCRAPE',
    status: 'PENDING',
    startedAt: isoLocal(now),
    completedAt: null,
    recordsProcessed: 0,
    recordsAdded: 0,
    recordsUpdated: 0,
    errors: null,
    log: null,
    durationSeconds: null,
    createdAt: isoLocal(now),
  }
  d.jobs.unshift(job)
  runs.set(job.id, { importId, upload: up, req: { ...req, defaults: { ...req.defaults, sourceName } }, user, sourceName: full, total: up.rows.length })
  return job
}

function runRows(d: Db, run: ImportRun, now: Date) {
  const { upload: up, req, user } = run
  const m = req.mapping
  const col = (row: string[], f: keyof ImportMapping) => (m[f] ? (row[up.columns.indexOf(m[f]!)] ?? '').trim() : '')
  let added = 0
  let updated = 0
  let skipped = 0
  const invalid: string[] = []
  up.rows.forEach((row, i) => {
    const name = col(row, 'businessName')
    const phoneRaw = col(row, 'phone')
    const email = col(row, 'email')
    const street = col(row, 'addressStreet')
    const city = col(row, 'addressCity') || req.defaults.addressCity?.trim() || ''
    if (!name) return void invalid.push(`Ligne ${i + 2} : nom manquant`)
    if (!phoneRaw && !email && !street) return void invalid.push(`Ligne ${i + 2} : ni téléphone, ni courriel, ni adresse`)
    const phone = normPhone(phoneRaw)
    if (phoneRaw && !/^[2-9]\d{2}[2-9]\d{6}$/.test(phone)) return void invalid.push(`Ligne ${i + 2} : téléphone invalide (${phoneRaw})`)
    const dup = exactDuplicate(d, { name, phone, city })
    if (dup) {
      if (req.skipDuplicates) return void skipped++
      dup.email = dup.email ?? (email || null)
      dup.website = dup.website ?? (col(row, 'website') || null)
      dup.phone = dup.phone ?? (phone || null)
      dup.updatedAt = isoLocal(now)
      return void updated++
    }
    const notes = col(row, 'notes')
    const lead = newLead(now, {
      businessName: name,
      businessType: col(row, 'businessType') || req.defaults.businessType?.trim() || 'Autre',
      phone: phone || null,
      email: email || null,
      website: col(row, 'website') || null,
      addressStreet: street || null,
      addressCity: city || null,
      postalCode: col(row, 'postalCode').toUpperCase() || null,
      dataSource: run.sourceName,
      externalId: `${up.importId}:${i + 2}`,
      assignedToId: req.assignToMe ? user.userId : null,
      assignedToName: req.assignToMe ? user.username : null,
      qualification: col(row, 'decisionMaker') ? { decisionMaker: col(row, 'decisionMaker') } : null,
    })
    d.leads.push(lead)
    if (notes) noteContact(d, lead, user, notes, now)
    added++
  })
  return { added, updated, skipped, invalid }
}

/** Advance file-import jobs (called whenever job endpoints are hit). */
export function progressImportJobs(d: Db, now: Date): void {
  for (const job of d.jobs) {
    const run = runs.get(job.id)
    if (!run || (job.status !== 'RUNNING' && job.status !== 'PENDING')) continue
    const elapsed = now.getTime() - parseLocal(job.startedAt ?? job.createdAt).getTime()
    if (elapsed < 600) {
      job.status = 'PENDING'
      continue
    }
    job.status = 'RUNNING'
    job.recordsProcessed = Math.min(run.total - 1, Math.max(0, Math.round((elapsed / IMPORT_JOB_MS) * run.total)))
    if (elapsed < IMPORT_JOB_MS) continue
    const res = runRows(d, run, now)
    job.status = 'COMPLETED'
    job.completedAt = isoLocal(now)
    job.recordsProcessed = run.total
    job.recordsAdded = res.added
    job.recordsUpdated = res.updated
    job.skipped = res.skipped
    job.invalid = res.invalid.length
    job.durationSeconds = Math.max(1, Math.round(elapsed / 1000))
    job.log = [`Importation terminée : ${res.added} ajoutées, ${res.updated} mises à jour, ${res.skipped} ignorées, ${res.invalid.length} invalides`, ...res.invalid.slice(0, 50)].join('\n')
    const source = d.sources.find((s) => s.id === job.source?.id)
    if (source) {
      source.lastSync = isoLocal(now)
      source.recordsCount = (source.recordsCount ?? 0) + res.added
    }
    imports.delete(run.importId)
    runs.delete(job.id)
  }
}

// ---------------------------------------------------------------- OpenStreetMap

const ATTRIBUTION = '© OpenStreetMap contributors'
const CATEGORY_LABEL: Record<string, string> = {
  restaurant: 'Restaurant', clinic: 'Clinique', daycare: 'Garderie', office: 'Bureau', retail: 'Commerce',
  gym: 'Gym', school: 'École', hotel: 'Hôtel', senior: 'Résidence', pharmacy: 'Pharmacie',
}

type Fixture = Omit<DiscoverCandidate, 'existingLeadId' | 'email'> & { email?: string | null }
const f = (osmId: string, name: string, category: string, phone: string | null, street: string | null, city: string, postalCode: string | null, lat: number, lon: number, website: string | null = null): Fixture => ({
  osmId, name, category, phone, website, addressStreet: street, addressCity: city, postalCode, lat, lon,
})
// A fake Overpass answer (already mapped to candidates). Montréal and Laval only.
const FIXTURE: Fixture[] = [
  f('node/2810451', 'Café Résonance', 'restaurant', '+1 514-277-4410', '5532 av. du Parc', 'Montréal', 'H2V 4G8', 45.5231, -73.5985, 'https://caferesonance.example'),
  f('node/2810999', 'Bistro Le Petit Mile-End', 'restaurant', '(514) 273-0021', '48 rue Fairmount O.', 'Montréal', 'H2T 2M1', 45.5217, -73.5993),
  f('way/771204', 'Pizzeria Napoli Centre', 'restaurant', null, '6767 boul. Saint-Laurent', 'Montréal', 'H2S 3E1', 45.5334, -73.6188),
  f('node/3321870', 'Clinique dentaire Plateau', 'clinic', '514-843-9090', '1375 av. du Mont-Royal E.', 'Montréal', 'H2J 1Y7', 45.5337, -73.5718, 'https://dentaireplateau.example'),
  f('way/889101', 'Clinique Santé Rosemont', 'clinic', '+1 514 593 1200', '2900 boul. Rosemont', 'Montréal', 'H1Y 1K6', 45.5412, -73.5801),
  f('node/4410021', 'CPE Les Marmousets', 'daycare', '514-526-3340', '4015 rue de Bordeaux', 'Montréal', 'H2H 1Z5', 45.5359, -73.5742),
  f('way/902331', 'Garderie Soleil Levant', 'daycare', null, '7240 rue Saint-Denis', 'Montréal', 'H2R 2E3', 45.5379, -73.6086),
  f('node/5521004', 'Pharmacie Jean Coutu Papineau', 'pharmacy', '514-522-1181', '1700 av. Papineau', 'Montréal', 'H2K 4J5', 45.5290, -73.5588),
  f('node/5529012', 'Studio Pilates Villeray', 'gym', '438-381-6602', '7330 rue Saint-Hubert', 'Montréal', 'H2R 2N2', 45.5404, -73.6112),
  f('way/613050', 'Résidence Le Bel Âge', 'senior', '514-382-7755', '8100 rue Lajeunesse', 'Montréal', 'H2P 2E9', 45.5458, -73.6277),
  f('node/6610402', 'Restaurant Chez Mamie', 'restaurant', '450-688-9002', '1650 boul. Saint-Martin O.', 'Laval', 'H7S 1M9', 45.5629, -73.7330),
  f('way/994002', 'Clinique médicale Chomedey', 'clinic', '450-681-5511', '3500 boul. Notre-Dame', 'Laval', 'H7V 1S1', 45.5497, -73.7512),
  f('node/7720311', 'Garderie Les Petits Explorateurs', 'daycare', '450-663-4120', '780 boul. Curé-Labelle', 'Laval', 'H7V 2T9', 45.5702, -73.7385),
  f('node/7731200', 'Hôtel Cartier Laval', 'hotel', null, '2900 boul. Saint-Martin O.', 'Laval', 'H7T 2J2', 45.5651, -73.7458, 'https://hotelcartier.example'),
  f('way/995120', 'Bureau Comptable Delorme', 'office', '450-973-8800', '3030 boul. Le Carrefour', 'Laval', 'H7T 2P5', 45.5707, -73.7473),
]

function discover(d: Db, body: { city?: string; categories?: string[]; limit?: number }): { candidates: DiscoverCandidate[]; attribution: string } {
  const city = (body.city ?? '').trim()
  if (!city) throw new HttpError(400, 'La ville est requise', { city: 'Requis' })
  // Demo of the failure path: a city named "panne" behaves like an unreachable Overpass server.
  if (normalizeHeader(city) === 'panne') throw new HttpError(502, 'Le service de cartographie ne répond pas')
  const cats = body.categories?.length ? body.categories : null
  const limit = Math.max(1, Math.min(300, body.limit ?? 100))
  const known = d.leads.filter((l) => l.phone)
  const out = FIXTURE.filter((c) => sameCity(c.addressCity, city) && (!cats || cats.includes(c.category)))
    .slice(0, limit)
    .map<DiscoverCandidate>((c) => ({ ...c, email: c.email ?? null, existingLeadId: null }))
  // One candidate is a business we already have: reuse a seeded Montréal lead's phone so the match is real.
  const seeded = known.find((l) => sameCity(l.addressCity, 'Montréal') && l.businessType === 'Restaurant')
  const slot = out.find((c) => c.osmId === 'node/2810999')
  if (seeded && slot) {
    slot.name = seeded.businessName
    slot.phone = seeded.phone
    slot.addressCity = seeded.addressCity
  }
  for (const c of out) {
    const hit = exactDuplicate(d, { name: c.name, phone: c.phone, city: c.addressCity }) ?? d.leads.find((l) => l.externalId === c.osmId)
    c.existingLeadId = hit?.id ?? null
  }
  return { candidates: out, attribution: ATTRIBUTION }
}

function importCandidates(d: Db, user: MockUser, body: { candidates?: DiscoverCandidate[]; assignToMe?: boolean }, now: Date) {
  const leads: BusinessDTO[] = []
  let skipped = 0
  for (const c of body.candidates ?? []) {
    const exists = exactDuplicate(d, { name: c.name, phone: c.phone, city: c.addressCity }) ?? d.leads.find((l) => l.externalId === c.osmId)
    if (!c.name || exists) {
      skipped++
      continue
    }
    const lead = newLead(now, {
      businessName: c.name,
      businessType: CATEGORY_LABEL[c.category] ?? 'Autre',
      phone: normPhone(c.phone) || null,
      email: c.email,
      website: c.website,
      addressStreet: c.addressStreet,
      addressCity: c.addressCity,
      postalCode: c.postalCode,
      latitude: c.lat,
      longitude: c.lon,
      dataSource: 'OpenStreetMap',
      externalId: c.osmId,
      assignedToId: body.assignToMe ? user.userId : null,
      assignedToName: body.assignToMe ? user.username : null,
      sourceDetails: { 'Catégorie OSM': c.category, Source: 'OpenStreetMap' },
    })
    d.leads.push(lead)
    leads.push(lead)
  }
  return { added: leads.length, skipped, leads }
}

// ---------------------------------------------------------------- inbound website requests

const INBOUND_PEOPLE = ['Marie Tremblay', 'Jean-François Gagné', 'Sophie Bouchard', 'Karim Haddad', 'Isabelle Côté', 'Patrick Lavoie', 'Nadia Rossi', 'Olivier Pelletier']
const INBOUND_STREETS = ['rue Beaubien Est', 'av. Laurier Ouest', 'boul. Saint-Joseph', 'rue Sherbrooke Ouest', 'boul. des Laurentides']
let inboundCount = 0

/** A new request from the website: INTERESTED, due now, so it tops the call queue. Returns what to broadcast. */
export function createInbound(d: Db, now: Date): BusinessDTO {
  const i = inboundCount++
  const kind: 'booking' | 'contact' = i % 3 === 2 ? 'contact' : 'booking'
  const commercial = i % 4 === 1
  const name = INBOUND_PEOPLE[i % INBOUND_PEOPLE.length]
  const estimate = [261, 189, 420, 335, 148, 590][i % 6]
  const due = new Date(now.getTime() - 1000)
  const lead = newLead(now, {
    businessName: name,
    businessType: kind === 'contact' ? 'Demande web – contact' : commercial ? 'Demande web – commercial' : 'Demande web – résidentiel',
    phone: `514555${String(1200 + i * 37).padStart(4, '0')}`,
    email: `${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]+/g, '.')}@courriel.example`,
    addressStreet: `${120 + i * 17}, ${INBOUND_STREETS[i % INBOUND_STREETS.length]}`,
    addressCity: i % 2 ? 'Laval' : 'Montréal',
    dataSource: 'Site web',
    externalId: `${kind}:${1000 + i}`,
    leadStatus: 'INTERESTED',
    nextFollowUpAt: isoLocal(due),
    estimatedValue: kind === 'booking' ? estimate : null,
    sourceDetails:
      kind === 'booking'
        ? { Service: commercial ? 'Entretien commercial' : 'Ménage résidentiel', 'Date souhaitée': 'samedi 10:00', Fréquence: 'aux deux semaines', Estimation: `${estimate} $` }
        : { Service: 'Nettoyage après rénovation', Message: 'Bonjour, j’aimerais une soumission pour un 4 1/2.' },
  })
  lead.dataQualityScore = 88
  lead.qualification = { language: 'fr' }
  d.leads.push(lead)
  d.contacts.push({
    id: mockId('c'), businessId: lead.id, businessName: lead.businessName, contactDate: isoLocal(now), contactType: 'NOTE',
    contactStatus: 'NOTE', contactPerson: null, notes: kind === 'booking' ? 'Demande de réservation reçue sur le site' : 'Demande de contact reçue sur le site',
    nextAction: 'Rappeler', nextActionDate: lead.nextFollowUpAt, userId: null, username: null, outcome: null, createdAt: isoLocal(now),
  })
  emit('lead.inbound', { leadId: lead.id, leadName: lead.businessName, kind, at: isoLocal(now) })
  return lead
}

// ---------------------------------------------------------------- router

export function handle4(req: Req, d: Db, user: MockUser, now: Date): Result | null {
  const { method, path, query: q } = req
  let m: RegExpExecArray | null
  const writer = () => {
    if (user.role === 'VIEWER') throw new HttpError(403, 'Accès refusé pour votre rôle')
  }

  if (method === 'POST' && path === '/api/businesses') {
    writer()
    const lead = createManual(d, user, (req.body ?? {}) as BusinessCreateRequest, now)
    return { status: 201, json: lead }
  }
  if (method === 'GET' && path === '/api/businesses/duplicates') {
    writer()
    return { json: findDuplicates(d, { name: q.get('name'), phone: q.get('phone'), city: q.get('city') }) }
  }
  if (method === 'POST' && path === '/api/imports/files') {
    writer()
    const f = (req.body ?? {}) as { name?: string; size?: number; text?: string }
    return { status: 200, json: storeUpload(f.name ?? 'fichier.csv', f.size ?? 0, f.text ?? null) }
  }
  if ((m = /^\/api\/imports\/([^/]+)\/run$/.exec(path)) && method === 'POST') {
    writer()
    return { status: 202, json: startImport(d, user, m[1], (req.body ?? {}) as ImportRunRequest, now) }
  }
  if ((m = /^\/api\/imports\/([^/]+)$/.exec(path)) && method === 'GET') {
    writer()
    const up = imports.get(m[1])
    if (!up) throw new HttpError(404, 'Import introuvable ou expiré')
    return { json: publicUpload(up) }
  }
  if (method === 'POST' && path === '/api/discover/osm') {
    writer()
    return { json: discover(d, (req.body ?? {}) as { city?: string; categories?: string[]; limit?: number }) }
  }
  if (method === 'POST' && path === '/api/discover/osm/import') {
    writer()
    return { json: importCandidates(d, user, (req.body ?? {}) as { candidates?: DiscoverCandidate[]; assignToMe?: boolean }, now) }
  }
  return null
}
