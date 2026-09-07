import { AccessibleForm } from '../components/AccessibleForm';
import { ExistingImages } from '../components/ExistingImages';
import { appendImages, saveImageDescriptions, descriptionsComplete, fileDescription, type ImageMetadata } from '../utils/imageMetadata';
import { ImageSelection } from '../components/ImageSelection';
import { useAction } from '../utils/useAction';
import { ApiError, apiFetch } from '../utils/api';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Pencil, ShieldCheck, Trash2, UserPlus, CheckCircle2, Eye, XCircle, ImagePlus, Tag, ChevronDown } from 'lucide-react';
import { RichTextEditor } from '../components/RichTextEditor';

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
  image_metadata?: ImageMetadata[];
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
  delivery_status?: 'sent' | 'failed' | null;
  sent_at?: string;
}

const parseJson = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const fetchJsonArray = async <T,>(url: string): Promise<T[]> => {
  const response = await apiFetch(url);
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
  const { user, csrfToken } = useAuthStore();
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
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [campSearch, setCampSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('date');
  const [initialCamp, setInitialCamp] = useState('');
  const { busy, runAction } = useAction(setError);


  const [editingCampId, setEditingCampId] = useState<number | null>(null);
  const [campEditData, setCampEditData] = useState<Partial<Camp>>({});
  const [campFieldErrors, setCampFieldErrors] = useState<Record<string, string>>({});
  const campEditorRef = useRef<HTMLElement>(null);
  const focusCampField = (field: string) => {
    const root = campEditorRef.current;
    const key = CSS.escape(field);
    const target = root?.querySelector<HTMLElement>(`[name="${key}"], [data-field="${key}"] .ql-editor, [data-field="${key}"] textarea, [data-field="${key}"]`);
    (target || root)?.focus();
  };
  useEffect(() => {
    const field = Object.keys(campFieldErrors)[0];
    if (busy || !field) return;
    const root = campEditorRef.current;
    const key = CSS.escape(field);
    const target = root?.querySelector<HTMLElement>(`[name="${key}"], [data-field="${key}"] .ql-editor, [data-field="${key}"] textarea, [data-field="${key}"]`);
    (target || root)?.focus();
  }, [campFieldErrors, busy]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  const [deleteCampId, setDeleteCampId] = useState<number | null>(null);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userEditData, setUserEditData] = useState({ display_name: '', role: 'user', contact_info: '' });
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [deleteUserConfirmation, setDeleteUserConfirmation] = useState('');

  const dirty = editingCampId !== null && (selectedFiles.length > 0 || JSON.stringify(campEditData) !== initialCamp);
  const visibleClubs = clubs.filter((club) => `${club.display_name} ${club.email}`.toLocaleLowerCase('de').includes(userSearch.toLocaleLowerCase('de')));
  const visibleCamps = camps.filter((camp) => (!statusFilter || camp.status === statusFilter) && `${camp.title} ${camp.club_name} ${camp.location_text}`.toLocaleLowerCase('de').includes(campSearch.toLocaleLowerCase('de')))
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'de') : (a.starts_at || '9999').localeCompare(b.starts_at || '9999'));

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
    if (!csrfToken) return;

    try {
      setCamps(await fetchJsonArray<Camp>('/api/camps?all=1'));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Freizeiten konnten nicht geladen werden');
    }
  };

  const fetchClubs = async () => {
    if (!csrfToken) return;

    try {
      setClubs(await fetchJsonArray<ClubUser>('/api/admin/users'));
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

    if (!csrfToken) {
      navigate('/login');
      return;
    }

    let cancelled = false;
    const loadDashboard = async () => {
      try {
        const [clubsData, campsData, holidaysData] = await Promise.all([
          fetchJsonArray<ClubUser>('/api/admin/users'),
          fetchJsonArray<Camp>('/api/camps?all=1'),
          fetchJsonArray<Holiday>('/api/holidays'),
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

    void loadDashboard().finally(() => { if (!cancelled) setLoading(false); });

    return () => {
      cancelled = true;
    };
  }, [user, csrfToken, navigate, isAdmin]);

  const handleEditCamp = (camp: Camp) => {
    if (dirty && !window.confirm('Ungespeicherte Änderungen verwerfen?')) return;
    setCampFieldErrors({});
    setInitialCamp(JSON.stringify(camp));
    setEditingCampId(camp.id);
    setCampEditData(camp);
    setDeleteCampId(null);
    setFormError('');
    setSelectedFiles([]);
  };

  const handleSaveCamp = (event: React.FormEvent) => runAction(async () => {
    event.preventDefault();
    setCampFieldErrors({});
    setFormError('');

    const startsAt = parseFormDate(campEditData.starts_at);
    const endsAt = parseFormDate(campEditData.ends_at);
    const registrationDeadline = parseFormDate(campEditData.registration_deadline);

    if (startsAt && endsAt && endsAt <= startsAt) {
      setFormError('Das Ende der Freizeit muss nach dem Beginn liegen.');
      setCampFieldErrors({ ends_at: 'Das Ende der Freizeit muss nach dem Beginn liegen.' });
      requestAnimationFrame(() => focusCampField('ends_at'));
      return;
    }
    if (registrationDeadline && startsAt && registrationDeadline >= startsAt) {
      setFormError('Der Anmeldeschluss muss vor dem Beginn der Freizeit liegen.');
      return;
    }

    try {
      if (['published', 'fully_booked'].includes(campEditData.status ?? '') && !descriptionsComplete([...(campEditData.image_metadata || []), ...selectedFiles.map(fileDescription)])) {
        setFormError('Bitte alle Bilder beschreiben oder als dekorativ kennzeichnen.');
        setCampFieldErrors({ images: 'Bitte alle Bilder beschreiben oder als dekorativ kennzeichnen.' });
        requestAnimationFrame(() => focusCampField('images'));
        return;
      }
      await saveImageDescriptions(editingCampId!, campEditData.image_metadata);
      const response = await apiFetch(`/api/camps/${editingCampId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(campEditData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Fehler beim Speichern');
      }

      setNotice('Freizeitdaten gespeichert. Ausgewählte Bilder werden anschließend hochgeladen.');
      if (selectedFiles?.length) {
        const imageData = new FormData();
        appendImages(imageData, selectedFiles);
        await apiFetch(`/api/camps/${editingCampId}/images`, {
          method: 'POST',

          body: imageData,
        });
      }

      setNotice('Freizeit gespeichert.');
      setEditingCampId(null);
      setCampEditData({});
      fetchCamps();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Fehler beim Speichern');
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        setCampFieldErrors(err.fields);
        requestAnimationFrame(() => focusCampField(Object.keys(err.fields)[0]));
      }
    }
  });

  const handleDeleteImage = (campId: number, imageUrl: string) => runAction(async () => {
    try {
      await apiFetch(`/api/camps/${campId}/images`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image_url: imageUrl }),
      });
      setCampEditData(current => ({
        ...current,
        images: current.images?.filter(img => img !== imageUrl),
        image_metadata: current.image_metadata?.filter(image => image.image_url !== imageUrl)
      }));
      fetchCamps();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Änderung fehlgeschlagen.');
    }
  });

  const handleDeleteCamp = (id: number) => runAction(async () => {
    await apiFetch(`/api/camps/${id}`, {
      method: 'DELETE',
    });
    setDeleteCampId(null);
    setNotice('Freizeit gelöscht.');
    fetchCamps();
  });

  const startEditUser = (club: ClubUser) => {
    setEditingUserId(club.id);
    setDeleteUserId(null);
    setUserEditData({
      display_name: club.display_name || club.club_name || '',
      role: club.role,
      contact_info: club.contact_info || '',
    });
  };

  const handleSaveUser = (event: React.FormEvent, club: ClubUser) => runAction(async () => {
    event.preventDefault();
    setError('');

    const res = await apiFetch(`/api/admin/users/${club.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userEditData),
    });
    const data = await parseJson(res);
    if (!res.ok) {
      setError(data?.error || 'Nutzer konnte nicht aktualisiert werden');
      return;
    }

    setEditingUserId(null);
    setNotice('Vereinsangaben gespeichert.');
    fetchClubs();
  });

  const handleDeleteUser = (club: ClubUser) => runAction(async () => {
    setError('');
    const res = await apiFetch(`/api/admin/users/${club.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
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
    setNotice('Verein und zugehörige Freizeiten gelöscht.');
    fetchClubs();
    fetchCamps();
  });

  const handleSubmit = (event: React.FormEvent) => runAction(async () => {
    event.preventDefault();
    setError('');

    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Fehler beim Erstellen');
      } else {
        setNotice(data.message);
        setFormData({ email: '', display_name: '', role: 'user', contact_info: '' });
        fetchClubs();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Einladung konnte nicht erstellt werden.');
    }
  });

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Entwurf';
      case 'published': return 'Veröffentlicht';
      case 'fully_booked': return 'Ausgebucht';
      case 'archived': return 'Archiv';
      default: return 'Unbekannt';
    }
  };

  const updateStatus = (camp: Camp, newStatus: string) => runAction(async () => {
    try {
      await apiFetch(`/api/camps/${camp.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...camp, status: newStatus }),
      });
      fetchCamps();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Änderung fehlgeschlagen.');
    }
  });

  const toggleCategory = (cat: string) => {
    const current = campEditData.categories || [];
    const updated = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
    setCampEditData({ ...campEditData, categories: updated });
  };

  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const leave = (event: Event) => { if (!window.confirm('Ungespeicherte Änderungen verwerfen?')) event.preventDefault(); };
    const click = (event: MouseEvent) => {
      const link = (event.target as HTMLElement)?.closest('a[href]');
      if (link && link.getAttribute('target') !== '_blank' && !window.confirm('Ungespeicherte Änderungen verwerfen?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload);
    window.addEventListener('request-leave-editor', leave);
    document.addEventListener('click', click, true);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('request-leave-editor', leave); document.removeEventListener('click', click, true); };
  }, [dirty]);

  return (
    <div className="dashboard-page">
      {notice && <p role="status" className="success-alert feedback-banner">{notice}</p>}
      {loading && <p role="status">Verwaltung wird geladen …</p>}
      {busy && <p role="status">Änderung wird gespeichert …</p>}
      <fieldset className="action-scope" disabled={busy} inert={busy}>
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
        <AccessibleForm className="dashboard-form" onSubmit={handleSubmit} aria-describedby={error ? 'admin-form-error' : undefined}>
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
        </AccessibleForm>
      </section>

      <section className="list-panel">
        <div className="section-heading">
          <h2>Ferien verwalten</h2>
        </div>
        <AccessibleForm className="admin-form compact" onSubmit={async (e) => {
          e.preventDefault();
          if (!csrfToken || isCreatingHoliday) return;
          setIsCreatingHoliday(true);
          try {
            const response = await apiFetch('/api/admin/holidays', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
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
            const updatedHolidays = await fetchJsonArray<Holiday>('/api/holidays');
            setHolidays(updatedHolidays);
            setNotice('Ferien gespeichert.');
          } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Fehler beim Erstellen der Ferien');
          } finally {
            setIsCreatingHoliday(false);
          }
        }}>
          <div className="admin-holiday-grid">
            <label className="field">
              <span>Name des Ferienzeitraums</span>
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
        </AccessibleForm>
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
                    if (!csrfToken || !confirm('Wirklich löschen?')) return;
                    try {
                      const response = await apiFetch(`/api/admin/holidays/${holiday.id}`, {
                        method: 'DELETE',
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
        <label className="field">Vereine suchen<input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Name oder E-Mail" /></label>
        {visibleClubs.length === 0 ? (
          <p className="empty-line">Keine Vereine registriert.</p>
        ) : (
          <ul className="club-grid">
            {visibleClubs.map((club) => (
              <li key={club.id} className="club-card">
                <span className="club-icon"><Building2 size={21} /></span>
                {editingUserId === club.id ? (
                  <AccessibleForm className="inline-edit-form user-edit-form" onSubmit={(event) => handleSaveUser(event, club)}>
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
                  </AccessibleForm>
                ) : (
                  <>
                    <h3>{club.display_name || club.club_name || club.email}</h3>
                    <p>{club.email}</p>
                    <span className={`status-pill ${club.is_active ? 'is-live' : 'is-muted'}`}>
                      {club.role === 'master_admin' ? 'Master-Admin' : club.role === 'admin' ? 'Admin' : 'Nutzer'} · {club.is_active ? 'aktiv' : 'eingeladen'}
                    </span>
                    <small>{club.contact_info || 'Keine Kontaktinfo hinterlegt'}</small>
                    {!club.is_active && <div>
                      <p>{club.delivery_status === 'failed' ? 'Einladung konnte nicht versendet werden.' : club.delivery_status === 'sent' ? 'Einladung versendet; Aktivierung steht aus.' : 'Einladung steht aus.'}</p>
                      <button type="button" className="secondary-action" onClick={() => void runAction(async () => {
                        try { const response = await apiFetch(`/api/admin/users/${club.id}/resend-invite`, { method: 'POST' }); const data = await response.json(); setNotice(data.message); }
                        finally { await fetchClubs(); }
                      })}>Einladung erneut senden</button>
                    </div>}
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
        <section className="form-panel" ref={campEditorRef} tabIndex={-1}>
          <div className="section-heading">
            <h2>Freizeit bearbeiten</h2>
            <span>Änderungen als Admin speichern</span>
          </div>
          {formError && <p className="alert" role="alert">{formError}</p>}
          <AccessibleForm className="dashboard-form" noValidate onSubmit={handleSaveCamp}>
            {Object.keys(campFieldErrors).length > 0 && <ul className="validation-summary" aria-label="Bitte prüfe diese Angaben">{Object.entries(campFieldErrors).map(([field, message]) => <li key={field} id={`admin-error-${field}`}><button type="button" onClick={() => focusCampField(field)}>{message}</button></li>)}</ul>}
            <label className="field">
              <span>Titel</span>
              <input type="text" name="title" aria-invalid={Boolean(campFieldErrors.title)} aria-describedby={campFieldErrors.title ? 'admin-error-title' : undefined} value={campEditData.title || ''} onChange={(e) => setCampEditData({ ...campEditData, title: e.target.value })} required />
            </label>

            <div className="field">
              <span>Kategorien</span>
              <div className="multi-select-container" ref={typeDropdownRef}>
                <button type="button" name="categories" aria-invalid={Boolean(campFieldErrors.categories)} aria-describedby={campFieldErrors.categories ? "admin-error-categories" : undefined} aria-expanded={isTypeDropdownOpen} aria-label="Kategorien wählen"
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
                </button>

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
              <input type="number" name="min_age" aria-invalid={Boolean(campFieldErrors.min_age)} aria-describedby={campFieldErrors.min_age ? 'admin-error-min_age' : undefined} value={campEditData.min_age ?? ''} onChange={(e) => setCampEditData({ ...campEditData, min_age: Number(e.target.value) })} required />
            </label>
            <label className="field">
              <span>Höchstalter</span>
              <input type="number" name="max_age" aria-invalid={Boolean(campFieldErrors.max_age)} aria-describedby={campFieldErrors.max_age ? 'admin-error-max_age' : undefined} value={campEditData.max_age ?? ''} onChange={(e) => setCampEditData({ ...campEditData, max_age: Number(e.target.value) })} required />
            </label>
            <div className="field field-wide" data-field="description">
              <span>Beschreibung</span>
              <RichTextEditor errorId={campFieldErrors.description ? "admin-error-description" : undefined} value={campEditData.description || ''} onChange={(val: string) => setCampEditData({ ...campEditData, description: val })} />
            </div>
            <label className="field field-wide">
              <span>Ort</span>
              <input type="text" name="location_text" aria-invalid={Boolean(campFieldErrors.location_text)} aria-describedby={campFieldErrors.location_text ? 'admin-error-location_text' : undefined} value={campEditData.location_text || ''} onChange={(e) => setCampEditData({ ...campEditData, location_text: e.target.value })} required />
            </label>
            <label className="field">
              <span>Beginn</span>
              <input type="datetime-local" name="starts_at" aria-invalid={Boolean(campFieldErrors.starts_at)} aria-describedby={campFieldErrors.starts_at ? 'admin-error-starts_at' : undefined} value={normalizeDateTimeLocal(campEditData.starts_at)} onChange={(e) => setCampEditData({ ...campEditData, starts_at: e.target.value })} required />
            </label>
            <label className="field">
              <span>Ende</span>
              <input type="datetime-local" name="ends_at" aria-invalid={Boolean(campFieldErrors.ends_at)} aria-describedby={campFieldErrors.ends_at ? 'admin-error-ends_at' : undefined} value={normalizeDateTimeLocal(campEditData.ends_at)} onChange={(e) => setCampEditData({ ...campEditData, ends_at: e.target.value })} required />
            </label>
            <label className="field">
              <span>Preis (€)</span>
              <input type="number" step="0.01" name="price_eur" aria-invalid={Boolean(campFieldErrors.price_eur)} aria-describedby={campFieldErrors.price_eur ? 'admin-error-price_eur' : undefined} value={campEditData.price_eur ?? ''} onChange={(e) => setCampEditData({ ...campEditData, price_eur: Number(e.target.value) })} required />
            </label>
            <label className="field">
              <span>Anmeldeschluss</span>
              <input type="datetime-local" name="registration_deadline" aria-invalid={Boolean(campFieldErrors.registration_deadline)} aria-describedby={campFieldErrors.registration_deadline ? 'admin-error-registration_deadline' : undefined} value={normalizeDateTimeLocal(campEditData.registration_deadline)} onChange={(e) => setCampEditData({ ...campEditData, registration_deadline: e.target.value })} required />
            </label>
            <label className="field">
              <span>Breitengrad</span>
              <input type="number" step="any" name="location_lat" aria-invalid={Boolean(campFieldErrors.location_lat)} aria-describedby={campFieldErrors.location_lat ? 'admin-error-location_lat' : undefined} value={campEditData.location_lat ?? ''} onChange={(e) => setCampEditData({ ...campEditData, location_lat: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span>Längengrad</span>
              <input type="number" step="any" name="location_lng" aria-invalid={Boolean(campFieldErrors.location_lng)} aria-describedby={campFieldErrors.location_lng ? 'admin-error-location_lng' : undefined} value={campEditData.location_lng ?? ''} onChange={(e) => setCampEditData({ ...campEditData, location_lng: Number(e.target.value) })} />
            </label>
            <div className="field field-wide">
              <span>Position auf Karte</span>
              <MapPicker lat={campEditData.location_lat} lng={campEditData.location_lng} onChange={(lat, lng) => setCampEditData({ ...campEditData, location_lat: lat, location_lng: lng })} />
            </div>
            <ExistingImages images={campEditData.image_metadata || []} onChange={image_metadata => setCampEditData(current => ({ ...current, image_metadata }))} onDelete={url => { if (editingCampId) void handleDeleteImage(editingCampId, url); }} />
            <ImageSelection files={selectedFiles} onChange={setSelectedFiles} existingCount={campEditData.images?.length || 0} />
            <div className="form-actions">
              <button className="primary-action" type="submit">Speichern</button>
              <button className="secondary-action" type="button" onClick={() => { if (!dirty || window.confirm('Ungespeicherte Änderungen verwerfen?')) setEditingCampId(null); }}>Abbrechen</button>
              <button className="secondary-action" type="button" aria-label="Freizeitvorschau" onClick={() => setIsPreviewOpen(true)}><Eye size={18} /></button>
            </div>
          </AccessibleForm>
        </section>
      )}

      {isPreviewOpen && (
        <PreviewModal
          camp={campEditData}
          selectedFiles={selectedFiles}
          onClose={() => setIsPreviewOpen(false)}
          clubName={campEditData.club_name}
        />
      )}

      <section className="list-panel">
        <div className="section-heading">
          <h2>Alle Freizeiten</h2>
          <span>Moderation</span>
        </div>
        <div className="management-filters">
          <label>Freizeiten suchen<input value={campSearch} onChange={(e) => setCampSearch(e.target.value)} placeholder="Titel, Verein oder Ort" /></label>
          <label>Status<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">Alle Status</option><option value="draft">Entwurf</option><option value="published">Veröffentlicht</option><option value="fully_booked">Ausgebucht</option><option value="archived">Archiv</option></select></label>
          <label>Sortieren<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="date">Beginn</option><option value="title">Titel</option></select></label>
        </div>
        {visibleCamps.length === 0 ? (
          <p className="empty-line">Keine Freizeiten vorhanden.</p>
        ) : (
          <ul className="management-list">
            {visibleCamps.map((camp) => (
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
                    aria-label={`Status für ${camp.title}`}
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
      </fieldset>
    </div>
  );
};
