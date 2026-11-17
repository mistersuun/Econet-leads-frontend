import { describe, expect, it } from 'vitest'
import { dedupeMessage, displayValue } from '../lib/messages'

describe('displayValue', () => {
  it('formats dot-decimal dollar amounts in French', () => {
    expect(displayValue('189.5 $')).toBe('189,50 $')
    expect(displayValue('Maison')).toBe('Maison')
  })
})

describe('dedupeMessage', () => {
  it('collapses repeated lines', () => {
    expect(dedupeMessage('Oups\nOups\nOups')).toBe('Oups')
    expect(dedupeMessage(null)).toBeNull()
  })
})
