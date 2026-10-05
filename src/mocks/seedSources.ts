// Demo data for the contract addendum 2 sources: leads without a phone from the
// business register and Montréal building permits (to enrich), and public
// tenders from CanadaBuys and SEAO. Deterministic, dev-only.
import type { BusinessDTO, DataSource, TenderDTO, TenderSource, TenderStatus } from '../api/types'
import { isoLocal, mockId, type Rng } from './seed'

export const NEW_SOURCE_NAMES = {
  register: 'Registre des entreprises du Québec',
  permits: 'Montréal - Permis de construction',
  canadabuys: "CanadaBuys - Appels d'offres",
  seao: 'SEAO - Avis et contrats',
} as const

export function makeNewSources(now: Date): DataSource[] {
  const ago = (days: number, h = 4) => {
    const d = new Date(now)
    d.setDate(d.getDate() - days)
    d.setHours(h, 5, 0, 0)
    return isoLocal(d)
  }
  return [
    { id: mockId('d'), sourceName: NEW_SOURCE_NAMES.register, sourceType: 'BULK_FILE', sourceUrl: 'https://www.donneesquebec.ca/recherche/dataset/registre-des-entreprises', lastSync: ago(6), syncFrequency: 'MONTHLY', active: true, recordsCount: 0 },
    { id: mockId('d'), sourceName: NEW_SOURCE_NAMES.permits, sourceType: 'CKAN_API', sourceUrl: 'https://donnees.montreal.ca/dataset/permis-construction', lastSync: ago(3), syncFrequency: 'WEEKLY', active: true, recordsCount: 0 },
    { id: mockId('d'), sourceName: NEW_SOURCE_NAMES.canadabuys, sourceType: 'CSV_DOWNLOAD', sourceUrl: 'https://canadabuys.canada.ca/en/tender-opportunities', lastSync: ago(0, 5), syncFrequency: 'DAILY', active: true, recordsCount: 0 },
    { id: mockId('d'), sourceName: NEW_SOURCE_NAMES.seao, sourceType: 'CKAN_API', sourceUrl: 'https://www.donneesquebec.ca/recherche/dataset/systeme-electronique-dappel-doffres-seao', lastSync: ago(12), syncFrequency: 'MONTHLY', active: true, recordsCount: 0 },
  ]
}

// ---------------------------------------------------------------- leads to enrich

interface Place {
  city: string
  postal: string[]
  streets: string[]
}
const PLACES: Place[] = [
  { city: 'Montréal', postal: ['H2J', 'H2T', 'H3B', 'H1V', 'H4C', 'H2X', 'H3H', 'H1Y', 'H4A', 'H2S'], streets: ['rue Saint-Denis', 'boul. Saint-Laurent', 'rue Sherbrooke Est', 'av. du Mont-Royal Est', 'rue Notre-Dame Ouest', 'rue Ontario Est', 'av. Laurier Ouest', 'rue Wellington', 'boul. Rosemont', 'rue Beaubien Est', 'rue Jean-Talon Est', 'av. Papineau'] },
  { city: 'Laval', postal: ['H7N', 'H7T', 'H7G', 'H7V'], streets: ['boul. Le Carrefour', 'boul. des Laurentides', 'boul. Saint-Martin Ouest', 'boul. Curé-Labelle', 'boul. Chomedey'] },
  { city: 'Longueuil', postal: ['J4K', 'J4H', 'J4J'], streets: ['rue Saint-Charles Ouest', 'chemin de Chambly', 'boul. Roland-Therrien', 'boul. Jacques-Cartier Est'] },
  { city: 'Brossard', postal: ['J4W', 'J4Z', 'J4X'], streets: ['boul. Taschereau', 'boul. de Rome', 'av. Panama', 'boul. du Quartier'] },
]

