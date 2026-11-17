import type { BusinessDTO } from '../api/types'

/** Number a follow-up text goes to: the main phone, else the direct line from the qualification (as the server does). */
export function smsPhone(lead: Pick<BusinessDTO, 'phone' | 'qualification'>): string | null {
  return lead.phone?.trim() || lead.qualification?.directPhone?.trim() || null
}
