import { differenceInCalendarDays, differenceInMinutes } from 'date-fns'
import {
  TENDER_SOURCES,
  TENDER_STATUSES,
  type SortDirection,
  type TenderDTO,
  type TenderListParams,
  type TenderSource,
  type TenderStatus,
} from '../api/types'
import { toDate } from './format'
import { PALETTE } from './status'

export const TENDER_STATUS_META: Record<TenderStatus, { label: string; color: string }> = {
  NEW: { label: 'Nouveau', color: PALETTE.gray },
  REVIEWING: { label: 'En analyse', color: PALETTE.blue },
  BIDDING: { label: 'En préparation', color: PALETTE.amber },
  SUBMITTED: { label: 'Soumis', color: PALETTE.plum },
  WON: { label: 'Gagné', color: PALETTE.green },
  LOST: { label: 'Perdu', color: PALETTE.terracotta },
  IGNORED: { label: 'Ignoré', color: PALETTE.darkGray },
}

export const TENDER_SOURCE_LABEL: Record<TenderSource, string> = {
  CANADABUYS: 'CanadaBuys',
  SEAO: 'SEAO',
}

/**
 * Awarded contracts imported from SEAO (not open calls): the contract carries no
 * dedicated field, so the importer marks them through `category`, and
 * `closingAt` holds the contract end / renewal date.
 */
export function isAwardedContract(t: Pick<TenderDTO, 'category'>): boolean {
  return /octroy|adjug|award/i.test(t.category ?? '')
}

export interface Countdown {
  text: string
  /** Open and closing in less than 3 days. */
  urgent: boolean
  past: boolean
}

/** "dans 5 h", "demain", "dans 12 jours", "fermé il y a 3 jours". */
export function closingCountdown(closingAt: string | null | undefined, now: Date = new Date()): Countdown {
  const d = toDate(closingAt)
  if (!d) return { text: 'Date non précisée', urgent: false, past: false }
  const mins = differenceInMinutes(d, now)
  const days = differenceInCalendarDays(d, now)
  if (mins < 0) {
    const ago = -days
    const text = ago === 0 ? 'fermé aujourd’hui' : ago === 1 ? 'fermé hier' : `fermé il y a ${ago} jours`
    return { text, urgent: false, past: true }
  }
  const urgent = mins < 3 * 24 * 60
  if (mins < 60) return { text: `dans ${Math.max(1, mins)} min`, urgent, past: false }
  if (days === 0) return { text: `dans ${Math.floor(mins / 60)} h`, urgent, past: false }
  if (days === 1) return { text: 'demain', urgent, past: false }
  if (days < 60) return { text: `dans ${days} jours`, urgent, past: false }
  return { text: `dans ${Math.round(days / 30)} mois`, urgent, past: false }
}

// ---- URL-synced filters for /tenders

export interface TenderFilterState {
  q: string
  status: TenderStatus | ''
  source: TenderSource | ''
  /** Default on: only closingAt >= now. */
  open: boolean
  dir: SortDirection
  page: number
  size: number
}

export const DEFAULT_TENDER_FILTERS: TenderFilterState = { q: '', status: '', source: '', open: true, dir: 'ASC', page: 0, size: 25 }

export function parseTenderFilters(sp: URLSearchParams): TenderFilterState {
  const status = sp.get('status') ?? ''
  const source = sp.get('source') ?? ''
  const size = Number(sp.get('size'))
  return {
    q: sp.get('q') ?? '',
    status: (TENDER_STATUSES as readonly string[]).includes(status) ? (status as TenderStatus) : '',
    source: (TENDER_SOURCES as readonly string[]).includes(source) ? (source as TenderSource) : '',
    open: sp.get('open') !== '0',
    dir: sp.get('dir') === 'DESC' ? 'DESC' : 'ASC',
    page: Math.max(0, Number(sp.get('page')) || 0),
    size: [25, 50, 100].includes(size) ? size : DEFAULT_TENDER_FILTERS.size,
  }
}

export function serializeTenderFilters(f: Partial<TenderFilterState>): URLSearchParams {
  const full = { ...DEFAULT_TENDER_FILTERS, ...f }
  const sp = new URLSearchParams()
  if (full.q) sp.set('q', full.q)
  if (full.status) sp.set('status', full.status)
  if (full.source) sp.set('source', full.source)
  if (!full.open) sp.set('open', '0')
  if (full.dir !== 'ASC') sp.set('dir', full.dir)
  if (full.page) sp.set('page', String(full.page))
  if (full.size !== DEFAULT_TENDER_FILTERS.size) sp.set('size', String(full.size))
  return sp
}

export function toTenderParams(f: TenderFilterState): TenderListParams {
  return {
    page: f.page,
    size: f.size,
    q: f.q || undefined,
    status: f.status || undefined,
    source: f.source || undefined,
    openOnly: f.open,
    sortBy: 'closingAt',
    sortDirection: f.dir,
  }
}

export function activeTenderFilterCount(f: TenderFilterState): number {
  return [f.q, f.status, f.source, !f.open].filter(Boolean).length
}