const FAMILY = ['Gagnon', 'Tremblay', 'Roy', 'Côté', 'Bouchard', 'Gauthier', 'Morin', 'Lavoie', 'Fortin', 'Gagné', 'Ouellet', 'Pelletier', 'Bélanger', 'Lévesque', 'Bergeron', 'Leblanc', 'Paquette', 'Girard', 'Simard', 'Boucher', 'Nguyen', 'Haddad', 'Rossi', 'Desjardins', 'Caron']
const PLACE_WORDS = ['du Plateau', 'Rosemont', 'Villeray', 'Saint-Michel', 'Ahuntsic', 'Hochelaga', 'Centre-Ville', 'des Érables', 'du Parc', 'Mont-Royal', 'Chomedey', 'Vieux-Longueuil', 'Quartier DIX30']

interface Sector {
  label: string // CAE-style activity description, as in the register
  type: string // our businessType
  weight: number
  name: (r: Rng) => string
}

const SECTORS: Sector[] = [
  { label: 'Cabinets de dentistes', type: 'Clinique dentaire', weight: 8, name: (r) => r.pick([`Clinique dentaire ${r.pick(FAMILY)} inc.`, `Centre dentaire ${r.pick(PLACE_WORDS)}`, `Dentistes ${r.pick(FAMILY)} & ${r.pick(FAMILY)} s.e.n.c.`]) },
  { label: "Bureaux d'avocats", type: 'Bureau', weight: 7, name: (r) => r.pick([`${r.pick(FAMILY)} ${r.pick(FAMILY)} avocats s.e.n.c.r.l.`, `Cabinet juridique ${r.pick(FAMILY)} inc.`]) },
  { label: 'Bureaux de comptables', type: 'Bureau', weight: 6, name: (r) => r.pick([`${r.pick(FAMILY)} CPA inc.`, `Groupe conseil ${r.pick(FAMILY)} comptables`]) },
  { label: 'Cabinets de médecins', type: 'Clinique médicale', weight: 6, name: (r) => r.pick([`Clinique médicale ${r.pick(PLACE_WORDS)}`, `Polyclinique ${r.pick(FAMILY)} inc.`, `GMF ${r.pick(PLACE_WORDS)}`]) },
  { label: 'Services de garde à l’enfance', type: 'Garderie', weight: 6, name: (r) => r.pick(['Garderie Les Petits Génies inc.', 'Garderie éducative Arc-en-ciel', 'Garderie Les Bout’choux', 'Garderie Soleil Levant inc.', 'Garderie Les Petits Explorateurs']) },
  { label: 'Restaurants à service complet', type: 'Restaurant', weight: 6, name: (r) => r.pick([`Restaurant ${r.pick(FAMILY)} inc.`, 'Bistro Le Saint-Urbain inc.', 'Brasserie Le Trèfle', 'Restaurant La Tablée du Parc', 'Café Olimpico Laval inc.']) },
  { label: 'Centres de conditionnement physique', type: 'Centre sportif', weight: 4, name: (r) => r.pick([`Énergie Cardio ${r.pick(PLACE_WORDS)}`, `Studio Pilates ${r.pick(FAMILY)}`, 'CrossFit Rive-Sud inc.', 'Club de boxe Le Ring']) },
  { label: 'Gestionnaires de biens immobiliers', type: 'Gestion immobilière', weight: 5, name: (r) => r.pick([`Gestion immobilière ${r.pick(FAMILY)} inc.`, `Immeubles ${r.pick(FAMILY)} & fils`, `Groupe immobilier ${r.pick(PLACE_WORDS)}`]) },
  { label: 'Syndicats de copropriété', type: 'Syndicat de copropriété', weight: 5, name: (r) => r.pick(['Syndicat de copropriété Le Castelnau', 'Syndicat des copropriétaires Les Jardins Laurier', 'Syndicat de copropriété Le 1200 Saint-Alexandre', 'Syndicat de la copropriété Château Brossard', 'Syndicat Les Terrasses du Canal']) },
  { label: 'Écoles de langues et de formation', type: 'École', weight: 3, name: (r) => r.pick(['École de langues Babel inc.', 'Centre de formation Pro-Tech', 'École de danse Pirouette', 'Académie de musique Allegro']) },
  { label: 'Bureaux administratifs', type: 'Bureau', weight: 4, name: (r) => `${r.int(9000, 9499)}-${String(r.int(1000, 9999))} Québec inc.` },
]

