import type { BusinessDTO } from '../../api/types'
import { BookingLinkPanel } from './BookingLinkPanel'
import { QuotesPanel } from './QuotesPanel'

/** Soumission + Lien de réservation, shared by the lead drawer and the call screen. */
export function LeadSalesPanel({ lead, canEdit }: { lead: BusinessDTO; canEdit: boolean }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <QuotesPanel lead={lead} canEdit={canEdit} />
      <BookingLinkPanel lead={lead} canEdit={canEdit} />
    </div>
  )
}
