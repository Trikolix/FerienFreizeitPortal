import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';

interface Camp {
  id: number;
  title: string;
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

export const ClubDashboard: React.FC = () => {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [camps, setCamps] = useState<Camp[]>([]);
  const [formData, setFormData] = useState<Partial<Camp>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);

  useEffect(() => {
    if (!user || user.role !== 'club') {
      navigate('/login');
    } else {
      fetchCamps();
    }
  }, [user, navigate]);

  const fetchCamps = async () => {
    try {
      // In a real app we might have a specific /api/my-camps endpoint,
      // but for simplicity we can fetch all and filter or add an endpoint.
      // Assuming GET /api/camps returns all active, but we need inactive too for the club.
      // We will adjust the backend query slightly or add /api/club/camps if needed.
      // For now, we will add an endpoint in backend later if necessary, or just use a generic fetch.
      const res = await fetch(`http://localhost:8000/api/camps?club_id=${user?.id}`);
      const data = await res.json();
      setCamps(data.filter((c: any) => c.club_name === user?.username)); // Workaround for now
    } catch (error) {
      console.error(error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = isEditing ? 'PUT' : 'POST';
    const url = isEditing ? `http://localhost:8000/api/camps/${formData.id}` : 'http://localhost:8000/api/camps';

    try {
      let reqBody: any;
      let headers: any = {
        'Authorization': `Bearer ${token}`
      };

      if (!isEditing && selectedFiles && selectedFiles.length > 0) {
        const formDataObj = new FormData();
        Object.entries(formData).forEach(([key, value]) => {
            formDataObj.append(key, value as string);
        });
        for (let i = 0; i < selectedFiles.length; i++) {
          formDataObj.append('images[]', selectedFiles[i]);
        }
        reqBody = formDataObj;
      } else {
        headers['Content-Type'] = 'application/json';
        reqBody = JSON.stringify(formData);
      }

      await fetch(url, {
        method,
        headers,
        body: reqBody
      });
      setIsEditing(false);
      setFormData({});
      setSelectedFiles(null);
      fetchCamps();
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`http://localhost:8000/api/camps/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchCamps();
    } catch (error) {
      console.error(error);
    }
  };

  const handleEdit = (camp: Camp) => {
    setFormData(camp);
    setIsEditing(true);
  };

  const toggleActive = async (camp: Camp) => {
    try {
      await fetch(`http://localhost:8000/api/camps/${camp.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...camp, is_active: camp.is_active ? 0 : 1 })
      });
      fetchCamps();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div>
      <h1>Vereins-Dashboard</h1>

      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid var(--border-color)' }}>
        <h2>{isEditing ? 'Freizeit bearbeiten' : 'Neue Freizeit anlegen'}</h2>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <label>Titel:</label>
            <input type="text" value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} required style={{width: '100%'}}/>
          </div>
          <div>
            <label>Art:</label>
            <input type="text" value={formData.type || ''} onChange={e => setFormData({...formData, type: e.target.value})} required style={{width: '100%'}}/>
          </div>
          <div>
            <label>Alter von:</label>
            <input type="number" value={formData.age_from || ''} onChange={e => setFormData({...formData, age_from: parseInt(e.target.value)})} style={{width: '100%'}}/>
          </div>
          <div>
            <label>Alter bis:</label>
            <input type="number" value={formData.age_to || ''} onChange={e => setFormData({...formData, age_to: parseInt(e.target.value)})} style={{width: '100%'}}/>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label>Beschreibung:</label>
            <textarea value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} required style={{width: '100%', height: '100px'}}/>
          </div>
          <div>
            <label>Zeitraum:</label>
            <input type="text" value={formData.period || ''} onChange={e => setFormData({...formData, period: e.target.value})} style={{width: '100%'}}/>
          </div>
          <div>
            <label>Kosten:</label>
            <input type="text" value={formData.cost || ''} onChange={e => setFormData({...formData, cost: e.target.value})} style={{width: '100%'}}/>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label>Barrierefreiheit:</label>
            <input type="text" value={formData.accessibility || ''} onChange={e => setFormData({...formData, accessibility: e.target.value})} style={{width: '100%'}}/>
          </div>
          <div>
            <label>Latitude:</label>
            <input type="number" step="any" value={formData.location_lat || ''} onChange={e => setFormData({...formData, location_lat: parseFloat(e.target.value)})} style={{width: '100%'}}/>
          </div>
          <div>
            <label>Longitude:</label>
            <input type="number" step="any" value={formData.location_lng || ''} onChange={e => setFormData({...formData, location_lng: parseFloat(e.target.value)})} style={{width: '100%'}}/>
          </div>
          {!isEditing && (
            <div style={{ gridColumn: 'span 2' }}>
              <label>Bilder hochladen:</label>
              <input type="file" multiple accept="image/*" onChange={(e) => setSelectedFiles(e.target.files)} style={{width: '100%'}}/>
            </div>
          )}
          <div style={{ gridColumn: 'span 2' }}>
            <button type="submit">{isEditing ? 'Speichern' : 'Anlegen'}</button>
            {isEditing && <button type="button" onClick={() => { setIsEditing(false); setFormData({}); }} style={{marginLeft: '1rem'}}>Abbrechen</button>}
          </div>
        </form>
      </section>

      <section>
        <h2>Meine Freizeiten</h2>
        {camps.length === 0 ? <p>Keine Freizeiten vorhanden.</p> : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {camps.map(camp => (
              <li key={camp.id} style={{ border: '1px solid var(--border-color)', margin: '1rem 0', padding: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <h3>{camp.title}</h3>
                  <p>Status: {camp.is_active ? 'Aktiv' : 'Deaktiviert'}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <button onClick={() => handleEdit(camp)}>Bearbeiten</button>
                  <button onClick={() => toggleActive(camp)}>{camp.is_active ? 'Deaktivieren' : 'Aktivieren'}</button>
                  <button onClick={() => handleDelete(camp.id)}>Löschen</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
