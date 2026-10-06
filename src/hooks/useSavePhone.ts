import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { updateLeadPhone } from '../api/endpoints'
import type { BusinessDTO } from '../api/types'
import { errorMessage } from '../lib/errors'

/** PATCH a lead's phone; on success the lead joins the call queue, so refresh what depends on it. */
export function useSavePhone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ lead, phone }: { lead: BusinessDTO; phone: string }) => updateLeadPhone(lead.id, phone),
    onSuccess: (lead) => {
      qc.setQueryData(['lead', lead.id], lead)
      void qc.invalidateQueries({ queryKey: ['contacts', lead.id] })
      for (const key of ['summary', 'queue', 'leads', 'lead-filters', 'breakdown']) void qc.invalidateQueries({ queryKey: [key] })
    },
  })
}

/** Server validation message for the phone field ({ error, fields: { phone } }). */
export function phoneErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 400) {
    const field = e.fields?.phone
    return field && !e.message.includes(field) ? `${e.message} (${field})` : e.message
  }
  return errorMessage(e)
}
