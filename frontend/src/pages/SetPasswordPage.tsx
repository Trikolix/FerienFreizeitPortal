import { useAction } from '../utils/useAction';
import { apiFetch } from '../utils/api';
import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';

export const SetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const purpose = useMemo(() => searchParams.get('purpose') === 'reset' ? 'reset' : 'invite', [searchParams]);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { busy, runAction } = useAction(setError);

  const handleSubmit = (event: React.FormEvent) => runAction(async () => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (password.length < 8 || new TextEncoder().encode(password).length > 72) {
      setError(password.length < 8 ? 'Bitte mindestens 8 Zeichen verwenden.' : 'Dieses Passwort ist zu lang. Bitte etwas kürzen; Sonderzeichen benötigen mehr Platz.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }

    try {
      const response = await apiFetch('/api/password/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, purpose, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Passwort konnte nicht gespeichert werden');
        return;
      }
      setMessage(data.message || 'Passwort wurde gespeichert.');
      setPassword('');
      setPasswordConfirm('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Anfrage fehlgeschlagen.');
    }
  });

  return (
    <div className="auth-page">
      <section className="auth-card single">
        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <span className="eyebrow">{purpose === 'invite' ? 'Aktivierung' : 'Passwort'}</span>
            <h2>{purpose === 'invite' ? 'Account aktivieren' : 'Neues Passwort setzen'}</h2>
            <p>Wähle ein neues Passwort für dein Konto.</p>
          </div>
          {!token && <p className="alert" role="alert">Der Link enthält keinen gültigen Token.</p>}
          {error && <p className="alert" role="alert">{error}</p>}
          {message && <p className="success-alert" role="status">{message}</p>}
          <label className="field">
            <span>Neues Passwort</span>
            <div className="input-with-icon">
              <KeyRound size={18} />
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" />
            </div>
          </label>
          <label className="field">
            <span>Passwort wiederholen</span>
            <div className="input-with-icon">
              <KeyRound size={18} />
              <input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} required autoComplete="new-password" />
            </div>
          </label>
          <button className="primary-action" type="submit" disabled={!token || busy || Boolean(message)}>Passwort speichern</button>
          {message && <Link className="secondary-action auth-link" to="/login">Zur Anmeldung</Link>}
        </form>
      </section>
    </div>
  );
};
