import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Building2, CalendarCheck, CalendarDays, ChevronRight, ClipboardCheck, FileSpreadsheet, LayoutDashboard, ShieldCheck, UserRoundCog } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { portalApi } from '../utils/portal';

export interface WorkspaceNavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  badge?: number;
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="breadcrumbs">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {index > 0 && <ChevronRight size={15} aria-hidden="true" />}
            {item.to ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function WorkspaceShell({
  navLabel,
  eyebrow,
  title,
  items,
  children,
}: {
  navLabel: string;
  eyebrow: string;
  title?: string;
  items: WorkspaceNavItem[];
  children: ReactNode;
}) {
  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <div className="workspace-sidebar-header">
          <span className="eyebrow" style={{ marginBottom: '.2rem' }}>{eyebrow}</span>
          {title && <strong>{title}</strong>}
        </div>
        <nav aria-label={navLabel}>
          <ul className="workspace-sidebar-list">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `workspace-nav-link ${isActive ? 'active' : ''}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span className="nav-badge is-attention">{item.badge}</span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="workspace-content">{children}</div>
    </div>
  );
}

export function ProviderWorkspaceShell({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const isApproved = user?.provider_status === 'approved';
  const items: WorkspaceNavItem[] = [
    ...(isApproved ? [
      { to: '/dashboard', label: 'Meine Freizeiten', icon: <CalendarCheck size={18} aria-hidden="true" /> },
      { to: '/buchungen', label: 'Alle Anmeldungen', icon: <ClipboardCheck size={18} aria-hidden="true" />, end: true },
    ] : []),
    { to: '/traegerprofil', label: 'Trägerprofil', icon: <Building2 size={18} aria-hidden="true" /> },
    { to: '/einstellungen', label: 'Konto & Einstellungen', icon: <UserRoundCog size={18} aria-hidden="true" /> },
  ];

  return (
    <WorkspaceShell
      navLabel="Vereinsnavigation"
      eyebrow="Vereinsbereich"
      title={user?.club_name || user?.display_name || user?.email}
      items={items}
    >
      {children}
    </WorkspaceShell>
  );
}

export function AdminWorkspaceShell({ children, pendingCount }: { children: ReactNode; pendingCount?: number }) {
  const user = useAuthStore((state) => state.user);
  const [fetchedPending, setFetchedPending] = useState(0);

  useEffect(() => {
    if (typeof pendingCount === 'number' || !user || user.role === 'user') return;
    let active = true;
    Promise.all([
      portalApi<{ id: number }[]>('/api/admin/reviews').catch(() => []),
      portalApi<{ status: string }[]>('/api/admin/providers').catch(() => []),
    ]).then(([reviews, providers]) => {
      if (!active) return;
      const campsCount = Array.isArray(reviews) ? reviews.length : 0;
      const providersCount = Array.isArray(providers) ? providers.filter((p) => p.status === 'submitted').length : 0;
      setFetchedPending(campsCount + providersCount);
    });
    return () => { active = false; };
  }, [pendingCount, user]);

  const badge = typeof pendingCount === 'number' ? pendingCount : fetchedPending;

  const items: WorkspaceNavItem[] = [
    { to: '/admin', label: 'Übersicht', icon: <LayoutDashboard size={18} aria-hidden="true" />, end: true },
    { to: '/admin/pruefungen', label: 'Prüfungen & Freigaben', icon: <ClipboardCheck size={18} aria-hidden="true" />, badge },
    { to: '/admin/vereine', label: 'Vereine & Konten', icon: <Building2 size={18} aria-hidden="true" /> },
    { to: '/admin/freizeiten', label: 'Alle Freizeiten', icon: <ShieldCheck size={18} aria-hidden="true" /> },
    { to: '/admin/ferien', label: 'Ferienzeiten', icon: <CalendarDays size={18} aria-hidden="true" /> },
    { to: '/admin/auswertung', label: 'Auswertung & Export', icon: <FileSpreadsheet size={18} aria-hidden="true" /> },
    { to: '/einstellungen', label: 'Konto & Einstellungen', icon: <UserRoundCog size={18} aria-hidden="true" /> },
  ];

  return (
    <WorkspaceShell
      navLabel="Verwaltungsnavigation"
      eyebrow="Jugendring-Verwaltung"
      title={user?.display_name || user?.email}
      items={items}
    >
      {children}
    </WorkspaceShell>
  );
}
