import { apiDownload, apiFetch, type Query } from './client'
import type {
  ActivityPoint,
  AuthResponse,
  BreakdownDimension,
  BreakdownRow,
  BusinessDTO,
  BusinessUpdateRequest,
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
    hasPhone: p.hasPhone || undefined,
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
export const getLeadFilters = () => apiFetch<LeadFilters>('/api/businesses/filters')
export const exportLeadsCsv = (p: LeadListParams) => {
  const q = leadQuery(p)
  delete q.page
  delete q.size
  return apiDownload('/api/businesses/export.csv', q)
}

// ---- Calling
export const getQueue = (size = 20) => apiFetch<BusinessDTO[]>('/api/leads/queue', { query: { size } })
export const logCall = (id: string, body: LogCallRequest) =>
  apiFetch<LogCallResponse>(`/api/leads/${id}/calls`, { method: 'POST', body })
export const getContacts = (businessId: string) => apiFetch<ContactDTO[]>(`/api/contacts/business/${businessId}`)
export const getUpcomingContacts = (days = 7) => apiFetch<ContactDTO[]>('/api/contacts/upcoming', { query: { days } })

// ---- Dashboard
const range = (r?: DateRange): Query => (r ? { from: r.from, to: r.to } : {})
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
export const listJobs = (page = 0, size = 20) =>
  apiFetch<Page<ScraperJobDTO>>('/api/scraper-jobs', { query: { page, size } })
export const listRunningJobs = () => apiFetch<ScraperJobDTO[]>('/api/scraper-jobs/running')
export const getJobStatistics = () => apiFetch<JobStatistics>('/api/scraper-jobs/statistics')
