import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getNotifications } from '../api/endpoints'
import type { AppNotification } from '../api/types'
import { formatRelative } from '../lib/format'
import { IconBell, IconPhone, IconX } from './icons'
import { EmptyState, ErrorState, SkeletonRows } from './States'
import './notifications.css'

const KIND_LABEL: Record<AppNotification['kind'], string> = {
  follow_up_due: 'Suivi aujourd’hui',
  follow_up_overdue: 'Suivi en retard',
  claim_expired: 'Réservation expirée',
  tender_closing: 'Appel d’offres',
  inbound_request: 'Demande du site',
}
const KIND_COLOR: Record<AppNotification['kind'], string> = {
  follow_up_due: '#c98a1f',
  follow_up_overdue: '#c4613f',
  claim_expired: '#a1a1a6',
  tender_closing: '#4a72b0',
  inbound_request: '#8a5fa8',
}

type Permission = 'default' | 'granted' | 'denied' | 'unsupported'

function currentPermission(): Permission {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

/**
 * Bell with a count, a panel of items, and native notifications for new
 * follow-ups. Permission is only requested from the bell, never on load.
 */
export function NotificationsBell({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [permission, setPermission] = useState<Permission>(currentPermission)
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  const seen = useRef<Set<string> | null>(null)

  const q = useQuery({ queryKey: ['notifications'], queryFn: getNotifications, refetchInterval: 60_000, staleTime: 30_000 })

  // Native notification for follow-ups that were not in the previous poll.
  useEffect(() => {
    if (!q.data) return
    const ids = new Set(q.data.map((n) => n.id))
    if (seen.current && permission === 'granted') {
      for (const n of q.data) {
        if (seen.current.has(n.id) || (n.kind !== 'follow_up_due' && n.kind !== 'follow_up_overdue' && n.kind !== 'inbound_request')) continue
        try {
          const native = new Notification(`${KIND_LABEL[n.kind]} — ${n.title}`, { body: n.body, tag: n.id, silent: true })
          native.onclick = () => {
            window.focus()
            navigate(n.leadId ? `/call?leadId=${n.leadId}` : '/follow-ups')
            native.close()
          }
        } catch {
          /* blocked by the browser */
        }
      }
    }
    seen.current = ids
  }, [q.data, permission, navigate])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const items = q.data ?? []
  const count = items.length
  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }

  const askPermission = async () => {
    if (permission !== 'default') return
    try {
      const r = await Notification.requestPermission()
      setPermission(r)
    } catch {
      setPermission(currentPermission())
    }
  }

  return (
    <div className={`notif${compact ? ' compact' : ''}`} ref={ref}>
      <button
        type="button"
        className={`notif-btn${compact ? '' : ' nav-like'}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Notifications${count ? ` (${count})` : ''}`}
      >
        <IconBell size={18} />
        {!compact && <span>Notifications</span>}
        {count > 0 && <span className={compact ? 'tab-dot' : 'nav-badge'}>{count}</span>}
      </button>
      {open && (
        <div className="notif-panel" id={id} role="dialog" aria-label="Notifications">
          <header className="notif-head">
            <h2>Notifications</h2>
            <span className="muted xs">{count ? `${count} à traiter` : 'rien à signaler'}</span>
            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setOpen(false)} aria-label="Fermer">
              <IconX size={16} />
            </button>
          </header>
          {permission === 'default' && (
            <div className="notif-perm">
              <span>Recevoir une alerte du navigateur quand un suivi arrive à échéance ?</span>
              <button type="button" className="btn btn-sm" onClick={() => void askPermission()}>
                Activer les alertes
              </button>
            </div>
          )}
          {permission === 'denied' && <div className="notif-perm muted xs">Alertes du navigateur bloquées dans les réglages du site.</div>}
          <div className="notif-list">
            {q.isPending ? (
              <div style={{ padding: 16 }}>
                <SkeletonRows rows={4} />
              </div>
            ) : q.isError ? (
              <ErrorState error={q.error} onRetry={() => void q.refetch()} />
            ) : items.length === 0 ? (
              <EmptyState title="Tout est à jour">Aucun suivi dû ni appel d’offres qui clôture bientôt.</EmptyState>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id}>
                    <span className="dot" style={{ background: KIND_COLOR[n.kind] }} aria-hidden="true" />
                    <div className="notif-main">
                      <div className="notif-kind xs muted">
                        {KIND_LABEL[n.kind]} · {formatRelative(n.at)}
                      </div>
                      <div className="notif-title truncate">{n.title}</div>
                      <div className="notif-body small muted">{n.body}</div>
                    </div>
                    <div className="notif-actions">
                      {n.leadId && (
                        <button type="button" className="btn btn-sm" onClick={() => go(`/call?leadId=${n.leadId}`)} title="Appeler maintenant">
                          <IconPhone size={14} /> Appeler
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => go(n.leadId ? `/leads/${n.leadId}` : n.tenderId ? `/tenders/${n.tenderId}` : '/follow-ups')}
                      >
                        Ouvrir
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
