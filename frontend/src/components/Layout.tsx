import React, { useEffect } from 'react';
import { Outlet, Link, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Compass, LogIn, LogOut, Palette, Shield, TentTree, UserRoundCog } from 'lucide-react';
import { type Theme, useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';

const themes: Array<{ value: Theme; label: string; note: string }> = [
  { value: 'default', label: 'Sonnenklar', note: 'warm, modern' },
  { value: 'colorblind', label: 'Kobalt', note: 'rot-grün-sicher' },
  { value: 'deuteranopia', label: 'Graphit', note: 'maximal unterscheidbar' },
  { value: 'high-contrast', label: 'Kontrast', note: 'WCAG stark' },
];

export const Layout: React.FC = () => {
  const { theme, setTheme } = useThemeStore();
  const { user, logout } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.className = `theme-${theme}`;
  }, [theme]);

  return (
    <div className={`app-container theme-${theme}`}>
      <header className="site-header">
        <div className="header-shell">
          <Link to="/" className="brand" aria-label="Westsachsen Ferienfreizeiten Startseite">
            <span className="brand-mark">
              <TentTree size={22} />
            </span>
            <span>
              <span className="brand-title">FreizeitPortal</span>
              <span className="brand-subtitle">Westsachsen</span>
            </span>
          </Link>

          <nav className="main-nav" aria-label="Hauptnavigation">
            <ul>
              <li>
                <NavLink to="/" end>
                  <Compass size={17} />
                  Suche
                </NavLink>
              </li>
              {user && (
                <>
                  <li>
                    <NavLink to={user.role === 'admin' ? '/admin' : '/dashboard'}>
                      {user.role === 'admin' ? <Shield size={17} /> : <UserRoundCog size={17} />}
                      Dashboard
                    </NavLink>
                  </li>
                  <li>
                    <button className="icon-button text-button" onClick={logout} aria-label="Logout">
                      <LogOut size={17} />
                      {user.username}
                    </button>
                  </li>
                </>
              )}
              {!user && (
                <li>
                  <NavLink to="/login">
                    <LogIn size={17} />
                    Login
                  </NavLink>
                </li>
              )}
            </ul>
          </nav>

          <div className="theme-switcher" aria-label="Farbschema auswählen">
            <Palette size={17} />
            <select
              value={theme}
              onChange={(event) => setTheme(event.target.value as Theme)}
              aria-label="Farbschema auswählen"
            >
              {themes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label} · {item.note}
                </option>
              ))}
            </select>
          </div>
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
