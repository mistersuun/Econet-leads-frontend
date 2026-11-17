import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { enrichLeadPlaces, getPlacesStatus } from '../api/endpoints'
import type { BusinessDTO, PlacesData } from '../api/types'
import { errorMessage } from '../lib/errors'
import { formatDate, formatNumber, formatRating } from '../lib/format'
import { IconExternalLink, IconRefresh, IconStar } from './icons'
import { useToast } from './Toast'
import './google-card.css'

/**
 * "Google" card of the lead drawer: rating, hours, reviews that mention cleanliness. Data comes from
 * Google Places (optional on the server) and may only be kept 30 days, hence the "Actualiser" button.
 */
export function GoogleCard({ lead, canEdit }: { lead: BusinessDTO; canEdit: boolean }) {
  const toast = useToast()
  const qc = useQueryClient()
  const status = useQuery({ queryKey: ['places-status'], queryFn: getPlacesStatus, staleTime: 60_000 })
  const refresh = useMutation({
    mutationFn: () => enrichLeadPlaces(lead.id),
    onSuccess: (l) => {
      qc.setQueryData(['lead', l.id], l)
      void qc.invalidateQueries({ queryKey: ['leads'] })
      void qc.invalidateQueries({ queryKey: ['places-status'] })
      const updated = !!l.places && !l.places.expired && l.places.fetchedAt !== lead.places?.fetchedAt
      toast(updated ? 'Données Google mises à jour' : 'Aucune fiche Google correspondante : les données restent inchangées', updated ? 'success' : 'info')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  const places = lead.places
  const configured = status.data?.configured
  const fresh = !!places && !places.expired

  return (
    <section className="card card-pad google-card" aria-label="Google">
      <header className="google-head">
        <h3>Google</h3>
        <span className="xs muted">Données Google</span>
        <span className="spacer" />
        {configured !== false && (
          <button type="button" className="btn btn-sm" onClick={() => refresh.mutate()} disabled={!canEdit || refresh.isPending || status.isPending} title={canEdit ? undefined : 'Lecture seule'}>
            <IconRefresh size={15} /> {refresh.isPending ? 'Recherche…' : places ? 'Actualiser' : 'Chercher sur Google'}
          </button>
        )}
      </header>

      {configured === false && !fresh ? (
        <p className="small muted google-empty">
          Google n’est pas configuré sur ce serveur. Ajoutez la variable <code>GOOGLE_PLACES_API_KEY</code> pour voir la note, les heures et les avis.
        </p>
      ) : !places ? (
        <p className="small muted google-empty">Aucune donnée Google pour ce lead pour l’instant.</p>
      ) : places.expired ? (
        <p className="small muted google-empty">Ces données datent de plus de 30 jours et ont été retirées. Actualisez pour les recharger.</p>
      ) : (
        <PlacesBody places={places} />
      )}

      {status.data?.configured && (
        <p className="xs muted google-foot">
          {status.data.usedToday} / {status.data.dailyLimit} recherches Google aujourd’hui
        </p>
      )}
    </section>
  )
}

function PlacesBody({ places }: { places: PlacesData }) {
  const signals = places.cleanlinessSignals ?? []
  const hours = places.openingHours ?? []
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="google-rating">
        {places.rating != null ? (
          <>
            <span className="google-score num"><IconStar size={18} aria-hidden="true" /> {formatRating(places.rating)}</span>
            <span className="muted small">{places.reviewCount != null ? `${formatNumber(places.reviewCount)} avis` : null}</span>
          </>
        ) : (
          <span className="muted small">Pas encore de note</span>
        )}
        {places.businessStatus && places.businessStatus !== 'OPERATIONAL' && (
          <span className="google-closed small">{places.businessStatus === 'CLOSED_PERMANENTLY' ? 'Fermé définitivement' : 'Fermé temporairement'}</span>
        )}
        <span className="spacer" />
        {places.mapsUrl && (
          <a className="btn btn-sm btn-ghost" href={places.mapsUrl} target="_blank" rel="noopener noreferrer">
            <IconExternalLink size={15} /> Voir sur Google Maps
          </a>
        )}
      </div>

      {hours.length > 0 && (
        <details className="google-hours">
          <summary className="small">Heures d’ouverture</summary>
          <ul className="small">
            {hours.map((h) => <li key={h}>{h}</li>)}
          </ul>
        </details>
      )}

      {signals.length > 0 ? (
        <div>
          <div className="small google-signals-title">Avis qui parlent de propreté ({signals.length})</div>
          <ul className="google-quotes">
            {signals.map((s, i) => (
              <li key={`${s.publishedAt}-${i}`}>
                <blockquote>« {s.text} »</blockquote>
                <div className="xs muted">
                  {s.rating != null ? `${s.rating} sur 5` : ''}
                  {s.rating != null && s.publishedAt ? ' · ' : ''}
                  {s.publishedAt ? formatDate(s.publishedAt) : ''}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="small muted">Aucun avis récent ne mentionne la propreté.</p>
      )}

      <p className="xs muted">Mis à jour le {formatDate(places.fetchedAt)}</p>
    </div>
  )
}