const EMPLOYEES = ['1 à 5', '6 à 10', '11 à 25', '26 à 49', '50 à 99']
const WORKS = ['Transformation', 'Construction neuve', 'Agrandissement', 'Transformation', 'Rénovation intérieure']
const USES = ['Bureaux', 'Commercial', 'Clinique médicale', 'Résidentiel – 24 logements', 'Résidentiel – 48 logements', 'Garderie', 'Mixte commercial / résidentiel', 'Restaurant']
const BOROUGHS = ['Le Plateau-Mont-Royal', 'Rosemont–La Petite-Patrie', 'Ville-Marie', 'Villeray–Saint-Michel–Parc-Extension', 'Ahuntsic-Cartierville', 'Le Sud-Ouest', 'Mercier–Hochelaga-Maisonneuve', 'Saint-Laurent', 'Côte-des-Neiges–Notre-Dame-de-Grâce']
const BUILDERS = () => [
  'Construction Bélanger inc.',
  'Développements Lavoie inc.',
  'Groupe immobilier Rossi',
  'Les Habitations Fortin inc.',
  'Rénovations Nguyen inc.',
  'Gestion Carré Saint-Louis inc.',
  'Constructions Desjardins & Caron',
  'Immeubles Haddad inc.',
  'Groupe Pelletier Construction',
  'Les Entreprises Girard ltée',
  'Habitations Mont-Royal inc.',
]

const money = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const fmtMoney = (n: number) => money.format(n).replace(/[\u202f\u00a0]/g, ' ')

function baseLead(r: Rng, place: Place, createdAt: Date): Omit<BusinessDTO, 'businessName' | 'businessType' | 'dataSource' | 'externalId' | 'sourceDetails'> {
  const iso = isoLocal(createdAt)
  return {
    id: mockId('b'),
    addressStreet: `${r.int(12, 9800)}, ${r.pick(place.streets)}`,
    addressCity: place.city,
    addressProvince: 'QC',
    postalCode: `${r.pick(place.postal)} ${r.int(1, 9)}${String.fromCharCode(65 + r.int(0, 25))}${r.int(1, 9)}`,
    phone: null,
    email: null,
    website: null,
    latitude: null,
    longitude: null,
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
  }
}

export function makeRegisterLead(r: Rng, createdAt: Date): BusinessDTO {
  const place = r.weighted(PLACES.map((p, i) => [p, [10, 4, 3, 3][i]] as const))
  const sector = r.weighted(SECTORS.map((s) => [s, s.weight] as const))
  const neq = `${r.pick(['11', '22', '33'])}${String(r.int(0, 99999999)).padStart(8, '0')}`
  const since = new Date(createdAt)
  since.setFullYear(since.getFullYear() - r.int(1, 28), r.int(0, 11), r.int(1, 28))
  const hasSite = r.chance(0.25)
  const name = sector.name(r)
  return {
    ...baseLead(r, place, createdAt),
    businessName: name,
    businessType: sector.type,
    dataSource: NEW_SOURCE_NAMES.register,
    externalId: neq,
    website: hasSite ? `https://www.${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 20)}.ca` : null,
    dataQualityScore: 18 + (hasSite ? 15 : 0) + r.int(0, 12),
    sourceDetails: {
      NEQ: neq,
      Secteur: sector.label,
      Employés: r.pick(EMPLOYEES),
      'Immatriculée le': isoLocal(since).slice(0, 10),
    },
  }
}

