import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { enrichLeadsPlaces, getJob, getPlacesStatus } from '../api/endpoints'
import { errorMessage } from '../lib/errors'
import { IconSearch } from './icons'
import { useToast } from './Toast'

export const MAX_BULK_ENRICH = 50

/** Selection bar of the leads list: "Enrichir avec Google (N)" runs one background job (50 leads at most). */
export function BulkEnrichBar({ ids, onClear }: { ids: string[]; onClear: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const status = useQuery({ queryKey: ['places-status'], queryFn: getPlacesStatus, staleTime: 60_000 })
  const [jobId, setJobId] = useState<string | null>(null)
  const done = useRef<string | null>(null)

  const start = useMutation({
    mutationFn: () => enrichLeadsPlaces(ids),
    onSuccess: (job) => setJobId(job.id),
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  const job = useQuery({
    queryKey: ['places-job', jobId],
    queryFn: () => getJob(jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(q.state.data.status) ? false : 1500),
  })

  useEffect(() => {
    const j = job.data
    if (!j || done.current === j.id) return
    if (j.status === 'COMPLETED') {
      done.current = j.id
      const n = j.recordsUpdated ?? 0
      toast(`${n} lead${n > 1 ? 's' : ''} enrichi${n > 1 ? 's' : ''} avec Google`)
      void qc.invalidateQueries({ queryKey: ['leads'] })
      void qc.invalidateQueries({ queryKey: ['lead'] })
      void qc.invalidateQueries({ queryKey: ['places-status'] })
      onClear()
    } else if (j.status === 'FAILED' || j.status === 'CANCELLED') {
      done.current = j.id
      toast(j.errors ?? 'L’enrichissement Google a échoué', 'error')
    }
  }, [job.data, qc, toast, onClear])

  const jobDone = !!job.data && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.data.status)
  const running = start.isPending || (!!jobId && !jobDone)
  const tooMany = ids.length > MAX_BULK_ENRICH
  const notConfigured = status.data?.configured === false

  return (
    <div className="card bulk-bar" role="region" aria-label="Actions sur la sélection">
      <strong className="num">{ids.length} sélectionné{ids.length > 1 ? 's' : ''}</strong>
      <button type="button" className="btn btn-sm btn-primary" onClick={() => start.mutate()} disabled={running || tooMany || notConfigured}>
        <IconSearch size={15} /> {running ? 'Enrichissement…' : `Enrichir avec Google (${ids.length})`}
      </button>
      <button type="button" className="btn btn-sm btn-ghost" onClick={onClear} disabled={running}>Tout désélectionner</button>
      {tooMany && <span className="small muted">{MAX_BULK_ENRICH} leads au maximum à la fois.</span>}
      {notConfigured && <span className="small muted">Google n’est pas configuré (<code>GOOGLE_PLACES_API_KEY</code>).</span>}
    </div>
  )
}
