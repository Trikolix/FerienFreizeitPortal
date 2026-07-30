import React, { useEffect, useState, useRef } from 'react';
import { Outlet, Link, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Menu, Shield, UserRoundCog, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import headerCircles from '../assets/header_circles.svg';
import logoJugendring from '../assets/logo_jugendring_westsachsen.svg';

export const Layout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isAdmin = user?.role === 'admin' || user?.role === 'master_admin';
  const menuRef = useRef<HTMLDivElement>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const firstMenuItemRef = useRef<HTMLAnchorElement>(null);
  const mainNavRef = useRef<HTMLElement>(null);
  const accountLabel = user?.club_name || user?.display_name || user?.email || '';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleMenuKeyDown = (event: KeyboardEvent) => {
      if (!isMenuOpen) return;

      if (event.key === 'Escape') {
        setIsMenuOpen(false);
        requestAnimationFrame(() => menuToggleRef.current?.focus());
        return;
      }

      if (event.key !== 'Tab' || !mainNavRef.current) return;

      const focusableElements = Array.from(mainNavRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) {
        event.preventDefault();
      } else if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleMenuKeyDown);

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      const wasOverflow = document.body.style.overflow;
      const isMobileMenu = window.matchMedia('(max-width: 680px)').matches;
      if (isMobileMenu) document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => firstMenuItemRef.current?.focus());

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleMenuKeyDown);
        if (isMobileMenu) document.body.style.overflow = wasOverflow;
      };
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleMenuKeyDown);
    };
  }, [isMenuOpen]);

  return (
    <div className="app-container">
      <a className="skip-link" href="#main-content">Zum Inhalt springen</a>
      <header className={`site-header ${user ? 'has-user-menu' : 'is-public'}`}>
        <img className="header-circles" src={headerCircles} alt="" aria-hidden="true" />
        <div className="header-shell" ref={menuRef}>
          <Link to="/" className="brand-logo" aria-label="Jugendring Westsachsen Ferienfreizeiten Startseite">
            <img src={logoJugendring} alt="Jugendring Westsachsen" />
            <span className="brand-divider" aria-hidden="true" />
            <span className="brand-copy">
              <span className="brand-heading">
                Ferienfreizeiten<br className="brand-heading-break" /> Westsachsen
              </span>
              <span className="brand-subheading">Angebote für Kinder und Jugendliche</span>
            </span>
          </Link>

          {user ? (
            <>
              <button
                className="menu-toggle"
                type="button"
                onClick={() => setIsMenuOpen((current) => !current)}
                ref={menuToggleRef}
                aria-label={isMenuOpen ? 'Menü schließen' : 'Menü öffnen'}
                aria-expanded={isMenuOpen}
                aria-controls="main-navigation"
              >
                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>

              {isMenuOpen && <button className="menu-backdrop" type="button" onClick={() => setIsMenuOpen(false)} aria-label="Menü schließen" />}
              <nav ref={mainNavRef} id="main-navigation" className={`main-nav ${isMenuOpen ? 'is-open' : ''}`} aria-label="Kontomenü">
                <div className="menu-account-info">
                  <span>Eingeloggt als</span>
                  <strong>{accountLabel}</strong>
                </div>
                <ul>
                  <li>
                    <NavLink ref={firstMenuItemRef} to={isAdmin ? '/admin' : '/dashboard'} onClick={() => setIsMenuOpen(false)}>
                      {isAdmin ? <Shield size={17} /> : <UserRoundCog size={17} />}
                      {isAdmin ? 'Verwaltung' : 'Meine Freizeiten'}
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/einstellungen" onClick={() => setIsMenuOpen(false)}>
                      <UserRoundCog size={17} />
                      Konto &amp; Einstellungen
                    </NavLink>
                  </li>
                </ul>
                <div className="menu-divider" aria-hidden="true" />
                <button
                  className="menu-logout"
                  onClick={() => {
                    logout();
                    setIsMenuOpen(false);
                    requestAnimationFrame(() => menuToggleRef.current?.focus());
                  }}
                >
                  <LogOut size={17} />
                  Abmelden
                </button>
              </nav>
            </>
          ) : null}
        </div>
      </header>

      <main className="page-shell" id="main-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="site-footer">
        <span>&copy; {new Date().getFullYear()} Westsachsen Ferienfreizeiten</span>
        <Link to="/kontakt">Kontakt</Link>
        <Link to="/impressum">Impressum</Link>
        {!user && <Link to="/login">Vereins-Login</Link>}
      </footer>
    </div>
  );
};
