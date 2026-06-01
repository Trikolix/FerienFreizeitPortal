import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Pencil, ShieldCheck, Trash2, UserPlus, CheckCircle2, Eye, XCircle, ImagePlus, Tag, ChevronDown } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import { MapPicker } from '../components/MapPicker';
import { PreviewModal } from '../components/PreviewModal';

interface Holiday {
  id: number;
  name: string;
  starts_at: string;
  ends_at: string;
}

interface Camp {
  id: number;
  title: string;
  club_name: string;
  min_age: number;
  max_age: number;
  description: string;
  type: string;
  categories?: string[];
  location_text: string;
  location_lat: number;
  location_lng: number;
  starts_at: string;
  ends_at: string;
  price_eur: number;
  registration_deadline: string;
  status: 'draft' | 'published' | 'fully_booked' | 'archived';
  images?: string[];
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
  camp_count?: number;
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
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayStart, setNewHolidayStart] = useState('');
  const [newHolidayEnd, setNewHolidayEnd] = useState('');
  const [isCreatingHoliday, setIsCreatingHoliday] = useState(false);

  const [formData, setFormData] = useState({ email: '', display_name: '', role: 'user', contact_info: '' });
  const [error, setError] = useState('');
  
  const [editingCampId, setEditingCampId] = useState<number | null>(null);
  const [campEditData, setCampEditData] = useState<Partial<Camp>>({});
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);

  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  const [deleteCampId, setDeleteCampId] = useState<number | null>(null);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userEditData, setUserEditData] = useState({ display_name: '', role: 'user', contact_info: '' });
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [deleteUserConfirmation, setDeleteUserConfirmation] = useState('');

  const normalizeDateTimeLocal = (value?: string) => value ? value.replace(' ', 'T').slice(0, 16) : '';
  const parseFormDate = (value?: string) => {
    if (!value) return null;
    const date = new Date(value.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const typeOptions = useMemo(() => {
    const base = ['Sport', 'Lager', 'Kreativ', 'Bildung', 'Natur'];
    const existing = Array.from(new Set(camps.flatMap(c => c.categories || [c.type]).filter(Boolean)));
    return Array.from(new Set([...base, ...existing]));
  }, [camps]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
        setIsTypeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        const [clubsData, campsData, holidaysData] = await Promise.all([
          fetchJsonArray<ClubUser>('/api/admin/users', token),
          fetchJsonArray<Camp>('/api/camps?all=1', token),
          fetchJsonArray<Holiday>('/api/holidays', token),
        ]);
        if (!cancelled) {
          setError('');
          setClubs(clubsData);
          setCamps(campsData);
          setHolidays(holidaysData);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setClubs([]);
          setCamps([]);
          setHolidays([]);
          setError(err instanceof Error ? err.message : 'Dashboard-Daten konnten nicht geladen werden');
        }
      }
    };

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [user, token, navigate, isAdmin]);

  const handleEditCamp = (camp: Camp) => {
    setEditingCampId(camp.id);
    setCampEditData(camp);
    setDeleteCampId(null);
    setFormError('');
    setSelectedFiles(null);
  };

  const handleSaveCamp = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');

    const startsAt = parseFormDate(campEditData.starts_at);
    const endsAt = parseFormDate(campEditData.ends_at);
    const registrationDeadline = parseFormDate(campEditData.registration_deadline);

    if (startsAt && endsAt && endsAt <= startsAt) {
      setFormError('Das Ende der Freizeit muss nach dem Beginn liegen.');
      return;
    }
    if (registrationDeadline && startsAt && registrationDeadline >= startsAt) {
      setFormError('Der Anmeldeschluss muss vor dem Beginn der Freizeit liegen.');
      return;
    }

    try {
      const response = await fetch(`/api/camps/${editingCampId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(campEditData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Fehler beim Speichern');
      }

      if (selectedFiles?.length) {
        const imageData = new FormData();
        Array.from(selectedFiles).forEach((file) => imageData.append('images[]', file));
        await fetch(`/api/camps/${editingCampId}/images`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: imageData,
        });
      }

      setEditingCampId(null);
      setCampEditData({});
      fetchCamps();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    }
  };

  const handleDeleteImage = async (campId: number, imageUrl: string) => {
    try {
      await fetch(`/api/camps/${campId}/images`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ image_url: imageUrl }),
      });
      setCampEditData(current => ({
        ...current,
        images: current.images?.filter(img => img !== imageUrl)
      }));
      fetchCamps();
    } catch (error) {
      console.error(error);
    }
  };

  const handleDeleteCamp = async (id: number) => {
    await fetch(`/api/camps/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setDeleteCampId(null);
    fetchCamps();
  };

  const startEditUser = (club: ClubUser) => {
    setEditingUserId(club.id);
    setDeleteUserId(null);
    setUserEditData({
      display_name: club.display_name || club.club_name || '',
      role: club.role,
      contact_info: club.contact_info || '',
    });
  };

  const handleSaveUser = async (event: React.FormEvent, club: ClubUser) => {
    event.preventDefault();
    setError('');

    const res = await fetch(`/api/admin/users/${club.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(userEditData),
    });
    const data = await parseJson(res);
    if (!res.ok) {
      setError(data?.error || 'Nutzer konnte nicht aktualisiert werden');
      return;
    }

    setEditingUserId(null);
    fetchClubs();
  };

  const handleDeleteUser = async (club: ClubUser) => {
    setError('');
    const res = await fetch(`/api/admin/users/${club.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ confirm: deleteUserConfirmation }),
    });
    const data = await parseJson(res);
    if (!res.ok) {
      setError(data?.error || 'Nutzer konnte nicht gelöscht werden');
      return;
    }
    setDeleteUserId(null);
    setDeleteUserConfirmation('');
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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Entwurf';
      case 'published': return 'Veröffentlicht';
      case 'fully_booked': return 'Ausgebucht';
      case 'archived': return 'Archiv';
      default: return 'Unbekannt';
    }
  };

  const updateStatus = async (camp: Camp, newStatus: string) => {
    try {
      await fetch(`/api/camps/${camp.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...camp, status: newStatus }),
      });
      fetchCamps();
    } catch (error) {
      console.error(error);
    }
  };

  const toggleCategory = (cat: string) => {
    const current = campEditData.categories || [];
    const updated = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
    setCampEditData({ ...campEditData, categories: updated });
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
          <h2>Ferien verwalten</h2>
        </div>
        <form className="admin-form compact" onSubmit={async (e) => {
          e.preventDefault();
          if (!token || isCreatingHoliday) return;
          setIsCreatingHoliday(true);
          try {
            const response = await fetch('/api/admin/holidays', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({
                name: newHolidayName,
                starts_at: newHolidayStart,
                ends_at: newHolidayEnd
              })
            });
            const data = await parseJson(response);
            if (!response.ok) throw new Error(data?.error || 'Fehler beim Erstellen der Ferien');
            setNewHolidayName('');
            setNewHolidayStart('');
            setNewHolidayEnd('');
            const updatedHolidays = await fetchJsonArray<Holiday>('/api/holidays', token);
            setHolidays(updatedHolidays);
          } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Fehler beim Erstellen der Ferien');
          } finally {
            setIsCreatingHoliday(false);
          }
        }}>
          <div className="admin-holiday-grid">
            <label className="field">
              <span>Name (z.B. Sommerferien 2024)</span>
              <input type="text" value={newHolidayName} onChange={(e) => setNewHolidayName(e.target.value)} required />
            </label>
            <label className="field">
              <span>Startdatum</span>
              <input type="date" value={newHolidayStart} onChange={(e) => setNewHolidayStart(e.target.value)} required />
            </label>
            <label className="field">
              <span>Enddatum</span>
              <input type="date" value={newHolidayEnd} onChange={(e) => setNewHolidayEnd(e.target.value)} required />
            </label>
            <button className="primary-action" type="submit" disabled={isCreatingHoliday}>
              Speichern
            </button>
          </div>
        </form>
        {holidays.length === 0 ? (
          <p className="empty-line">Keine Ferien angelegt.</p>
        ) : (
          <ul className="management-list">
            {holidays.map(holiday => (
              <li key={holiday.id} className="management-item">
                <div className="management-main no-thumb">
                  <div>
                    <h3>{holiday.name}</h3>
                    <p>{new Date(holiday.starts_at).toLocaleDateString('de-DE')} - {new Date(holiday.ends_at).toLocaleDateString('de-DE')}</p>
                  </div>
                </div>
                <div className="item-actions">
                  <button className="danger-action" type="button" onClick={async () => {
                    if (!token || !confirm('Wirklich löschen?')) return;
                    try {
                      const response = await fetch(`/api/admin/holidays/${holiday.id}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}` }
                      });
                      if (!response.ok) throw new Error('Fehler beim Löschen');
                      setHolidays(holidays.filter(h => h.id !== holiday.id));
                    } catch (err) {
                      console.error(err);
                      setError('Fehler beim Löschen der Ferien');
                    }
                  }}>
                    Löschen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
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
                {editingUserId === club.id ? (
                  <form className="inline-edit-form user-edit-form" onSubmit={(event) => handleSaveUser(event, club)}>
                    <label className="field">
                      <span>Name / Verein</span>
                      <input
                        value={userEditData.display_name}
                        onChange={(event) => setUserEditData({ ...userEditData, display_name: event.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Rolle</span>
                      <select
                        value={userEditData.role}
                        onChange={(event) => setUserEditData({ ...userEditData, role: event.target.value })}
                        disabled={club.role === 'master_admin'}
                      >
                        <option value="user">Nutzer</option>
                        {isMasterAdmin && <option value="admin">Admin</option>}
                        {club.role === 'master_admin' && <option value="master_admin">Master-Admin</option>}
                      </select>
                    </label>
                    <label className="field">
                      <span>Kontaktinfo</span>
                      <textarea
                        value={userEditData.contact_info}
                        onChange={(event) => setUserEditData({ ...userEditData, contact_info: event.target.value })}
                      />
                    </label>
                    <div className="inline-actions">
                      <button className="primary-action" type="submit">Speichern</button>
                      <button className="secondary-action" type="button" onClick={() => setEditingUserId(null)}>Abbrechen</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <h3>{club.display_name || club.club_name || club.email}</h3>
                    <p>{club.email}</p>
                    <span className={`status-pill ${club.is_active ? 'is-live' : 'is-muted'}`}>
                      {club.role === 'master_admin' ? 'Master-Admin' : club.role === 'admin' ? 'Admin' : 'Nutzer'} · {club.is_active ? 'aktiv' : 'eingeladen'}
                    </span>
                    <small>{club.contact_info || 'Keine Kontaktinfo hinterlegt'}</small>
                    <small>{club.camp_count ?? 0} Freizeiten im Konto</small>
                    <div className="club-card-actions">
                      {club.id !== user?.id && club.role !== 'master_admin' && (
                        <button className="secondary-action" type="button" onClick={() => startEditUser(club)}>
                          <Pencil size={17} />
                          Bearbeiten
                        </button>
                      )}
                      {club.id !== user?.id && club.role !== 'master_admin' && (
                        <button
                          className="danger-action"
                          type="button"
                          onClick={() => {
                            setDeleteUserId(club.id);
                            setDeleteUserConfirmation('');
                            setEditingUserId(null);
                          }}
                          aria-label={`${club.display_name || club.email} löschen`}
                        >
                          <Trash2 size={17} />
                        </button>
                      )}
                    </div>
                    {deleteUserId === club.id && (
                      <div className="delete-confirm-panel">
                        <strong>Verein dauerhaft löschen?</strong>
                        <p>Zur Bestätigung bitte die E-Mail-Adresse eingeben.</p>
                        <input
                          type="text"
                          value={deleteUserConfirmation}
                          onChange={(event) => setDeleteUserConfirmation(event.target.value)}
                          placeholder={club.email}
                          aria-label="E-Mail zur Löschbestätigung"
                        />
                        <div className="inline-actions">
                          <button className="danger-action" type="button" onClick={() => handleDeleteUser(club)}>
                            Löschen
                          </button>
                          <button
                            className="secondary-action"
                            type="button"
                            onClick={() => {
                              setDeleteUserId(null);
                              setDeleteUserConfirmation('');
                            }}
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {editingCampId && (
        <section className="form-panel">
          <div className="section-heading">
            <h2>Freizeit bearbeiten</h2>
            <span>Änderungen als Admin speichern</span>
          </div>
          {formError && <p className="alert">{formError}</p>}
          <form className="dashboard-form" onSubmit={handleSaveCamp}>
            <label className="field">
              <span>Titel</span>
              <input type="text" value={campEditData.title || ''} onChange={(e) => setCampEditData({ ...campEditData, title: e.target.value })} required />
            </label>
            
            <div className="field">
              <span>Kategorien</span>
              <div className="multi-select-container" ref={typeDropdownRef}>
                <div 
                  className="multi-select-trigger" 
                  onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                >
                  <div className="multi-select-value">
                    <Tag size={18} />
                    <span className={campEditData.categories?.length ? '' : 'is-placeholder'}>
                      {campEditData.categories?.length ? campEditData.categories.join(', ') : 'Kategorien wählen'}
                    </span>
                  </div>
                  <ChevronDown size={16} />
                </div>
                
                <AnimatePresence>
                  {isTypeDropdownOpen && (
                    <motion.div 
                      className="multi-select-dropdown"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                    >
                      {typeOptions.map(type => (
                        <label key={type} className="multi-select-option">
                          <input 
                            type="checkbox" 
                            checked={campEditData.categories?.includes(type)} 
                            onChange={() => toggleCategory(type)}
                          />
                          <span>{type}</span>
                        </label>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <label className="field">
              <span>Mindestalter</span>
              <input type="number" value={campEditData.min_age ?? ''} onChange={(e) => setCampEditData({ ...campEditData, min_age: Number(e.target.value) })} required />
            </label>
            <label className="field">
              <span>Höchstalter</span>
              <input type="number" value={campEditData.max_age ?? ''} onChange={(e) => setCampEditData({ ...campEditData, max_age: Number(e.target.value) })} required />
            </label>
            <div className="field field-wide">
              <span>Beschreibung</span>
              <ReactQuill theme="snow" value={campEditData.description || ''} onChange={(val: string) => setCampEditData({ ...campEditData, description: val })} />
            </div>
            <label className="field field-wide">
              <span>Ort</span>
              <input type="text" value={campEditData.location_text || ''} onChange={(e) => setCampEditData({ ...campEditData, location_text: e.target.value })} required />
            </label>
            <label className="field">
              <span>Beginn</span>
              <input type="datetime-local" value={normalizeDateTimeLocal(campEditData.starts_at)} onChange={(e) => setCampEditData({ ...campEditData, starts_at: e.target.value })} required />
            </label>
            <label className="field">
              <span>Ende</span>
              <input type="datetime-local" value={normalizeDateTimeLocal(campEditData.ends_at)} onChange={(e) => setCampEditData({ ...campEditData, ends_at: e.target.value })} required />
            </label>
            <label className="field">
              <span>Preis (€)</span>
              <input type="number" step="0.01" value={campEditData.price_eur ?? ''} onChange={(e) => setCampEditData({ ...campEditData, price_eur: Number(e.target.value) })} required />
            </label>
            <label className="field">
              <span>Anmeldeschluss</span>
              <input type="datetime-local" value={normalizeDateTimeLocal(campEditData.registration_deadline)} onChange={(e) => setCampEditData({ ...campEditData, registration_deadline: e.target.value })} required />
            </label>
            <label className="field">
              <span>Latitude</span>
              <input type="number" step="any" value={campEditData.location_lat ?? ''} onChange={(e) => setCampEditData({ ...campEditData, location_lat: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span>Longitude</span>
              <input type="number" step="any" value={campEditData.location_lng ?? ''} onChange={(e) => setCampEditData({ ...campEditData, location_lng: Number(e.target.value) })} />
            </label>
            <div className="field field-wide">
              <span>Position auf Karte</span>
              <MapPicker lat={campEditData.location_lat} lng={campEditData.location_lng} onChange={(lat, lng) => setCampEditData({ ...campEditData, location_lat: lat, location_lng: lng })} />
            </div>
            {campEditData.images?.length ? (
              <div className="field field-wide">
                <span>Bilder</span>
                <ul className="image-management-list">
                  {campEditData.images.map(img => (
                    <li key={img}>
                      <img src={img} alt="" />
                      <button className="danger-action" type="button" onClick={() => handleDeleteImage(editingCampId!, img)}><Trash2 size={17} /></button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <label className="field field-wide file-field">
              <span>Bilder hinzufügen</span>
              <input type="file" multiple accept="image/*" onChange={(e) => setSelectedFiles(e.target.files)} />
            </label>
            <div className="form-actions">
              <button className="primary-action" type="submit">Speichern</button>
              <button className="secondary-action" type="button" onClick={() => setEditingCampId(null)}>Abbrechen</button>
              <button className="secondary-action" type="button" onClick={() => setIsPreviewOpen(true)}><Eye size={18} /></button>
            </div>
          </form>
        </section>
      )}

      {isPreviewOpen && (
        <PreviewModal
          camp={campEditData}
          onClose={() => setIsPreviewOpen(false)}
          clubName={campEditData.club_name}
        />
      )}

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
                <div className="management-main">
                   {camp.images?.length ? <img src={camp.images[0]} alt="" /> : <span className="thumb-placeholder"><ImagePlus size={22} /></span>}
                  <div>
                    <h3>{camp.title}</h3>
                    <p>{camp.club_name} · {camp.categories?.join(', ') || camp.type} · {camp.location_text || 'Ort offen'}</p>
                    <span className={`status-pill ${camp.status === 'published' ? 'is-live' : 'is-muted'}`}>
                      {camp.status === 'published' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                      {getStatusLabel(camp.status)}
                    </span>
                  </div>
                </div>
                <div className="item-actions">
                  <button className="icon-button" type="button" onClick={() => handleEditCamp(camp)} aria-label={`${camp.title} bearbeiten`}>
                    <Pencil size={17} />
                  </button>
                  <select
                    className="status-select"
                    value={camp.status}
                    onChange={(e) => updateStatus(camp, e.target.value)}
                  >
                    <option value="draft">Entwurf</option>
                    <option value="published">Veröffentlicht</option>
                    <option value="fully_booked">Ausgebucht</option>
                    <option value="archived">Archiv</option>
                  </select>
                  {deleteCampId === camp.id ? (
                    <div className="inline-confirm" role="group" aria-label={`${camp.title} wirklich löschen`}>
                      <span>Löschen?</span>
                      <button className="danger-action" type="button" onClick={() => handleDeleteCamp(camp.id)}>Ja</button>
                      <button className="secondary-action" type="button" onClick={() => setDeleteCampId(null)}>Nein</button>
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
