// Phone entry helpers for the enrichment workflow: live "(514) 555-1234"
// formatting, NANP validation matching the server rule, and the Google search
// link used to look a number up.

/** Digits a person typed or pasted, without a leading NANP country code, capped at 10. */
export function phoneDigits(raw: string): string {
  let d = raw.replace(/\D/g, '')
  // NANP area codes never start with 0 or 1, so a leading 1 is the country code (+1 / 1-514…).
  if (d.startsWith('1')) d = d.slice(1)
  return d.slice(0, 10)
}

/**
 * Progressive display format while typing. Punctuation only appears once the
 * next digit exists, so Backspace never gets stuck on a ")" or "-":
 * "5" → "(5", "514" → "(514", "5145" → "(514) 5", "5145551234" → "(514) 555-1234".
 */
export function formatPhoneInput(raw: string): string {
  const d = phoneDigits(raw)
  if (!d) return ''
  if (d.length <= 3) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

/** Caret position in `formatted` just after the `digitCount`-th digit. */
export function caretAfterDigits(formatted: string, digitCount: number): number {
  if (digitCount <= 0) return formatted.startsWith('(') ? 1 : 0
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      seen++
      if (seen === digitCount) return i + 1
    }
  }
  return formatted.length
}

export type PhoneValidation = { valid: true; digits: string } | { valid: false; error: string }

/** 10-digit NANP number (optional +1): area code and exchange start with 2–9. */
export function validatePhone(raw: string): PhoneValidation {
  const all = raw.replace(/\D/g, '')
  if (!all) return { valid: false, error: 'Entrez un numéro de téléphone.' }
  const d = all.length === 11 && all.startsWith('1') ? all.slice(1) : all
  if (d.length < 10) return { valid: false, error: 'Numéro incomplet : il faut 10 chiffres.' }
  if (d.length > 10) return { valid: false, error: 'Trop de chiffres : 10 chiffres attendus.' }
  if (!/^[2-9]/.test(d)) return { valid: false, error: 'Indicatif régional invalide.' }
  if (!/^[2-9]/.test(d.slice(3))) return { valid: false, error: 'Numéro invalide.' }
  return { valid: true, digits: d }
}

/** Google search for a business' phone number: `"<name>" <city> téléphone`. */
export function phoneSearchUrl(name: string, city?: string | null): string {
  const q = [`"${name.trim()}"`, city?.trim(), 'téléphone'].filter(Boolean).join(' ')
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}
