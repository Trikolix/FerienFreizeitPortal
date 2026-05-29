import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/password/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Anfrage konnte nicht verarbeitet werden');
        return;
      }
      setMessage(data.message || 'Wenn ein Konto existiert, wurde eine E-Mail versendet.');
    } catch {
      setError('Netzwerkfehler');
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-card single">
        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <span className="eyebrow">Passwort</span>
            <h2>Passwort zurücksetzen</h2>
            <p>Du erhältst einen Link, über den du ein neues Passwort festlegen kannst.</p>
          </div>
          {error && <p className="alert" role="alert">{error}</p>}
          {message && <p className="success-alert" role="status">{message}</p>}
          <label className="field">
            <span>E-Mail</span>
            <div className="input-with-icon">
              <Mail size={18} />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
            </div>
          </label>
          <button className="primary-action" type="submit">Link anfordern</button>
          <Link className="secondary-action auth-link" to="/login">Zur Anmeldung</Link>
        </form>
      </section>
    </div>
  );
};
