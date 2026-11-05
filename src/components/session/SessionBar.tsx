import { useEffect, useState } from 'react'
import { formatClock, sessionElapsedSeconds, type CallSession } from '../../lib/callSession'
import { IconPause, IconPlay, IconStop } from '../icons'
import './session.css'

interface Props {
  session: CallSession
  onPause: () => void
  onResume: () => void
  onEnd: () => void
}

/** Slim progress line under the call header while a session runs. */
export function SessionBar({ session, onPause, onResume, onEnd }: Props) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (session.pausedAt) return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [session.pausedAt])

  const done = session.calls.length
  const total = session.size
  const paused = !!session.pausedAt
  const conv = session.calls.filter((c) => ['INTERESTED', 'QUOTE_SENT', 'WON', 'NOT_INTERESTED', 'CALLBACK'].includes(c.outcome)).length
  return (
    <div className={`session-bar${paused ? ' paused' : ''}`} role="status" aria-label="Session en cours">
      <span className={`dot${paused ? '' : ' live'}`} aria-hidden="true" />
      <strong className="session-bar-label">{paused ? 'Session en pause' : 'Session en cours'}</strong>
      <span className="session-bar-progress" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (done / Math.max(1, total)) * 100)}%` }} />
      </span>
      <span className="num small">
        {done} / {total}
        {session.target ? ` · ${conv} / ${session.target} conv.` : ''}
      </span>
      <span className="num small muted">{formatClock(sessionElapsedSeconds(session))}</span>
      <span className="session-bar-actions">
        {paused ? (
          <button type="button" className="btn btn-sm" onClick={onResume}>
            <IconPlay size={14} /> Reprendre
          </button>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onPause}>
            <IconPause size={14} /> Pause
          </button>
        )}
        <button type="button" className="btn btn-sm" onClick={onEnd}>
          <IconStop size={14} /> Terminer
        </button>
      </span>
    </div>
  )
}
