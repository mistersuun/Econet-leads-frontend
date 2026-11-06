import { apiDownload, apiFetch, apiUpload, type Query, type UploadProgress } from './client'
import type {
  ActivityPoint,
  AppNotification,
  BestHourCell,
  CallScript,
  ClaimResponse,
  ConversionByTypeRow,
  EmailPreview,
  EmailStatus,
  EmailTemplate,
  EmailTemplateUpdate,
  Estimate,
  EstimateInput,
  Funnel,
  Qualification,
  QueueParams,
  ScriptLanguage,
  ScriptUpsert,
  SendEmailRequest,
  SendEmailResponse,
  SnoozeRequest,
  TeamTodayRow,
  TodayStats,
  UserTargets,
  AuthResponse,
  BreakdownDimension,
  BreakdownRow,
  BusinessCreateRequest,
  BusinessDTO,
  BusinessUpdateRequest,
  DiscoverImportResponse,
  DiscoverRequest,
  DiscoverResponse,
  DiscoverCandidate,
  DuplicateQuery,
  ImportRunRequest,
  ImportUpload,
  ContactDTO,
  CurrentUser,
  DataSource,
  DateRange,
  DashboardSummary,
  JobStatistics,
  LeadFilters,
  LeadListParams,
  LeaderboardRow,
  LogCallRequest,
  LogCallResponse,
  OutcomeCount,
  Page,
  PipelineEntry,
  ScraperJobDTO,
  StatusUpdateRequest,
  TenderDTO,
  TenderListParams,
  TenderSummary,
  TenderUpdateRequest,
} from './types'

// ---- Auth
export const login = (username: string, password: string) =>
  apiFetch<AuthResponse>('/api/auth/login', { method: 'POST', body: { username, password }, anonymous: true })
export const getMe = () => apiFetch<CurrentUser>('/api/auth/me')

// ---- Leads
export function leadQuery(p: LeadListParams): Query {
  return {
    page: p.page,
    size: p.size,
    sortBy: p.sortBy,
    sortDirection: p.sortDirection,
    q: p.q,
    leadStatus: p.leadStatus && p.leadStatus.length ? p.leadStatus : undefined,
    businessType: p.businessType,
    city: p.city,
    dataSource: p.dataSource,
    // `false` is meaningful (leads without a phone), so only drop it when unset.
    hasPhone: p.hasPhone,
    assignedTo: p.assignedTo,
    minQualityScore: p.minQualityScore,
    followUpDue: p.followUpDue || undefined,
  }
}

export const listLeads = (p: LeadListParams) => apiFetch<Page<BusinessDTO>>('/api/businesses', { query: leadQuery(p) })
export const getLead = (id: string) => apiFetch<BusinessDTO>(`/api/businesses/${id}`)
export const updateLead = (id: string, body: BusinessUpdateRequest) =>
  apiFetch<BusinessDTO>(`/api/businesses/${id}`, { method: 'PUT', body })
export const updateLeadStatus = (id: string, body: StatusUpdateRequest) =>
  apiFetch<BusinessDTO>(`/api/businesses/${id}/status`, { method: 'PATCH', body })
export const updateLeadPhone = (id: string, phone: string) =>
  apiFetch<BusinessDTO>(`/api/businesses/${id}/phone`, { method: 'PATCH', body: { phone } })
export const createLead = (body: BusinessCreateRequest) => apiFetch<BusinessDTO>('/api/businesses', { method: 'POST', body })
/** Live "existe déjà ?" hints (max 5). */
export const findDuplicates = (q: DuplicateQuery, signal?: AbortSignal) =>
  apiFetch<BusinessDTO[]>('/api/businesses/duplicates', { query: { name: q.name, phone: q.phone, city: q.city }, signal })
export const getLeadFilters = () => apiFetch<LeadFilters>('/api/businesses/filters')
export const exportLeadsCsv = (p: LeadListParams) => {
  const q = leadQuery(p)
  delete q.page
  delete q.size
  return apiDownload('/api/businesses/export.csv', q)
}

