import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Pencil, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface Camp {
  id: number;
  title: string;
  club_name: string;
  min_age: number;
  max_age: number;
  description: string;
  type: string;
  location_text: string;
  location_lat: number;
  location_lng: number;
  starts_at: string;
  ends_at: string;
  price_eur: number;
  registration_deadline: string;
  is_active: number;
}

interface ClubUser {
  id: number;
  username: string;
  club_name: string;
  contact_info: string;
}

const parseJson = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const fetchJsonArray = async <T,>(url: string, token: string): Promise<T[]> => {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseJson(response);

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}`);
  }

  if (!Array.isArray(data)) {
    throw new Error('Unerwartete Antwort vom Server');
  }

  return data;
};

export const AdminDashboard: React.FC = () => {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<ClubUser[]>([]);
  const [camps, setCamps] = useState<Camp[]>([]);
  const [formData, setFormData] = useState({ username: '', password: '', club_name: '', contact_info: '' });
  const [error, setError] = useState('');

  const fetchCamps = async () => {
    if (!token) return;

    try {
      setCamps(await fetchJsonArray<Camp>('/api/camps?all=1', token));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Freizeiten konnten nicht geladen werden');
    }
  };

  const fetchClubs = async () => {
    if (!token) return;

    try {
      setClubs(await fetchJsonArray<ClubUser>('/api/admin/users', token));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Vereine konnten nicht geladen werden');
    }
  };

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/login');
      return;
    }

    if (!token) {
      navigate('/login');
      return;
    }

    let cancelled = false;
    const loadDashboard = async () => {
      try {
        const [clubsData, campsData] = await Promise.all([
          fetchJsonArray<ClubUser>('/api/admin/users', token),
          fetchJsonArray<Camp>('/api/camps?all=1', token),
        ]);
        if (!cancelled) {
          setError('');
          setClubs(clubsData);
          setCamps(campsData);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setClubs([]);
          setCamps([]);
          setError(err instanceof Error ? err.message : 'Dashboard-Daten konnten nicht geladen werden');
        }
      }
    };

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [user, token, navigate]);

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
                    <p>{camp.club_name} · {camp.type} · {camp.location_text || 'Ort offen'} · {camp.min_age}-{camp.max_age} Jahre</p>
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
