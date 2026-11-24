import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AccessibleForm } from '../components/AccessibleForm';
import { fragmentToken, portalApi } from '../utils/portal';

export function ProviderRegistrationPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await portalApi<{ message: string }>('/api/providers/register', { email, password });
      setMessage(response.message);
      setPassword('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Registrierung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-card single">
        <div className="auth-form">
          <div>
            <span className="eyebrow">Für Vereine &amp; Träger</span>
            <h1>Als Träger registrieren</h1>
            <p>Für Vereine, Verbände, Unternehmen und öffentliche Träger. Nach der E-Mail-Bestätigung ergänzt du eure Organisationsdaten. Der Jugendring prüft das Profil vor der Freigabe.</p>
          </div>

          <ol className="stepper" aria-label="Ablauf der Registrierung">
            <li className="stepper-item is-active"><span className="stepper-num" aria-hidden="true">1</span><span>Konto anlegen</span></li>
            <li className="stepper-item"><span className="stepper-num" aria-hidden="true">2</span><span>E-Mail bestätigen</span></li>
            <li className="stepper-item"><span className="stepper-num" aria-hidden="true">3</span><span>Profil prüfen lassen</span></li>
          </ol>

          {error && <p role="alert" className="alert">{error}</p>}
          {message ? (
            <p role="status" className="success-alert">{message}</p>
          ) : (
            <AccessibleForm onSubmit={submit}>
              <label className="field">
                <span>E-Mail-Adresse des verantwortlichen Kontos</span>
                <input type="email" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} required />
              </label>
              <label className="field">
                <span>Passwort (mindestens 12 Zeichen, höchstens 72 Bytes)</span>
                <input type="password" autoComplete="new-password" minLength={12} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} required />
              </label>
              <button className="primary-action" disabled={busy}>{busy ? 'Registrierung läuft …' : 'Bestätigungslink anfordern'}</button>
            </AccessibleForm>
          )}
          <p><Link className="secondary-action auth-link" to="/login">Zum Träger-Login</Link></p>
        </div>
      </section>
    </div>
  );
}

export function ProviderVerificationPage() {
  const [token] = useState(fragmentToken);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    portalApi<{ message: string }>('/api/providers/verify-email', { token })
      .then(result => { if (active) setMessage(result.message); })
      .catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [token]);

  return (
    <div className="auth-page">
      <section className="auth-card single">
        <div className="auth-form">
          <div>
            <span className="eyebrow">Bestätigung</span>
            <h1>E-Mail bestätigen</h1>
          </div>
          {error ? <p role="alert" className="alert">{error}</p> : <p role="status" className="success-alert">{message || 'Bestätigung wird geprüft …'}</p>}
          <Link className="primary-action auth-link" to="/login">Anmelden und Stammdaten ergänzen</Link>
        </div>
      </section>
    </div>
  );
}
