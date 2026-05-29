import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export const AccountSettingsPage: React.FC = () => {
  const { user, token, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user?.display_name || user?.club_name || '');
  const [contactInfo, setContactInfo] = useState(user?.contact_info || '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !token) {
      navigate('/login');
    }
  }, [user, token, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ display_name: displayName, contact_info: contactInfo }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Einstellungen konnten nicht gespeichert werden');
        return;
      }
      updateUser(data);
      setMessage('Einstellungen gespeichert.');
    } catch {
      setError('Netzwerkfehler');
    }
  };

  return (
    <div className="dashboard-page">
      <section className="page-heading">
        <span className="eyebrow">Konto</span>
        <h1>Einstellungen</h1>
        <p>Name, Verein und Kontaktdaten werden bei deinen Freizeiten angezeigt.</p>
      </section>
      <section className="form-panel">
        {error && <p className="alert" role="alert">{error}</p>}
        {message && <p className="success-alert" role="status">{message}</p>}
        <form className="dashboard-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>E-Mail</span>
            <input type="email" value={user?.email || ''} disabled />
          </label>
          <label className="field">
            <span>Rolle</span>
            <input type="text" value={user?.role === 'master_admin' ? 'Master-Admin' : user?.role === 'admin' ? 'Admin' : 'Nutzer'} disabled />
          </label>
          <label className="field">
            <span>Name / Verein</span>
            <input type="text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </label>
          <label className="field field-wide">
            <span>Kontaktdaten</span>
            <textarea value={contactInfo} onChange={(event) => setContactInfo(event.target.value)} />
          </label>
          <div className="form-actions">
            <button className="primary-action" type="submit">
              <Save size={18} />
              Speichern
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
