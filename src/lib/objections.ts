// Objections heard on a call: chips come from the current script's objections section
// (the quoted objection of each pair), falling back to a short default list.
import { parseObjections } from './placeholders'

export const MAX_OBJECTIONS = 5
export const MAX_OBJECTION_LENGTH = 80

export const DEFAULT_OBJECTIONS: readonly string[] = [
  'Déjà un fournisseur',
  'Pas de budget',
  'Envoyez un courriel',
  'Pas le bon moment',
  'Pas le décideur',
  'Trop cher',
]

/** Trim, drop the trailing period / quotes, cap at 80 characters. */
export function normalizeObjection(raw: string): string {
  const t = raw
    .replace(/^[«"“\s]+|[»"”\s]+$/g, '')
    .replace(/[.!?…]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > MAX_OBJECTION_LENGTH ? `${t.slice(0, MAX_OBJECTION_LENGTH - 1).trimEnd()}…` : t
}

/** Chip labels for the outcome form: the script's objections, else the defaults (at most 8, no duplicates). */
export function objectionChips(sectionBody: string | null | undefined): string[] {
  const fromScript = sectionBody ? parseObjections(sectionBody).map((p) => normalizeObjection(p.objection)) : []
  const out: string[] = []
  for (const c of fromScript.length ? fromScript : [...DEFAULT_OBJECTIONS]) {
    if (c && !out.some((o) => o.toLowerCase() === c.toLowerCase())) out.push(c)
  }
  return out.slice(0, 8)
}

/** Adds one objection if there is room and it is not already there (case-insensitive). */
export function addObjection(list: readonly string[], raw: string): string[] {
  const t = normalizeObjection(raw)
  if (!t || list.length >= MAX_OBJECTIONS || list.some((o) => o.toLowerCase() === t.toLowerCase())) return [...list]
  return [...list, t]
}
