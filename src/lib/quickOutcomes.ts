import type { CallOutcome } from '../api/types'

/** Outcomes logged straight away from the quick-outcome sheet (with the call duration). */
export type QuickOutcome = Extract<CallOutcome, 'NO_ANSWER' | 'VOICEMAIL' | 'NOT_INTERESTED' | 'WRONG_NUMBER'>
/** Outcomes that open the detailed form instead. */
export type DetailedChoice = 'SPOKE' | 'CALLBACK'

export const QUICK_LABEL: Record<QuickOutcome, string> = {
  NO_ANSWER: 'Pas de réponse',
  VOICEMAIL: 'Message laissé',
  NOT_INTERESTED: 'Pas intéressé',
  WRONG_NUMBER: 'Mauvais numéro',
}
