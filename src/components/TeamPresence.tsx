import type { PresenceUser } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useLive } from '../live/LiveProvider'
import { presenceLabel, teammates } from '../live/store'
import './team-presence.css'

const STATUS_COLOR: Record<PresenceUser['status'], string> = { calling: '#2f7a5c', idle: '#6b9080', offline: '#c7c7cc' }

/** Sidebar footer: who else is on the floor right now. */
export function TeamPresence() {
  const { user } = useAuth()
  const { presence, connected } = useLive()
  const others = teammates(presence, user?.userId)
  return (
    <div className="presence" aria-label="Équipe en ligne">
      <div className="presence-head xs muted">
        <span>Équipe</span>
        <span className="presence-conn" title={connected ? 'Connecté au flux en direct' : 'Reconnexion au flux en direct…'}>
          <span className={`dot${connected ? '' : ' off'}`} aria-hidden="true" />
          {connected ? 'en direct' : 'hors ligne'}
        </span>
      </div>
      {others.length === 0 ? (
        <div className="presence-empty xs muted">{connected ? 'Personne d’autre pour l’instant.' : 'En attente du flux…'}</div>
      ) : (
        <ul className="presence-list">
          {others.map((u) => (
            <li key={u.userId} className={u.status} title={presenceLabel(u)}>
              <span className="dot" style={{ background: STATUS_COLOR[u.status] }} aria-hidden="true" />
              <span className="presence-name truncate">{u.username}</span>
              <span className="presence-status truncate">{presenceLabel(u)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
