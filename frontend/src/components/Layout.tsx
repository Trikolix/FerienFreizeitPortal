import React, { useEffect } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';

export const Layout: React.FC = () => {
  const { theme, setTheme } = useThemeStore();
  const { user, logout } = useAuthStore();

  useEffect(() => {
    document.documentElement.className = `theme-${theme}`;
  }, [theme]);

  return (
    <div className={`app-container theme-${theme}`} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <nav aria-label="Main Navigation">
          <ul style={{ display: 'flex', listStyle: 'none', gap: '1rem', margin: 0, padding: 0 }}>
            <li><Link to="/">Suche</Link></li>
            {user ? (
              <>
                <li>
                  <Link to={user.role === 'admin' ? '/admin' : '/dashboard'}>Dashboard</Link>
                </li>
                <li>
                  <button onClick={logout} aria-label="Logout">Logout ({user.username})</button>
                </li>
              </>
            ) : (
              <li><Link to="/login">Login für Vereine</Link></li>
            )}
          </ul>
        </nav>

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

      <main style={{ flex: 1, padding: '1rem' }} id="main-content">
        <Outlet />
      </main>

      <footer style={{ padding: '1rem', textAlign: 'center', borderTop: '1px solid #ccc' }}>
        &copy; {new Date().getFullYear()} Westsachsen Ferienfreizeiten
      </footer>
    </div>
  );
};
