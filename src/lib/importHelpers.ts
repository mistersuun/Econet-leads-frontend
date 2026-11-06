// Pure helpers for the file/paste import: delimiter sniffing, a small RFC-4180
// parser, pasted-text → CSV, header synonyms, live preview and row counts.
// The mock backend reuses the parsing and suggestion code, so the demo and the
// UI agree on how a file is read.
import { IMPORT_FIELDS, type ImportField, type ImportMapping, type ScraperJobDTO } from '../api/types'

export const FIELD_LABEL: Record<ImportField, string> = {
  businessName: 'Nom de l’entreprise',
  phone: 'Téléphone',
  email: 'Courriel',
  website: 'Site web',
  addressStreet: 'Adresse',
  addressCity: 'Ville',
  postalCode: 'Code postal',
  businessType: 'Type',
  notes: 'Notes',
  decisionMaker: 'Contact / responsable',
}

export type Delimiter = '\t' | ';' | ','

/** Picks the delimiter used most in the first non-empty line, ignoring quoted text. Tab wins ties (Excel paste). */
export function sniffDelimiter(text: string): Delimiter {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const counts: Record<Delimiter, number> = { '\t': 0, ';': 0, ',': 0 }
  let quoted = false
  for (const ch of line) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch in counts) counts[ch as Delimiter]++
  }
  const order: Delimiter[] = ['\t', ';', ',']
  return order.reduce((best, d) => (counts[d] > counts[best] ? d : best), order[0])
}

/** Parse delimited text (quotes, doubled quotes, newlines inside quotes). Blank lines are dropped. */
export function parseDelimited(text: string, delimiter: Delimiter = sniffDelimiter(text)): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const endCell = () => {
    row.push(cell)
    cell = ''
  }
  const endRow = () => {
    endCell()
    if (row.some((c) => c.trim() !== '')) rows.push(row)
    row = []
  }
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) endCell()
    else if (ch === '\n') endRow()
    else if (ch === '\r') {
      if (src[i + 1] === '\n') i++
      endRow()
    } else cell += ch
  }
  if (cell !== '' || row.length) endRow()
  return rows.map((r) => r.map((c) => c.trim()))
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export interface PasteResult {
  csv: string
  /** Rows without the header. */
  rowCount: number
  columns: string[]
}

/** Text pasted from Excel/Sheets (tab-separated) or a CSV snippet → clean comma-separated CSV with a header row. */
export function pasteToCsv(text: string): PasteResult | null {
  const rows = parseDelimited(text)
  if (rows.length < 2) return null
  const width = Math.max(...rows.map((r) => r.length))
  const padded = rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''))
  const columns = padded[0].map((c, i) => c || `Colonne ${i + 1}`)
  padded[0] = columns
  return { csv: toCsv(padded), rowCount: padded.length - 1, columns }
}

export function pasteToFile(text: string, name = 'collage.csv'): File | null {
  const res = pasteToCsv(text)
  return res ? new File(['\uFEFF' + res.csv], name, { type: 'text/csv' }) : null
}

// ---- header synonyms

export function normalizeHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Order matters: "code postal" must claim a column before "ville"/"adresse" can.
const SYNONYMS: [ImportField, string[]][] = [
  ['postalCode', ['code postal', 'postal code', 'postal', 'zip', 'cp']],
  ['businessName', ['nom', 'name', 'entreprise', 'company', 'compagnie', 'societe', 'business name', 'raison sociale', 'nom de l entreprise', 'business']],
  ['phone', ['telephone', 'phone', 'tel', 'tel.', 'cell', 'cellulaire', 'mobile', 'numero', 'numero de telephone']],
  ['email', ['courriel', 'email', 'e mail', 'mail', 'adresse courriel']],
  ['website', ['site', 'web', 'website', 'site web', 'url', 'siteweb']],
  ['addressCity', ['ville', 'city', 'municipalite']],
  ['addressStreet', ['adresse', 'address', 'rue', 'street', 'adresse civique']],
  ['businessType', ['type', 'categorie', 'category', 'secteur', 'industrie']],
  ['notes', ['notes', 'note', 'commentaire', 'commentaires', 'comments', 'remarques']],
  ['decisionMaker', ['contact', 'responsable', 'decideur', 'decision maker', 'personne contact', 'nom du contact']],
]

