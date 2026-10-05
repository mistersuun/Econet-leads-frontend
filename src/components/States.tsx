import type { CSSProperties, ReactNode } from 'react'
import { errorMessage } from '../lib/errors'
import { IconAlert, IconInbox, IconRefresh } from './icons'

export function Skeleton({ height = 16, width = '100%', style }: { height?: number | string; width?: number | string; style?: CSSProperties }) {
  return <div className="skeleton" style={{ height, width, ...style }} aria-hidden="true" />
}

export function SkeletonRows({ rows = 5, height = 18 }: { rows?: number; height?: number }) {
  return (
    <div className="stack" style={{ gap: 12 }} role="status" aria-label="Chargement">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} width={`${92 - ((i * 13) % 30)}%`} />
      ))}
    </div>
  )
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="state">
      <div className="state-icon">{icon ?? <IconInbox size={22} />}</div>
      <strong>{title}</strong>
      {children && <div className="small">{children}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="state error" role="alert">
      <div className="state-icon">
        <IconAlert size={22} />
      </div>
      <strong>Impossible de charger les données</strong>
      <div className="small">{errorMessage(error)}</div>
      {onRetry && (
        <button type="button" className="btn btn-sm" onClick={onRetry} style={{ marginTop: 6 }}>
          <IconRefresh size={16} /> Réessayer
        </button>
      )}
    </div>
  )
}
