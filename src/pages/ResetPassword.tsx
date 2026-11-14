import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { resetUserPassword } from '../api/endpoints'
import { useToast } from '../components/Toast'
import { errorMessage } from '../lib/errors'
import { generatePassword, MIN_PASSWORD_LENGTH } from '../lib/password'
import '../components/password-fields.css'

/** Équipe (ADMIN): set a member's password (typed or generated). The value is shown once, with a copy button. */
export default function ResetPassword({ userId, username }: { userId: string; username: string }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [shown, setShown] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (pw: string) => resetUserPassword(userId, pw).then(() => pw),
    onSuccess: (pw) => {
      setShown(pw)
      setValue('')
    },
  })
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shown ?? '')
      toast('Mot de passe copié')
    } catch {
      toast('Copie impossible : sélectionnez le mot de passe et copiez-le', 'error')
    }
  }
  const close = () => {
    setOpen(false)
    setShown(null)
    setValue('')
    save.reset()
  }
  if (!open) {
    return (
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)} aria-label={`Réinitialiser le mot de passe de ${username}`}>
        Réinitialiser le mot de passe
      </button>
    )
  }
  if (shown) {
    return (
      <div className="stack" role="status">
        <p className="small">
          Nouveau mot de passe de <strong>{username}</strong>. Il ne sera plus affiché : transmettez-le maintenant.
        </p>
        <div className="pw-reveal">
          <code data-testid="new-password">{shown}</code>
          <button type="button" className="btn btn-sm" onClick={() => void copy()}>
            Copier
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={close}>
            Terminé
          </button>
        </div>
      </div>
    )
  }
  const tooShort = value.length < MIN_PASSWORD_LENGTH
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (!tooShort && !save.isPending) save.mutate(value)
      }}
    >
      <label className="field">
        <span>Nouveau mot de passe pour {username} ({MIN_PASSWORD_LENGTH} caractères minimum)</span>
        <span className="row">
          <input className="input" style={{ flex: 1 }} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
          <button type="button" className="btn btn-sm" onClick={() => setValue(generatePassword())}>
            Générer
          </button>
        </span>
      </label>
      {save.isError && (
        <div className="field-error" role="alert">
          {errorMessage(save.error)}
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sm" onClick={close}>
          Annuler
        </button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={tooShort || save.isPending}>
          {save.isPending ? '…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}
