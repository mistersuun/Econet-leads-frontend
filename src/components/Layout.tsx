import { Suspense, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { getSummary } from '../api/endpoints'
import { ROLE_LABEL } from '../lib/status'
import { SkeletonRows } from './States'
import {
  IconCalendarClock,
  IconDashboard,
  IconDatabase,
  IconLeaf,
  IconLogOut,
  IconMore,
  IconPhone,
  IconUsers,
} from './icons'

const MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

export function Layout() {
  const { user, logout, hasRole } = useAuth()
  const [sheetOpen, setSheetOpen] = useState(false)
  const location = useLocation()
  const summary = useQuery({ queryKey: ['summary', 'nav'], queryFn: () => getSummary(), staleTime: 60_000 })
  const overdue = (summary.data?.followUpsOverdue ?? 0) + (summary.data?.followUpsDue ?? 0)

  const items = [
    { to: '/', label: 'Tableau de bord', short: 'Tableau', icon: IconDashboard, end: true },
    { to: '/call', label: 'Appeler', short: 'Appeler', icon: IconPhone },
    { to: '/leads', label: 'Leads', short: 'Leads', icon: IconUsers },
    { to: '/follow-ups', label: 'Suivis', short: 'Suivis', icon: IconCalendarClock, badge: overdue },
    ...(hasRole('ADMIN') ? [{ to: '/sources', label: 'Sources', short: 'Sources', icon: IconDatabase }] : []),
  ]
  const initials = (user?.username ?? '?')
    .split(/[.\s_-]/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Navigation principale">
        <div className="brand">
          <span className="brand-mark">
            <IconLeaf size={16} />
          </span>
          <span>
            EcoNet Leads
            <small>CRM prospection</small>
          </span>
        </div>
        <nav className="nav">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end}>
              <it.icon size={18} />
              {it.label}
              {!!it.badge && <span className="nav-badge" aria-label={`${it.badge} suivis à faire`}>{it.badge}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <span className="avatar" aria-hidden="true">{initials}</span>
          <div className="who">
            <strong className="truncate">{user?.username}</strong>
            <span>{user ? ROLE_LABEL[user.role] : ''}</span>
          </div>
          <button type="button" className="icon-btn-dark" onClick={logout} title="Se déconnecter" aria-label="Se déconnecter">
            <IconLogOut size={18} />
          </button>
        </div>
      </aside>

      <div className="main">
        {MOCKS && <div className="mock-banner">Mode démo — données simulées<span className="hide-sm"> en mémoire (VITE_USE_MOCKS=true)</span></div>}
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">
              <IconLeaf size={15} />
            </span>
            EcoNet Leads
          </div>
          <span className="spacer" />
          <span className="avatar" style={{ width: 28, height: 28 }} aria-label={user?.username}>
            {initials}
          </span>
        </header>
        <main id="content">
          <Suspense fallback={<div className="page"><SkeletonRows rows={6} /></div>}>
            <Outlet />
          </Suspense>
        </main>
        <nav className="tabbar" aria-label="Navigation">
          {items.slice(0, 4).map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end}>
              <it.icon size={22} />
              {it.short}
              {!!it.badge && <span className="tab-dot">{it.badge}</span>}
            </NavLink>
          ))}
          <button type="button" onClick={() => setSheetOpen(true)} aria-haspopup="dialog" aria-expanded={sheetOpen}>
            <IconMore size={22} />
            Plus
          </button>
        </nav>
      </div>

      {sheetOpen && (
        <MoreSheet key={location.pathname} onClose={() => setSheetOpen(false)}>
          {hasRole('ADMIN') && (
            <NavLink to="/sources" onClick={() => setSheetOpen(false)}>
              <IconDatabase size={20} /> Sources de données
            </NavLink>
          )}
          <div style={{ padding: '16px 8px', borderBottom: '1px solid var(--hairline)' }} className="small muted">
            Connecté : <strong style={{ color: 'var(--ink)' }}>{user?.username}</strong> · {user ? ROLE_LABEL[user.role] : ''}
          </div>
          <button type="button" className="sheet-item" onClick={logout}>
            <IconLogOut size={20} /> Se déconnecter
          </button>
        </MoreSheet>
      )}
    </div>
  )
}

function MoreSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Plus d'options"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="grabber" />
        {children}
      </div>
    </>
  )
}
