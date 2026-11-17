import { describe, expect, it } from 'vitest'
import { smsPhone } from './smsPhone'

describe('smsPhone', () => {
  it('prefers the main phone, falls back to the direct line', () => {
    expect(smsPhone({ phone: '514-555-0101', qualification: { directPhone: '514-555-9999' } })).toBe('514-555-0101')
    expect(smsPhone({ phone: null, qualification: { directPhone: '514-555-1234' } })).toBe('514-555-1234')
    expect(smsPhone({ phone: '', qualification: null })).toBeNull()
  })
})
