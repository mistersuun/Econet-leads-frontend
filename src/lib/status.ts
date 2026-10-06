import type { CallOutcome, LeadStatus } from '../api/types'

/** Chart/categorical palette, validated for light surfaces. */
export const PALETTE = {
  green: '#2f7a5c',
  amber: '#c98a1f',
  blue: '#4a72b0',
  terracotta: '#c4613f',
  plum: '#8a5fa8',
  gray: '#a1a1a6',
  darkGray: '#48484a',
  sage: '#6b9080',
} as const

export const SERIES_COLORS = [PALETTE.green, PALETTE.amber, PALETTE.blue, PALETTE.terracotta, PALETTE.plum, PALETTE.gray]

export const STATUS_META: Record<LeadStatus, { label: string; color: string }> = {
  NEW: { label: 'Nouveau', color: PALETTE.gray },
  CONTACTED: { label: 'Contacté', color: PALETTE.blue },
  INTERESTED: { label: 'Intéressé', color: PALETTE.amber },
  QUOTE_SENT: { label: 'Devis envoyé', color: PALETTE.plum },
  WON: { label: 'Gagné', color: PALETTE.green },
  LOST: { label: 'Perdu', color: PALETTE.terracotta },
  DO_NOT_CALL: { label: 'Ne pas appeler', color: PALETTE.darkGray },
}

export const TERMINAL_STATUSES: LeadStatus[] = ['WON', 'LOST', 'DO_NOT_CALL']

export interface OutcomeMeta {
  label: string
  short: string
  color: string
  /** Show the estimated value field for this outcome. */
  withValue: boolean
  /** Default follow-up in days (business days for 'business'), null = none. */
  followUp: { days: number; business: boolean } | null
  tone: 'neutral' | 'positive' | 'negative'
}

export const OUTCOME_META: Record<CallOutcome, OutcomeMeta> = {
  NO_ANSWER: { label: 'Pas de réponse', short: 'Pas de rép.', color: PALETTE.gray, withValue: false, followUp: { days: 2, business: true }, tone: 'neutral' },
  VOICEMAIL: { label: 'Messagerie', short: 'Messagerie', color: PALETTE.sage, withValue: false, followUp: { days: 2, business: true }, tone: 'neutral' },
  CALLBACK: { label: 'Rappeler', short: 'Rappeler', color: PALETTE.blue, withValue: false, followUp: { days: 2, business: true }, tone: 'neutral' },
  INTERESTED: { label: 'Intéressé', short: 'Intéressé', color: PALETTE.amber, withValue: true, followUp: { days: 3, business: false }, tone: 'positive' },
  NOT_INTERESTED: { label: 'Pas intéressé', short: 'Pas int.', color: PALETTE.terracotta, withValue: false, followUp: null, tone: 'negative' },
  QUOTE_SENT: { label: 'Devis envoyé', short: 'Devis', color: PALETTE.plum, withValue: true, followUp: { days: 3, business: false }, tone: 'positive' },
  WON: { label: 'Contrat gagné', short: 'Gagné', color: PALETTE.green, withValue: true, followUp: null, tone: 'positive' },
  WRONG_NUMBER: { label: 'Mauvais numéro', short: 'Mauvais no', color: '#6e6e73', withValue: false, followUp: null, tone: 'negative' },
  DO_NOT_CALL: { label: 'Ne pas appeler', short: 'Ne pas app.', color: PALETTE.darkGray, withValue: false, followUp: null, tone: 'negative' },
}

/** Labels for legacy Contact outcomes that predate the call workflow. */
const LEGACY_OUTCOMES: Record<string, string> = {
  CONTRAT: 'Contrat',
  REFUS: 'Refus',
  EN_ATTENTE: 'En attente',
}

export function outcomeLabel(outcome: string | null | undefined): string {
  if (!outcome) return 'Contact'
  return OUTCOME_META[outcome as CallOutcome]?.label ?? LEGACY_OUTCOMES[outcome] ?? outcome
}

export function outcomeColor(outcome: string | null | undefined): string {
  return (outcome && OUTCOME_META[outcome as CallOutcome]?.color) || PALETTE.gray
}

export const ROLE_LABEL = { ADMIN: 'Administrateur', USER: 'Agent', VIEWER: 'Lecture seule' } as const
