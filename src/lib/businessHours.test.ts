import { describe, expect, it } from 'vitest'
import { hoursRuleFor, nextGoodTime, openStatus } from './businessHours'

// Instants chosen in UTC so the Montreal wall clock is unambiguous
// (EDT = UTC−4 in October, EST = UTC−5 in January).
const tueOct6_10h = new Date('2026-10-06T14:00:00Z') // Tuesday 10:00 Montreal
const tueOct6_19h = new Date('2026-10-06T23:00:00Z') // Tuesday 19:00
const satOct10_12h = new Date('2026-10-10T16:00:00Z') // Saturday 12:00
const sunOct11_15h = new Date('2026-10-11T19:00:00Z') // Sunday 15:00
const monJan5_7h30 = new Date('2026-01-05T12:30:00Z') // Monday 07:30 (EST)

describe('hoursRuleFor', () => {
  it('maps business types to rules, with a default', () => {
    expect(hoursRuleFor('Bureau').open).toBe(8)
    expect(hoursRuleFor('Cabinet comptable Roy').close).toBe(17)
    expect(hoursRuleFor('CPE').open).toBe(7)
    expect(hoursRuleFor('Garderie').close).toBe(18)
    expect(hoursRuleFor('Clinique dentaire').days).toContain(6)
    expect(hoursRuleFor('Restaurant').best).toEqual([14, 17])
    expect(hoursRuleFor('Commerce de détail').open).toBe(9)
    expect(hoursRuleFor(null).label).toMatch(/défaut/)
  })
})

describe('openStatus', () => {
  it('offices are open on a Tuesday morning', () => {
    const s = openStatus('Bureau', tueOct6_10h)
    expect(s.open).toBe(true)
    expect(s.goodTime).toBe(true)
    expect(s.label).toBe('Ouvert · bon moment')
    expect(s.suggestion).toBeNull()
  })

  it('offices are closed at 19:00 and suggest tomorrow 8 h', () => {
    const s = openStatus('Bureau', tueOct6_19h)
    expect(s.open).toBe(false)
    expect(s.label).toBe('Fermé · reporter ?')
    expect(s.suggestionLabel).toBe('demain 8 h')
    expect(s.suggestion?.toISOString()).toBe('2026-10-07T12:00:00.000Z')
  })

  it('clinics answer on Saturday until 20 h, CPE do not', () => {
    expect(openStatus('Clinique médicale', satOct10_12h).open).toBe(true)
    const cpe = openStatus('CPE', satOct10_12h)
    expect(cpe.open).toBe(false)
    expect(cpe.suggestionLabel).toBe('lundi 7 h')
  })

  it('restaurants are open Sunday afternoon and 14–17 h is the best window', () => {
    const s = openStatus('Restaurant', sunOct11_15h)
    expect(s.open).toBe(true)
    expect(s.goodTime).toBe(true)
    const rush = openStatus('Restaurant', new Date('2026-10-11T16:30:00Z')) // Sunday 12:30 — lunch rush
    expect(rush.open).toBe(true)
    expect(rush.goodTime).toBe(false)
    expect(rush.label).toBe('Ouvert · mieux 14 h–17 h')
    expect(rush.suggestionLabel).toBe('aujourd’hui 14 h')
  })

  it('CPE are open at 07:30 in winter (EST handled)', () => {
    expect(openStatus('CPE', monJan5_7h30).open).toBe(true)
    expect(openStatus('Bureau', monJan5_7h30).open).toBe(false)
    expect(openStatus('Bureau', monJan5_7h30).suggestionLabel).toBe('aujourd’hui 8 h')
  })

  it('evaluates in Montreal time regardless of the caller’s zone', () => {
    // 23:30 UTC Tuesday is 19:30 in Montreal: closed for an office even though UTC says "evening" too;
    // 13:30 UTC is 09:30 Montreal: open.
    expect(openStatus('Bureau', new Date('2026-10-06T13:30:00Z')).open).toBe(true)
    expect(openStatus('Bureau', new Date('2026-10-06T23:30:00Z')).open).toBe(false)
  })
})

describe('nextGoodTime', () => {
  it('skips the weekend to Monday', () => {
    const d = nextGoodTime(hoursRuleFor('Bureau'), new Date('2026-10-09T22:00:00Z')) // Friday 18:00
    expect(d.toISOString()).toBe('2026-10-12T12:00:00.000Z') // Monday 8:00 EDT
  })
})