export function makePermitLead(r: Rng, createdAt: Date): BusinessDTO {
  const place = PLACES[0]
  const permitDate = new Date(createdAt)
  permitDate.setDate(permitDate.getDate() - r.int(2, 40))
  const cost = Math.round(r.int(50, 2400) * 1000 / 5000) * 5000
  const permitNo = `${r.pick(['3000', '3001'])}${String(r.int(100000, 999999))}`
  return {
    ...baseLead(r, place, createdAt),
    businessName: r.chance(0.18) ? `${r.int(9000, 9499)}-${String(r.int(1000, 9999))} Québec inc.` : r.pick(BUILDERS()),
    businessType: 'Chantier',
    dataSource: NEW_SOURCE_NAMES.permits,
    externalId: permitNo,
    dataQualityScore: 22 + r.int(0, 14),
    sourceDetails: {
      Travaux: r.pick(WORKS),
      Usage: r.pick(USES),
      'Coût estimé': fmtMoney(Math.max(50000, cost)),
      'Date du permis': isoLocal(permitDate).slice(0, 10),
      Arrondissement: r.pick(BOROUGHS),
      'No de permis': permitNo,
    },
  }
}

/** ~60 leads without a phone, created over the last three weeks. */
export function makeEnrichLeads(r: Rng, now: Date, n = 60): BusinessDTO[] {
  const out: BusinessDTO[] = []
  for (let i = 0; i < n; i++) {
    const created = new Date(now)
    created.setDate(created.getDate() - r.int(0, 20))
    created.setHours(4, r.int(0, 59), r.int(0, 59), 0)
    if (created > now) created.setDate(created.getDate() - 1)
    out.push(i % 5 < 3 ? makeRegisterLead(r, created) : makePermitLead(r, created))
  }
  return out
}

// ---------------------------------------------------------------- tenders

export const TENDER_KEYWORDS = ['nettoyage', 'entretien ménager', 'conciergerie', 'janitorial', 'custodial', 'cleaning', 'housekeeping']

interface TenderTemplate {
  source: TenderSource
  title: string
  buyer: string
  region: string | null
  category: string | null
  keywords?: string[]
}

const CB = 'CANADABUYS' as const
const SE = 'SEAO' as const

