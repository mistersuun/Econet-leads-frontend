import { describe, expect, it } from 'vitest'
import { formatCurrency, formatPercent, formatPhone, formatRelative, telHref, toApiDateTime } from './format'
import { defaultFollowUp, previousRange } from './dates'

const norm = (s: string) => s.replace(/\u00a0/g, ' ')

describe('formatCurrency', () => {
  it('formats CAD in fr-CA', () => {
    expect(norm(formatCurrency(12500))).toBe('12 500 $')
    expect(norm(formatCurrency(0))).toBe('0 $')
    expect(formatCurrency(null)).toBe('—')
  })
  it('compacts large values on demand', () => {
    expect(norm(formatCurrency(184000, { compact: true }))).toMatch(/^184 k\s?\$$/)
  })
})

describe('formatPercent', () => {
  it('formats fractions as French percentages', () => {
    expect(norm(formatPercent(0.234))).toBe('23,4 %')
    expect(norm(formatPercent(0.5, 0))).toBe('50 %')
    expect(formatPercent(Number.NaN)).toBe('—')
  })
})

describe('formatPhone', () => {
  it('formats North-American numbers', () => {
    expect(formatPhone('5145551234')).toBe('(514) 555-1234')
    expect(formatPhone('+1 514-555-1234')).toBe('(514) 555-1234')
    expect(formatPhone('514.555.1234')).toBe('(514) 555-1234')
  })
  it('falls back to the raw value', () => {
    expect(formatPhone('poste 22')).toBe('poste 22')
    expect(formatPhone(null)).toBe('—')
  })
  it('builds tel: links', () => {
    expect(telHref('(514) 555-1234')).toBe('tel:+15145551234')
  })
})

describe('formatRelative', () => {
  const now = new Date(2026, 9, 5, 14, 0, 0)
  it('uses French relative wording', () => {
    expect(formatRelative('2026-10-04T10:00:00', now)).toBe('hier')
    expect(formatRelative('2026-10-06T10:00:00', now)).toBe('demain')
    expect(formatRelative('2026-10-02T10:00:00', now)).toBe('il y a 3 jours')
    expect(formatRelative('2026-10-05T12:00:00', now)).toBe('il y a 2 heures')
    expect(formatRelative('2026-10-05T14:00:20', now)).toBe("à l'instant")
    expect(formatRelative(null, now)).toBe('—')
  })
})

describe('dates', () => {
  it('serialises local date-times without offset', () => {
    expect(toApiDateTime(new Date(2026, 9, 5, 9, 5, 0))).toBe('2026-10-05T09:05:00')
  })
  it('computes the previous equal-length period', () => {
    expect(previousRange({ from: '2026-09-06', to: '2026-10-05' })).toEqual({ from: '2026-08-07', to: '2026-09-05' })
  })
  it('defaults follow-ups like the server', () => {
    const friday = new Date(2026, 9, 2, 15, 0, 0)
    expect(toApiDateTime(defaultFollowUp('NO_ANSWER', friday)!)).toBe('2026-10-06T10:00:00') // +2 business days
    expect(toApiDateTime(defaultFollowUp('INTERESTED', friday)!)).toBe('2026-10-05T10:00:00') // +3 days
    expect(defaultFollowUp('WON', friday)).toBeNull()
  })
})
