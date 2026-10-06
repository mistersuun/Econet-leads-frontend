// Deterministic demo data for mock mode: Quebec businesses, users, sources, and
// ~60 days of simulated calling history. Dev-only, never bundled in production.
import type { BusinessDTO, DataSource, ScraperJobDTO } from '../api/types'

export function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    weighted: <T,>(items: readonly (readonly [T, number])[]): T => {
      const total = items.reduce((s, [, w]) => s + w, 0)
      let r = next() * total
      for (const [v, w] of items) {
        r -= w
        if (r <= 0) return v
      }
      return items[items.length - 1][0]
    },
    chance: (p: number) => next() < p,
  }
}
export type Rng = ReturnType<typeof rng>

let uuidCounter = 0
export function mockId(prefix = 'a'): string {
  uuidCounter++
  const hex = uuidCounter.toString(16).padStart(12, '0')
  const p = prefix.padEnd(8, '0').slice(0, 8)
  return `${p}-0000-4000-8000-${hex}`
}

export interface MockUser {
  userId: string
  username: string
  email: string
  role: 'ADMIN' | 'USER' | 'VIEWER'
  password: string
}

export const USERS: MockUser[] = [
  { userId: 'u0000001-0000-4000-8000-000000000001', username: 'admin', email: 'admin@econet.ca', role: 'ADMIN', password: 'admin' },
  { userId: 'u0000001-0000-4000-8000-000000000002', username: 'marie.lavoie', email: 'marie@econet.ca', role: 'USER', password: 'demo' },
  { userId: 'u0000001-0000-4000-8000-000000000003', username: 'julien.roy', email: 'julien@econet.ca', role: 'USER', password: 'demo' },
  { userId: 'u0000001-0000-4000-8000-000000000004', username: 'lecteur', email: 'direction@econet.ca', role: 'VIEWER', password: 'demo' },
]

interface CityDef {
  name: string
  weight: number
  areaCodes: string[]
  postal: string[]
  streets: string[]
}

const CITIES: CityDef[] = [
  {
    name: 'Montréal',
    weight: 40,
    areaCodes: ['514', '438'],
    postal: ['H2J', 'H2T', 'H3B', 'H1V', 'H4C', 'H2X', 'H3H', 'H1Y', 'H4A'],
    streets: ['rue Saint-Denis', 'boul. Saint-Laurent', 'rue Sherbrooke Est', 'av. du Mont-Royal Est', 'rue Notre-Dame Ouest', 'rue Ontario Est', 'av. Laurier Ouest', 'rue Wellington', 'boul. Rosemont', 'rue Beaubien Est'],
  },
  { name: 'Laval', weight: 12, areaCodes: ['450'], postal: ['H7N', 'H7T', 'H7G'], streets: ['boul. Le Carrefour', 'boul. des Laurentides', 'boul. Saint-Martin Ouest', 'boul. Curé-Labelle'] },
  { name: 'Longueuil', weight: 9, areaCodes: ['450'], postal: ['J4K', 'J4H', 'J4J'], streets: ['rue Saint-Charles Ouest', 'chemin de Chambly', 'boul. Roland-Therrien'] },
  { name: 'Québec', weight: 12, areaCodes: ['418', '581'], postal: ['G1R', 'G1K', 'G1S', 'G2B'], streets: ['Grande Allée Est', 'rue Saint-Jean', 'boul. Charest Est', 'av. Cartier', '3e Avenue'] },
  { name: 'Gatineau', weight: 7, areaCodes: ['819', '873'], postal: ['J8X', 'J8Y', 'J9H'], streets: ['boul. Maloney Ouest', 'rue Principale', 'boul. Saint-Joseph'] },
  { name: 'Sherbrooke', weight: 6, areaCodes: ['819'], postal: ['J1H', 'J1J', 'J1E'], streets: ['rue King Ouest', 'rue Wellington Nord', 'boul. de Portland'] },
  { name: 'Trois-Rivières', weight: 4, areaCodes: ['819'], postal: ['G9A', 'G8T'], streets: ['rue des Forges', 'boul. des Récollets'] },
  { name: 'Brossard', weight: 4, areaCodes: ['450'], postal: ['J4W', 'J4Z'], streets: ['boul. Taschereau', 'boul. de Rome'] },
  { name: 'Terrebonne', weight: 3, areaCodes: ['450'], postal: ['J6W', 'J6X'], streets: ['boul. des Seigneurs', 'montée Masson'] },
  { name: 'Saint-Jérôme', weight: 3, areaCodes: ['450'], postal: ['J7Z', 'J7Y'], streets: ['rue Saint-Georges', 'boul. du Grand-Héron'] },
]

