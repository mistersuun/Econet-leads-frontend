import type { AvailabilityWindow, EstimateInput, QuoteStatus } from '../api/types'

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; color: string }> = {
  draft: { label: 'Brouillon', color: '#a1a1a6' },
  sent: { label: 'Envoyée', color: '#4a72b0' },
  accepted: { label: 'Acceptée', color: '#2f7a5c' },
  declined: { label: 'Refusée', color: '#c4613f' },
  expired: { label: 'Expirée', color: '#c98a1f' },
}

export const DEFAULT_ESTIMATE: EstimateInput = {
  service: 'commercial',
  area: '800_1500',
  propertyType: 'office',
  addOnIds: [],
  frequency: 'weekly',
}

/** Estimate area bucket for a known size; over 2 500 sq ft is 'over_2500' (custom quote, not priced online). */
export function sizeToArea(sqft: number): EstimateInput['area'] {
  if (sqft < 800) return 'under_800'
  if (sqft < 1500) return '800_1500'
  if (sqft <= 2500) return '1500_2500'
  return 'over_2500'
}

export const WEEKDAYS = [
  { weekday: 1, label: 'Lundi' },
  { weekday: 2, label: 'Mardi' },
  { weekday: 3, label: 'Mercredi' },
  { weekday: 4, label: 'Jeudi' },
  { weekday: 5, label: 'Vendredi' },
  { weekday: 6, label: 'Samedi' },
  { weekday: 7, label: 'Dimanche' },
]

/** The editable part of a window (ids change on every save). */
export const plainWindow = (w: AvailabilityWindow) => ({ weekday: w.weekday, startTime: w.startTime, endTime: w.endTime, slotMinutes: w.slotMinutes, active: w.active })

/** What the server refuses (an end before the start, overlapping ranges in a day), said before saving. */
export function findOverlap(windows: AvailabilityWindow[]): string | null {
  for (let i = 0; i < windows.length; i++) {
    const a = windows[i]
    if (a.endTime <= a.startTime) return `${WEEKDAYS[a.weekday - 1].label} : la fin doit suivre le début.`
    for (let j = i + 1; j < windows.length; j++) {
      const b = windows[j]
      if (a.weekday === b.weekday && a.startTime < b.endTime && b.startTime < a.endTime) return `${WEEKDAYS[a.weekday - 1].label} : deux plages se chevauchent.`
    }
  }
  return null
}
