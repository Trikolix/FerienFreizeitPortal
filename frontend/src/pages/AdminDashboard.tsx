import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';

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

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/login');
    } else {
      fetchClubs();
      fetchCamps();
    }
  }, [user, navigate]);

  const fetchCamps = async () => {
    try {
      // The backend /api/camps GET logic fetches active by default, or all if we pass club_id.
      // To get ALL camps for admin, we need a small adjustment on backend or a specific admin endpoint.
      // We will adjust backend to return all camps if admin.
      const res = await fetch('/api/camps?all=1', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setCamps(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditCamp = async (camp: Camp) => {
    const newTitle = prompt('Neuer Titel:', camp.title);
    if (newTitle) {
      await fetch(`/api/camps/${camp.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...camp, title: newTitle })
      });
      fetchCamps();
    }
  };

  const handleDeleteCamp = async (id: number) => {
    if (confirm('Wirklich löschen?')) {
      await fetch(`/api/camps/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchCamps();
    }
  };

  const fetchClubs = async () => {
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setClubs(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Fehler beim Erstellen');
      } else {
        setFormData({ username: '', password: '', club_name: '', contact_info: '' });
        fetchClubs();
      }
    } catch (err) {
      setError('Netzwerkfehler');
    }
  };

  return (
    <div>
      <h1>Admin Dashboard</h1>

      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid var(--border-color)' }}>
        <h2>Neuen Jugendverein anlegen</h2>
        {error && <p style={{color: 'red'}}>{error}</p>}
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <label>Benutzername:</label>
            <input type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} required style={{width: '100%'}}/>
          </div>
          <div>
            <label>Passwort:</label>
            <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required style={{width: '100%'}}/>
          </div>
          <div>
            <label>Vereinsname:</label>
            <input type="text" value={formData.club_name} onChange={e => setFormData({...formData, club_name: e.target.value})} style={{width: '100%'}}/>
          </div>
          <div>
            <label>Kontaktinfo:</label>
            <input type="text" value={formData.contact_info} onChange={e => setFormData({...formData, contact_info: e.target.value})} style={{width: '100%'}}/>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <button type="submit">Verein anlegen</button>
          </div>
        </form>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Registrierte Vereine</h2>
        {clubs.length === 0 ? <p>Keine Vereine registriert.</p> : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {clubs.map(club => (
              <li key={club.id} style={{ border: '1px solid var(--border-color)', margin: '1rem 0', padding: '1rem' }}>
                <h3>{club.club_name || club.username}</h3>
                <p><strong>Benutzername:</strong> {club.username}</p>
                <p><strong>Kontakt:</strong> {club.contact_info}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Alle Freizeiten (Moderation)</h2>
        {camps.length === 0 ? <p>Keine Freizeiten vorhanden.</p> : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {camps.map(camp => (
              <li key={camp.id} style={{ border: '1px solid var(--border-color)', margin: '1rem 0', padding: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <h3>{camp.title}</h3>
                  <p><strong>Anbieter:</strong> {camp.club_name}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <button onClick={() => handleEditCamp(camp)}>Titel bearbeiten</button>
                  <button onClick={() => handleDeleteCamp(camp.id)}>Löschen</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
