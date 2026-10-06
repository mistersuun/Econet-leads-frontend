// Types mirroring the backend API contract. Dates are ISO-8601 strings without
// offset (server time zone America/Montreal), e.g. "2026-10-05T14:30:00".

export type Role = 'ADMIN' | 'USER' | 'VIEWER'

export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'INTERESTED'
  | 'QUOTE_SENT'
  | 'WON'
  | 'LOST'
  | 'DO_NOT_CALL'

export const LEAD_STATUSES: readonly LeadStatus[] = [
  'NEW',
  'CONTACTED',
  'INTERESTED',
  'QUOTE_SENT',
  'WON',
  'LOST',
  'DO_NOT_CALL',
]

export type CallOutcome =
  | 'NO_ANSWER'
  | 'VOICEMAIL'
  | 'CALLBACK'
  | 'INTERESTED'
  | 'NOT_INTERESTED'
  | 'QUOTE_SENT'
  | 'WON'
  | 'WRONG_NUMBER'
  | 'DO_NOT_CALL'

export const CALL_OUTCOMES: readonly CallOutcome[] = [
  'NO_ANSWER',
  'VOICEMAIL',
  'CALLBACK',
  'INTERESTED',
  'NOT_INTERESTED',
  'QUOTE_SENT',
  'WON',
  'WRONG_NUMBER',
  'DO_NOT_CALL',
]

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  tokenType: 'Bearer'
  userId: string
  username: string
  email: string
  role: Role
}

export interface CurrentUser {
  userId: string
  username: string
  email: string
  role: Role
}

export interface Page<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export interface BusinessDTO {
  id: string
  businessName: string
  businessType: string | null
  addressStreet: string | null
  addressCity: string | null
  addressProvince: string | null
  postalCode: string | null
  phone: string | null
  email: string | null
  website: string | null
  latitude: number | null
  longitude: number | null
  dataSource: string | null
  externalId: string | null
  dataQualityScore: number | null
  leadStatus: LeadStatus
  assignedToId: string | null
  assignedToName: string | null
  lastContactedAt: string | null
  nextFollowUpAt: string | null
  contactCount: number
  estimatedValue: number | null
  createdAt: string
  updatedAt: string
  lastVerified: string | null
  /**
   * Short source-specific facts to show the caller, e.g. a permit's
   * `{ "Travaux": "Transformation", "Coût estimé": "450 000 $" }`. Key order is display order.
   */
  sourceDetails?: Record<string, string> | null
}

export type LeadSortField =
  | 'createdAt'
  | 'businessName'
  | 'dataQualityScore'
  | 'lastContactedAt'
  | 'nextFollowUpAt'
  | 'addressCity'

export type SortDirection = 'ASC' | 'DESC'

export interface LeadListParams {
  page?: number
  size?: number
  sortBy?: LeadSortField
  sortDirection?: SortDirection
  q?: string
  leadStatus?: LeadStatus[]
  businessType?: string
  city?: string
  dataSource?: string
  hasPhone?: boolean
  assignedTo?: string // uuid or "me"
  minQualityScore?: number
  followUpDue?: boolean
}

/** Partial update accepted by PUT /api/businesses/{id}. */
export interface BusinessUpdateRequest {
  businessName?: string
  businessType?: string
  addressStreet?: string
  addressCity?: string
  postalCode?: string
  phone?: string
  email?: string
  website?: string
  estimatedValue?: number | null
  assignedToId?: string | null
}

/** PATCH /api/businesses/{id}/phone — the server normalises and validates (10-digit NANP, optional +1). */
export interface PhoneUpdateRequest {
  phone: string
}

export interface StatusUpdateRequest {
  status: LeadStatus
  note?: string
}

export interface LeadFilters {
  businessTypes: string[]
  cities: string[]
  dataSources: string[]
}

export type ContactType = 'APPEL' | 'EMAIL' | 'VISITE' | 'NOTE'

export interface ContactDTO {
  id: string
  businessId: string
  businessName: string
  contactDate: string
  contactType: ContactType
  contactStatus: string | null
  contactPerson: string | null
  notes: string | null
  nextAction: string | null
  nextActionDate: string | null
  userId: string | null
  username: string | null
  /** CallOutcome for calls logged via the call workflow; legacy rows may hold other values. */
  outcome: CallOutcome | string | null
  createdAt: string
}

export interface LogCallRequest {
  outcome: CallOutcome
  notes?: string
  contactPerson?: string
  nextFollowUpAt?: string
  estimatedValue?: number
}

