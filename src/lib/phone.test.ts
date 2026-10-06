import { describe, expect, it } from 'vitest'
import { caretAfterDigits, formatPhoneInput, phoneDigits, phoneSearchUrl, validatePhone } from './phone'

describe('formatPhoneInput', () => {
  it('formats progressively without trailing punctuation', () => {
    expect(formatPhoneInput('')).toBe('')
    expect(formatPhoneInput('5')).toBe('(5')
    expect(formatPhoneInput('514')).toBe('(514')
    expect(formatPhoneInput('5145')).toBe('(514) 5')
    expect(formatPhoneInput('514555')).toBe('(514) 555')
    expect(formatPhoneInput('5145551')).toBe('(514) 555-1')
    expect(formatPhoneInput('5145551234')).toBe('(514) 555-1234')
  })

  it('reformats pasted numbers in any common shape', () => {
    expect(formatPhoneInput('514-555-1234')).toBe('(514) 555-1234')
    expect(formatPhoneInput('514.555.1234')).toBe('(514) 555-1234')
    expect(formatPhoneInput('+1 (514) 555-1234')).toBe('(514) 555-1234')
    expect(formatPhoneInput('1-450-555-0199')).toBe('(450) 555-0199')
    expect(formatPhoneInput('Tél. : 438 555 7788')).toBe('(438) 555-7788')
  })

  it('caps at 10 digits', () => {
    expect(formatPhoneInput('51455512349999')).toBe('(514) 555-1234')
  })

  it('lets Backspace remove a digit instead of re-adding punctuation', () => {
    // "(514) 5" minus its last char is "(514) " → digits 514 → "(514"
    expect(formatPhoneInput('(514) ')).toBe('(514')
    expect(formatPhoneInput('(514) 555-')).toBe('(514) 555')
  })
})

describe('phoneDigits', () => {
  it('drops the +1 country code', () => {
    expect(phoneDigits('+1 514 555 1234')).toBe('5145551234')
    expect(phoneDigits('15145551234')).toBe('5145551234')
  })
})

describe('caretAfterDigits', () => {
  it('places the caret after the n-th digit', () => {
    expect(caretAfterDigits('(514) 555-1234', 3)).toBe(4)
    expect(caretAfterDigits('(514) 555-1234', 4)).toBe(7)
    expect(caretAfterDigits('(514) 555-1234', 10)).toBe(14)
    expect(caretAfterDigits('(514', 0)).toBe(1)
  })
})

describe('validatePhone', () => {
  it('accepts 10-digit NANP numbers with or without +1', () => {
    expect(validatePhone('(514) 555-1234')).toEqual({ valid: true, digits: '5145551234' })
    expect(validatePhone('+1 450 555 0199')).toEqual({ valid: true, digits: '4505550199' })
    expect(validatePhone('1-819-555-2000')).toEqual({ valid: true, digits: '8195552000' })
  })

  it('rejects empty, short and long input with a French message', () => {
    expect(validatePhone('')).toEqual({ valid: false, error: 'Entrez un numéro de téléphone.' })
    expect(validatePhone('(514) 555-12')).toMatchObject({ valid: false, error: expect.stringMatching(/10 chiffres/) })
    expect(validatePhone('514555123499')).toMatchObject({ valid: false, error: expect.stringMatching(/Trop/) })
  })

  it('rejects area codes and exchanges starting with 0 or 1', () => {
    expect(validatePhone('014 555 1234')).toMatchObject({ valid: false, error: 'Indicatif régional invalide.' })
    expect(validatePhone('514 055 1234')).toMatchObject({ valid: false, error: 'Numéro invalide.' })
    expect(validatePhone('514 155 1234')).toMatchObject({ valid: false })
  })
})

describe('phoneSearchUrl', () => {
  it('builds a Google search for the quoted name, city and "téléphone"', () => {
    expect(phoneSearchUrl('Clinique dentaire Roy', 'Laval')).toBe(
      'https://www.google.com/search?q=' + encodeURIComponent('"Clinique dentaire Roy" Laval téléphone'),
    )
  })

  it('encodes accents, ampersands and quotes', () => {
    const url = phoneSearchUrl('Notaires Côté & Gagné', 'Montréal')
    expect(url).toBe('https://www.google.com/search?q=%22Notaires%20C%C3%B4t%C3%A9%20%26%20Gagn%C3%A9%22%20Montr%C3%A9al%20t%C3%A9l%C3%A9phone')
    expect(decodeURIComponent(url.split('q=')[1])).toBe('"Notaires Côté & Gagné" Montréal téléphone')
  })

  it('omits a missing city without leaving double spaces', () => {
    expect(decodeURIComponent(phoneSearchUrl('9187-4432 Québec inc.', null).split('q=')[1])).toBe('"9187-4432 Québec inc." téléphone')
  })
})