// ---- Calling
export const getQueue = (p: QueueParams | number = 20) => {
  const params: QueueParams = typeof p === 'number' ? { size: p } : p
  return apiFetch<BusinessDTO[]>('/api/leads/queue', {
    query: {
      size: params.size ?? 20,
      businessType: params.businessType?.length ? params.businessType : undefined,
      city: params.city?.length ? params.city : undefined,
      sourceIn: params.sourceIn?.length ? params.sourceIn : undefined,
      minQualityScore: params.minQualityScore,
      followUpsOnly: params.followUpsOnly || undefined,
      newOnly: params.newOnly || undefined,
    },
  })
}
export const claimLead = (id: string) => apiFetch<ClaimResponse>(`/api/leads/${id}/claim`, { method: 'POST' })
export const releaseLead = (id: string) => apiFetch<void>(`/api/leads/${id}/claim`, { method: 'DELETE' })
export const snoozeLead = (id: string, body: SnoozeRequest) =>
  apiFetch<BusinessDTO>(`/api/leads/${id}/snooze`, { method: 'POST', body })
export const getQualification = (id: string) => apiFetch<Qualification>(`/api/businesses/${id}/qualification`)
export const patchQualification = (id: string, body: Qualification) =>
  apiFetch<Qualification>(`/api/businesses/${id}/qualification`, { method: 'PATCH', body })
export const logCall = (id: string, body: LogCallRequest) =>
  apiFetch<LogCallResponse>(`/api/leads/${id}/calls`, { method: 'POST', body })
export const getContacts = (businessId: string) => apiFetch<ContactDTO[]>(`/api/contacts/business/${businessId}`)
export const getUpcomingContacts = (days = 7) => apiFetch<ContactDTO[]>('/api/contacts/upcoming', { query: { days } })

// ---- Scripts
export const getScript = (businessType: string | null | undefined, language: ScriptLanguage) =>
  apiFetch<CallScript>('/api/scripts', { query: { businessType: businessType ?? undefined, language } })
export const listScripts = () => apiFetch<CallScript[]>('/api/scripts/all')
export const updateScript = (id: string, body: ScriptUpsert) => apiFetch<CallScript>(`/api/scripts/${id}`, { method: 'PUT', body })
export const createScript = (body: ScriptUpsert) => apiFetch<CallScript>('/api/scripts', { method: 'POST', body })

// ---- Targets, today, team
export const getMyTargets = () => apiFetch<UserTargets>('/api/me/targets')
export const updateMyTargets = (body: UserTargets) => apiFetch<UserTargets>('/api/me/targets', { method: 'PUT', body })
export const updateUserTargets = (userId: string, body: UserTargets) =>
  apiFetch<UserTargets>(`/api/users/${userId}/targets`, { method: 'PUT', body })
export const getMyToday = () => apiFetch<TodayStats>('/api/dashboard/me/today')
export const getTeamToday = () => apiFetch<TeamTodayRow[]>('/api/dashboard/team/today')

// ---- Email
export const getEmailStatus = () => apiFetch<EmailStatus>('/api/email/status')
export const listEmailTemplates = () => apiFetch<EmailTemplate[]>('/api/email/templates')
export const updateEmailTemplate = (id: string, body: EmailTemplateUpdate) =>
  apiFetch<EmailTemplate>(`/api/email/templates/${id}`, { method: 'PUT', body })
export const estimatePricing = (body: EstimateInput) => apiFetch<Estimate>('/api/pricing/estimate', { method: 'POST', body })
export const previewEmail = (leadId: string, body: SendEmailRequest, signal?: AbortSignal) =>
  apiFetch<EmailPreview>(`/api/leads/${leadId}/emails/preview`, { method: 'POST', body, signal })
export const sendEmail = (leadId: string, body: SendEmailRequest) =>
  apiFetch<SendEmailResponse>(`/api/leads/${leadId}/emails`, { method: 'POST', body })

// ---- Notifications
export const getNotifications = () => apiFetch<AppNotification[]>('/api/notifications')