export const SOURCE_NAMES = {
  cpe: 'Données Québec - CPE',
  chsld: 'Données Québec - CHSLD',
  resto: 'Données Montréal - Restaurants',
  statcan: 'Statistics Canada - Healthcare Facilities',
  pj: 'Pages Jaunes - Manual Scraping',
} as const

interface TypeDef {
  type: string
  weight: number
  source: string
  value: [number, number]
  names: (r: Rng, city: string) => string
}

const CPE_WORDS = ['Les Petits Bourgeons', 'La Ribambelle', 'Les Lucioles', 'Le Jardin des Merveilles', 'Les Copains d’abord', 'La Marelle', 'Les Explorateurs', 'Le Petit Prince', 'Les Pommes de Reinette', 'La Courte Échelle', 'Les Bambins du Quartier', 'Les Coccinelles', 'Le Nid Douillet', 'Les Trois Pommes']
const SAINTS = ['Saint-Denis', 'Sainte-Catherine', 'Saint-Laurent', 'Saint-Michel', 'Sainte-Foy', 'Saint-Hubert', 'Saint-Roch', 'Sainte-Anne', 'Saint-Vincent', 'Saint-Charles']
const FAMILY = ['Gagnon', 'Tremblay', 'Roy', 'Côté', 'Bouchard', 'Gauthier', 'Morin', 'Lavoie', 'Fortin', 'Gagné', 'Ouellet', 'Pelletier', 'Bélanger', 'Lévesque', 'Bergeron', 'Leblanc', 'Paquette', 'Girard', 'Simard', 'Boucher', 'Nguyen', 'Haddad', 'Rossi']
const RESTO = ['Chez Ginette', 'Le Cartier', 'La Belle Province', 'Le Petit Bistro', 'Casa Luna', 'Pho Saigon', 'Le Fourquet', 'L’Assiette du Coin', 'La Cabane', 'Sushi Shino', 'Le Comptoir', 'Brasserie du Vieux', 'Le Saint-Bock', 'Taverne Normand', 'Olive & Gourmando']
const OFFICE = ['Cabinet comptable', 'Notaires', 'Avocats', 'Assurances', 'Courtiers immobiliers', 'Architectes', 'Ingénieurs-conseils']
const GYM = ['Studio Yoga', 'Énergie Cardio', 'Club Athlétique', 'CrossFit', 'Studio Pilates', 'Centre sportif']
const SHOP = ['Pharmacie', 'Boutique', 'Quincaillerie', 'Librairie', 'Fleuriste', 'Animalerie']