/** Guess which column feeds each field from header names (accent- and case-insensitive). */
export function suggestMapping(columns: string[]): ImportMapping {
  const norm = columns.map(normalizeHeader)
  const taken = new Set<number>()
  const out: ImportMapping = {}
  const pick = (field: ImportField, exact: boolean) => {
    const syns = SYNONYMS.find(([f]) => f === field)![1]
    const idx = norm.findIndex((n, i) => !taken.has(i) && (exact ? syns.includes(n) : syns.some((s) => s.length > 3 && n.includes(s))))
    if (idx >= 0) {
      taken.add(idx)
      out[field] = columns[idx]
    }
  }
  // Exact header matches first, then "contains" matches for what is still unmapped.
  for (const [f] of SYNONYMS) pick(f, true)
  for (const [f] of SYNONYMS) if (!out[f]) pick(f, false)
  for (const f of IMPORT_FIELDS) if (!out[f]) out[f] = null
  return out
}

// ---- preview and counts

function cellFor(columns: string[], row: string[], column: string | null | undefined): string {
  if (!column) return ''
  const i = columns.indexOf(column)
  return i >= 0 ? (row[i] ?? '').trim() : ''
}

/** The mapped fields of each row, for the live preview table. */
export function previewRows(columns: string[], rows: string[][], mapping: ImportMapping): Partial<Record<ImportField, string>>[] {
  return rows.map((r) => {
    const out: Partial<Record<ImportField, string>> = {}
    for (const f of IMPORT_FIELDS) if (mapping[f]) out[f] = cellFor(columns, r, mapping[f])
    return out
  })
}

export interface RowCounts {
  total: number
  missingName: number
  missingPhone: number
}

/** Rows lacking a name (will be rejected) or a phone (kept, but not callable). `defaults` do not count as a value. */
export function countMissing(columns: string[], rows: string[][], mapping: ImportMapping): RowCounts {
  let missingName = 0
  let missingPhone = 0
  for (const r of rows) {
    if (!cellFor(columns, r, mapping.businessName)) missingName++
    if (!cellFor(columns, r, mapping.phone)) missingPhone++
  }
  return { total: rows.length, missingName, missingPhone }
}

/** Drop unmapped fields so the request only carries real columns. */
export function cleanMapping(mapping: ImportMapping): ImportMapping {
  const out: ImportMapping = {}
  for (const f of IMPORT_FIELDS) if (mapping[f]) out[f] = mapping[f]
  return out
}

export function defaultSourceName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || 'Fichier'
}

// ---- job summary

export interface ImportCounts {
  added: number
  updated: number
  skipped: number
  invalid: number
}

function findCount(log: string, labels: string): number | null {
  // "label: N" / "label=N" first: in "added=1 skipped: 4" the "1 skipped" would otherwise win.
  const before = new RegExp(`(?:${labels})\\s*[:=]\\s*(\\d+)`, 'i').exec(log)
  if (before) return Number(before[1])
  const after = new RegExp(`(\\d+)\\s*(?:${labels})`, 'i').exec(log)
  return after ? Number(after[1]) : null
}

/** added/updated come from the job; skipped/invalid from its fields or, per the contract, the log summary. */
export function importCounts(job: Pick<ScraperJobDTO, 'recordsAdded' | 'recordsUpdated' | 'skipped' | 'invalid' | 'log'>): ImportCounts {
  const log = job.log ?? ''
  return {
    added: job.recordsAdded ?? 0,
    updated: job.recordsUpdated ?? 0,
    skipped: job.skipped ?? findCount(log, 'ignor[ée]e?s?|skipped|doublons? ignor[ée]s?') ?? 0,
    invalid: job.invalid ?? findCount(log, 'invalides?|invalid') ?? 0,
  }
}
