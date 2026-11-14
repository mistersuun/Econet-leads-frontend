import { describe, expect, it } from 'vitest'
import { addObjection, DEFAULT_OBJECTIONS, MAX_OBJECTIONS, normalizeObjection, objectionChips } from './objections'

describe('objections', () => {
  it('takes chips from the objections section, quotes and periods removed', () => {
    const body = "« On a déjà quelqu'un. »\n→ Parfait.\n\n« On n'a pas de budget. »\n→ Je comprends."
    expect(objectionChips(body)).toEqual(["On a déjà quelqu'un", "On n'a pas de budget"])
  })

  it('falls back to the defaults when the script has none', () => {
    expect(objectionChips(undefined)).toEqual([...DEFAULT_OBJECTIONS])
    expect(objectionChips('Texte libre sans paires')).toEqual([...DEFAULT_OBJECTIONS])
  })

  it('caps length at 80 characters', () => {
    expect(normalizeObjection('x'.repeat(200)).length).toBe(80)
  })

  it('adds at most five distinct objections', () => {
    let list: string[] = []
    for (const o of ['a', 'b', 'A', 'c', 'd', 'e', 'f']) list = addObjection(list, o)
    expect(list).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(list).toHaveLength(MAX_OBJECTIONS)
  })
})
