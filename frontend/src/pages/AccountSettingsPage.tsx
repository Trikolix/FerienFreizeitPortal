import { AccessibleForm } from '../components/AccessibleForm';
import { useAction } from '../utils/useAction';
import { apiFetch } from '../utils/api';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, PencilLine, Save, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const getRoleLabel = (role?: string) => {
  if (role === 'master_admin') return 'Master-Admin';
  if (role === 'admin') return 'Administration';
  return 'Vereinskonto';
};

export const AccountSettingsPage: React.FC = () => {
  const { user, updateUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user?.display_name || user?.club_name || '');
  const [contactInfo, setContactInfo] = useState(user?.contact_info || '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { busy, runAction } = useAction(setError);
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  const handleProfileSubmit = (event: React.FormEvent) => runAction(async () => {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      const response = await apiFetch('/api/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',

        },
        body: JSON.stringify({ display_name: displayName, contact_info: contactInfo }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Öffentliche Angaben konnten nicht gespeichert werden');
        return;
      }
      updateUser(data);
      setMessage('Öffentliche Vereinsangaben gespeichert.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Anfrage fehlgeschlagen.');
    }
  });

  const handlePasswordSubmit = (event: React.FormEvent) => runAction(async () => {
    event.preventDefault();
    setPasswordError('');

    if (newPassword.length < 8 || new TextEncoder().encode(newPassword).length > 72) {
      setPasswordError(newPassword.length < 8 ? 'Bitte mindestens 8 Zeichen verwenden.' : 'Dieses Passwort ist zu lang. Bitte etwas kürzen; Sonderzeichen benötigen mehr Platz.');
      return;
    }
    if (newPassword !== passwordConfirmation) {
      setPasswordError('Die neuen Passwörter stimmen nicht überein.');
      return;
    }

    try {
      const response = await apiFetch('/api/me/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',

        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        setPasswordError(data.error || 'Passwort konnte nicht geändert werden');
        return;
      }

      await logout();
      navigate('/login?passwort-geaendert=1');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Anfrage fehlgeschlagen.');
    }
  });

  return (
    <div className="settings-page">
      <section className="page-heading">
        <span className="eyebrow">Konto</span>
        <h1>Kontoeinstellungen</h1>
        <p>Verwalte die Angaben, die Familien bei deinen Freizeiten sehen, und halte dein Konto sicher.</p>
      </section>

      <section className="account-info-panel" aria-labelledby="account-info-title">
        <div className="settings-section-heading">
          <ShieldCheck size={22} />
          <div>
            <h2 id="account-info-title">Kontoinformationen</h2>
            <p>Diese Angaben werden vom Jugendring verwaltet und können hier nicht geändert werden.</p>
          </div>
        </div>
        <dl className="account-info-list">
          <div><dt>E-Mail-Adresse</dt><dd>{user?.email}</dd></div>
          <div><dt>Konto-Rolle</dt><dd><span className="account-role-badge">{getRoleLabel(user?.role)}</span></dd></div>
        </dl>
      </section>

      <section className="form-panel public-profile-panel" aria-labelledby="public-profile-title">
        <div className="settings-section-heading">
          <PencilLine size={22} />
          <div>
            <h2 id="public-profile-title">Öffentliches Vereinsprofil</h2>
            <p>Diese Angaben sehen Interessenten bei deinen veröffentlichten Freizeiten.</p>
          </div>
        </div>
        {error && <p className="alert" role="alert">{error}</p>}
        {message && <p className="success-alert" role="status">{message}</p>}
        <div className="public-profile-layout">
          <AccessibleForm className="settings-form" onSubmit={handleProfileSubmit}>
            <label className="field">
              <span>Name des Vereins / Anbieters</span>
              <input type="text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
            </label>
            <label className="field">
              <span>Kontakt für Rückfragen</span>
              <textarea value={contactInfo} onChange={(event) => setContactInfo(event.target.value)} placeholder="z. B. E-Mail-Adresse, Telefonnummer und Ansprechperson" />
            </label>
            <button className="primary-action" type="submit" disabled={busy}><Save size={18} /> Öffentliche Angaben speichern</button>
          </AccessibleForm>
          <aside className="public-profile-preview" aria-label="Vorschau der öffentlichen Angaben">
            <span>So sehen Familien dein Angebot</span>
            <strong>{displayName || 'Name des Vereins'}</strong>
            <p>{contactInfo || 'Kontaktinformationen erscheinen hier.'}</p>
          </aside>
        </div>
      </section>

      <section className="security-panel" aria-labelledby="security-title">
        <div className="settings-section-heading">
          <KeyRound size={22} />
          <div>
            <h2 id="security-title">Sicherheit</h2>
            <p>Hier kannst du dein Passwort ändern. Zur Bestätigung benötigst du dein aktuelles Passwort.</p>
          </div>
        </div>
        {!isPasswordFormOpen ? (
          <button className="secondary-action" type="button" onClick={() => setIsPasswordFormOpen(true)}><KeyRound size={18} /> Passwort ändern</button>
        ) : (
          <AccessibleForm className="password-change-form" onSubmit={handlePasswordSubmit}>
            {passwordError && <p className="alert" role="alert">{passwordError}</p>}
            <label className="field">
              <span>Aktuelles Passwort</span>
              <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
            </label>
            <label className="field">
              <span>Neues Passwort</span>
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required />
            </label>
            <label className="field">
              <span>Neues Passwort wiederholen</span>
              <input type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" required />
            </label>
            <div className="form-actions">
              <button className="primary-action" type="submit" disabled={busy}>Passwort speichern</button>
              <button className="secondary-action" type="button" onClick={() => { setIsPasswordFormOpen(false); setCurrentPassword(''); setNewPassword(''); setPasswordConfirmation(''); setPasswordError(''); }}>Abbrechen</button>
            </div>
          </AccessibleForm>
        )}
        <Link className="text-link security-reset-link" to="/passwort-vergessen">Passwort vergessen?</Link>
      </section>
    </div>
  );
};
