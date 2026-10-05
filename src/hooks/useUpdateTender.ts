import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateTender } from '../api/endpoints'
import type { Page, TenderDTO, TenderStatus } from '../api/types'
import { useToast } from '../components/Toast'
import { errorMessage } from '../lib/errors'

/** Patch a tender and keep every cached copy (lists, detail, summary) in step. */
export function useUpdateTender() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: TenderStatus; notes?: string | null }) => updateTender(id, body),
    onMutate: ({ id, ...patch }) => {
      // Optimistic: the select reflects the change immediately.
      const apply = (t: TenderDTO) => (t.id === id ? { ...t, ...patch } : t)
      qc.setQueriesData<Page<TenderDTO>>({ queryKey: ['tenders'] }, (old) => (old ? { ...old, content: old.content.map(apply) } : old))
      qc.setQueryData<TenderDTO>(['tender', id], (old) => (old ? apply(old) : old))
    },
    onSuccess: (t) => {
      qc.setQueryData(['tender', t.id], t)
      qc.setQueriesData<Page<TenderDTO>>({ queryKey: ['tenders'] }, (old) =>
        old ? { ...old, content: old.content.map((x) => (x.id === t.id ? t : x)) } : old,
      )
      void qc.invalidateQueries({ queryKey: ['tender-summary'] })
    },
    onError: (e, { id }) => {
      toast(errorMessage(e), 'error')
      void qc.invalidateQueries({ queryKey: ['tenders'] })
      void qc.invalidateQueries({ queryKey: ['tender', id] })
    },
  })
}
