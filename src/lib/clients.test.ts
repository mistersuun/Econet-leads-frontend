import { describe, expect, it } from 'vitest'
import { monthlyValue, renewalInfo, sumMonthly } from './clients'

describe('monthlyValue', () => {
  it('converts the price per visit to a monthly figure', () => {
    expect(monthlyValue(100, 'weekly')).toBe(433.33)
    expect(monthlyValue(100, 'bi-weekly')).toBe(216.67)
    expect(monthlyValue(100, 'monthly')).toBe(100)
    expect(monthlyValue(100, 'one-time')).toBe(0)
  })
})

describe('renewalInfo', () => {
  const now = new Date(2026, 5, 10, 14, 0)
  it('is null without a contract end', () => expect(renewalInfo(null, now)).toBeNull())
  it('flags the next 7 days as danger and the next 30 as warning', () => {
    expect(renewalInfo('2026-06-10', now)).toMatchObject({ days: 0, tone: 'danger' })
    expect(renewalInfo('2026-06-15', now)).toMatchObject({ days: 5, label: 'dans 5 j', tone: 'danger' })
    expect(renewalInfo('2026-06-30', now)).toMatchObject({ days: 20, tone: 'warn' })
    expect(renewalInfo('2026-09-01', now)).toMatchObject({ tone: 'none' })
  })
  it('flags past dates', () => expect(renewalInfo('2026-06-01', now)).toMatchObject({ days: -9, label: 'échu depuis 9 j', tone: 'danger' }))
})

describe('sumMonthly', () => {
  it('only counts active clients', () => {
    expect(sumMonthly([{ monthlyValue: 100, status: 'active' }, { monthlyValue: 50, status: 'paused' }, { monthlyValue: 25.5, status: 'active' }])).toBe(125.5)
  })
})
