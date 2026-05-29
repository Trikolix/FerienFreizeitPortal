import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ImagePlus, Pencil, Plus, Trash2, XCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface Camp {
  id: number;
  title: string;
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
  images?: string[];
}

const normalizeDateTimeLocal = (value?: string) => value ? value.replace(' ', 'T').slice(0, 16) : '';

const parseFormDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const ClubDashboard: React.FC = () => {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [camps, setCamps] = useState<Camp[]>([]);
  const [formData, setFormData] = useState<Partial<Camp>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [formError, setFormError] = useState('');

  const fetchCamps = async () => {
    try {
      const res = await fetch(`/api/camps?club_id=${user?.id}`);
      const data = await res.json();
      setCamps(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (!user || user.role !== 'club') {
      navigate('/login');
      return;
    }

    let cancelled = false;
    const loadCamps = async () => {
      try {
        const res = await fetch(`/api/camps?club_id=${user.id}`);
        const data = await res.json();
        if (!cancelled) {
          setCamps(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error(error);
      }
    };

    void loadCamps();

    return () => {
      cancelled = true;
    };
  }, [user, navigate]);

  const validateDates = () => {
    const startsAt = parseFormDate(formData.starts_at);
    const endsAt = parseFormDate(formData.ends_at);
    const registrationDeadline = parseFormDate(formData.registration_deadline);

    if (startsAt && endsAt && endsAt <= startsAt) {
      return 'Das Ende der Freizeit muss nach dem Beginn liegen.';
    }

    if (registrationDeadline && startsAt && registrationDeadline >= startsAt) {
      return 'Der Anmeldeschluss muss vor dem Beginn der Freizeit liegen.';
    }

    return '';
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');

    const validationError = validateDates();
    if (validationError) {
      setFormError(validationError);
      return;
    }

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

      const response = await fetch(url, { method, headers, body: reqBody });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Freizeit konnte nicht gespeichert werden');
      }

      const campId = isEditing ? formData.id : data.id;
      if (isEditing && campId && selectedFiles?.length) {
        const imageData = new FormData();
        Array.from(selectedFiles).forEach((file) => imageData.append('images[]', file));
        const imageResponse = await fetch(`/api/camps/${campId}/images`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: imageData,
        });

        if (!imageResponse.ok) {
          const imageError = await imageResponse.json();
          throw new Error(imageError.error || 'Bilder konnten nicht hochgeladen werden');
        }
      }

      setIsEditing(false);
      setFormData({});
      setSelectedFiles(null);
      fetchCamps();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Freizeit konnte nicht gespeichert werden');
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
    setSelectedFiles(null);
    setFormError('');
  };

  const handleDeleteImage = async (campId: number, imageUrl: string) => {
    try {
      const response = await fetch(`/api/camps/${campId}/images`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ image_url: imageUrl }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Bild konnte nicht gelöscht werden');
      }

      setFormData((current) => ({
        ...current,
        images: current.images?.filter((image) => image !== imageUrl),
      }));
      fetchCamps();
    } catch (error) {
      console.error(error);
    }
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
        {formError && <p className="alert">{formError}</p>}

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
            <span>Mindestalter</span>
            <input type="number" min="0" value={formData.min_age || ''} onChange={(event) => setFormData({ ...formData, min_age: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>Höchstalter</span>
            <input type="number" min="0" value={formData.max_age || ''} onChange={(event) => setFormData({ ...formData, max_age: Number(event.target.value) })} />
          </label>
          <label className="field field-wide">
            <span>Beschreibung</span>
            <textarea value={formData.description || ''} onChange={(event) => setFormData({ ...formData, description: event.target.value })} required />
          </label>
          <label className="field field-wide">
            <span>Ort</span>
            <input type="text" value={formData.location_text || ''} onChange={(event) => setFormData({ ...formData, location_text: event.target.value })} />
          </label>
          <label className="field">
            <span>Beginn</span>
            <input type="datetime-local" value={normalizeDateTimeLocal(formData.starts_at)} onChange={(event) => setFormData({ ...formData, starts_at: event.target.value })} />
          </label>
          <label className="field">
            <span>Ende</span>
            <input type="datetime-local" value={normalizeDateTimeLocal(formData.ends_at)} onChange={(event) => setFormData({ ...formData, ends_at: event.target.value })} />
          </label>
          <label className="field">
            <span>Teilnahmebeitrag in €</span>
            <input type="number" min="0" step="0.01" value={formData.price_eur || ''} onChange={(event) => setFormData({ ...formData, price_eur: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>Anmeldeschluss</span>
            <input type="datetime-local" value={normalizeDateTimeLocal(formData.registration_deadline)} onChange={(event) => setFormData({ ...formData, registration_deadline: event.target.value })} />
          </label>
          <label className="field">
            <span>Latitude für Karte</span>
            <input type="number" step="any" value={formData.location_lat || ''} onChange={(event) => setFormData({ ...formData, location_lat: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>Longitude für Karte</span>
            <input type="number" step="any" value={formData.location_lng || ''} onChange={(event) => setFormData({ ...formData, location_lng: Number(event.target.value) })} />
          </label>
          {isEditing && Boolean(formData.images?.length) && (
            <div className="field field-wide">
              <span>Vorhandene Bilder</span>
              <ul className="image-management-list">
                {formData.images?.map((image) => (
                  <li key={image}>
                    <img src={image} alt="" />
                    <button
                      className="danger-action"
                      type="button"
                      onClick={() => formData.id && handleDeleteImage(formData.id, image)}
                      aria-label="Bild löschen"
                    >
                      <Trash2 size={17} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label className="field field-wide file-field">
            <span>{isEditing ? 'Weitere Bilder hinzufügen' : 'Bilder hochladen'}</span>
            <input type="file" multiple accept="image/*" onChange={(event) => setSelectedFiles(event.target.files)} />
          </label>
          <div className="form-actions">
            <button className="primary-action" type="submit">
              {isEditing ? <CheckCircle2 size={18} /> : <Plus size={18} />}
              {isEditing ? 'Speichern' : 'Anlegen'}
            </button>
            {isEditing && (
              <button className="secondary-action" type="button" onClick={() => { setIsEditing(false); setFormData({}); setSelectedFiles(null); setFormError(''); }}>
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
                    <p>{camp.type} · {camp.location_text || 'Ort offen'} · {camp.min_age}-{camp.max_age} Jahre</p>
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
