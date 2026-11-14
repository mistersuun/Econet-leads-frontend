import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createBookingLink, listVisits } from '../../api/endpoints'
import type { BookingLink, BusinessDTO } from '../../api/types'
import { copyText } from '../../lib/copyText'
import { errorMessage } from '../../lib/errors'
import { formatDate, formatDateTime, toApiDate } from '../../lib/format'
import { useToast } from '../Toast'
import { IconMail } from '../icons'
import { EmailComposer } from '../EmailComposer'
import './quotes.css'

/** "Lien de réservation": the prospect picks a visit time on a public page. Create, copy, include in an email. */
export function BookingLinkPanel({ lead, canEdit }: { lead: BusinessDTO; canEdit: boolean }) {
  const toast = useToast()
  const [link, setLink] = useState<BookingLink | null>(null)
  const [composing, setComposing] = useState(false)
  const from = toApiDate(new Date())
  const visits = useQuery({ queryKey: ['visits', 'lead', lead.id, from], queryFn: () => listVisits(from, undefined), staleTime: 30_000 })
  const mine = (visits.data ?? []).filter((v) => v.leadId === lead.id && v.status === 'booked')

  const create = useMutation({
    mutationFn: () => createBookingLink(lead.id),
    onSuccess: (l) => {
      setLink(l)
      toast('Lien de réservation créé')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const copy = async () => {
    if (!link) return
    toast((await copyText(link.url)) ? 'Lien copié' : 'Copiez le lien manuellement', 'info')
  }

  return (
    <section className="card card-pad sales-panel" aria-labelledby={`booking-${lead.id}`}>
      <div className="row">
        <h3 id={`booking-${lead.id}`}>Lien de réservation</h3>
        <span className="spacer" />
        <button type="button" className="btn btn-sm" onClick={() => create.mutate()} disabled={!canEdit || create.isPending} title={canEdit ? undefined : 'Lecture seule'}>
          {create.isPending ? 'Création…' : link ? 'Créer un nouveau lien' : 'Créer un lien'}
        </button>
      </div>
      <p className="xs muted">Le client choisit une plage libre (dans les 14 prochains jours, avec 24 h de préavis). Le lien sert une seule fois.</p>
      {mine.length > 0 && (
        <ul className="sales-list">
          {mine.map((v) => (
            <li key={v.id} className="sales-item">
              <strong>Visite prévue</strong> · {formatDateTime(v.startsAt)}
            </li>
          ))}
        </ul>
      )}
      {link && (
        <div className="stack" style={{ gap: 8 }}>
          <label className="field">
            <span className="sr-only">Lien de réservation</span>
            <input className="input" readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} aria-label="Lien de réservation" />
          </label>
          <div className="row wrap">
            <button type="button" className="btn btn-sm" onClick={() => void copy()}>
              Copier
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setComposing(true)}>
              <IconMail size={14} /> Inclure dans un courriel
            </button>
            <span className="xs muted">Valide jusqu’au {formatDate(link.expiresAt)}</span>
          </div>
        </div>
      )}
      {composing && link && (
        <EmailComposer
          lead={lead}
          defaultTemplate="intro"
          defaultExtraNote={`Choisissez l’heure de votre visite gratuite ici : ${link.url}`}
          onClose={() => setComposing(false)}
        />
      )}
    </section>
  )
}