const TEMPLATES: TenderTemplate[] = [
  { source: CB, title: 'Janitorial services – Federal building, Montréal', buyer: 'Public Services and Procurement Canada', region: 'Québec (Montréal)', category: 'Services' },
  { source: CB, title: 'Custodial services – Shawinigan tax centre', buyer: 'Canada Revenue Agency', region: 'Québec (Mauricie)', category: 'Services' },
  { source: CB, title: 'Services de nettoyage – Bureau des passeports, Laval', buyer: 'Emploi et Développement social Canada', region: 'Québec (Laval)', category: 'Services' },
  { source: CB, title: 'Cleaning services for RCMP detachments – Quebec region', buyer: 'Royal Canadian Mounted Police', region: 'Québec', category: 'Services' },
  { source: CB, title: 'Housekeeping services – CFB Valcartier', buyer: 'National Defence', region: 'Québec (Capitale-Nationale)', category: 'Services' },
  { source: CB, title: 'Janitorial services – Lachine Canal National Historic Site', buyer: 'Parks Canada', region: 'Québec (Montréal)', category: 'Services' },
  { source: CB, title: 'National standing offer – Post-construction cleaning services', buyer: 'Public Services and Procurement Canada', region: 'National', category: 'Services', keywords: ['cleaning'] },
  { source: CB, title: 'Custodial services – Laval correctional institutions', buyer: 'Correctional Service Canada', region: 'Québec (Laval)', category: 'Services' },
  { source: CB, title: 'Services de conciergerie – Complexe Guy-Favreau', buyer: 'Services publics et Approvisionnement Canada', region: 'Québec (Montréal)', category: 'Services' },
  { source: CB, title: 'Laboratory cleaning – NRC Boucherville campus', buyer: 'National Research Council Canada', region: 'Québec (Montérégie)', category: 'Services' },
  { source: CB, title: 'Entretien ménager – Centre fiscal de Jonquière', buyer: 'Agence du revenu du Canada', region: 'Québec (Saguenay–Lac-Saint-Jean)', category: 'Services' },
  { source: CB, title: 'Janitorial and window cleaning – Port of Montréal administrative offices', buyer: 'Montreal Port Authority', region: 'Québec (Montréal)', category: 'Services' },
  { source: CB, title: 'Cleaning services – Service Canada Centre, Longueuil', buyer: 'Employment and Social Development Canada', region: 'Québec (Montérégie)', category: 'Services' },
  { source: CB, title: 'Housekeeping services – Ste. Anne’s Hospital', buyer: 'Veterans Affairs Canada', region: 'Québec (Montréal)', category: 'Services' },
  { source: SE, title: "Services d'entretien ménager – Centre de services scolaire de Laval", buyer: 'Centre de services scolaire de Laval', region: 'Laval', category: 'Services de nettoyage' },
  { source: SE, title: 'Entretien ménager des édifices municipaux', buyer: 'Ville de Longueuil', region: 'Montérégie', category: 'Services de nettoyage' },
  { source: SE, title: 'Services de conciergerie – Arénas et centres communautaires', buyer: 'Ville de Brossard', region: 'Montérégie', category: 'Services de nettoyage' },
  { source: SE, title: 'Entretien ménager – CLSC et points de service', buyer: 'CIUSSS du Centre-Sud-de-l’Île-de-Montréal', region: 'Montréal', category: 'Services de nettoyage' },
  { source: SE, title: 'Nettoyage de vitres et entretien ménager – Bibliothèques', buyer: 'Ville de Montréal – Arrondissement du Plateau-Mont-Royal', region: 'Montréal', category: 'Services de nettoyage' },
  { source: SE, title: "Services d'entretien ménager – Cégep Édouard-Montpetit", buyer: 'Cégep Édouard-Montpetit', region: 'Montérégie', category: 'Services de nettoyage' },
  { source: SE, title: 'Entretien ménager – Pavillons du campus central', buyer: 'Université du Québec à Montréal', region: 'Montréal', category: 'Services de nettoyage' },
  { source: SE, title: 'Services de conciergerie – Habitations à loyer modique, secteur Est', buyer: "Office municipal d'habitation de Montréal", region: 'Montréal', category: 'Services de nettoyage' },
  { source: SE, title: 'Entretien ménager – Gares et terminus', buyer: 'exo – Réseau de transport métropolitain', region: 'Montréal', category: 'Services de nettoyage' },
  { source: SE, title: 'Nettoyage des stations de métro – Ligne orange', buyer: 'Société de transport de Montréal', region: 'Montréal', category: 'Services de nettoyage' },
  { source: SE, title: "Services d'entretien ménager – Palais de justice de Longueuil", buyer: 'Société québécoise des infrastructures', region: 'Montérégie', category: 'Services de nettoyage' },
  { source: SE, title: 'Nettoyage après sinistre – Banque d’heures 2026-2028', buyer: 'Ville de Laval', region: 'Laval', category: 'Services de nettoyage' },
  { source: SE, title: 'Entretien ménager – Hôtel de ville et bureaux administratifs', buyer: 'Ville de Terrebonne', region: 'Lanaudière', category: 'Services de nettoyage' },
  { source: SE, title: "Services d'entretien ménager – Écoles secondaires", buyer: 'Centre de services scolaire Marguerite-Bourgeoys', region: 'Montréal', category: 'Services de nettoyage' },
  { source: SE, title: 'Entretien ménager – Résidences étudiantes', buyer: 'Université de Montréal', region: 'Montréal', category: 'Services de nettoyage' },
  { source: SE, title: 'Désinfection et entretien ménager – Cliniques externes', buyer: 'CISSS de Laval', region: 'Laval', category: 'Services de nettoyage' },
  { source: SE, title: 'Entretien ménager – Succursales et bureaux, région de Montréal', buyer: 'Société des alcools du Québec', region: 'Montréal', category: 'Services de nettoyage' },
  { source: SE, title: 'Services de conciergerie – Musée et réserves', buyer: "Musée d'art contemporain de Montréal", region: 'Montréal', category: 'Services de nettoyage' },
  { source: SE, title: 'Entretien ménager – Centres de services aux citoyens', buyer: 'Ville de Montréal – Service de la gestion et planification des immeubles', region: 'Montréal', category: 'Services de nettoyage' },
  { source: SE, title: 'Entretien ménager – Bureaux régionaux', buyer: 'Retraite Québec', region: 'Capitale-Nationale', category: 'Services de nettoyage' },
  { source: SE, title: 'Nettoyage industriel – Usine de filtration Atwater', buyer: 'Ville de Montréal – Service de l’eau', region: 'Montréal', category: 'Services de nettoyage', keywords: ['nettoyage'] },
  { source: SE, title: "Services d'entretien ménager – Centre de services scolaire des Patriotes", buyer: 'Centre de services scolaire des Patriotes', region: 'Montérégie', category: 'Services de nettoyage' },
]