const TYPES: TypeDef[] = [
  { type: 'CPE', weight: 24, source: SOURCE_NAMES.cpe, value: [3600, 14000], names: (r) => `CPE ${r.pick(CPE_WORDS)}` },
  { type: 'Garderie', weight: 8, source: SOURCE_NAMES.pj, value: [2400, 9000], names: (r) => `Garderie ${r.pick(CPE_WORDS)}` },
  { type: 'Clinique médicale', weight: 14, source: SOURCE_NAMES.statcan, value: [4800, 22000], names: (r, c) => r.pick([`Clinique médicale ${r.pick(SAINTS)}`, `Clinique médicale de ${c}`, `GMF ${r.pick(SAINTS)}`, `Polyclinique ${r.pick(FAMILY)}`]) },
  { type: 'Clinique dentaire', weight: 10, source: SOURCE_NAMES.pj, value: [3000, 12000], names: (r) => r.pick([`Clinique dentaire ${r.pick(FAMILY)}`, `Centre dentaire ${r.pick(SAINTS)}`, `Dentistes ${r.pick(FAMILY)} & ${r.pick(FAMILY)}`]) },
  { type: 'CHSLD', weight: 6, source: SOURCE_NAMES.chsld, value: [12000, 48000], names: (r) => `CHSLD ${r.pick(SAINTS)}` },
  { type: 'Restaurant', weight: 20, source: SOURCE_NAMES.resto, value: [2400, 10000], names: (r) => r.pick([`Restaurant ${r.pick(RESTO)}`, `Bistro ${r.pick(RESTO)}`, `Café ${r.pick(FAMILY)}`, r.pick(RESTO)]) },
  { type: 'Bureau', weight: 12, source: SOURCE_NAMES.pj, value: [3000, 18000], names: (r) => `${r.pick(OFFICE)} ${r.pick(FAMILY)}${r.chance(0.4) ? ` & ${r.pick(FAMILY)}` : ''}` },
  { type: 'Centre sportif', weight: 5, source: SOURCE_NAMES.pj, value: [4000, 16000], names: (r) => `${r.pick(GYM)} ${r.pick(SAINTS)}` },
  { type: 'Commerce de détail', weight: 6, source: SOURCE_NAMES.pj, value: [1800, 7000], names: (r) => `${r.pick(SHOP)} ${r.pick(FAMILY)}` },
]

function slug(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 22)
}

export function makeLead(r: Rng, createdAt: Date, opts: { typeDef?: string } = {}): BusinessDTO {
  const t = opts.typeDef ? TYPES.find((x) => x.type === opts.typeDef) ?? TYPES[0] : r.weighted(TYPES.map((x) => [x, x.weight] as const))
  const city = r.weighted(CITIES.map((c) => [c, c.weight] as const))
  const name = t.names(r, city.name)
  const hasPhone = r.chance(0.9)
  const hasEmail = r.chance(0.45)
  const hasSite = r.chance(0.55)
  const phone = hasPhone ? `${r.pick(city.areaCodes)}${r.int(200, 989)}${String(r.int(0, 9999)).padStart(4, '0')}` : null
  const quality = Math.min(100, (hasPhone ? 40 : 10) + (hasEmail ? 20 : 0) + (hasSite ? 15 : 0) + r.int(0, 25))
  const iso = isoLocal(createdAt)
  return {
    id: mockId('b'),
    businessName: name,
    businessType: t.type,
    addressStreet: `${r.int(12, 9800)}, ${r.pick(city.streets)}`,
    addressCity: city.name,
    addressProvince: 'QC',
    postalCode: `${r.pick(city.postal)} ${r.int(1, 9)}${String.fromCharCode(65 + r.int(0, 25))}${r.int(1, 9)}`,
    phone,
    email: hasEmail ? `info@${slug(name)}.ca` : null,
    website: hasSite ? `https://www.${slug(name)}.ca` : null,
    latitude: null,
    longitude: null,
    dataSource: t.source,
    externalId: `EXT-${r.int(100000, 999999)}`,
    dataQualityScore: quality,
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
  }
}

export function estimateValue(r: Rng, type: string | null): number {
  const t = TYPES.find((x) => x.type === type) ?? TYPES[0]
  return Math.round(r.int(t.value[0], t.value[1]) / 100) * 100
}

