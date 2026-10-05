import { addDays, differenceInCalendarDays, isWeekend, parseISO, setHours, setMinutes, setSeconds, startOfYear, subDays } from 'date-fns'
import type { DateRange } from '../api/types'
import { toApiDate } from './format'
import { OUTCOME_META } from './status'
import type { CallOutcome } from '../api/types'

export type RangePreset = '7d' | '30d' | '90d' | 'ytd' | 'custom'

export const PRESET_LABELS: Record<Exclude<RangePreset, 'custom'>, string> = {
  '7d': '7 j',
  '30d': '30 j',
  '90d': '90 j',
  ytd: 'Cette année',
}

export function presetRange(preset: Exclude<RangePreset, 'custom'>, today: Date = new Date()): DateRange {
  const to = toApiDate(today)
  switch (preset) {
    case '7d':
      return { from: toApiDate(subDays(today, 6)), to }
    case '30d':
      return { from: toApiDate(subDays(today, 29)), to }
    case '90d':
      return { from: toApiDate(subDays(today, 89)), to }
    case 'ytd':
      return { from: toApiDate(startOfYear(today)), to }
  }
}

/** The equal-length period immediately before `range`. */
export function previousRange(range: DateRange): DateRange {
  const from = parseISO(range.from)
  const to = parseISO(range.to)
  const len = differenceInCalendarDays(to, from) + 1
  return { from: toApiDate(subDays(from, len)), to: toApiDate(subDays(from, 1)) }
}

export function rangeLength(range: DateRange): number {
  return differenceInCalendarDays(parseISO(range.to), parseISO(range.from)) + 1
}

export function addBusinessDays(date: Date, days: number): Date {
  let d = date
  let left = days
  while (left > 0) {
    d = addDays(d, 1)
    if (!isWeekend(d)) left--
  }
  return d
}

const at10 = (d: Date) => setSeconds(setMinutes(setHours(d, 10), 0), 0)

/** Default follow-up for an outcome, matching the server rules. Null for terminal outcomes. */
export function defaultFollowUp(outcome: CallOutcome, now: Date = new Date()): Date | null {
  const rule = OUTCOME_META[outcome].followUp
  if (!rule) return null
  return at10(rule.business ? addBusinessDays(now, rule.days) : addDays(now, rule.days))
}
