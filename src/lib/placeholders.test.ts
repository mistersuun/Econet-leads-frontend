import { describe, expect, it } from 'vitest'
import { parseObjections, placeholderKeys, substitutePlaceholders } from './placeholders'

describe('substitutePlaceholders', () => {
  const values = { businessName: 'CPE Les Lucioles', city: 'Laval', callerName: 'marie.lavoie', companyName: 'EcoNet Propreté', decisionMaker: '' }

  it('replaces every known placeholder, tolerating spaces inside the braces', () => {
    expect(substitutePlaceholders('Bonjour, ici {{callerName}} de {{ companyName }} pour {{businessName}} à {{city}}.', values)).toBe(
      'Bonjour, ici marie.lavoie de EcoNet Propreté pour CPE Les Lucioles à Laval.',
    )
  })

  it('uses the fallback for empty values and keeps unknown keys visible', () => {
    expect(substitutePlaceholders('Bonjour {{decisionMaker}}, {{unknownKey}}!', values, { decisionMaker: 'madame, monsieur' })).toBe('Bonjour madame, monsieur, {{unknownKey}}!')
    expect(substitutePlaceholders('{{decisionMaker}}', { decisionMaker: null })).toBe('{{decisionMaker}}')
  })

  it('lists the keys a text uses, once each, in order', () => {
    expect(placeholderKeys('{{a}} {{b}} {{a}} {{ c }}')).toEqual(['a', 'b', 'c'])
  })
})

describe('parseObjections', () => {
  it('reads "objection → reply" paragraphs', () => {
    const pairs = parseObjections('On a déjà un fournisseur. → Parfait, comparons.\n\nPas de budget. -> Notre soumission est gratuite.')
    expect(pairs).toEqual([
      { objection: 'On a déjà un fournisseur.', reply: 'Parfait, comparons.' },
      { objection: 'Pas de budget.', reply: 'Notre soumission est gratuite.' },
    ])
  })

  it('reads two-line paragraphs and strips "Objection :" / "Réponse :" prefixes and bullets', () => {
    const pairs = parseObjections('Objection : Envoyez-moi un courriel.\nRéponse : Avec plaisir, à quelle adresse ?\n\n- Ce n’est pas le moment\n  Quand serait mieux ?')
    expect(pairs).toEqual([
      { objection: 'Envoyez-moi un courriel.', reply: 'Avec plaisir, à quelle adresse ?' },
      { objection: 'Ce n’est pas le moment', reply: 'Quand serait mieux ?' },
    ])
  })

  it('returns nothing for free text so the caller shows it as is', () => {
    expect(parseObjections('Juste un paragraphe sans structure.')).toEqual([])
  })
})
