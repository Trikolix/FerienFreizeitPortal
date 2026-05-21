import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, LogIn, UserRound } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login fehlgeschlagen');
      } else {
        login(data.user, data.token);
        navigate(data.user.role === 'admin' ? '/admin' : '/dashboard');
      }
    } catch {
      setError('Netzwerkfehler');
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-visual" aria-hidden="true">
          <span className="auth-badge">Vereinsbereich</span>
          <h1>Angebote pflegen, veröffentlichen und aktuell halten.</h1>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <span className="eyebrow">Login</span>
            <h2>Für Jugendvereine</h2>
            <p>Nach der Anmeldung kannst du Freizeiten verwalten und neue Angebote einstellen.</p>
          </div>

          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}

          <label className="field">
            <span>Benutzername</span>
            <div className="input-with-icon">
              <UserRound size={18} />
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
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

          <button className="primary-action" type="submit">
            <LogIn size={18} />
            Anmelden
          </button>
        </form>
      </section>
    </div>
  );
};
