import React, { useState } from 'react';
import { Outlet, Link, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Compass, LogIn, LogOut, Menu, Shield, UserRoundCog, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import headerCircles from '../assets/header_circles.svg';
import logoJugendring from '../assets/logo_jugendring_westsachsen.svg';

export const Layout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="app-container">
      <header className="site-header">
        <img className="header-circles" src={headerCircles} alt="" aria-hidden="true" />
        <div className="header-shell">
          <span aria-hidden="true" />

          <Link to="/" className="brand-logo" aria-label="Jugendring Westsachsen Ferienfreizeiten Startseite">
            <img src={logoJugendring} alt="Jugendring Westsachsen" />
          </Link>

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

          <nav id="main-navigation" className={`main-nav ${isMenuOpen ? 'is-open' : ''}`} aria-label="Hauptnavigation">
            <ul>
              <li>
                <NavLink to="/" end onClick={() => setIsMenuOpen(false)}>
                  <Compass size={17} />
                  Suche
                </NavLink>
              </li>
              {user && (
                <>
                  <li>
                    <NavLink to={user.role === 'admin' ? '/admin' : '/dashboard'} onClick={() => setIsMenuOpen(false)}>
                      {user.role === 'admin' ? <Shield size={17} /> : <UserRoundCog size={17} />}
                      Dashboard
                    </NavLink>
                  </li>
                  <li>
                    <button className="icon-button text-button" onClick={() => { logout(); setIsMenuOpen(false); }} aria-label="Logout">
                      <LogOut size={17} />
                      {user.username}
                    </button>
                  </li>
                </>
              )}
              {!user && (
                <li>
                  <NavLink to="/login" onClick={() => setIsMenuOpen(false)}>
                    <LogIn size={17} />
                    Login
                  </NavLink>
                </li>
              )}
            </ul>
          </nav>
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
        <Link to="/impressum">Impressum</Link>
        {!user && <Link to="/login">Vereins-Login</Link>}
      </footer>
    </div>
  );
};
