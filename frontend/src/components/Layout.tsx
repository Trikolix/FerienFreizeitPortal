import { useEffect, useRef, useState } from 'react';
import { Outlet, Link, NavLink, useLocation } from 'react-router-dom';
import { Building2, CalendarCheck, CalendarDays, ClipboardCheck, Compass, FileSpreadsheet, LayoutDashboard, LogOut, Menu, Shield, ShieldCheck, UserRoundCog, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import logoJugendring from '../assets/logo_jugendring_westsachsen.svg';

export function Layout() {
  const { user, logout } = useAuthStore();
  const { pathname } = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const main = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const isAdmin = user?.role === 'admin' || user?.role === 'master_admin';

  useEffect(() => {
    const content = main.current;
    if (!content) return;
    content.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
    const updateTitle = () => {
      const heading = content.querySelector('h1');
      document.title = heading ? heading.textContent + ' · Ferienfreizeiten Westsachsen' : 'Ferienfreizeiten Westsachsen';
    };
    updateTitle();
    const observer = new MutationObserver(updateTitle);
    observer.observe(content, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if (isMenuOpen && !menu.current?.contains(event.target as Node)) setIsMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isMenuOpen) { setIsMenuOpen(false); toggle.current?.focus(); }
      const container = (event.target as HTMLElement).closest?.('.multi-select-container');
      if (event.key === 'Escape' && container) {
        const trigger = container.querySelector<HTMLButtonElement>('button[aria-expanded="true"]');
        trigger?.click(); trigger?.focus();
      }
    };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', escape); };
  }, [isMenuOpen]);

  return <div className="app-container">
    <a className="skip-link" href="#main-content">Zum Inhalt springen</a>
    <header className="site-header">
      <div className="header-shell" ref={menu}>
        <Link to="/" className="brand-logo" aria-label="Jugendring Westsachsen Ferienfreizeiten Startseite">
          <img src={logoJugendring} alt="Jugendring Westsachsen" />
          <span className="brand-divider" aria-hidden="true" />
          <span className="brand-copy"><span className="brand-heading">Ferienfreizeiten<br className="brand-heading-break" /> Westsachsen</span><span className="brand-subheading">Gemeinsam eine gute Zeit erleben.</span></span>
        </Link>
        <div className="header-actions">
          <nav className="header-nav" aria-label="Hauptnavigation">
            <NavLink to="/" end><Compass size={16} aria-hidden="true" />Freizeiten</NavLink>
            {user && (
              isAdmin ? (
                <NavLink to="/admin"><Shield size={16} aria-hidden="true" />Verwaltung</NavLink>
              ) : (
                <NavLink to={user.provider_status === 'approved' ? '/dashboard' : '/traegerprofil'}>
                  <CalendarCheck size={16} aria-hidden="true" />Vereinsbereich
                </NavLink>
              )
            )}
          </nav>
          {!user ? <Link className="secondary-action" to="/login">Vereins-Login</Link> : <button ref={toggle} type="button" className="menu-toggle" aria-label={isMenuOpen ? 'Menü schließen' : 'Menü öffnen'} aria-expanded={isMenuOpen} aria-controls="main-navigation" onClick={() => setIsMenuOpen(!isMenuOpen)}>{isMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button>}
        </div>
        {user && <nav id="main-navigation" className={`main-nav ${isMenuOpen ? 'is-open' : ''}`} aria-label="Kontomenü" onBlur={event => { if (event.relatedTarget && !menu.current?.contains(event.relatedTarget as Node)) setIsMenuOpen(false); }}>
          <div className="menu-account-info"><span>Eingeloggt als</span><strong>{user.club_name || user.display_name || user.email}</strong></div>
          <ul>
            <li><NavLink to="/" end onClick={() => setIsMenuOpen(false)}><Compass size={18} aria-hidden="true" />Alle Freizeiten</NavLink></li>
            {isAdmin ? <>
              <li><NavLink to="/admin" end onClick={() => setIsMenuOpen(false)}><LayoutDashboard size={18} aria-hidden="true" />Übersicht</NavLink></li>
              <li><NavLink to="/admin/pruefungen" onClick={() => setIsMenuOpen(false)}><ClipboardCheck size={18} aria-hidden="true" />Prüfungen &amp; Freigaben</NavLink></li>
              <li><NavLink to="/admin/vereine" onClick={() => setIsMenuOpen(false)}><Building2 size={18} aria-hidden="true" />Vereine &amp; Konten</NavLink></li>
              <li><NavLink to="/admin/freizeiten" onClick={() => setIsMenuOpen(false)}><ShieldCheck size={18} aria-hidden="true" />Alle Freizeiten</NavLink></li>
              <li><NavLink to="/admin/ferien" onClick={() => setIsMenuOpen(false)}><CalendarDays size={18} aria-hidden="true" />Ferienzeiten</NavLink></li>
              <li><NavLink to="/admin/auswertung" onClick={() => setIsMenuOpen(false)}><FileSpreadsheet size={18} aria-hidden="true" />Auswertung &amp; Export</NavLink></li>
            </> : <>
              {user.provider_status === 'approved' && <>
                <li><NavLink to="/dashboard" onClick={() => setIsMenuOpen(false)}><CalendarCheck size={18} aria-hidden="true" />Meine Freizeiten</NavLink></li>
                <li><NavLink to="/buchungen" onClick={() => setIsMenuOpen(false)}><ClipboardCheck size={18} aria-hidden="true" />Anmeldungen &amp; Wartelisten</NavLink></li>
              </>}
              <li><NavLink to="/traegerprofil" onClick={() => setIsMenuOpen(false)}><Building2 size={18} aria-hidden="true" />Trägerprofil &amp; Stammdaten</NavLink></li>
            </>}
            <li><NavLink to="/einstellungen" onClick={() => setIsMenuOpen(false)}><UserRoundCog size={18} aria-hidden="true" />Konto &amp; Einstellungen</NavLink></li>
          </ul>
          <div className="menu-divider" />
          <button type="button" className="menu-logout" disabled={loggingOut} onClick={async () => {
            if (loggingOut || !window.dispatchEvent(new Event('request-leave-editor', { cancelable: true }))) return;
            setLoggingOut(true);
            try { await logout(); setIsMenuOpen(false); }
            catch (error) { setLogoutError(error instanceof Error ? error.message : 'Abmelden fehlgeschlagen.'); }
            finally { setLoggingOut(false); }
          }}><LogOut size={18} aria-hidden="true" />Abmelden</button>
          {logoutError && <p role="alert">{logoutError}</p>}
        </nav>}
      </div>
    </header>
    <main className="page-shell" id="main-content" ref={main} tabIndex={-1}><Outlet /></main>
    <footer className="site-footer" aria-label="Informationen und Kontakt">
      <span>&copy; {new Date().getFullYear()} Ferienfreizeiten Westsachsen</span>
      <Link to="/kontakt">Kontakt</Link><Link to="/impressum">Impressum</Link><Link to="/datenschutz">Datenschutz</Link><Link to="/barrierefreiheit">Barrierefreiheit</Link>
    </footer>
  </div>;
}
