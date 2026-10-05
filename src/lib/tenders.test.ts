import { describe, expect, it } from 'vitest'
import { closingCountdown, isAwardedContract, parseTenderFilters, serializeTenderFilters, toTenderParams } from './tenders'

const now = new Date(2026, 9, 5, 10, 0, 0) // 5 Oct 2026 10:00 local

describe('closingCountdown', () => {
  it('flags tenders closing within 3 days as urgent', () => {
    expect(closingCountdown('2026-10-05T14:00:00', now)).toEqual({ text: 'dans 4 h', urgent: true, past: false })
    expect(closingCountdown('2026-10-06T14:00:00', now)).toEqual({ text: 'demain', urgent: true, past: false })
    expect(closingCountdown('2026-10-08T09:00:00', now)).toMatchObject({ text: 'dans 3 jours', urgent: true })
    expect(closingCountdown('2026-10-08T11:00:00', now)).toMatchObject({ text: 'dans 3 jours', urgent: false })
    expect(closingCountdown('2026-10-05T10:20:00', now)).toMatchObject({ text: 'dans 20 min', urgent: true })
  })

  it('describes closed tenders and far-off dates', () => {
    expect(closingCountdown('2026-10-02T14:00:00', now)).toEqual({ text: 'fermé il y a 3 jours', urgent: false, past: true })
    expect(closingCountdown('2026-10-04T14:00:00', now)).toMatchObject({ text: 'fermé hier', past: true })
    expect(closingCountdown('2027-02-05T14:00:00', now)).toMatchObject({ text: 'dans 4 mois', urgent: false })
    expect(closingCountdown(null, now)).toMatchObject({ text: 'Date non précisée', urgent: false })
  })
})

describe('tender filters', () => {
  it('defaults to open tenders sorted by closing date', () => {
    const f = parseTenderFilters(new URLSearchParams())
    expect(f).toMatchObject({ open: true, dir: 'ASC', status: '', source: '', page: 0, size: 25 })
    expect(serializeTenderFilters(f).toString()).toBe('')
    expect(toTenderParams(f)).toMatchObject({ openOnly: true, sortBy: 'closingAt', sortDirection: 'ASC' })
  })

  it('round-trips through the URL and ignores unknown values', () => {
    const sp = new URLSearchParams('q=laval&status=BIDDING&source=SEAO&open=0&dir=DESC&page=2&size=50')
    const f = parseTenderFilters(sp)
    expect(f).toEqual({ q: 'laval', status: 'BIDDING', source: 'SEAO', open: false, dir: 'DESC', page: 2, size: 50 })
    expect(serializeTenderFilters(f).toString()).toBe(sp.toString())
    expect(parseTenderFilters(new URLSearchParams('status=NOPE&source=X'))).toMatchObject({ status: '', source: '' })
  })
})

describe('isAwardedContract', () => {
  it('recognises awarded contracts by category', () => {
    expect(isAwardedContract({ category: 'Contrat octroyé' })).toBe(true)
    expect(isAwardedContract({ category: 'Awarded contract' })).toBe(true)
    expect(isAwardedContract({ category: 'Services de nettoyage' })).toBe(false)
    expect(isAwardedContract({ category: null })).toBe(false)
  })
})
