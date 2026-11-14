import type { QueryClient } from '@tanstack/react-query'
import type { LogCallResponse } from '../api/types'

const KEYS = ['summary', 'leads', 'pipeline', 'activity', 'outcomes', 'leaderboard', 'breakdown', 'followups', 'today', 'funnel', 'best-hours', 'team-today', 'notifications']

/** Refreshes everything a logged call changes (same set as the detailed outcome form). */
export function applyLoggedCall(qc: QueryClient, res: LogCallResponse) {
  qc.setQueryData(['lead', res.lead.id], res.lead)
  void qc.invalidateQueries({ queryKey: ['contacts', res.lead.id] })
  for (const key of KEYS) void qc.invalidateQueries({ queryKey: [key] })
}
