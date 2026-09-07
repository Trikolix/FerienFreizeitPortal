import { AccessibleForm } from '../components/AccessibleForm';
import { apiFetch } from '../utils/api';
import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, LogIn, UserRound } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export const LoginPage: React.FC<{ onAuthenticated?: () => void; expectedUserId?: number }> = ({ onAuthenticated, expectedUserId }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const passwordChanged = searchParams.get('passwort-geaendert') === '1';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');

    try {
      const res = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login fehlgeschlagen');
      } else {
        if (expectedUserId && data.user.id !== expectedUserId) throw new Error('Bitte mit demselben Konto anmelden, um diese Eingaben weiterzubearbeiten.');
        login(data.user, data.csrf_token);
        if (onAuthenticated) onAuthenticated();
        else navigate(data.user.role === 'user' ? '/dashboard' : '/admin');
      }
    } catch (error) { setError(error instanceof Error ? error.message : 'Anmeldung fehlgeschlagen.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-visual" aria-hidden="true">
          <span className="auth-badge">Vereinsbereich</span>
          <p>Angebote pflegen, veröffentlichen und aktuell halten.</p>
        </div>

        <AccessibleForm className="auth-form" onSubmit={handleSubmit}>
          <div>
            <span className="eyebrow">Login</span>
            <h1>Für Jugendvereine</h1>
            <p>Nach der Anmeldung kannst du Freizeiten verwalten und neue Angebote einstellen.</p>
          </div>

          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          {passwordChanged && <p className="success-alert" role="status">Passwort geändert. Bitte melde dich mit dem neuen Passwort an.</p>}

          <label className="field">
            <span>E-Mail oder Nutzername</span>
            <div className="input-with-icon">
              <UserRound size={18} />
              <input
                type="text"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="username"
              />
            </div>
          </label>

          <label className="field">
            <span>Passwort</span>
            <div className="input-with-icon">
              <KeyRound size={18} />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          </label>

          <button className="primary-action" type="submit" disabled={busy}>
            <LogIn size={18} />
            {busy ? 'Anmeldung läuft …' : 'Anmelden'}
          </button>
          <Link className="secondary-action auth-link" to="/passwort-vergessen">
            Passwort vergessen
          </Link>
        </AccessibleForm>
      </section>
    </div>
  );
};
