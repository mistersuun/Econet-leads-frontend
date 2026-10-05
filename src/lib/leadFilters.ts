import { LEAD_STATUSES, type LeadListParams, type LeadSortField, type LeadStatus, type SortDirection } from '../api/types'

/** Lead-list filters as they live in the URL query string of /leads. */
export interface LeadFilterState {
  q: string
  status: LeadStatus[]
  type: string
  city: string
  source: string
  phone: boolean
  mine: boolean
  due: boolean
  sort: LeadSortField
  dir: SortDirection
  page: number
  size: number
}

const SORTS: LeadSortField[] = ['createdAt', 'businessName', 'dataQualityScore', 'lastContactedAt', 'nextFollowUpAt', 'addressCity']

export const DEFAULT_FILTERS: LeadFilterState = {
  q: '',
  status: [],
  type: '',
  city: '',
  source: '',
  phone: false,
  mine: false,
  due: false,
  sort: 'createdAt',
  dir: 'DESC',
  page: 0,
  size: 25,
}

export function parseLeadFilters(sp: URLSearchParams): LeadFilterState {
  const sort = sp.get('sort') as LeadSortField | null
  const size = Number(sp.get('size'))
  return {
    q: sp.get('q') ?? '',
    status: (sp.get('status') ?? '')
      .split(',')
      .filter((s): s is LeadStatus => (LEAD_STATUSES as readonly string[]).includes(s)),
    type: sp.get('type') ?? '',
    city: sp.get('city') ?? '',
    source: sp.get('source') ?? '',
    phone: sp.get('phone') === '1',
    mine: sp.get('mine') === '1',
    due: sp.get('due') === '1',
    sort: sort && SORTS.includes(sort) ? sort : DEFAULT_FILTERS.sort,
    dir: sp.get('dir') === 'ASC' ? 'ASC' : 'DESC',
    page: Math.max(0, Number(sp.get('page')) || 0),
    size: [10, 25, 50, 100].includes(size) ? size : DEFAULT_FILTERS.size,
  }
}

export function serializeLeadFilters(f: Partial<LeadFilterState>): URLSearchParams {
  const full = { ...DEFAULT_FILTERS, ...f }
  const sp = new URLSearchParams()
  if (full.q) sp.set('q', full.q)
  if (full.status.length) sp.set('status', full.status.join(','))
  if (full.type) sp.set('type', full.type)
  if (full.city) sp.set('city', full.city)
  if (full.source) sp.set('source', full.source)
  if (full.phone) sp.set('phone', '1')
  if (full.mine) sp.set('mine', '1')
  if (full.due) sp.set('due', '1')
  if (full.sort !== DEFAULT_FILTERS.sort) sp.set('sort', full.sort)
  if (full.dir !== DEFAULT_FILTERS.dir) sp.set('dir', full.dir)
  if (full.page) sp.set('page', String(full.page))
  if (full.size !== DEFAULT_FILTERS.size) sp.set('size', String(full.size))
  return sp
}

export function leadsHref(f: Partial<LeadFilterState>): string {
  const s = serializeLeadFilters(f).toString()
  return s ? `/leads?${s}` : '/leads'
}

export function toListParams(f: LeadFilterState): LeadListParams {
  return {
    page: f.page,
    size: f.size,
    sortBy: f.sort,
    sortDirection: f.dir,
    q: f.q || undefined,
    leadStatus: f.status,
    businessType: f.type || undefined,
    city: f.city || undefined,
    dataSource: f.source || undefined,
    hasPhone: f.phone || undefined,
    assignedTo: f.mine ? 'me' : undefined,
    followUpDue: f.due || undefined,
  }
}

export function activeFilterCount(f: LeadFilterState): number {
  return [f.q, f.status.length, f.type, f.city, f.source, f.phone, f.mine, f.due].filter(Boolean).length
}