/** Awarded contracts with a renewal / end date: who to approach before it ends. */
const AWARDED: (TenderTemplate & { winner: string; months: number })[] = [
  { source: SE, title: 'Entretien ménager – Écoles primaires, secteur Ouest', buyer: 'Centre de services scolaire des Mille-Îles', region: 'Laurentides', category: 'Contrat octroyé', winner: 'Services ménagers Roy inc.', months: 3 },
  { source: SE, title: 'Entretien ménager – Bibliothèques et centres culturels', buyer: 'Ville de Longueuil', region: 'Montérégie', category: 'Contrat octroyé', winner: 'Groupe Entretien Max inc.', months: 5 },
  { source: SE, title: 'Services de conciergerie – Immeubles administratifs', buyer: 'Ville de Laval', region: 'Laval', category: 'Contrat octroyé', winner: 'Conciergerie Saint-Laurent ltée', months: 7 },
  { source: SE, title: 'Entretien ménager – CHSLD et centres de jour', buyer: 'CISSS de la Montérégie-Centre', region: 'Montérégie', category: 'Contrat octroyé', winner: 'Entretien Impeccable inc.', months: 9 },
]

const STATUS_PLAN: TenderStatus[] = ['NEW', 'NEW', 'REVIEWING', 'NEW', 'BIDDING', 'NEW', 'IGNORED', 'NEW', 'REVIEWING', 'SUBMITTED', 'NEW', 'NEW', 'BIDDING', 'NEW', 'REVIEWING', 'NEW', 'NEW', 'IGNORED', 'NEW', 'SUBMITTED', 'NEW', 'BIDDING', 'NEW', 'REVIEWING', 'NEW', 'NEW', 'WON', 'NEW', 'LOST', 'NEW', 'NEW', 'REVIEWING', 'NEW', 'NEW', 'NEW', 'NEW']

const NOTES: Partial<Record<TenderStatus, string[]>> = {
  REVIEWING: ['Lire le devis : superficie et fréquence à valider.', 'Vérifier si l’assurance responsabilité de 5 M$ est exigée.'],
  BIDDING: ['Visite obligatoire des lieux – inscrite. Garantie de soumission 10 %.', 'Prix au pied carré à calculer avec Julien.'],
  SUBMITTED: ['Soumission déposée sur SEAO, accusé de réception reçu.', 'Déposée. Ouverture publique des soumissions prévue à 14 h 05.'],
  WON: ['Contrat octroyé à EcoNet, début le 1er novembre.'],
  LOST: ['Plus bas soumissionnaire conforme : écart de 8 %.'],
  IGNORED: ['Hors de notre zone de service.', 'Exige une cote de sécurité « Secret ».'],
}

function matchKeywords(title: string, fallback?: string[]): string[] {
  const t = title.toLowerCase()
  const found = TENDER_KEYWORDS.filter((k) => t.includes(k))
  return found.length ? found : fallback ?? ['nettoyage']
}

