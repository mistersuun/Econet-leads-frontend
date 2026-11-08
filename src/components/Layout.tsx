import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { getSummary } from '../api/endpoints'
import { inboundMessage } from '../lib/inbound'
import { AddLeadProvider, useAddLead } from './AddLead'
import { useLiveEvent, useLiveInvalidate } from '../live/LiveProvider'
import { ROLE_LABEL } from '../lib/status'
import { NotificationsBell } from './NotificationsBell'
import { SkeletonRows } from './States'
import { TeamPresence } from './TeamPresence'
import { useToast } from './Toast'
import {
  IconCalendarClock,
  IconCompass,
  IconDashboard,
  IconDatabase,
  IconFileText,
  IconLeaf,
  IconLogOut,
  IconMore,
  IconPhone,
  IconPhonePlus,
  IconPlus,
  IconSettings,
  IconUpload,
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
  return (
    <AddLeadProvider>
      <LayoutShell />
    </AddLeadProvider>
  )
}

function LayoutShell() {
  const { user, logout, hasRole } = useAuth()
  const { open: openAddLead } = useAddLead()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [sheetOpen, setSheetOpen] = useState(false)
  const location = useLocation()
  const toast = useToast()
  const summary = useQuery({ queryKey: ['summary', 'nav'], queryFn: () => getSummary(), staleTime: 60_000 })
  const bannerRef = useRef<HTMLDivElement>(null)

  // The call screen fits the viewport exactly; tell it how tall the chrome above it is.
  useEffect(() => {
    const el = bannerRef.current
    const set = () => document.documentElement.style.setProperty('--banner-h', `${el?.offsetHeight ?? 0}px`)
    set()
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Keep every screen in step with the team, and celebrate a teammate's win.
  useLiveInvalidate()
  useLiveEvent((e) => {
    if (e.type === 'call.logged' && e.data.outcome === 'WON' && e.data.userId !== user?.userId) {
      toast(`${e.data.username} a gagné un contrat — ${e.data.leadName}`)
    }
    if (e.type === 'lead.inbound' && user?.role !== 'VIEWER') {
      // A website request: the hottest lead there is. Sticky, one tap to call.
      const { leadId, leadName, kind } = e.data
      void qc.invalidateQueries({ queryKey: ['queue'] })
      void qc.invalidateQueries({ queryKey: ['leads'] })
      void qc.invalidateQueries({ queryKey: ['summary'] })
      void qc.invalidateQueries({ queryKey: ['notifications'] })
      toast(inboundMessage({ leadName, kind }, e.data), 'info', { sticky: true, action: { label: 'Appeler', onClick: () => navigate(`/call?leadId=${leadId}`) } })
    }
  })
  const overdue = (summary.data?.followUpsOverdue ?? 0) + (summary.data?.followUpsDue ?? 0)
  const toEnrich = summary.data?.toEnrich ?? 0

  const items: NavItem[] = [
    { to: '/', label: 'Tableau de bord', short: 'Tableau', icon: IconDashboard, end: true, tab: true },
    { to: '/call', label: 'Appeler', short: 'Appeler', icon: IconPhone, tab: true },
    { to: '/enrich', label: 'À enrichir', short: 'Enrichir', icon: IconPhonePlus, count: toEnrich },
    { to: '/leads', label: 'Leads', short: 'Leads', icon: IconUsers, tab: true },
    { to: '/follow-ups', label: 'Suivis', short: 'Suivis', icon: IconCalendarClock, badge: overdue, tab: true },
    { to: '/tenders', label: 'Appels d’offres', short: 'Offres', icon: IconFileText },
    ...(hasRole('ADMIN', 'USER')
      ? [
          { to: '/import', label: 'Importer', short: 'Importer', icon: IconUpload },
          { to: '/discover', label: 'Trouver des entreprises', short: 'Trouver', icon: IconCompass },
        ]
      : []),
    ...(hasRole('ADMIN')
      ? [
          { to: '/sources', label: 'Sources', short: 'Sources', icon: IconDatabase },
          { to: '/settings', label: 'Réglages', short: 'Réglages', icon: IconSettings },
        ]
      : []),
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
          <NotificationsBell />
        </nav>
        <TeamPresence />
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
        {MOCKS && <div className="mock-banner" ref={bannerRef}>Mode démo — données simulées<span className="hide-sm"> en mémoire (VITE_USE_MOCKS=true)</span></div>}
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">
              <IconLeaf size={15} />
            </span>
            EcoNet Leads
          </div>
          <span className="spacer" />
          <NotificationsBell compact />
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
          {hasRole('ADMIN', 'USER') && (
            <button type="button" className="sheet-item" onClick={() => { setSheetOpen(false); openAddLead() }}>
              <IconPlus size={20} /> Ajouter un lead
            </button>
          )}
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
