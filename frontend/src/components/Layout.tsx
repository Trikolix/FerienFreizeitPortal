import { useEffect, useRef, useState } from 'react';
import { Outlet, Link, NavLink, useLocation } from 'react-router-dom';
import { LogOut, Menu, Shield, UserRoundCog, X } from 'lucide-react';
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
          <NavLink className="text-button" to="/">Freizeiten entdecken</NavLink>
          {!user ? <Link className="secondary-action" to="/login">Vereins-Login</Link> : <button ref={toggle} type="button" className="menu-toggle" aria-label={isMenuOpen ? 'Menü schließen' : 'Menü öffnen'} aria-expanded={isMenuOpen} aria-controls="main-navigation" onClick={() => setIsMenuOpen(!isMenuOpen)}>{isMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button>}
        </div>
        {user && <nav id="main-navigation" className={`main-nav ${isMenuOpen ? 'is-open' : ''}`} aria-label="Kontomenü" onBlur={event => { if (event.relatedTarget && !menu.current?.contains(event.relatedTarget as Node)) setIsMenuOpen(false); }}>
          <div className="menu-account-info"><span>Eingeloggt als</span><strong>{user.club_name || user.display_name || user.email}</strong></div>
          <ul><li><NavLink to={isAdmin ? '/admin' : '/dashboard'} onClick={() => setIsMenuOpen(false)}>{isAdmin ? <Shield size={18} aria-hidden="true" /> : <UserRoundCog size={18} aria-hidden="true" />}{isAdmin ? 'Verwaltung' : 'Meine Freizeiten'}</NavLink></li>
            <li><NavLink to="/einstellungen" onClick={() => setIsMenuOpen(false)}><UserRoundCog size={18} aria-hidden="true" />Konto &amp; Einstellungen</NavLink></li></ul>
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