function externalIdFor(r: Rng, source: TenderSource): string {
  return source === 'CANADABUYS'
    ? `${r.pick(['W', 'EN', 'EW', '24062-'])}${r.int(1000, 9999)}-26${String(r.int(0, 9999)).padStart(4, '0')}/${r.pick(['A', 'B'])}`
    : `${r.int(1950000, 1999999)}`
}

function urlFor(source: TenderSource, externalId: string): string {
  return source === 'CANADABUYS'
    ? `https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/${encodeURIComponent(externalId.toLowerCase().replace(/\//g, '-'))}`
    : `https://seao.gouv.qc.ca/avis-resultat-recherche/consulter?ItemId=${externalId}`
}

function makeTender(r: Rng, now: Date, t: TenderTemplate, status: TenderStatus, closingOffsetDays: number): TenderDTO {
  const closing = new Date(now)
  closing.setDate(closing.getDate() + closingOffsetDays)
  closing.setHours(r.pick([11, 14, 14, 14, 15]), 0, 0, 0)
  if (closingOffsetDays === 0 && closing < now) closing.setHours(23, 0, 0, 0)
  const published = new Date(closing)
  published.setDate(published.getDate() - r.int(18, 40))
  published.setHours(r.int(8, 16), r.int(0, 59), 0, 0)
  const created = new Date(Math.min(now.getTime(), published.getTime() + 8 * 3600_000))
  const externalId = externalIdFor(r, t.source)
  const hasValue = r.chance(0.55)
  const notes = NOTES[status]
  return {
    id: mockId('t'),
    source: t.source,
    externalId,
    title: t.title,
    buyer: t.buyer,
    region: t.region,
    category: t.category,
    publishedAt: isoLocal(published),
    closingAt: isoLocal(closing),
    url: urlFor(t.source, externalId),
    estimatedValue: hasValue ? Math.round(r.int(25, 900) * 1000 / 5000) * 5000 || 25000 : null,
    matchedKeywords: matchKeywords(t.title, t.keywords),
    status,
    notes: notes && r.chance(0.8) ? r.pick(notes) : null,
    createdAt: isoLocal(created),
    updatedAt: isoLocal(created),
  }
}

/** ~40 tenders: closing dates spread from −10 to +45 days, plus a few awarded contracts. */
export function makeTenders(r: Rng, now: Date): TenderDTO[] {
  // A few close within 3 days so the countdown has something urgent to show.
  const offsets = [1, 2, 0, 3, 5, 6, 4, 8, 9, 11, 13, 14, 16, 18, 20, 21, 23, 25, 27, 29, 31, 33, 35, 37, 40, 42, 45, -1, -2, -4, -6, -8, -10, 12, 17, 26]
  const out = TEMPLATES.map((t, i) => {
    let status = STATUS_PLAN[i % STATUS_PLAN.length]
    const off = offsets[i % offsets.length]
    // Past closing: either we submitted / decided, or it simply lapsed.
    if (off < 0 && status === 'BIDDING') status = 'SUBMITTED'
    return makeTender(r, now, t, status, off)
  })
  for (const a of AWARDED) {
    const tender = makeTender(r, now, a, 'NEW', a.months * 30 + r.int(-10, 10))
    const awarded = new Date(now)
    awarded.setMonth(awarded.getMonth() - (36 - a.months))
    tender.publishedAt = isoLocal(awarded)
    tender.title = `${a.title} (octroyé à ${a.winner})`
    tender.matchedKeywords = matchKeywords(a.title)
    tender.estimatedValue = Math.round(r.int(180, 1400) * 1000 / 10000) * 10000
    out.push(tender)
  }
  return out
}

/** A fresh notice, as an import job would bring in. */
export function makeImportedTender(r: Rng, now: Date, source: TenderSource): TenderDTO {
  const pool = TEMPLATES.filter((t) => t.source === source)
  return makeTender(r, now, r.pick(pool), 'NEW', r.int(10, 45))
}
