import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getClientsSummary } from '../../api/endpoints'
import { Skeleton } from '../../components/States'
import { formatCurrency, formatNumber } from '../../lib/format'
import '../clients.css'

/** "Clients actifs · revenu mensuel": the after-the-sale counterpart of the pipeline tiles. */
export function ClientsTile() {
  const q = useQuery({ queryKey: ['clients', 'summary'], queryFn: getClientsSummary, staleTime: 60_000 })
  const s = q.data
  return (
    <Link to="/clients" className="card tile tile-clients is-link" aria-label="Clients actifs et revenu mensuel">
      <span className="tile-label">Clients actifs · revenu mensuel</span>
      {q.isError ? (
        <span className="tile-foot">Indisponible pour l’instant</span>
      ) : (
        <div className="tile-clients-figures">
          <div>
            {s ? <span className="tile-value num">{formatNumber(s.active)}</span> : <Skeleton height={40} width={64} />}
            <span className="tile-foot">{s && s.active <= 1 ? 'client actif' : 'clients actifs'}</span>
          </div>
          <div>
            {s ? <span className="tile-value num">{formatCurrency(s.monthlyRecurringRevenue)}</span> : <Skeleton height={40} width={120} />}
            <span className="tile-foot">par mois, récurrent</span>
          </div>
          <div>
            {s ? <span className="tile-value num">{formatNumber(s.renewalsNext30Days)}</span> : <Skeleton height={40} width={48} />}
            <span className="tile-foot">renouvellements d’ici 30 jours</span>
          </div>
        </div>
      )}
    </Link>
  )
}
