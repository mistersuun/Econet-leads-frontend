import { differenceInCalendarDays, format, formatDistanceStrict, isValid, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

const currencyFmt = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const currencyCompactFmt = new Intl.NumberFormat('fr-CA', {
  style: 'currency',
  currency: 'CAD',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})
const numberFmt = new Intl.NumberFormat('fr-CA')

/** Normalise narrow/no-break spaces to a regular NBSP so output is predictable. */
const nbsp = (s: string) => s.replace(/[\u202f\u00a0]/g, '\u00a0')

export function formatCurrency(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return nbsp((opts.compact && Math.abs(value) >= 10000 ? currencyCompactFmt : currencyFmt).format(value))
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return nbsp(numberFmt.format(value))
}

/** 0.234 → "23,4 %" (fraction in, French percent out). */
export function formatPercent(fraction: number | null | undefined, digits = 1): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return '—'
  return nbsp(
    new Intl.NumberFormat('fr-CA', {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    }).format(fraction),
  )
}

/** North-American phone → "(514) 555-1234"; keeps "+1" off, falls back to the raw value. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  const d = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  if (d.length === 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  return phone.trim()
}

/** Value for a tel: link, e.g. "+15145551234". */
export function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `tel:+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`
  return `tel:${digits}`
}

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const d = typeof value === 'string' ? parseISO(value) : value
  return isValid(d) ? d : null
}

/** "il y a 3 jours", "dans 2 heures", "hier", "demain"… */
export function formatRelative(value: string | Date | null | undefined, now: Date = new Date()): string {
  const d = toDate(value)
  if (!d) return '—'
  if (Math.abs(d.getTime() - now.getTime()) < 60_000) return "à l'instant"
  const days = differenceInCalendarDays(d, now)
  if (days === 1) return 'demain'
  if (days === -1) return 'hier'
  return formatDistanceStrict(d, now, { locale: fr, addSuffix: true, roundingMethod: 'floor' })
}

export function formatDate(value: string | Date | null | undefined, pattern = 'd MMM yyyy'): string {
  const d = toDate(value)
  return d ? format(d, pattern, { locale: fr }) : '—'
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value)
  return d ? format(d, "d MMM yyyy 'à' HH'h'mm", { locale: fr }) : '—'
}

/** Local date → "2026-10-05T10:00:00" (no offset, as the API expects). */
export function toApiDateTime(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm:ss")
}

/** Local date → "2026-10-05". */
export function toApiDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

/** Value for <input type="datetime-local">. */
export function toInputDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value)
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : ''
}

/** 235_000_000 → "224,1 Mo" (binary units, French abbreviations). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—'
  const units = ['o', 'Ko', 'Mo', 'Go']
  let v = Math.max(0, bytes)
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  const digits = i === 0 || v >= 100 ? 0 : 1
  return nbsp(`${new Intl.NumberFormat('fr-CA', { maximumFractionDigits: digits }).format(v)} ${units[i]}`)
}
