import { describe, expect, it } from 'vitest'
import { inboundKind, inboundMessage } from './inbound'

describe('inboundMessage', () => {
  it('names the person, the kind and the estimate', () => {
    const msg = inboundMessage({ leadName: 'Marie Tremblay', kind: 'booking' }, { businessType: 'Demande web – résidentiel', estimatedValue: 261 })
    expect(msg.startsWith('Nouvelle demande du site : Marie Tremblay · Résidentiel · 261')).toBe(true)
    expect(msg).toMatch(/\$/)
  })
  it('omits the estimate when there is none and falls back on the event kind', () => {
    expect(inboundMessage({ leadName: 'Karim Haddad', kind: 'contact' }, null)).toBe('Nouvelle demande du site : Karim Haddad · Contact')
    expect(inboundKind({ businessType: 'Demande web – commercial' }, 'booking')).toBe('Commercial')
    expect(inboundKind(undefined, 'booking')).toBe('Réservation')
  })
})
