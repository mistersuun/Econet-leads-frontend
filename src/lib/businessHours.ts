// "Ouvert maintenant ?" — a heuristic of when a business type answers the
// phone, in America/Montreal regardless of the caller's own time zone.

export interface HoursRule {
  /** ISO weekdays, 1 = Monday … 7 = Sunday */
  days: number[]
  open: number
  close: number
  /** Best window to call, when it differs from plain opening hours. */
  best?: [number, number]
  label: string
}

const WEEKDAYS = [1, 2, 3, 4, 5]

const RULES: { match: RegExp; rule: HoursRule }[] = [
  { match: /bureau|office|cabinet|notaire|avocat|comptable|assurance|courtier|architecte|ing[ée]nieur/i, rule: { days: WEEKDAYS, open: 8, close: 17, label: 'Bureau · lun–ven 8 h–17 h' } },
  { match: /cpe|garderie|daycare|centre de la petite enfance/i, rule: { days: WEEKDAYS, open: 7, close: 18, best: [9, 11], label: 'CPE / garderie · lun–ven 7 h–18 h' } },
  { match: /clinique|clinic|dentaire|m[ée]dical|gmf|polyclinique|chsld|pharmacie|sant[ée]/i, rule: { days: [1, 2, 3, 4, 5, 6], open: 8, close: 20, label: 'Clinique · lun–sam 8 h–20 h' } },
  { match: /restaurant|resto|bistro|caf[ée]|brasserie|taverne|sushi|pizz/i, rule: { days: [2, 3, 4, 5, 6, 7], open: 11, close: 22, best: [14, 17], label: 'Restaurant · mar–dim 11 h–22 h, idéalement 14 h–17 h' } },
]

export const DEFAULT_RULE: HoursRule = { days: WEEKDAYS, open: 9, close: 17, label: 'Par défaut · lun–ven 9 h–17 h' }

export function hoursRuleFor(businessType: string | null | undefined): HoursRule {
  if (!businessType) return DEFAULT_RULE
  return RULES.find((r) => r.match.test(businessType))?.rule ?? DEFAULT_RULE
}

export const MONTREAL = 'America/Montreal'

interface WallClock {
  year: number
  month: number
  day: number
  /** ISO weekday 1..7 */
  dow: number
  hour: number
  minute: number
}

const DOW: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

function wallClock(date: Date, timeZone = MONTREAL): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    dow: DOW[get('weekday')] ?? 1,
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
  }
}

/** The instant at which the wall clock in `timeZone` reads y-m-d h:00 (handles DST by one correction pass). */
function fromWallClock(year: number, month: number, day: number, hour: number, minute = 0, timeZone = MONTREAL): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const offset = (d: Date) => {
    const w = wallClock(d, timeZone)
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - d.getTime()
  }
  let result = new Date(guess - offset(new Date(guess)))
  // Around a DST change the first guess can be off by an hour; correct once.
  const w = wallClock(result, timeZone)
  if (w.hour !== hour || w.day !== day) result = new Date(guess - offset(result))
  return result
}

export interface OpenStatus {
  open: boolean
  /** Open and inside the best window (or no best window defined). */
  goodTime: boolean
  /** Short French status, e.g. "Ouvert · bon moment" */
  label: string
  /** Why, e.g. the rule's hours. */
  detail: string
  /** When to call instead, when closed or outside the best window. */
  suggestion: Date | null
  /** Hint for the snooze button, e.g. "demain 9 h" */
  suggestionLabel: string | null
}

function suggestionLabel(target: Date, now: Date, timeZone: string): string {
  const t = wallClock(target, timeZone)
  const n = wallClock(now, timeZone)
  const h = `${t.hour} h${t.minute ? String(t.minute).padStart(2, '0') : ''}`
  if (t.year === n.year && t.month === n.month && t.day === n.day) return `aujourd’hui ${h}`
  const diffDays = Math.round((Date.UTC(t.year, t.month - 1, t.day) - Date.UTC(n.year, n.month - 1, n.day)) / 86400_000)
  if (diffDays === 1) return `demain ${h}`
  const names = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
  return `${names[t.dow]} ${h}`
}

/**
 * Next instant (strictly after `now`) at which the rule says calling is good:
 * the start of the best window if there is one, otherwise opening time.
 */
export function nextGoodTime(rule: HoursRule, now: Date, timeZone = MONTREAL): Date {
  const startHour = rule.best ? rule.best[0] : rule.open
  const endHour = rule.best ? rule.best[1] : rule.close
  const w = wallClock(now, timeZone)
  for (let i = 0; i < 8; i++) {
    const day = new Date(Date.UTC(w.year, w.month - 1, w.day + i))
    const y = day.getUTCFullYear()
    const m = day.getUTCMonth() + 1
    const d = day.getUTCDate()
    const dow = ((day.getUTCDay() + 6) % 7) + 1
    if (!rule.days.includes(dow)) continue
    const candidate = fromWallClock(y, m, d, startHour, 0, timeZone)
    if (i === 0) {
      if (candidate > now) return candidate
      // Still inside today's window: suggest a little later today.
      const end = fromWallClock(y, m, d, endHour, 0, timeZone)
      if (now < end) {
        const later = new Date(now.getTime() + 2 * 3600_000)
        return later < end ? later : candidate
      }
      continue
    }
    return candidate
  }
  return fromWallClock(w.year, w.month - 1, w.day + 1, startHour, 0, timeZone)
}

export function openStatus(businessType: string | null | undefined, now: Date = new Date(), timeZone = MONTREAL): OpenStatus {
  const rule = hoursRuleFor(businessType)
  const w = wallClock(now, timeZone)
  const h = w.hour + w.minute / 60
  const isOpen = rule.days.includes(w.dow) && h >= rule.open && h < rule.close
  if (!isOpen) {
    const s = nextGoodTime(rule, now, timeZone)
    return {
      open: false,
      goodTime: false,
      label: 'Fermé · reporter ?',
      detail: rule.label,
      suggestion: s,
      suggestionLabel: suggestionLabel(s, now, timeZone),
    }
  }
  const inBest = !rule.best || (h >= rule.best[0] && h < rule.best[1])
  if (inBest) {
    return { open: true, goodTime: true, label: 'Ouvert · bon moment', detail: rule.label, suggestion: null, suggestionLabel: null }
  }
  const s = nextGoodTime(rule, now, timeZone)
  return {
    open: true,
    goodTime: false,
    label: `Ouvert · mieux ${rule.best![0]} h–${rule.best![1]} h`,
    detail: rule.label,
    suggestion: s,
    suggestionLabel: suggestionLabel(s, now, timeZone),
  }
}

/** Snooze presets used by the call screen, in the caller's local clock. */
export function laterToday(now: Date = new Date(), hours = 3): Date {
  return new Date(now.getTime() + hours * 3600_000)
}

export function tomorrowAt(hour: number, now: Date = new Date()): Date {
  const d = new Date(now)
  d.setDate(d.getDate() + 1)
  d.setHours(hour, 0, 0, 0)
  return d
}