// ---- Dashboard
const range = (r?: DateRange): Query => (r ? { from: r.from, to: r.to } : {})
export const getFunnel = (r?: DateRange) => apiFetch<Funnel>('/api/dashboard/funnel', { query: range(r) })
export const getBestHours = (r?: DateRange) => apiFetch<BestHourCell[]>('/api/dashboard/best-hours', { query: range(r) })
export const getConversionByType = () => apiFetch<ConversionByTypeRow[]>('/api/dashboard/conversion-by-type')
export const getSummary = (r?: DateRange) => apiFetch<DashboardSummary>('/api/dashboard/summary', { query: range(r) })
export const getPipeline = (r?: DateRange) => apiFetch<PipelineEntry[]>('/api/dashboard/pipeline', { query: range(r) })
export const getActivity = (r: DateRange) => apiFetch<ActivityPoint[]>('/api/dashboard/activity', { query: range(r) })
export const getBreakdown = (dimension: BreakdownDimension, r?: DateRange, limit = 10) =>
  apiFetch<BreakdownRow[]>('/api/dashboard/breakdown', { query: { dimension, limit, ...range(r) } })
export const getOutcomes = (r: DateRange) => apiFetch<OutcomeCount[]>('/api/dashboard/outcomes', { query: range(r) })
export const getLeaderboard = (r: DateRange) =>
  apiFetch<LeaderboardRow[]>('/api/dashboard/leaderboard', { query: range(r) })

// ---- Sources / jobs
export const listDataSources = () => apiFetch<DataSource[]>('/api/data-sources')
export const importDataSource = (id: string) =>
  apiFetch<ScraperJobDTO>(`/api/data-sources/${id}/import`, { method: 'POST' })
export const setDataSourceActive = (id: string, active: boolean) =>
  apiFetch<DataSource>(`/api/data-sources/${id}/active`, { method: 'PATCH', query: { active } })
/** Upload the business-register ZIP (≈225 MB) and start its import → 202 + job. */
export const uploadDataSourceFile = (
  id: string,
  file: File,
  opts: { onProgress?: (p: UploadProgress) => void; signal?: AbortSignal } = {},
) => {
  const body = new FormData()
  body.append('file', file, file.name)
  return apiUpload<ScraperJobDTO>(`/api/data-sources/${id}/upload`, body, opts)
}
export const listJobs = (page = 0, size = 20) =>
  apiFetch<Page<ScraperJobDTO>>('/api/scraper-jobs', { query: { page, size } })
export const getJob = (id: string) => apiFetch<ScraperJobDTO>(`/api/scraper-jobs/${id}`)
export const listRunningJobs = () => apiFetch<ScraperJobDTO[]>('/api/scraper-jobs/running')
export const getJobStatistics = () => apiFetch<JobStatistics>('/api/scraper-jobs/statistics')

// ---- Tenders (appels d'offres)
export const listTenders = (p: TenderListParams) =>
  apiFetch<Page<TenderDTO>>('/api/tenders', {
    query: {
      page: p.page,
      size: p.size,
      status: p.status,
      source: p.source,
      q: p.q,
      openOnly: p.openOnly,
      sortBy: p.sortBy,
      sortDirection: p.sortDirection,
    },
  })
export const getTender = (id: string) => apiFetch<TenderDTO>(`/api/tenders/${id}`)
export const updateTender = (id: string, body: TenderUpdateRequest) =>
  apiFetch<TenderDTO>(`/api/tenders/${id}`, { method: 'PATCH', body })
export const getTenderSummary = () => apiFetch<TenderSummary>('/api/tenders/summary')

// ---- Imports (CSV / XLSX / pasted text)
export const uploadImportFile = (file: File, opts: { onProgress?: (p: UploadProgress) => void; signal?: AbortSignal } = {}) => {
  const body = new FormData()
  body.append('file', file, file.name)
  return apiUpload<ImportUpload>('/api/imports/files', body, opts)
}
export const runImport = (importId: string, body: ImportRunRequest) =>
  apiFetch<ScraperJobDTO>(`/api/imports/${importId}/run`, { method: 'POST', body })
export const getImportUpload = (importId: string) => apiFetch<ImportUpload>(`/api/imports/${importId}`)

// ---- Discover (OpenStreetMap)
export const discoverOsm = (body: DiscoverRequest, signal?: AbortSignal) =>
  apiFetch<DiscoverResponse>('/api/discover/osm', { method: 'POST', body, signal })
export const importOsm = (candidates: DiscoverCandidate[], assignToMe: boolean) =>
  apiFetch<DiscoverImportResponse>('/api/discover/osm/import', { method: 'POST', body: { candidates, assignToMe } })
