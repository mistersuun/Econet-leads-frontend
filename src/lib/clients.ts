import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { ClientDTO, ClientFrequency, ClientStatus } from '../api/types'

export const FREQUENCY_LABEL: Record<ClientFrequency, string> = {
  weekly: 'Hebdomadaire',
  'bi-weekly': 'Aux 2 semaines',
  monthly: 'Mensuel',
  'one-time': 'Une fois',
}
export const FREQUENCIES: ClientFrequency[] = ['weekly', 'bi-weekly', 'monthly', 'one-time']

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  active: 'Actif',
  paused: 'En pause',
  ended: 'Terminé',
}
export const CLIENT_STATUS_COLOR: Record<ClientStatus, string> = {
  active: '#2f7a5c',
  paused: '#c98a1f',
  ended: '#a1a1a6',
}
export const CLIENT_STATUSES: ClientStatus[] = ['active', 'paused', 'ended']

/** Visits per year for each frequency; one-time counts for no recurring revenue. */
const VISITS_PER_YEAR: Record<ClientFrequency, number> = { weekly: 52, 'bi-weekly': 26, monthly: 12, 'one-time': 0 }

/** Recurring monthly value of a client: weekly ×52/12, bi-weekly ×26/12, monthly ×1, one-time 0. */
export function monthlyValue(pricePerVisit: number, frequency: ClientFrequency): number {
  return Math.round(((pricePerVisit * VISITS_PER_YEAR[frequency]) / 12) * 100) / 100
}

export interface Renewal {
  days: number
  label: string
  tone: 'danger' | 'warn' | 'none'
}

/** Days until the contract ends and how to flag it (≤ 30 days: warn, ≤ 7 or past: danger). */
export function renewalInfo(contractEndDate: string | null, now: Date = new Date()): Renewal | null {
  if (!contractEndDate) return null
  const days = differenceInCalendarDays(parseISO(contractEndDate), now)
  if (days < 0) return { days, label: `échu depuis ${-days} j`, tone: 'danger' }
  if (days === 0) return { days, label: 'échoit aujourd’hui', tone: 'danger' }
  const label = `dans ${days} j`
  return { days, label, tone: days <= 7 ? 'danger' : days <= 30 ? 'warn' : 'none' }
}

export function sumMonthly(clients: Pick<ClientDTO, 'monthlyValue' | 'status'>[]): number {
  return clients.filter((c) => c.status === 'active').reduce((s, c) => s + c.monthlyValue, 0)
}
