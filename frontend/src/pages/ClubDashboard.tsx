import { ImageSelection } from '../components/ImageSelection';
import { Modal } from '../components/Modal';
import { editorSections, fieldSection, publicationIssues } from '../utils/campForm';
import { useAction } from '../utils/useAction';
import { apiFetch, ApiError } from '../utils/api';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Copy, ImagePlus, Pencil, Plus, Trash2, XCircle, Eye, Tag, ChevronDown, CalendarDays, MapPin, MoreHorizontal, PlayCircle } from 'lucide-react';
import { RichTextEditor } from '../components/RichTextEditor';

import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import { PreviewModal } from '../components/PreviewModal';
import { MapPicker } from '../components/MapPicker';

interface Camp {
  id: number;
  title: string;
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
  lifecycle_state?: 'upcoming' | 'ongoing' | 'past';
  images?: string[];
}

const normalizeDateTimeLocal = (value?: string) => value ? value.replace(' ', 'T').slice(0, 16) : '';

const parseFormDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatCampDate = (value?: string) => {
  const date = parseFormDate(value);
  return date ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date) : 'Termin offen';
};

const getFormSnapshot = (data: Partial<Camp>) => {
  const { description, ...remainingData } = data;
  const descriptionText = (description || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

  return JSON.stringify({
    ...remainingData,
    ...(descriptionText ? { description } : {}),
  });
};

export const ClubDashboard: React.FC = () => {
  const { user, csrfToken } = useAuthStore();
  const navigate = useNavigate();
  const [camps, setCamps] = useState<Camp[]>([]);
  const [formData, setFormData] = useState<Partial<Camp>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [activeEditorSection, setActiveEditorSection] = useState<'basics' | 'schedule' | 'location' | 'images'>('basics');
  const [campToDelete, setCampToDelete] = useState<Camp | null>(null);
  const [initialFormData, setInitialFormData] = useState('{}');
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);
  const [discardAction, setDiscardAction] = useState<'close' | 'create'>('close');
  const [activeCampView, setActiveCampView] = useState<'current' | 'past'>('current');
  const [formNotice, setFormNotice] = useState('');
  const [dashboardError, setDashboardError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('date');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { busy, runAction } = useAction(setDashboardError);
  const checklist = publicationIssues(formData, user?.contact_info);
  const focusError = (fields: Record<string, string>) => {
    setFieldErrors(fields);
    const field = Object.keys(fields)[0];
    setActiveEditorSection(fieldSection[field] || 'basics');
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[name="${field}"], [data-field="${field}"] .ql-editor, [data-field="${field}"] button`)?.focus());
  };


  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

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
    try {
      const res = await apiFetch(`/api/camps?manage=1&club_id=${user?.id}`);
      const data = await res.json();
      setCamps(Array.isArray(data) ? data : []);
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : 'Die Aktion ist fehlgeschlagen.');
    }
  };

  useEffect(() => {
    if (!user || user.role !== 'user') {
      navigate('/login');
      return;
    }

    let cancelled = false;
    const loadCamps = async () => {
      try {
        const res = await apiFetch(`/api/camps?manage=1&club_id=${user.id}`);
        const data = await res.json();
        if (!cancelled) {
          setCamps(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        setDashboardError(error instanceof Error ? error.message : 'Die Aktion ist fehlgeschlagen.');
      }
    };

    void loadCamps().finally(() => { if (!cancelled) setLoading(false); });

    return () => {
      cancelled = true;
    };
  }, [user, csrfToken, navigate]);

  const validateDates = () => {
    const startsAt = parseFormDate(formData.starts_at);
    const endsAt = parseFormDate(formData.ends_at);
    const registrationDeadline = parseFormDate(formData.registration_deadline);

    if (
      formData.min_age !== undefined &&
      formData.max_age !== undefined &&
      Number(formData.max_age) < Number(formData.min_age)
    ) {
      return 'Das Höchstalter muss größer oder gleich dem Mindestalter sein.';
    }

    if (startsAt && endsAt && endsAt <= startsAt) {
      return 'Das Ende der Freizeit muss nach dem Beginn liegen.';
    }

    if (registrationDeadline && startsAt && registrationDeadline >= startsAt) {
      return 'Der Anmeldeschluss muss vor dem Beginn der Freizeit liegen.';
    }

    return '';
  };

  const handleSubmit = (event?: React.FormEvent, statusOverride?: 'draft' | 'published') => runAction(async () => {
    if (event) event.preventDefault();
    setFormError('');
    const submitter = (event?.nativeEvent as SubmitEvent | undefined)?.submitter as HTMLButtonElement | null | undefined;
    const submittedStatus = submitter?.name === 'status' ? submitter.value as 'draft' | 'published' : undefined;
    const requestedStatus = statusOverride ?? submittedStatus;
    setFieldErrors({});
    if (['published', 'fully_booked'].includes(requestedStatus ?? formData.status ?? 'draft') && Object.keys(checklist).length) {
      setFormError('Bitte vervollständige die markierten Angaben vor dem Veröffentlichen.');
      focusError(checklist);
      return;
    }

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

      };

      const finalData = { ...formData, status: requestedStatus ?? formData.status ?? 'draft' };

      if (!isEditing && selectedFiles?.length) {
        const formDataObj = new FormData();
        Object.entries(finalData).forEach(([key, value]) => {
          if (key === 'categories' && Array.isArray(value)) {
            value.forEach(v => formDataObj.append('categories[]', v));
          } else if (value !== undefined && value !== null) {
            formDataObj.append(key, String(value));
          }
        });
        Array.from(selectedFiles).forEach((file) => formDataObj.append('images[]', file));
        reqBody = formDataObj;
      } else {
        headers['Content-Type'] = 'application/json';
        reqBody = JSON.stringify(finalData);
      }

      const response = await apiFetch(url, { method, headers, body: reqBody });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Freizeit konnte nicht gespeichert werden');
      }

      const campId = isEditing ? formData.id : data.id;
      setFormNotice('Freizeitdaten gespeichert.');
      if (isEditing && campId && selectedFiles?.length) {
        const imageData = new FormData();
        Array.from(selectedFiles).forEach((file) => imageData.append('images[]', file));
        const imageResponse = await apiFetch(`/api/camps/${campId}/images`, {
          method: 'POST',

          body: imageData,
        });

        if (!imageResponse.ok) {
          const imageError = await imageResponse.json();
          throw new Error(imageError.error || 'Bilder konnten nicht hochgeladen werden');
        }
      }

      setIsEditing(false);
      setIsEditorOpen(false);
      setInitialFormData('{}');
      setFormData({});
      setSelectedFiles([]);
      setFormNotice('');
      setNotice('Freizeit erfolgreich gespeichert.');
      fetchCamps();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Freizeit konnte nicht gespeichert werden');
      if (error instanceof ApiError && Object.keys(error.fields).length) focusError(error.fields);
      setDashboardError(error instanceof Error ? error.message : 'Die Aktion ist fehlgeschlagen.');
    }
  });

  const handleDelete = (id: number) => runAction(async () => {
    try {
      await apiFetch(`/api/camps/${id}`, {
        method: 'DELETE',
      });
      setCampToDelete(null);
      setNotice('Freizeit gelöscht.');
      fetchCamps();
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : 'Die Aktion ist fehlgeschlagen.');
    }
  });

  const handleEdit = (camp: Camp) => {
    if (isFormDirty && !window.confirm('Ungespeicherte Änderungen verwerfen und eine andere Freizeit öffnen?')) return;
    setFieldErrors({});
    setFormData(camp);
    setIsEditing(true);
    setIsEditorOpen(true);
    setInitialFormData(getFormSnapshot(camp));
    setActiveEditorSection('basics');
    setSelectedFiles([]);
    setFormError('');
    setFormNotice('');
  };

  const openCreateEditor = () => {
    setFieldErrors({});
    setFormData({});
    setIsEditing(false);
    setSelectedFiles([]);
    setFormError('');
    setFormNotice('');
    setActiveEditorSection('basics');
    setInitialFormData('{}');
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setIsEditing(false);
    setFormData({});
    setSelectedFiles([]);
    setFormError('');
    setFormNotice('');
    setInitialFormData('{}');
  };

  const handleDuplicate = (camp: Camp) => runAction(async () => {
    if (isFormDirty && !window.confirm('Ungespeicherte Änderungen verwerfen und die Kopie öffnen?')) return;
    setDashboardError('');

    try {
      const response = await apiFetch(`/api/camps/${camp.id}/duplicate`, {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok || !data.camp) {
        throw new Error(data.error || 'Kopie konnte nicht angelegt werden');
      }

      const copiedCamp = data.camp as Camp;
      setCamps((current) => [copiedCamp, ...current]);
      setFormData(copiedCamp);
      setIsEditing(true);
      setIsEditorOpen(true);
      setInitialFormData(getFormSnapshot(copiedCamp));
      setSelectedFiles([]);
      setFormError('');
      setFormNotice('Kopie angelegt. Ergänze Termin, Preis und Anmeldeschluss, bevor du sie veröffentlichst.');
      setActiveEditorSection('schedule');
      requestAnimationFrame(() => document.querySelector('.camp-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : 'Kopie konnte nicht angelegt werden');
    }
  });

  const isFormDirty = isEditorOpen && (Boolean(selectedFiles?.length) || getFormSnapshot(formData) !== initialFormData);

  const requestCloseEditor = () => {
    if (isFormDirty) {
      setDiscardAction('close');
      setIsDiscardDialogOpen(true);
      return;
    }
    closeEditor();
  };

  const requestCreateEditor = () => {
    if (isFormDirty) {
      setDiscardAction('create');
      setIsDiscardDialogOpen(true);
      return;
    }
    openCreateEditor();
  };

  const discardUnsavedChanges = () => {
    setIsDiscardDialogOpen(false);
    if (discardAction === 'create') {
      openCreateEditor();
    } else {
      closeEditor();
    }
  };

  const handleDeleteImage = (campId: number, imageUrl: string) => runAction(async () => {
    try {
      const response = await apiFetch(`/api/camps/${campId}/images`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
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
      setDashboardError(error instanceof Error ? error.message : 'Die Aktion ist fehlgeschlagen.');
    }
  });

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
      setDashboardError(error instanceof Error ? error.message : 'Die Aktion ist fehlgeschlagen.');
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

  const getLifecycleLabel = (lifecycleState?: Camp['lifecycle_state']) => {
    switch (lifecycleState) {
      case 'ongoing': return 'Läuft gerade';
      case 'past': return 'Vergangen';
      default: return '';
    }
  };

  const isPastStart = (startsAt?: string) => {
    if (!startsAt) return false;
    const date = parseFormDate(startsAt);
    return date ? date < new Date() : false;
  };

  const toggleCategory = (cat: string) => {
    const current = formData.categories || [];
    const updated = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
    setFormData({ ...formData, categories: updated });
  };

  const currentCamps = camps.filter((camp) => camp.lifecycle_state !== 'past');
  const pastCamps = camps.filter((camp) => camp.lifecycle_state === 'past');
  const visibleCamps = (activeCampView === 'past' ? pastCamps : currentCamps)
    .filter((camp) => (!statusFilter || camp.status === statusFilter) && `${camp.title} ${camp.location_text || ''}`.toLocaleLowerCase('de').includes(search.toLocaleLowerCase('de')))
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'de') : (a.starts_at || '9999').localeCompare(b.starts_at || '9999'));
  const publishedCamps = currentCamps.filter((camp) => camp.status === 'published').length;
  const draftCamps = currentCamps.filter((camp) => camp.status === 'draft').length;

  useEffect(() => {
    if (!isFormDirty) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    const warnBeforeNavigation = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest<HTMLAnchorElement>('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;

      if (!window.confirm('Du hast ungespeicherte Änderungen. Möchtest du diese Seite wirklich verlassen?')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const warnBeforeLogout = (event: Event) => { if (!window.confirm('Ungespeicherte Änderungen verwerfen und abmelden?')) event.preventDefault(); };
    window.addEventListener('request-leave-editor', warnBeforeLogout);
    window.addEventListener('beforeunload', warnBeforeUnload);
    document.addEventListener('click', warnBeforeNavigation, true);
    return () => {
      window.removeEventListener('request-leave-editor', warnBeforeLogout);
      window.removeEventListener('beforeunload', warnBeforeUnload);
      document.removeEventListener('click', warnBeforeNavigation, true);
    };
  }, [isFormDirty]);

  return (
    <div className="dashboard-page">
      {notice && <p className="success-alert" role="status">{notice}</p>}
      {busy && <p role="status">Änderung wird gespeichert …</p>}
      <fieldset className="action-scope" disabled={busy} inert={busy}>
      <section className="dashboard-hero">
        <div className="page-heading">
          <span className="eyebrow">Vereinsbereich</span>
          <h1>Meine Freizeiten</h1>
          <p>Verwalte deine Angebote und behalte ihre Sichtbarkeit im Blick.</p>
        </div>
        <button className="primary-action dashboard-create-action" type="button" onClick={requestCreateEditor}>
          <Plus size={18} />
          Freizeit anlegen
        </button>
      </section>

      <section className="dashboard-summary" aria-label="Übersicht">
        <div><strong>{currentCamps.length}</strong><span>Aktuell</span></div>
        <div><strong>{publishedCamps}</strong><span>Veröffentlicht</span></div>
        <div><strong>{draftCamps}</strong><span>Entwürfe</span></div>
        <div><strong>{pastCamps.length}</strong><span>Vergangen</span></div>
      </section>

      {isEditorOpen && (
      <section className="form-panel camp-editor">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{isEditing ? 'Bearbeiten' : 'Neue Freizeit'}</span>
            <h2>{isEditing ? formData.title || 'Freizeit bearbeiten' : 'Freizeit anlegen'}</h2>
          </div>
          <button className="editor-close-button" type="button" onClick={requestCloseEditor} aria-label="Editor schließen">×</button>
        </div>
        {formError && (
          <p className="alert" id="camp-form-error" role="alert">
            {formError}
          </p>
        )}
        {Object.keys(fieldErrors).length > 0 && <ul className="validation-summary" aria-label="Bitte prüfen">{Object.entries(fieldErrors).map(([field, error]) => <li key={field}><button type="button" id={`error-${field}`} onClick={() => focusError({ [field]: error })}>{error}</button></li>)}</ul>}
        <p>Entwürfe dürfen unvollständig sein. Zum Veröffentlichen fehlen noch {Object.keys(checklist).length} Angaben.</p>
        {formNotice && <p className="success-alert" role="status">{formNotice}</p>}

        <form className="dashboard-form" noValidate onSubmit={handleSubmit} aria-describedby={formError ? 'camp-form-error' : undefined}>
          <section className="editor-step field-wide">
            <button className="editor-step-toggle" type="button" onClick={() => setActiveEditorSection('basics')} aria-expanded={activeEditorSection === 'basics'}>
              <span><strong>1. Grundlagen <span className="step-status">{Object.keys(checklist).some((field) => fieldSection[field] === 'basics') ? 'Angaben offen' : 'Vollständig'}</span></strong><small>Titel, Kategorie, Alter und Beschreibung</small></span>
              <ChevronDown size={18} />
            </button>
            {activeEditorSection === 'basics' && <div className="editor-step-content dashboard-form-grid">
          <label className="field">
            <span>Titel</span>
            <input name="title" aria-invalid={Boolean(fieldErrors.title)} aria-describedby={fieldErrors.title ? 'error-title' : undefined} type="text" value={formData.title || ''} onChange={(event) => setFormData({ ...formData, title: event.target.value })} required />
          </label>

          <div className="field" data-field="categories">
            <span>Kategorien</span>
            <div className="multi-select-container" ref={typeDropdownRef}>
              <button type="button" aria-expanded={isTypeDropdownOpen} aria-label="Kategorien wählen"
                className="multi-select-trigger"
                onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
              >
                <div className="multi-select-value">
                  <Tag size={18} />
                  <span className={formData.categories?.length ? '' : 'is-placeholder'}>
                    {formData.categories?.length ? formData.categories.join(', ') : 'Kategorien wählen'}
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
                          checked={formData.categories?.includes(type) ?? false}
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
            <input name="min_age" aria-invalid={Boolean(fieldErrors.min_age)} aria-describedby={fieldErrors.min_age ? 'error-min_age' : undefined} type="number" min="0" value={formData.min_age ?? ''} onChange={(event) => setFormData({ ...formData, min_age: event.target.value === '' ? undefined : Number(event.target.value) })} required />
          </label>
          <label className="field">
            <span>Höchstalter</span>
            <input name="max_age" aria-invalid={Boolean(fieldErrors.max_age)} aria-describedby={fieldErrors.max_age ? 'error-max_age' : undefined} type="number" min="0" value={formData.max_age ?? ''} onChange={(event) => setFormData({ ...formData, max_age: event.target.value === '' ? undefined : Number(event.target.value) })} required />
          </label>
          <div className="field field-wide" data-field="description">
            <span id="description-label">Beschreibung</span>
            <RichTextEditor
              value={formData.description || ''}
              onChange={(value: string) => setFormData({ ...formData, description: value })}
            />
          </div>
            </div>}
          </section>

          <section className="editor-step field-wide">
            <button className="editor-step-toggle" type="button" onClick={() => setActiveEditorSection('schedule')} aria-expanded={activeEditorSection === 'schedule'}>
              <span><strong>2. Termin &amp; Preis <span className="step-status">{Object.keys(checklist).some((field) => fieldSection[field] === 'schedule') ? 'Angaben offen' : 'Vollständig'}</span></strong><small>Zeitraum, Teilnahmebeitrag und Anmeldeschluss</small></span>
              <ChevronDown size={18} />
            </button>
            {activeEditorSection === 'schedule' && <div className="editor-step-content dashboard-form-grid">
          <label className="field">
            <span>Beginn</span>
            <input name="starts_at" aria-invalid={Boolean(fieldErrors.starts_at)} aria-describedby={fieldErrors.starts_at ? 'error-starts_at' : undefined} type="datetime-local" value={normalizeDateTimeLocal(formData.starts_at)} onChange={(event) => setFormData({ ...formData, starts_at: event.target.value })} required />
          </label>
          <label className="field">
            <span>Ende</span>
            <input name="ends_at" aria-invalid={Boolean(fieldErrors.ends_at)} aria-describedby={fieldErrors.ends_at ? 'error-ends_at' : undefined} type="datetime-local" value={normalizeDateTimeLocal(formData.ends_at)} onChange={(event) => setFormData({ ...formData, ends_at: event.target.value })} required />
          </label>
          <label className="field">
            <span>Teilnahmebeitrag in €</span>
            <input name="price_eur" aria-invalid={Boolean(fieldErrors.price_eur)} aria-describedby={fieldErrors.price_eur ? 'error-price_eur' : undefined} type="number" min="0" step="0.01" value={formData.price_eur ?? ''} onChange={(event) => setFormData({ ...formData, price_eur: event.target.value === '' ? undefined : Number(event.target.value) })} required />
          </label>
          <label className="field">
            <span>Anmeldeschluss</span>
            <input name="registration_deadline" aria-invalid={Boolean(fieldErrors.registration_deadline)} aria-describedby={fieldErrors.registration_deadline ? 'error-registration_deadline' : undefined} type="datetime-local" value={normalizeDateTimeLocal(formData.registration_deadline)} onChange={(event) => setFormData({ ...formData, registration_deadline: event.target.value })} required />
          </label>
            </div>}
          </section>

          <section className="editor-step field-wide">
            <button className="editor-step-toggle" type="button" onClick={() => setActiveEditorSection('location')} aria-expanded={activeEditorSection === 'location'}>
              <span><strong>3. Ort &amp; Karte <span className="step-status">{Object.keys(checklist).some((field) => fieldSection[field] === 'location') ? 'Angaben offen' : 'Vollständig'}</span></strong><small>Adresse und Kartenposition</small></span>
              <ChevronDown size={18} />
            </button>
            {activeEditorSection === 'location' && <div className="editor-step-content dashboard-form-grid">
          <label className="field field-wide">
            <span>Ort</span>
            <input name="location_text" aria-invalid={Boolean(fieldErrors.location_text)} aria-describedby={fieldErrors.location_text ? 'error-location_text' : undefined} type="text" value={formData.location_text || ''} onChange={(event) => setFormData({ ...formData, location_text: event.target.value })} required />
          </label>
          <details className="field-wide"><summary>Koordinaten manuell bearbeiten (optional)</summary>
          <label className="field">
            <span>Breitengrad (optional)</span>
            <input name="location_lat" aria-invalid={Boolean(fieldErrors.location_lat)} aria-describedby={fieldErrors.location_lat ? 'error-location_lat' : undefined} type="number" step="any" value={formData.location_lat ?? ''} onChange={(event) => setFormData({ ...formData, location_lat: event.target.value === '' ? undefined : Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>Längengrad (optional)</span>
            <input name="location_lng" aria-invalid={Boolean(fieldErrors.location_lng)} aria-describedby={fieldErrors.location_lng ? 'error-location_lng' : undefined} type="number" step="any" value={formData.location_lng ?? ''} onChange={(event) => setFormData({ ...formData, location_lng: event.target.value === '' ? undefined : Number(event.target.value) })} />
          </label>
          </details>
          <button type="button" className="secondary-action" onClick={() => setFormData({ ...formData, location_lat: undefined, location_lng: undefined })}>Kartenposition entfernen</button>
          {!user?.contact_info && <p data-field="contact_info">Bitte unter Konto &amp; Einstellungen eine öffentliche Kontaktmöglichkeit ergänzen.</p>}
          <div className="field field-wide">
            <span>Position auf Karte wählen</span>
            <MapPicker
              lat={formData.location_lat}
              lng={formData.location_lng}
              onChange={(lat, lng) => setFormData({ ...formData, location_lat: lat, location_lng: lng })}
            />
          </div>
            </div>}
          </section>

          <section className="editor-step field-wide">
            <button className="editor-step-toggle" type="button" onClick={() => setActiveEditorSection('images')} aria-expanded={activeEditorSection === 'images'}>
              <span><strong>4. Bilder <span className="step-status">{selectedFiles.length || formData.images?.length ? 'Bilder gewählt' : 'Optional'}</span></strong><small>Vorschaubild und Galerie</small></span>
              <ChevronDown size={18} />
            </button>
            {activeEditorSection === 'images' && <div className="editor-step-content dashboard-form-grid">
          {isEditing && Boolean(formData.images?.length) && (
            <div className="field field-wide">
              <span>Vorhandene Bilder</span>
              <ul className="image-management-list">
                {formData.images?.map((image, index) => (
                  <li key={image}>
                    <img src={image} alt={`Bild ${index + 1} zu ${formData.title || 'dieser Freizeit'}`} />
                    <button
                      className="danger-action"
                      type="button"
                      onClick={() => { if (formData.id && window.confirm('Dieses Bild sofort löschen? Andere ungespeicherte Änderungen bleiben erhalten.')) void handleDeleteImage(formData.id, image); }}
                      aria-label={`Bild ${index + 1} löschen`}
                    >
                      <Trash2 size={17} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ImageSelection files={selectedFiles} onChange={setSelectedFiles} existingCount={formData.images?.length || 0} />
            </div>}
          </section>
          <div className="form-actions field-wide">
            <button type="button" className="secondary-action" disabled={activeEditorSection === 'basics'} onClick={() => setActiveEditorSection(editorSections[Math.max(0, editorSections.indexOf(activeEditorSection) - 1)])}>Zurück</button>
            <button type="button" className="secondary-action" disabled={activeEditorSection === 'images'} onClick={() => {
              const issues = Object.fromEntries(Object.entries(checklist).filter(([field]) => fieldSection[field] === activeEditorSection));
              if (Object.keys(issues).length) { focusError(issues); setFormError('Bitte prüfe diesen Abschnitt. Als Entwurf kannst du jederzeit speichern.'); return; }
              setActiveEditorSection(editorSections[Math.min(3, editorSections.indexOf(activeEditorSection) + 1)]);
            }}>Weiter</button>
          </div>
          <div className="form-actions editor-actions">
            {!isEditing ? (
              <>
                <button className="secondary-action" type="submit" name="status" value="draft">
                   Als Entwurf speichern
                </button>
                <button className="primary-action" type="submit" name="status" value="published" disabled={isPastStart(formData.starts_at)}>
                   <Plus size={18} />
                   Veröffentlichen
                </button>
                <button className="secondary-action" type="button" onClick={() => setIsPreviewOpen(true)} title="Vorschau" aria-label="Vorschau">
                  <Eye size={18} />
                </button>
              </>
            ) : formData.status === 'draft' ? (
              <>
                <button className="secondary-action" type="submit" name="status" value="draft">
                  Als Entwurf speichern
                </button>
                <button className="primary-action" type="submit" name="status" value="published" disabled={isPastStart(formData.starts_at)}>
                  <CheckCircle2 size={18} />
                  Veröffentlichen
                </button>
                <button className="secondary-action" type="button" onClick={requestCloseEditor}>
                  Abbrechen
                </button>
                <button className="secondary-action" type="button" onClick={() => setIsPreviewOpen(true)} title="Vorschau" aria-label="Vorschau">
                  <Eye size={18} />
                </button>
              </>
            ) : (
              <>
                <button className="primary-action" type="submit">
                  <CheckCircle2 size={18} />
                  Speichern
                </button>
                <button className="secondary-action" type="button" onClick={requestCloseEditor}>
                  Abbrechen
                </button>
                <button className="secondary-action" type="button" onClick={() => setIsPreviewOpen(true)} title="Vorschau" aria-label="Vorschau">
                  <Eye size={18} />
                </button>
              </>
            )}
          </div>
        </form>
      </section>
      )}

      {isPreviewOpen && (
        <PreviewModal
          camp={formData}
          selectedFiles={selectedFiles}
          onClose={() => setIsPreviewOpen(false)}
          clubName={user?.club_name}
          contactInfo={user?.contact_info}
        />
      )}

      <section className="list-panel">
        <div className="section-heading camp-list-heading">
          <div>
            <h2>{activeCampView === 'past' ? 'Vergangene Freizeiten' : 'Aktuelle Freizeiten'}</h2>
            <span>{visibleCamps.length} {visibleCamps.length === 1 ? 'Angebot' : 'Angebote'}</span>
          </div>
          <div className="camp-view-tabs" role="group" aria-label="Freizeiten nach Zeitraum filtern">
            <button
              className={activeCampView === 'current' ? 'is-active' : ''}
              type="button"
              aria-pressed={activeCampView === 'current'}
              onClick={() => setActiveCampView('current')}
            >
              Aktuell <span>{currentCamps.length}</span>
            </button>
            <button
              className={activeCampView === 'past' ? 'is-active' : ''}
              type="button"
              aria-pressed={activeCampView === 'past'}
              onClick={() => setActiveCampView('past')}
            >
              Vergangen <span>{pastCamps.length}</span>
            </button>
          </div>
        </div>
        <div className="management-filters">
          <label>Freizeiten suchen<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Titel oder Ort" /></label>
          <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Alle Status</option><option value="draft">Entwurf</option><option value="published">Veröffentlicht</option><option value="fully_booked">Ausgebucht</option><option value="archived">Archiv</option></select></label>
          <label>Sortieren<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="date">Beginn</option><option value="title">Titel</option></select></label>
        </div>
        {loading && <p role="status">Freizeiten werden geladen …</p>}
        {dashboardError && <p className="alert" role="alert">{dashboardError}</p>}
        {!loading && visibleCamps.length === 0 ? (
          <div className="empty-state compact">
            <ImagePlus size={32} />
            <h3>{search || statusFilter ? 'Keine passenden Freizeiten' : activeCampView === 'past' ? 'Noch keine vergangenen Freizeiten' : 'Noch keine aktuelle Freizeit angelegt'}</h3>
            <p>{activeCampView === 'past' ? 'Abgelaufene Angebote erscheinen hier automatisch.' : 'Lege dein erstes Angebot an und mache es für Familien sichtbar.'}</p>
            {activeCampView === 'current' && <button className="primary-action" type="button" onClick={requestCreateEditor}><Plus size={18} /> Freizeit anlegen</button>}
          </div>
        ) : (
          <ul className="management-list">
            {visibleCamps.map((camp) => (
              <li key={camp.id} className="management-item">
                <div className="management-main">
                  {camp.images?.length ? <img src={camp.images[0]} alt={`Bild zu ${camp.title}`} /> : <span className="thumb-placeholder"><ImagePlus size={22} /></span>}
                  <div>
                    <h3>{camp.title}</h3>
                    <p>{camp.categories?.join(', ') || camp.type} · {camp.min_age}-{camp.max_age} Jahre</p>
                    <p className="management-meta"><CalendarDays size={15} /> {formatCampDate(camp.starts_at)} <MapPin size={15} /> {camp.location_text || 'Ort offen'}</p>
                    {camp.lifecycle_state === 'past' || camp.lifecycle_state === 'ongoing' ? (
                      <span className={`status-pill ${camp.lifecycle_state === 'past' ? 'is-past' : 'is-ongoing'}`}>
                        {camp.lifecycle_state === 'past' ? <CalendarDays size={15} /> : <PlayCircle size={15} />}
                        {getLifecycleLabel(camp.lifecycle_state)}
                      </span>
                    ) : null}
                    <span className={`status-pill ${camp.status === 'published' ? 'is-live' : 'is-muted'}`}>
                      {camp.status === 'published' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                      {getStatusLabel(camp.status)}
                    </span>
                  </div>
                </div>
                <div className="item-actions">
                  {camp.lifecycle_state === 'past' && (
                    <button className="primary-action management-copy-action" type="button" onClick={() => void handleDuplicate(camp)}>
                      <Copy size={17} />
                      Für neues Jahr kopieren
                    </button>
                  )}
                  <button className="secondary-action management-edit-action" type="button" onClick={() => handleEdit(camp)}>
                    <Pencil size={17} />
                    Bearbeiten
                  </button>
                  <details className="camp-actions-menu">
                    <summary aria-label={`Weitere Aktionen für ${camp.title}`}><MoreHorizontal size={20} /></summary>
                    <div>
                      <label>
                        Status
                        <select className="status-select" value={camp.status} onChange={(event) => updateStatus(camp, event.target.value)}>
                          <option value="draft">Entwurf</option>
                          <option value="published" disabled={isPastStart(camp.starts_at)}>Veröffentlicht</option>
                          <option value="fully_booked">Ausgebucht</option>
                          <option value="archived">Archiv</option>
                        </select>
                      </label>
                      <button className="danger-action" type="button" onClick={() => setCampToDelete(camp)}><Trash2 size={17} /> Freizeit löschen</button>
                    </div>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {campToDelete && (
        <Modal title="Freizeit löschen?" onClose={() => setCampToDelete(null)}>

          <div className="delete-dialog-content">
            <h2 id="delete-camp-title">Freizeit löschen?</h2>
            <p>„{campToDelete.title}“ und die zugehörigen Bilder werden dauerhaft entfernt.</p>
            <div>
              <button className="secondary-action" type="button" onClick={() => setCampToDelete(null)}>Abbrechen</button>
              <button className="danger-action" type="button" onClick={() => { void handleDelete(campToDelete.id); }}><Trash2 size={17} /> Löschen</button>
            </div>
          </div>
        </Modal>
      )}

      {isDiscardDialogOpen && (
        <Modal title="Ungespeicherte Änderungen verwerfen?" onClose={() => setIsDiscardDialogOpen(false)}>

          <div className="delete-dialog-content">
            <h2 id="discard-changes-title">Ungespeicherte Änderungen verwerfen?</h2>
            <p>Deine Eingaben gehen verloren, wenn du den Editor jetzt verlässt.</p>
            <div>
              <button className="secondary-action" type="button" onClick={() => setIsDiscardDialogOpen(false)}>Weiter bearbeiten</button>
              <button className="danger-action" type="button" onClick={discardUnsavedChanges}>Änderungen verwerfen</button>
            </div>
          </div>
        </Modal>
      )}
      </fieldset>
    </div>
  );
};
