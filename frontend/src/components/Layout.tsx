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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
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
                aria-label={isMenuOpen ? 'Menü schließen' : 'Menü öffnen'}
                aria-expanded={isMenuOpen}
                aria-controls="main-navigation"
              >
                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>

              <nav id="main-navigation" className={`main-nav ${isMenuOpen ? 'is-open' : ''}`} aria-label="Interne Navigation">
                <ul>
                  <li>
                    <NavLink to={isAdmin ? '/admin' : '/dashboard'} onClick={() => setIsMenuOpen(false)}>
                      {isAdmin ? <Shield size={17} /> : <UserRoundCog size={17} />}
                      Dashboard
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/einstellungen" onClick={() => setIsMenuOpen(false)}>
                      <UserRoundCog size={17} />
                      Einstellungen
                    </NavLink>
                  </li>
                  <li>
                    <button
                      className="icon-button text-button"
                      onClick={() => {
                        logout();
                        setIsMenuOpen(false);
                      }}
                      aria-label="Logout"
                    >
                      <LogOut size={17} />
                      {user.display_name || user.email}
                    </button>
                  </li>
                </ul>
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
