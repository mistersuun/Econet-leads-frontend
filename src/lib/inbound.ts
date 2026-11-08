import type { LiveEventMap } from '../api/types'
import { formatCurrency } from './format'

type Inbound = LiveEventMap['lead.inbound']

/** "Résidentiel" / "Commercial" / "Contact" from the lead's type (or the event kind as a fallback). */
export function inboundKind(lead: { businessType?: string | null } | null | undefined, kind: Inbound['kind']): string {
  const t = (lead?.businessType ?? '').toLowerCase()
  if (t.includes('commercial')) return 'Commercial'
  if (t.includes('résidentiel') || t.includes('residentiel')) return 'Résidentiel'
  return kind === 'booking' ? 'Réservation' : 'Contact'
}

/** "Nouvelle demande du site : Marie Tremblay · Résidentiel · 261 $" (the toast adds the "Appeler" action). */
export function inboundMessage(e: Pick<Inbound, 'leadName' | 'kind'>, lead?: { businessType?: string | null; estimatedValue?: number | null } | null): string {
  const parts = [e.leadName, inboundKind(lead, e.kind)]
  if (lead?.estimatedValue) parts.push(formatCurrency(lead.estimatedValue))
  return `Nouvelle demande du site : ${parts.join(' · ')}`
}