export function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function makeSources(now: Date): DataSource[] {
  const ago = (days: number, h = 3) => {
    const d = new Date(now)
    d.setDate(d.getDate() - days)
    d.setHours(h, 12, 0, 0)
    return isoLocal(d)
  }
  return [
    { id: mockId('d'), sourceName: SOURCE_NAMES.cpe, sourceType: 'CKAN_API', sourceUrl: 'https://www.donneesquebec.ca/recherche/dataset/repertoire-des-installations-des-cpe', lastSync: ago(2), syncFrequency: 'WEEKLY', active: true, recordsCount: 0 },
    { id: mockId('d'), sourceName: SOURCE_NAMES.chsld, sourceType: 'CKAN_API', sourceUrl: 'https://www.donneesquebec.ca/recherche/dataset/chsld', lastSync: ago(9), syncFrequency: 'MONTHLY', active: true, recordsCount: 0 },
    { id: mockId('d'), sourceName: SOURCE_NAMES.resto, sourceType: 'CKAN_API', sourceUrl: 'https://donnees.montreal.ca/dataset/inspection-aliments-contrevenants', lastSync: ago(1), syncFrequency: 'WEEKLY', active: true, recordsCount: 0 },
    { id: mockId('d'), sourceName: SOURCE_NAMES.statcan, sourceType: 'CSV_DOWNLOAD', sourceUrl: 'https://www150.statcan.gc.ca/n1/pub/13-26-0001/', lastSync: ago(21), syncFrequency: 'MONTHLY', active: true, recordsCount: 0 },
    { id: mockId('d'), sourceName: SOURCE_NAMES.pj, sourceType: 'WEB_SCRAPER', sourceUrl: 'https://www.pagesjaunes.ca', lastSync: ago(14), syncFrequency: 'MANUAL', active: false, recordsCount: 0 },
  ]
}

export function makeHistoricalJobs(sources: DataSource[], now: Date, r: Rng): ScraperJobDTO[] {
  const jobs: ScraperJobDTO[] = []
  for (let i = 0; i < 14; i++) {
    const s = sources[i % sources.length]
    const start = new Date(now)
    start.setDate(start.getDate() - (i * 4 + 1))
    start.setHours(3, r.int(0, 50), 0, 0)
    const duration = r.int(12, 240)
    const end = new Date(start.getTime() + duration * 1000)
    const failed = i === 3 || i === 10
    const processed = failed ? r.int(0, 40) : r.int(80, 1600)
    jobs.push({
      id: mockId('j'),
      source: { id: s.id, sourceName: s.sourceName, sourceType: s.sourceType, sourceUrl: s.sourceUrl },
      jobType: i % 3 === 0 ? 'FULL_SYNC' : 'INCREMENTAL_SYNC',
      status: failed ? 'FAILED' : 'COMPLETED',
      startedAt: isoLocal(start),
      completedAt: isoLocal(end),
      recordsProcessed: processed,
      recordsAdded: failed ? 0 : r.int(0, Math.floor(processed / 10)),
      recordsUpdated: failed ? 0 : r.int(0, Math.floor(processed / 4)),
      errors: failed ? 'HTTP 503 Service Unavailable — le portail de données ne répond pas.' : null,
      durationSeconds: duration,
      createdAt: isoLocal(start),
    })
  }
  return jobs
}

export const NOTES: Record<string, string[]> = {
  NO_ANSWER: ['', 'Sonne dans le vide.', 'Aucune réponse, réessayer en matinée.'],
  VOICEMAIL: ['Message laissé sur la boîte vocale.', 'Boîte vocale de la réception, message laissé.', ''],
  CALLBACK: ['La directrice est en réunion, rappeler jeudi.', 'Demande de rappeler après 14h.', 'Responsable absent cette semaine.'],
  INTERESTED: ['Contrat actuel se termine en décembre, intéressés par une soumission.', 'Veulent un entretien 3x/semaine, demander visite.', 'Insatisfaits du fournisseur actuel.'],
  NOT_INTERESTED: ['Ont déjà un contrat de 3 ans.', 'Font l’entretien à l’interne.', 'Pas de budget cette année.'],
  QUOTE_SENT: ['Soumission envoyée par courriel.', 'Devis envoyé après la visite des lieux.', 'Soumission pour entretien hebdomadaire envoyée.'],
  WON: ['Contrat signé, début le 1er du mois.', 'Contrat d’un an signé!', 'Accepté — démarrage lundi prochain.'],
  WRONG_NUMBER: ['Numéro hors service.', 'Ce n’est pas le bon commerce.'],
  DO_NOT_CALL: ['Demande à ne plus être sollicité.', 'Fermé définitivement.'],
}

export const CONTACT_PEOPLE = ['Mme Gagnon (directrice)', 'M. Tremblay', 'Julie, réception', 'Sylvie Côté', 'Marc-André Roy (gérant)', 'Dre Pelletier', 'Nathalie', 'M. Haddad (propriétaire)', '']
