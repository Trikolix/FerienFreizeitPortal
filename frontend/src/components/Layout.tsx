import React, { useEffect } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';
import { motion, AnimatePresence } from 'framer-motion';

export const Layout: React.FC = () => {
  const { theme, setTheme } = useThemeStore();
  const { user, logout } = useAuthStore();

  useEffect(() => {
    document.documentElement.className = `theme-${theme}`;
  }, [theme]);

  return (
    <div className={`app-container theme-${theme}`} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>
            <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>Westsachsen Ferienfreizeiten</Link>
          </h1>
          <nav aria-label="Main Navigation">
            <ul style={{ display: 'flex', listStyle: 'none', gap: '1rem', margin: 0, padding: 0 }}>
              <li><Link to="/">Suche</Link></li>
              {user && (
                <>
                  <li>
                    <Link to={user.role === 'admin' ? '/admin' : '/dashboard'}>Dashboard</Link>
                  </li>
                  <li>
                    <button onClick={logout} aria-label="Logout">Logout ({user.username})</button>
                  </li>
                </>
              )}
            </ul>
          </nav>
        </div>

        <div className="theme-toggle">
          <label htmlFor="theme-select" style={{ marginRight: '0.5rem' }}>Kontrast/Design:</label>
          <select
            id="theme-select"
            value={theme}
            onChange={(e) => setTheme(e.target.value as any)}
            aria-label="Wähle das Farbschema"
          >
            <option value="default">Standard</option>
            <option value="high-contrast">Hoher Kontrast</option>
            <option value="colorblind">Rot-Grün-Schwäche</option>
          </select>
        </div>
      </header>

      <main style={{ flex: 1, padding: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }} id="main-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={window.location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer style={{ padding: '2rem 1rem', textAlign: 'center', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', gap: '2rem', backgroundColor: 'var(--bg-color-secondary)' }}>
        <span>&copy; {new Date().getFullYear()} Westsachsen Ferienfreizeiten</span>
        <Link to="/impressum" style={{ color: 'var(--text-color)', textDecoration: 'none' }}>Impressum</Link>
        {!user && <Link to="/login" style={{ color: 'var(--text-color)', opacity: 0.5, textDecoration: 'none', fontSize: '0.9em' }}>Vereins-Login</Link>}
      </footer>
    </div>
  );
};