export interface LogCallResponse {
  lead: BusinessDTO
  contact: ContactDTO
}

export interface DateRange {
  from: string // YYYY-MM-DD
  to: string // YYYY-MM-DD
}

export interface DashboardSummary {
  totalLeads: number
  callableLeads: number
  newLeads: number
  calls: number
  callsToday: number
  conversations: number
  quotesSent: number
  won: number
  conversionRate: number
  followUpsDue: number
  followUpsOverdue: number
  pipelineValue: number
  /** Leads without a phone whose status is not WON, LOST or DO_NOT_CALL. Optional until every backend serves it. */
  toEnrich?: number
}

export interface PipelineEntry {
  status: LeadStatus
  count: number
}

export interface ActivityPoint {
  date: string
  calls: number
  conversations: number
  won: number
}

export type BreakdownDimension = 'type' | 'city' | 'source'

export interface BreakdownRow {
  label: string
  total: number
  contacted: number
  won: number
}

export interface OutcomeCount {
  outcome: CallOutcome
  count: number
}

export interface LeaderboardRow {
  userId: string
  username: string
  calls: number
  conversations: number
  won: number
}

export type SourceType = 'CKAN_API' | 'WEB_SCRAPER' | 'CSV_DOWNLOAD' | 'BULK_FILE' | 'MANUAL'
export type SyncFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'MANUAL'

export interface DataSource {
  id: string
  sourceName: string
  sourceType: SourceType
  sourceUrl: string | null
  lastSync: string | null
  syncFrequency: SyncFrequency | null
  active: boolean
  recordsCount: number | null
  createdAt?: string
  updatedAt?: string
}

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
export type JobType = 'FULL_SYNC' | 'INCREMENTAL_SYNC' | 'MANUAL_SCRAPE'

/**
 * The contract lists flat `sourceId`/`sourceName`, but the existing backend DTO
 * nests them under `source`. Both shapes are accepted; use `jobSourceName()`.
 */
export interface ScraperJobDTO {
  id: string
  source?: { id: string; sourceName: string; sourceType: string; sourceUrl: string | null } | null
  sourceId?: string | null
  sourceName?: string | null
  jobType: JobType
  status: JobStatus
  startedAt: string | null
  completedAt: string | null
  recordsProcessed: number | null
  recordsAdded: number | null
  recordsUpdated: number | null
  errors: string | null
  log?: string | null
  durationSeconds: number | null
  createdAt: string
}

export interface JobStatistics {
  pending: number
  running: number
  completed: number
  failed: number
  cancelled: number
  total: number
  last24Hours: number
  totalRecordsProcessed: number
  totalRecordsAdded: number
  totalRecordsUpdated: number
}

export function jobSourceName(job: ScraperJobDTO): string {
  return job.source?.sourceName ?? job.sourceName ?? '—'
}

export function jobSourceId(job: ScraperJobDTO): string | null {
  return job.source?.id ?? job.sourceId ?? null
}

// ---- Public tenders (appels d'offres)

export type TenderStatus = 'NEW' | 'REVIEWING' | 'BIDDING' | 'SUBMITTED' | 'WON' | 'LOST' | 'IGNORED'

export const TENDER_STATUSES: readonly TenderStatus[] = ['NEW', 'REVIEWING', 'BIDDING', 'SUBMITTED', 'WON', 'LOST', 'IGNORED']

export type TenderSource = 'CANADABUYS' | 'SEAO'

export const TENDER_SOURCES: readonly TenderSource[] = ['CANADABUYS', 'SEAO']

export interface TenderDTO {
  id: string
  source: TenderSource
  externalId: string
  title: string
  buyer: string
  region: string | null
  category: string | null
  publishedAt: string | null
  closingAt: string | null
  url: string
  estimatedValue: number | null
  matchedKeywords: string[]
  status: TenderStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type TenderSortField = 'closingAt' | 'publishedAt' | 'createdAt'

export interface TenderListParams {
  page?: number
  size?: number
  status?: TenderStatus
  source?: TenderSource
  q?: string
  /** closingAt >= now */
  openOnly?: boolean
  sortBy?: TenderSortField
  sortDirection?: SortDirection
}

export interface TenderUpdateRequest {
  status?: TenderStatus
  notes?: string | null
}

export interface TenderSummary {
  open: number
  closingThisWeek: number
  bidding: number
  submitted: number
  won: number
}
