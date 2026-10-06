import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { IconAlert, IconLeaf } from '../components/icons'
import { errorMessage } from '../lib/errors'

const MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (user) return <Navigate to={from} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(username.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <section className="login-hero">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark">
            <IconLeaf size={18} />
          </span>
          <span>
            EcoNet Leads
            <small>Entretien ménager commercial · Montréal</small>
          </span>
        </div>
        <div>
          <h1>Trouvez, appelez et signez vos prochains clients.</h1>
          <p>Leads issus des données ouvertes du Québec, file d’appels priorisée et tableau de bord de performance — au même endroit.</p>
        </div>
        <p className="hero-foot small">
          Outil interne EcoNet
        </p>
      </section>
      <div className="login-form-wrap">
        <form className="login-form" onSubmit={onSubmit} noValidate>
          <div>
            <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 600, letterSpacing: '-0.022em' }}>Connexion</h2>
            <p className="muted" style={{ marginTop: 4 }}>
              Entrez vos identifiants pour continuer.
            </p>
          </div>
          {error && (
            <div className="form-error" role="alert">
              <IconAlert size={18} style={{ flex: 'none', marginTop: 1 }} />
              {error}
            </div>
          )}
          <label className="field">
            <span>Nom d’utilisateur</span>
            <input
              className="input"
              style={{ height: 44 }}
              autoComplete="username"
              autoCapitalize="none"
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Mot de passe</span>
            <input
              className="input"
              style={{ height: 44 }}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !username || !password}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
          {MOCKS && (
            <div className="demo-hint">
              <strong>Mode démo.</strong> Comptes : <code>admin</code> / <code>admin</code>, <code>marie.lavoie</code> / <code>demo</code>,{' '}
              <code>lecteur</code> / <code>demo</code> (lecture seule).
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
