import { useState } from 'react'
import { passwordStrength } from '../lib/password'
import './password-fields.css'

/** New password + confirmation with show/hide and a strength hint. Controlled by the parent form. */
export default function PasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
  label = 'Nouveau mot de passe',
}: {
  password: string
  confirm: string
  onPassword: (v: string) => void
  onConfirm: (v: string) => void
  label?: string
}) {
  const [show, setShow] = useState(false)
  const strength = passwordStrength(password)
  return (
    <>
      <label className="field">
        <span>{label} (10 caractères minimum)</span>
        <span className="row">
          <input
            className="input"
            style={{ flex: 1 }}
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            autoComplete="new-password"
            aria-describedby="pw-strength"
          />
          <button type="button" className="btn btn-sm" onClick={() => setShow((s) => !s)} aria-pressed={show}>
            {show ? 'Masquer' : 'Afficher'}
          </button>
        </span>
        <span id="pw-strength" className="pw-strength small" data-score={strength.score} aria-live="polite">
          {password ? (
            <>
              <span className="pw-bar" aria-hidden="true">
                {[1, 2, 3].map((i) => (
                  <i key={i} className={strength.score >= i ? 'on' : ''} />
                ))}
              </span>
              <span className="muted">{strength.label}</span>
            </>
          ) : (
            <span className="muted">Évitez votre nom d’utilisateur et les mots de passe réutilisés ailleurs.</span>
          )}
        </span>
      </label>
      <label className="field">
        <span>Confirmer le mot de passe</span>
        <input className="input" type={show ? 'text' : 'password'} value={confirm} onChange={(e) => onConfirm(e.target.value)} autoComplete="new-password" />
      </label>
    </>
  )
}
