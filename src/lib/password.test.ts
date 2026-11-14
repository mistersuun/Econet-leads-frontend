import { describe, expect, it } from 'vitest'
import { generatePassword, passwordProblem, passwordStrength } from './password'

describe('password helpers', () => {
  it('rates strength', () => {
    expect(passwordStrength('').score).toBe(0)
    expect(passwordStrength('court').label).toContain('Trop court')
    expect(passwordStrength('abcdefghij').score).toBe(1)
    expect(passwordStrength('Abcdefg123').score).toBe(2)
    expect(passwordStrength('Abcdefghij123!xyz').score).toBe(3)
  })
  it('explains what blocks submission', () => {
    expect(passwordProblem('court', 'court', 'marie')).toContain('10')
    expect(passwordProblem('marie.lavoie', 'marie.lavoie', 'Marie.Lavoie')).toContain("nom d'utilisateur")
    expect(passwordProblem('assez-long-123', 'autre-chose-123', 'marie')).toContain('correspondent')
    expect(passwordProblem('assez-long-123', 'assez-long-123', 'marie')).toBeNull()
  })
  it('generates long unambiguous passwords', () => {
    const a = generatePassword()
    expect(a).toHaveLength(14)
    expect(a).toMatch(/^[A-Za-z2-9]+$/)
    expect(a).not.toMatch(/[0OIl1]/)
    expect(generatePassword()).not.toBe(a)
    expect(passwordProblem(a, a, 'x')).toBeNull()
  })
})
