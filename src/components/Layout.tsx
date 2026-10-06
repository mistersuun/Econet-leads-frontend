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
  IconFileText,
  IconLeaf,
  IconLogOut,
  IconMore,
  IconPhone,
  IconPhonePlus,
  IconUsers,
} from './icons'

const MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

interface NavItem {
  to: string
  label: string
  short: string
  icon: typeof IconDashboard
  end?: boolean
  /** Needs attention: red count. */
  badge?: number
  /** Plain muted count. */
  count?: number
  /** Shown in the mobile tab bar (otherwise under "Plus"). */
  tab?: boolean
}

export function Layout() {
  const { user, logout, hasRole } = useAuth()
  const [sheetOpen, setSheetOpen] = useState(false)
  const location = useLocation()
  const summary = useQuery({ queryKey: ['summary', 'nav'], queryFn: () => getSummary(), staleTime: 60_000 })
  const overdue = (summary.data?.followUpsOverdue ?? 0) + (summary.data?.followUpsDue ?? 0)
  const toEnrich = summary.data?.toEnrich ?? 0

  const items: NavItem[] = [
    { to: '/', label: 'Tableau de bord', short: 'Tableau', icon: IconDashboard, end: true, tab: true },
    { to: '/call', label: 'Appeler', short: 'Appeler', icon: IconPhone, tab: true },
    { to: '/enrich', label: 'À enrichir', short: 'Enrichir', icon: IconPhonePlus, count: toEnrich },
    { to: '/leads', label: 'Leads', short: 'Leads', icon: IconUsers, tab: true },
    { to: '/follow-ups', label: 'Suivis', short: 'Suivis', icon: IconCalendarClock, badge: overdue, tab: true },
    { to: '/tenders', label: 'Appels d’offres', short: 'Offres', icon: IconFileText },
    ...(hasRole('ADMIN') ? [{ to: '/sources', label: 'Sources', short: 'Sources', icon: IconDatabase }] : []),
  ]
  const tabs = items.filter((it) => it.tab)
  const more = items.filter((it) => !it.tab)
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
              {!!it.count && <span className="nav-count" aria-label={`${it.count} leads sans téléphone`}>{it.count}</span>}
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
          {tabs.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end}>
              <it.icon size={22} />
              {it.short}
              {!!it.badge && <span className="tab-dot">{it.badge}</span>}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            className={more.some((it) => location.pathname.startsWith(it.to)) ? 'active' : undefined}
          >
            <IconMore size={22} />
            Plus
          </button>
        </nav>
      </div>

      {sheetOpen && (
        <MoreSheet key={location.pathname} onClose={() => setSheetOpen(false)}>
          {more.map((it) => (
            <NavLink key={it.to} to={it.to} onClick={() => setSheetOpen(false)}>
              <it.icon size={20} /> {it.to === '/sources' ? 'Sources de données' : it.label}
              {!!it.count && <span className="sheet-count num">{it.count}</span>}
            </NavLink>
          ))}
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
