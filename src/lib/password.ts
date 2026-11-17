export const MIN_PASSWORD_LENGTH = 10

export type Strength = { score: 0 | 1 | 2 | 3; label: string }

/** Rough hint only; the server enforces the real rules (10 characters, not the username). */
export function passwordStrength(pw: string): Strength {
  if (!pw) return { score: 0, label: '' }
  if (pw.length < MIN_PASSWORD_LENGTH) return { score: 0, label: `Trop court (${MIN_PASSWORD_LENGTH} caractères minimum)` }
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length
  if (pw.length >= 16 || (pw.length >= 12 && classes >= 3)) return { score: 3, label: 'Solide' }
  if (classes >= 3 || pw.length >= 13) return { score: 2, label: 'Correct' }
  return { score: 1, label: 'Faible : ajoutez des chiffres, majuscules ou symboles' }
}

/** Why the new password cannot be submitted, or null when it can. */
export function passwordProblem(pw: string, confirm: string, username: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`
  if (pw.toLowerCase() === username.toLowerCase()) return "Le mot de passe ne doit pas être identique au nom d'utilisateur"
  if (confirm !== pw) return 'Les deux mots de passe ne correspondent pas'
  return null
}

// No look-alike characters (0/O, 1/l/I) so a password read aloud or typed from a screen is not misread.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Random password of 14 characters from a typo-safe alphabet (crypto.getRandomValues). */
export function generatePassword(length = 14): string {
  const out: string[] = []
  const limit = 256 - (256 % ALPHABET.length)
  const buf = new Uint8Array(length * 2)
  while (out.length < length) {
    crypto.getRandomValues(buf)
    for (const b of buf) {
      if (b < limit && out.length < length) out.push(ALPHABET[b % ALPHABET.length])
    }
  }
  return out.join('')
}
