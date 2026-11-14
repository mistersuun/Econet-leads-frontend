import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { changeMyPassword } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'
import PasswordFields from '../components/PasswordFields'
import { useToast } from '../components/Toast'
import { errorMessage } from '../lib/errors'
import { passwordProblem } from '../lib/password'

const ROLE_LABEL = { ADMIN: 'Administrateur', USER: 'Appelant', VIEWER: 'Lecture seule' } as const

/** Réglages → Mon compte (every role): identity (read-only) and password change. */
export default function AccountTab() {
  const { user } = useAuth()
  return (
    <div className="stack account">
      <section className="card card-pad">
        <h2>Mon compte</h2>
        <dl className="account-facts">
          <div>
            <dt className="muted small">Nom d’utilisateur</dt>
            <dd>{user?.username}</dd>
          </div>
          <div>
            <dt className="muted small">Courriel</dt>
            <dd>{user?.email}</dd>
          </div>
          <div>
            <dt className="muted small">Rôle</dt>
            <dd>{user ? ROLE_LABEL[user.role] : ''}</dd>
          </div>
        </dl>
      </section>
      <ChangePasswordForm username={user?.username ?? ''} />
    </div>
  )
}

export function ChangePasswordForm({ username }: { username: string }) {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [touched, setTouched] = useState(false)
  const save = useMutation({
    mutationFn: () => changeMyPassword({ currentPassword: current, newPassword: next }),
    onSuccess: () => {
      toast('Mot de passe modifié')
      setCurrent('')
      setNext('')
      setConfirm('')
      setShowCurrent(false)
      setTouched(false)
    },
  })
  const problem = passwordProblem(next, confirm, username)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!current || problem || save.isPending) return
    save.mutate()
  }
  return (
    <section className="card card-pad">
      <h2>Changer mon mot de passe</h2>
      <form className="stack team-form" onSubmit={submit} noValidate>
        <label className="field">
          <span>Mot de passe actuel</span>
          <span className="row">
            <input className="input" style={{ flex: 1 }} type={showCurrent ? 'text' : 'password'} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            <button type="button" className="btn btn-sm" onClick={() => setShowCurrent((s) => !s)} aria-pressed={showCurrent}>
              {showCurrent ? 'Masquer' : 'Afficher'}
            </button>
          </span>
        </label>
        <PasswordFields password={next} confirm={confirm} onPassword={setNext} onConfirm={setConfirm} />
        {touched && !current && (
          <div className="field-error" role="alert">
            Saisissez votre mot de passe actuel
          </div>
        )}
        {touched && problem && (
          <div className="field-error" role="alert">
            {problem}
          </div>
        )}
        {save.isError && (
          <div className="field-error" role="alert">
            {errorMessage(save.error)}
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Enregistrement…' : 'Changer le mot de passe'}
          </button>
        </div>
      </form>
    </section>
  )
}
