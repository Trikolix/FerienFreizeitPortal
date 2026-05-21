import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ImagePlus, Pencil, Plus, Trash2, XCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

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
  images?: string[];
}

export const ClubDashboard: React.FC = () => {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [camps, setCamps] = useState<Camp[]>([]);
  const [formData, setFormData] = useState<Partial<Camp>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);

  const fetchCamps = async () => {
    try {
      const res = await fetch(`/api/camps?club_id=${user?.id}`);
      const data = await res.json();
      setCamps(data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (!user || user.role !== 'club') {
      navigate('/login');
    } else {
      fetchCamps();
    }
  }, [user, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const method = isEditing ? 'PUT' : 'POST';
    const url = isEditing ? `/api/camps/${formData.id}` : '/api/camps';

    try {
      let reqBody: BodyInit;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };

      if (!isEditing && selectedFiles?.length) {
        const formDataObj = new FormData();
        Object.entries(formData).forEach(([key, value]) => {
          if (value !== undefined) formDataObj.append(key, String(value));
        });
        Array.from(selectedFiles).forEach((file) => formDataObj.append('images[]', file));
        reqBody = formDataObj;
      } else {
        headers['Content-Type'] = 'application/json';
        reqBody = JSON.stringify(formData);
      }

      await fetch(url, { method, headers, body: reqBody });
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
      await fetch(`/api/camps/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
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
      await fetch(`/api/camps/${camp.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...camp, is_active: camp.is_active ? 0 : 1 }),
      });
      fetchCamps();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="dashboard-page">
      <section className="page-heading">
        <span className="eyebrow">Vereins-Dashboard</span>
        <h1>Freizeiten verwalten</h1>
        <p>Lege Angebote an, aktualisiere Details und steuere die Sichtbarkeit für die öffentliche Suche.</p>
      </section>

      <section className="form-panel">
        <div className="section-heading">
          <h2>{isEditing ? 'Freizeit bearbeiten' : 'Neue Freizeit anlegen'}</h2>
          <span>{isEditing ? 'Änderungen werden direkt gespeichert' : 'Alle Pflichtfelder sauber ausfüllen'}</span>
        </div>

        <form className="dashboard-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Titel</span>
            <input type="text" value={formData.title || ''} onChange={(event) => setFormData({ ...formData, title: event.target.value })} required />
          </label>
          <label className="field">
            <span>Art</span>
            <input type="text" value={formData.type || ''} onChange={(event) => setFormData({ ...formData, type: event.target.value })} required />
          </label>
          <label className="field">
            <span>Alter von</span>
            <input type="number" value={formData.age_from || ''} onChange={(event) => setFormData({ ...formData, age_from: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>Alter bis</span>
            <input type="number" value={formData.age_to || ''} onChange={(event) => setFormData({ ...formData, age_to: Number(event.target.value) })} />
          </label>
          <label className="field field-wide">
            <span>Beschreibung</span>
            <textarea value={formData.description || ''} onChange={(event) => setFormData({ ...formData, description: event.target.value })} required />
          </label>
          <label className="field">
            <span>Zeitraum</span>
            <input type="text" value={formData.period || ''} onChange={(event) => setFormData({ ...formData, period: event.target.value })} />
          </label>
          <label className="field">
            <span>Kosten</span>
            <input type="text" value={formData.cost || ''} onChange={(event) => setFormData({ ...formData, cost: event.target.value })} />
          </label>
          <label className="field field-wide">
            <span>Barrierefreiheit</span>
            <input type="text" value={formData.accessibility || ''} onChange={(event) => setFormData({ ...formData, accessibility: event.target.value })} />
          </label>
          <label className="field">
            <span>Latitude</span>
            <input type="number" step="any" value={formData.location_lat || ''} onChange={(event) => setFormData({ ...formData, location_lat: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>Longitude</span>
            <input type="number" step="any" value={formData.location_lng || ''} onChange={(event) => setFormData({ ...formData, location_lng: Number(event.target.value) })} />
          </label>
          {!isEditing && (
            <label className="field field-wide file-field">
              <span>Bilder hochladen</span>
              <input type="file" multiple accept="image/*" onChange={(event) => setSelectedFiles(event.target.files)} />
            </label>
          )}
          <div className="form-actions">
            <button className="primary-action" type="submit">
              {isEditing ? <CheckCircle2 size={18} /> : <Plus size={18} />}
              {isEditing ? 'Speichern' : 'Anlegen'}
            </button>
            {isEditing && (
              <button className="secondary-action" type="button" onClick={() => { setIsEditing(false); setFormData({}); }}>
                Abbrechen
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="list-panel">
        <div className="section-heading">
          <h2>Meine Freizeiten</h2>
          <span>{camps.length} Angebote</span>
        </div>
        {camps.length === 0 ? (
          <div className="empty-state compact">
            <ImagePlus size={32} />
            <p>Keine Freizeiten vorhanden.</p>
          </div>
        ) : (
          <ul className="management-list">
            {camps.map((camp) => (
              <li key={camp.id} className="management-item">
                <div className="management-main">
                  {camp.images?.length ? <img src={camp.images[0]} alt="" /> : <span className="thumb-placeholder"><ImagePlus size={22} /></span>}
                  <div>
                    <h3>{camp.title}</h3>
                    <p>{camp.type} · {camp.age_from}-{camp.age_to} Jahre</p>
                    <span className={`status-pill ${camp.is_active ? 'is-live' : 'is-muted'}`}>
                      {camp.is_active ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                      {camp.is_active ? 'Aktiv' : 'Deaktiviert'}
                    </span>
                  </div>
                </div>
                <div className="item-actions">
                  <button className="icon-button" onClick={() => handleEdit(camp)} aria-label={`${camp.title} bearbeiten`}>
                    <Pencil size={17} />
                  </button>
                  <button className="secondary-action" onClick={() => toggleActive(camp)}>
                    {camp.is_active ? 'Deaktivieren' : 'Aktivieren'}
                  </button>
                  <button className="danger-action" onClick={() => handleDelete(camp.id)} aria-label={`${camp.title} löschen`}>
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
