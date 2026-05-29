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
  email: string;
  username: string;
  role: 'master_admin' | 'admin' | 'user';
  display_name: string;
  club_name: string;
  contact_info: string;
  is_active: number;
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
  const isMasterAdmin = user?.role === 'master_admin';
  const isAdmin = user?.role === 'admin' || user?.role === 'master_admin';
  const [clubs, setClubs] = useState<ClubUser[]>([]);
  const [camps, setCamps] = useState<Camp[]>([]);
  const [formData, setFormData] = useState({ email: '', display_name: '', role: 'user', contact_info: '' });
  const [error, setError] = useState('');
  const [editingCampId, setEditingCampId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteCampId, setDeleteCampId] = useState<number | null>(null);

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
    if (!user || !isAdmin) {
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
  }, [user, token, navigate, isAdmin]);

  const handleEditCamp = async (camp: Camp) => {
    setEditingCampId(camp.id);
    setEditTitle(camp.title);
    setDeleteCampId(null);
  };

  const handleSaveCampTitle = async (event: React.FormEvent, camp: Camp) => {
    event.preventDefault();
    const title = editTitle.trim();
    if (!title) return;

    await fetch(`/api/camps/${camp.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...camp, title }),
    });
    setEditingCampId(null);
    setEditTitle('');
    fetchCamps();
  };

  const handleDeleteCamp = async (id: number) => {
    await fetch(`/api/camps/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setDeleteCampId(null);
    fetchCamps();
  };

  const handleDeleteUser = async (id: number) => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await parseJson(res);
    if (!res.ok) {
      setError(data?.error || 'Nutzer konnte nicht gelöscht werden');
      return;
    }
    fetchClubs();
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
        setFormData({ email: '', display_name: '', role: 'user', contact_info: '' });
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
          <h2>Nutzer einladen</h2>
          <span>Aktivierung per E-Mail</span>
        </div>
        {error && (
          <p className="alert" id="admin-form-error" role="alert">
            {error}
          </p>
        )}
        <form className="dashboard-form" onSubmit={handleSubmit} aria-describedby={error ? 'admin-form-error' : undefined}>
          <label className="field">
            <span>E-Mail</span>
            <input type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} required />
          </label>
          <label className="field">
            <span>Name / Verein</span>
            <input type="text" value={formData.display_name} onChange={(event) => setFormData({ ...formData, display_name: event.target.value })} required />
          </label>
          <label className="field">
            <span>Rolle</span>
            <select value={formData.role} onChange={(event) => setFormData({ ...formData, role: event.target.value })}>
              <option value="user">Nutzer</option>
              {isMasterAdmin && <option value="admin">Admin</option>}
            </select>
          </label>
          <label className="field">
            <span>Kontaktinfo</span>
            <input type="text" value={formData.contact_info} onChange={(event) => setFormData({ ...formData, contact_info: event.target.value })} />
          </label>
          <div className="form-actions">
            <button className="primary-action" type="submit">
              <UserPlus size={18} />
              Einladung senden
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
                <h3>{club.display_name || club.club_name || club.email}</h3>
                <p>{club.email}</p>
                <span className={`status-pill ${club.is_active ? 'is-live' : 'is-muted'}`}>
                  {club.role === 'master_admin' ? 'Master-Admin' : club.role === 'admin' ? 'Admin' : 'Nutzer'} · {club.is_active ? 'aktiv' : 'eingeladen'}
                </span>
                <small>{club.contact_info || 'Keine Kontaktinfo hinterlegt'}</small>
                {club.id !== user?.id && club.role !== 'master_admin' && (
                  <button className="danger-action" type="button" onClick={() => handleDeleteUser(club.id)} aria-label={`${club.display_name || club.email} löschen`}>
                    <Trash2 size={17} />
                  </button>
                )}
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
                    {editingCampId === camp.id ? (
                      <form className="inline-edit-form" onSubmit={(event) => handleSaveCampTitle(event, camp)}>
                        <label className="field">
                          <span>Titel bearbeiten</span>
                          <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} required />
                        </label>
                        <div className="inline-actions">
                          <button className="primary-action" type="submit">
                            Speichern
                          </button>
                          <button
                            className="secondary-action"
                            type="button"
                            onClick={() => {
                              setEditingCampId(null);
                              setEditTitle('');
                            }}
                          >
                            Abbrechen
                          </button>
                        </div>
                      </form>
                    ) : (
                      <h3>{camp.title}</h3>
                    )}
                    <p>{camp.club_name} · {camp.type} · {camp.location_text || 'Ort offen'} · {camp.min_age}-{camp.max_age} Jahre</p>
                  </div>
                </div>
                <div className="item-actions">
                  <button className="icon-button" type="button" onClick={() => handleEditCamp(camp)} aria-label={`${camp.title} bearbeiten`}>
                    <Pencil size={17} />
                  </button>
                  {deleteCampId === camp.id ? (
                    <div className="inline-confirm" role="group" aria-label={`${camp.title} wirklich löschen`}>
                      <span>Wirklich löschen?</span>
                      <button className="danger-action" type="button" onClick={() => handleDeleteCamp(camp.id)}>
                        Ja
                      </button>
                      <button className="secondary-action" type="button" onClick={() => setDeleteCampId(null)}>
                        Nein
                      </button>
                    </div>
                  ) : (
                    <button className="danger-action" type="button" onClick={() => setDeleteCampId(camp.id)} aria-label={`${camp.title} löschen`}>
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
