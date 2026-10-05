import { useState } from 'react'
import type { BusinessDTO } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { phoneErrorMessage, useSavePhone } from '../hooks/useSavePhone'
import { phoneSearchUrl, validatePhone } from '../lib/phone'
import { PhoneInput } from './PhoneInput'
import { useToast } from './Toast'
import { IconExternalLink, IconSearch } from './icons'

/** Shown instead of the phone tile when a lead has no number: look it up, type it, save. */
export function AddPhone({ lead }: { lead: BusinessDTO }) {
  const { hasRole } = useAuth()
  const canEdit = hasRole('ADMIN', 'USER')
  const toast = useToast()
  const save = useSavePhone()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const check = validatePhone(value)

  const submit = () => {
    if (save.isPending) return
    if (!check.valid) {
      setError(check.error)
      return
    }
    setError(null)
    save.mutate(
      { lead, phone: check.digits },
      {
        onSuccess: () => toast(`Numéro ajouté — ${lead.businessName} rejoint la file d’appels`),
        onError: (e) => setError(phoneErrorMessage(e)),
      },
    )
  }

  return (
    <div className="add-phone">
      <div className="add-phone-head">
        <span className="note warn">Aucun numéro de téléphone</span>
        <a className="btn btn-sm" href={phoneSearchUrl(lead.businessName, lead.addressCity)} target="_blank" rel="noreferrer">
          <IconSearch size={15} /> Chercher le numéro
          <IconExternalLink size={13} className="muted" />
        </a>
      </div>
      {canEdit && (
        <form
          className="add-phone-form"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <PhoneInput
            className="input num"
            value={value}
            onValueChange={(v) => {
              setValue(v)
              if (error) setError(null)
            }}
            placeholder="(514) 555-1234"
            aria-label={`Numéro de téléphone de ${lead.businessName}`}
            aria-invalid={!!error}
            aria-describedby={error ? `add-phone-err-${lead.id}` : undefined}
          />
          <button type="submit" className="btn btn-primary" disabled={save.isPending || !value}>
            {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      )}
      {error && (
        <div id={`add-phone-err-${lead.id}`} className="field-error" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
