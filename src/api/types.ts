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
  /** Addendum 3: quality blended with observed conversion by type (0–100). */
  priorityScore?: number | null
  /** Addendum 3: structured facts captured during calls. */
  qualification?: Qualification | null
  /** Addendum 3: who holds the claim on this lead right now (queue items). */
  claimedBy?: { userId: string; username: string } | null
}

// ---- Addendum 3: qualification

export type FrequencyWanted = 'weekly' | 'bi-weekly' | 'monthly' | 'one-time'
export type ScriptLanguage = 'fr' | 'en'

export const PAIN_POINTS = ['qualité', 'prix', 'fiabilité', 'produits', 'horaire', 'autre'] as const
export type PainPoint = (typeof PAIN_POINTS)[number]

export interface Qualification {
  decisionMaker?: string
  role?: string
  directPhone?: string
  email?: string
  /** "none" | "in-house" | a company name */
  currentProvider?: string | null
  /** YYYY-MM-DD */
  contractEndsAt?: string | null
  sizeSqft?: number | null
  employees?: number | null
  frequencyWanted?: FrequencyWanted | null
  painPoints?: string[]
  language?: ScriptLanguage | null
  bestTimeToCall?: string | null
  notes?: string
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
  /** Addendum 3: call length, when the caller used the timer. */
  durationSeconds?: number | null
}

export interface LogCallRequest {
  outcome: CallOutcome
  notes?: string
  contactPerson?: string
  nextFollowUpAt?: string
  estimatedValue?: number
  /** Addendum 3 */
  durationSeconds?: number
  qualification?: Qualification
  /** Only for NO_ANSWER / VOICEMAIL / CALLBACK: sets nextFollowUpAt without changing status. */
  snoozeUntil?: string
}

export interface QueueParams {
  size?: number
  businessType?: string[]
  city?: string[]
  sourceIn?: string[]
  minQualityScore?: number
  followUpsOnly?: boolean
  newOnly?: boolean
}

export interface SnoozeRequest {
  until: string
  reason?: string
}

export interface ClaimResponse {
  leadId: string
  userId: string
  username: string
  expiresAt: string
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

// ---- Addendum 3: scripts

export type ScriptSectionKey = 'opening' | 'questions' | 'objections' | 'closing'
export const SCRIPT_SECTION_KEYS: readonly ScriptSectionKey[] = ['opening', 'questions', 'objections', 'closing']

export interface ScriptSection {
  key: ScriptSectionKey
  title: string
  body: string
}

export interface CallScript {
  id: string
  name: string
  /** null = default script for the language */
  businessType: string | null
  language: ScriptLanguage
  sections: ScriptSection[]
  active?: boolean
  updatedAt?: string
  /** True when no script matched the requested type and the default was served. */
  fallback?: boolean
}

export interface ScriptUpsert {
  name: string
  businessType: string | null
  language: ScriptLanguage
  sections: ScriptSection[]
  active?: boolean
}

// ---- Addendum 3: targets, today, team

export interface UserTargets {
  dailyCallTarget: number
  dailyConversationTarget: number
}

export interface TodayStats {
  callsToday: number
  conversationsToday: number
  quotesToday: number
  wonToday: number
  callTarget: number
  conversationTarget: number
  streakDays: number
  bestDayCalls: number
  rankToday: { position: number; of: number }
}

export type PresenceStatus = 'idle' | 'calling' | 'offline'

export interface TeamTodayRow {
  userId: string
  username: string
  callsToday: number
  conversationsToday: number
  status: PresenceStatus
  currentLeadName: string | null
}

// ---- Addendum 3: dashboard insights

export interface Funnel {
  dials: number
  connects: number
  conversations: number
  interested: number
  quotes: number
  won: number
}

export interface BestHourCell {
  /** ISO day of week, 1 = Monday */
  dow: number
  hour: number
  calls: number
  connects: number
  positive: number
}

export interface ConversionByTypeRow {
  businessType: string
  leadsCalled: number
  conversations: number
  positive: number
  rate: number
}

// ---- Addendum 3: email

export type EmailTemplateKey = 'quote_followup' | 'visit_confirmation' | 'missed_you' | 'intro'
export const EMAIL_TEMPLATE_KEYS: readonly EmailTemplateKey[] = ['quote_followup', 'visit_confirmation', 'missed_you', 'intro']

export interface EmailStatus {
  configured: boolean
  from?: string | null
}

export interface EmailTemplate {
  id: string
  key: EmailTemplateKey
  language: ScriptLanguage
  subject: string
  body: string
  active: boolean
}

export interface EmailTemplateUpdate {
  subject?: string
  body?: string
  active?: boolean
}

// Pricing mirrors the website's src/app/shared/pricing.ts.
export type ServiceId = 'residential' | 'commercial' | 'deep_cleaning' | 'post_construction'
export type AreaRange = 'under_800' | '800_1500' | '1500_2500' | 'over_2500'
export type PropertyType = 'apartment' | 'house' | 'townhouse' | 'office' | 'retail'

export interface EstimateInput {
  service: ServiceId | '' | null
  area: AreaRange | '' | null
  propertyType: PropertyType | '' | null
  addOnIds: string[]
  frequency: string
}

export interface Estimate {
  base: number
  areaMultiplier: number
  areaAdjustment: number
  propertyTypeMultiplier: number
  propertyTypeAdjustment: number
  addOns: { id: string; name: string; price: number }[]
  addOnsTotal: number
  beforeDiscount: number
  discountRate: number
  discount: number
  subtotal: number
  taxes: number
  total: number
  quoteRequired: boolean
}

export interface SendEmailRequest {
  templateKey: EmailTemplateKey
  language: ScriptLanguage
  to?: string
  estimate?: EstimateInput
  /** "YYYY-MM-DDTHH:mm:ss" local; adds an ICS invite. */
  visitAt?: string
  extraNote?: string
}

export interface EmailPreview {
  subject: string
  body: string
}

export interface SendEmailResponse {
  contact: ContactDTO
  preview: EmailPreview
}

// ---- Addendum 3: notifications

export type NotificationKind = 'follow_up_due' | 'follow_up_overdue' | 'claim_expired' | 'tender_closing'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  leadId?: string | null
  tenderId?: string | null
  at: string
}

// ---- Addendum 3: server-sent events

export interface PresenceUser {
  userId: string
  username: string
  status: PresenceStatus
  leadId?: string | null
  leadName?: string | null
  since: string
}

export interface LiveEventMap {
  presence: { users: PresenceUser[] }
  'lead.claimed': { leadId: string; leadName: string; userId: string; username: string; expiresAt: string }
  'lead.released': { leadId: string; userId: string }
  'call.logged': {
    contactId: string
    leadId: string
    leadName: string
    userId: string
    username: string
    outcome: CallOutcome
    durationSeconds: number | null
    at: string
  }
  'lead.updated': { leadId: string; leadStatus: LeadStatus; nextFollowUpAt: string | null }
  'target.progress': { userId: string; callsToday: number; conversationsToday: number; target: number }
  'tender.updated': { tenderId: string; status: TenderStatus }
}

export type LiveEventType = keyof LiveEventMap

export const LIVE_EVENT_TYPES: readonly LiveEventType[] = [
  'presence',
  'lead.claimed',
  'lead.released',
  'call.logged',
  'lead.updated',
  'target.progress',
  'tender.updated',
]

export type LiveEvent = {
  [K in LiveEventType]: { type: K; data: LiveEventMap[K]; id: string; at: number }
}[LiveEventType]
