import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Pencil, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface Camp {
  id: number;
  title: string;
  club_name: string;
  age_from: number;
  age_to: number;
  description: string;
  type: string;
  location_lat: number;
  location_lng: number;
  period: string;
  cost: string;
  accessibility: string;
  is_active: number;
}

interface ClubUser {
  id: number;
  username: string;
  club_name: string;
  contact_info: string;
}

export const AdminDashboard: React.FC = () => {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<ClubUser[]>([]);
  const [camps, setCamps] = useState<Camp[]>([]);
  const [formData, setFormData] = useState({ username: '', password: '', club_name: '', contact_info: '' });
  const [error, setError] = useState('');

  const fetchCamps = async () => {
    try {
      const res = await fetch('/api/camps?all=1', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCamps(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchClubs = async () => {
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setClubs(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/login');
    } else {
      fetchClubs();
      fetchCamps();
    }
  }, [user, navigate]);

  const handleEditCamp = async (camp: Camp) => {
    const newTitle = prompt('Neuer Titel:', camp.title);
    if (newTitle) {
      await fetch(`/api/camps/${camp.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...camp, title: newTitle }),
      });
      fetchCamps();
    }
  };

  const handleDeleteCamp = async (id: number) => {
    if (confirm('Wirklich löschen?')) {
      await fetch(`/api/camps/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchCamps();
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Fehler beim Erstellen');
      } else {
        setFormData({ username: '', password: '', club_name: '', contact_info: '' });
        fetchClubs();
      }
    } catch {
      setError('Netzwerkfehler');
    }
  };

  return (
    <div className="dashboard-page">
      <section className="page-heading">
        <span className="eyebrow">Administration</span>
        <h1>Portal moderieren</h1>
        <p>Vereine verwalten, Angebote prüfen und die Datenqualität der Plattform im Blick behalten.</p>
      </section>

      <section className="metric-row" aria-label="Kennzahlen">
        <div className="metric-card">
          <Building2 size={22} />
          <strong>{clubs.length}</strong>
          <span>registrierte Vereine</span>
        </div>
        <div className="metric-card">
          <ShieldCheck size={22} />
          <strong>{camps.length}</strong>
          <span>Freizeiten im System</span>
        </div>
      </section>

      <section className="form-panel">
        <div className="section-heading">
          <h2>Neuen Jugendverein anlegen</h2>
          <span>Zugangsdaten und Kontakt speichern</span>
        </div>
        {error && <p className="alert">{error}</p>}
        <form className="dashboard-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Benutzername</span>
            <input type="text" value={formData.username} onChange={(event) => setFormData({ ...formData, username: event.target.value })} required />
          </label>
          <label className="field">
            <span>Passwort</span>
            <input type="password" value={formData.password} onChange={(event) => setFormData({ ...formData, password: event.target.value })} required />
          </label>
          <label className="field">
            <span>Vereinsname</span>
            <input type="text" value={formData.club_name} onChange={(event) => setFormData({ ...formData, club_name: event.target.value })} />
          </label>
          <label className="field">
            <span>Kontaktinfo</span>
            <input type="text" value={formData.contact_info} onChange={(event) => setFormData({ ...formData, contact_info: event.target.value })} />
          </label>
          <div className="form-actions">
            <button className="primary-action" type="submit">
              <UserPlus size={18} />
              Verein anlegen
            </button>
          </div>
        </form>
      </section>

      <section className="list-panel">
        <div className="section-heading">
          <h2>Registrierte Vereine</h2>
          <span>{clubs.length} Konten</span>
        </div>
        {clubs.length === 0 ? (
          <p className="empty-line">Keine Vereine registriert.</p>
        ) : (
          <ul className="club-grid">
            {clubs.map((club) => (
              <li key={club.id} className="club-card">
                <span className="club-icon"><Building2 size={21} /></span>
                <h3>{club.club_name || club.username}</h3>
                <p>{club.username}</p>
                <small>{club.contact_info || 'Keine Kontaktinfo hinterlegt'}</small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="list-panel">
        <div className="section-heading">
          <h2>Alle Freizeiten</h2>
          <span>Moderation</span>
        </div>
        {camps.length === 0 ? (
          <p className="empty-line">Keine Freizeiten vorhanden.</p>
        ) : (
          <ul className="management-list">
            {camps.map((camp) => (
              <li key={camp.id} className="management-item">
                <div className="management-main no-thumb">
                  <div>
                    <h3>{camp.title}</h3>
                    <p>{camp.club_name} · {camp.type} · {camp.age_from}-{camp.age_to} Jahre</p>
                  </div>
                </div>
                <div className="item-actions">
                  <button className="icon-button" onClick={() => handleEditCamp(camp)} aria-label={`${camp.title} bearbeiten`}>
                    <Pencil size={17} />
                  </button>
                  <button className="danger-action" onClick={() => handleDeleteCamp(camp.id)} aria-label={`${camp.title} löschen`}>
                    <Trash2 size={17} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
