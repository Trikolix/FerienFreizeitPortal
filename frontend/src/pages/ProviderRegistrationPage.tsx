import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AccessibleForm } from '../components/AccessibleForm';
import { fragmentToken, portalApi } from '../utils/portal';

export function ProviderRegistrationPage() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { const response = await portalApi<{ message: string }>('/api/providers/register', { email, password }); setMessage(response.message); setPassword(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Registrierung fehlgeschlagen.'); }
    finally { setBusy(false); }
  }
  return <section className="portal-panel narrow-panel"><h1>Als Träger registrieren</h1>
    <p>Für Vereine, Verbände, Unternehmen und öffentliche Träger. Nach der E-Mail-Bestätigung ergänzt du eure Organisationsdaten. Der Jugendring prüft das Profil vor der Freigabe.</p>
    {error && <p role="alert" className="alert">{error}</p>}
    {message ? <p role="status" className="success-alert">{message}</p> : <AccessibleForm onSubmit={submit}>
      <label className="field"><span>E-Mail-Adresse des verantwortlichen Kontos</span><input type="email" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} required /></label>
      <label className="field"><span>Passwort (mindestens 12 Zeichen, höchstens 72 Bytes)</span><input type="password" autoComplete="new-password" minLength={12} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} required /></label>
      <button className="primary-action" disabled={busy}>{busy ? 'Registrierung läuft …' : 'Bestätigungslink anfordern'}</button>
    </AccessibleForm>}
    <p><Link to="/login">Zum Träger-Login</Link></p>
  </section>;
}

export function ProviderVerificationPage() {
  const [token] = useState(fragmentToken); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    portalApi<{ message: string }>('/api/providers/verify-email', { token }).then(result => { if (active) setMessage(result.message); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [token]);
  return <section className="portal-panel narrow-panel"><h1>E-Mail bestätigen</h1>{error ? <p role="alert" className="alert">{error}</p> : <p role="status">{message || 'Bestätigung wird geprüft …'}</p>}<Link to="/login">Anmelden und Stammdaten ergänzen</Link></section>;
}
