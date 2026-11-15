import { describe, expect, it } from 'vitest'
import { findOverlap, sizeToArea } from './quotes'

const w = (weekday: number, startTime: string, endTime: string) => ({ weekday, startTime, endTime, slotMinutes: 60, active: true })

describe('availability validation', () => {
  it('accepts separate ranges and different days', () => {
    expect(findOverlap([w(1, '09:00', '12:00'), w(1, '13:00', '17:00'), w(2, '09:00', '17:00')])).toBeNull()
  })
  it('names the day with overlapping or inverted ranges', () => {
    expect(findOverlap([w(2, '09:00', '12:00'), w(2, '11:00', '15:00')])).toBe('Mardi : deux plages se chevauchent.')
    expect(findOverlap([w(5, '17:00', '09:00')])).toBe('Vendredi : la fin doit suivre le début.')
  })
})

describe('sizeToArea', () => {
  it('maps square footage to the estimate buckets', () => {
    expect(sizeToArea(500)).toBe('under_800')
    expect(sizeToArea(1200)).toBe('800_1500')
    expect(sizeToArea(2500)).toBe('1500_2500')
    expect(sizeToArea(4000)).toBe('over_2500')
  })
})
