import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Eye, Plus, Tag } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { AccessibleForm } from './AccessibleForm';
import { ExistingImages } from './ExistingImages';
import { ImageSelection } from './ImageSelection';
import { MapPicker } from './MapPicker';
import { Modal } from './Modal';
import { PreviewModal } from './PreviewModal';
import { RichTextEditor } from './RichTextEditor';
import { apiFetch, ApiError } from '../utils/api';
import { campChangeRequiresReview, editorSections, fieldSection, publicationIssues, type EditorSection } from '../utils/campForm';
import { appendImages, descriptionsComplete, fileDescription, saveImageDescriptions, type ImageMetadata } from '../utils/imageMetadata';
import { safeHtml } from '../utils/safeHtml';
import { useAction } from '../utils/useAction';

export interface CampRecord {
  id: number;
  club_id?: number;
  club_name?: string;
  review_status?: string;
  review_reason?: string;
  approved_revision_id?: number | null;
  external_occupied?: number;
  occupied_in_portal?: number;
  title: string;
  min_age: number;
  max_age: number;
  description: string;
  confirmation_information?: string;
  legal_and_requirements?: string;
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
  image_metadata?: ImageMetadata[];
  place_requests_enabled?: boolean;
  allocation_method?: 'request' | 'lottery';
  capacity_total?: number;
  places_remaining?: number;
  request_opens_at?: string;
  waitlist_enabled?: boolean;
  place_request_email?: string;
  availability_state?: 'available' | 'few_places' | 'waitlist' | 'sold_out' | 'application_open' | 'not_open' | 'closed' | 'contact_only';
}

const normalizeDateTimeLocal = (value?: string) => value ? value.replace(' ', 'T').slice(0, 16) : '';

const parseFormDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
};

const defaultNewCamp: Partial<CampRecord> = {
  place_requests_enabled: false,
  allocation_method: 'request',
  waitlist_enabled: false,
};

const getFormSnapshot = (data: Partial<CampRecord>) => {
  const { description, ...remainingData } = data;
  const normalizedDescription = safeHtml(description || '').trim();
  const descriptionText = normalizedDescription.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  const entries = Object.entries({
    ...remainingData,
    ...(descriptionText ? { description: normalizedDescription } : {}),
  }).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(Object.fromEntries(entries));
};

const isPastStart = (startsAt?: string) => {
  if (!startsAt) return false;
  const date = parseFormDate(startsAt);
  return date ? date < new Date() : false;
};

export function CampEditorForm({
  mode,
  role,
  initialCamp,
  typeOptions,
  ownerName,
  ownerContactInfo,
  ownerEmail,
  onSaved,
  onCancel,
}: {
  mode: 'create' | 'edit';
  role: 'provider' | 'admin';
  initialCamp?: Partial<CampRecord>;
  typeOptions: string[];
  ownerName?: string;
  ownerContactInfo?: string;
  ownerEmail?: string;
  onSaved: (result: { id: number; notice: string }) => void;
  onCancel: () => void;
}) {
  const isEditing = mode === 'edit' && Boolean(initialCamp?.id);
  const [formData, setFormData] = useState<Partial<CampRecord>>(() => initialCamp || defaultNewCamp);
  const [initialSnapshot] = useState(() => getFormSnapshot(initialCamp || defaultNewCamp));
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [activeEditorSection, setActiveEditorSection] = useState<EditorSection>('basics');
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const { busy, runAction } = useAction(setFormError);

  const checklist = publicationIssues(formData, ownerContactInfo ?? (role === 'admin' ? 'Kontakt' : undefined), ownerEmail);
  if (!descriptionsComplete([...(formData.image_metadata || []), ...selectedFiles.map(fileDescription)])) {
    checklist.images = 'Bitte alle Bilder beschreiben oder als dekorativ kennzeichnen.';
  }

  const focusError = (fields: Record<string, string>) => {
    setFieldErrors(fields);
    const field = Object.keys(fields)[0];
    setActiveEditorSection(fieldSection[field] || 'basics');
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[name="${field}"], [data-field="${field}"] .ql-editor, [data-field="${field}"] button, [data-field="${field}"] textarea, [data-field="${field}"]`)?.focus()
    );
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
        setIsTypeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isFormDirty = Boolean(selectedFiles.length) || getFormSnapshot(formData) !== initialSnapshot;

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
      const nextUrl = new URL(link.href, window.location.origin);
      if (nextUrl.pathname === window.location.pathname && nextUrl.search === window.location.search) return;
      if (!window.confirm('Du hast ungespeicherte Änderungen. Möchtest du diese Seite wirklich verlassen?')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const warnBeforeLogout = (event: Event) => {
      if (!window.confirm('Ungespeicherte Änderungen verwerfen und abmelden?')) event.preventDefault();
    };
    window.addEventListener('request-leave-editor', warnBeforeLogout);
    window.addEventListener('beforeunload', warnBeforeUnload);
    document.addEventListener('click', warnBeforeNavigation, true);
    return () => {
      window.removeEventListener('request-leave-editor', warnBeforeLogout);
      window.removeEventListener('beforeunload', warnBeforeUnload);
      document.removeEventListener('click', warnBeforeNavigation, true);
    };
  }, [isFormDirty]);

  const validateDates = () => {
    const startsAt = parseFormDate(formData.starts_at);
    const endsAt = parseFormDate(formData.ends_at);
    const registrationDeadline = parseFormDate(formData.registration_deadline);
    const requestOpensAt = parseFormDate(formData.request_opens_at);
    if (formData.min_age !== undefined && formData.max_age !== undefined && Number(formData.max_age) < Number(formData.min_age)) {
      return 'Das Höchstalter muss größer oder gleich dem Mindestalter sein.';
    }
    if (startsAt && endsAt && endsAt <= startsAt) {
      return 'Das Ende der Freizeit muss nach dem Beginn liegen.';
    }
    if (registrationDeadline && startsAt && registrationDeadline >= startsAt) {
      return 'Der Anmeldeschluss muss vor dem Beginn der Freizeit liegen.';
    }
    if (requestOpensAt && registrationDeadline && requestOpensAt >= registrationDeadline) {
      return 'Der Beginn für Anfragen oder Bewerbungen muss vor dem Anmeldeschluss liegen.';
    }
    return '';
  };

  const handleSubmit = (event?: React.FormEvent, statusOverride?: 'draft' | 'published') => runAction(async () => {
    if (event) event.preventDefault();
    setFormError('');
    const submitter = (event?.nativeEvent as SubmitEvent | undefined)?.submitter as HTMLButtonElement | null | undefined;
    const submittedStatus = submitter?.name === 'status' ? submitter.value as 'draft' | 'published' : undefined;
    const requestedStatus = statusOverride ?? submittedStatus ?? (role === 'admin' ? 'published' : undefined);
    setFieldErrors({});

    const shouldSubmit = ['published', 'fully_booked'].includes(requestedStatus ?? formData.status ?? 'draft');
    if (shouldSubmit && Object.keys(checklist).length) {
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
    const targetStatus = role === 'admin' && shouldSubmit ? 'published' : 'draft';
    const finalData = { ...formData, allocation_method: 'request', status: targetStatus };

    try {
      let reqBody: BodyInit;
      const headers: Record<string, string> = {};
      if (!isEditing && selectedFiles.length) {
        const formDataObj = new FormData();
        Object.entries(finalData).forEach(([key, value]) => {
          if (key === 'categories' && Array.isArray(value)) {
            value.forEach(v => formDataObj.append('categories[]', String(v)));
          } else if (value !== undefined && value !== null) {
            formDataObj.append(key, String(value));
          }
        });
        appendImages(formDataObj, selectedFiles);
        reqBody = formDataObj;
      } else {
        headers['Content-Type'] = 'application/json';
        reqBody = JSON.stringify(finalData);
      }

      if (isEditing && formData.id) await saveImageDescriptions(formData.id, formData.image_metadata);
      const response = await apiFetch(url, { method, headers, body: reqBody });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Freizeit konnte nicht gespeichert werden');

      const campId = Number(isEditing ? formData.id : data.id);
      if (isEditing && campId && selectedFiles.length) {
        const imageData = new FormData();
        appendImages(imageData, selectedFiles);
        const imageResponse = await apiFetch(`/api/camps/${campId}/images`, { method: 'POST', body: imageData });
        if (!imageResponse.ok) {
          const imageError = await imageResponse.json();
          throw new Error(imageError.error || 'Bilder konnten nicht hochgeladen werden');
        }
      }

      const needsReview = data.requires_review !== false;
      if (shouldSubmit && campId && needsReview) {
        await apiFetch(`/api/camps/${campId}/submit`, { method: 'POST' });
      }

      const notice = data.message || (
        !needsReview
          ? (role === 'admin' ? 'Änderungen direkt freigegeben und veröffentlicht.' : 'Änderungen direkt übernommen und veröffentlicht.')
          : shouldSubmit
            ? 'Angebot zur Prüfung eingereicht.'
            : 'Arbeitsfassung gespeichert.'
      );
      onSaved({ id: campId, notice });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Freizeit konnte nicht gespeichert werden');
      if (error instanceof ApiError && Object.keys(error.fields).length) focusError(error.fields);
    }
  });

  const handleDeleteImage = (campId: number, imageUrl: string) => runAction(async () => {
    const response = await apiFetch(`/api/camps/${campId}/images`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Bild konnte nicht gelöscht werden');
    }
    setFormData((current) => ({
      ...current,
      images: current.images?.filter((image) => image !== imageUrl),
      image_metadata: current.image_metadata?.filter((image) => image.image_url !== imageUrl),
    }));
  });

  const toggleCategory = (cat: string) => {
    const current = formData.categories || [];
    const updated = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
    setFormData({ ...formData, categories: updated });
  };

  const requestCancel = () => {
    if (isFormDirty) {
      setIsDiscardDialogOpen(true);
      return;
    }
    onCancel();
  };

  const editApprovedPublic = isEditing && Boolean(formData.approved_revision_id) && ['published', 'fully_booked'].includes(formData.status || '');
  const needsReviewNow = formData.review_status !== 'approved' || campChangeRequiresReview(initialCamp || {}, formData);

  return (
    <section className="form-panel camp-editor">
      {busy && <p role="status">Änderung wird gespeichert …</p>}
      <fieldset className="action-scope" disabled={busy} inert={busy}>
        {formError && <p className="alert" id="camp-form-error" role="alert">{formError}</p>}
        {Object.keys(fieldErrors).length > 0 && (
          <ul className="validation-summary" aria-label="Bitte prüfen">
            {Object.entries(fieldErrors).map(([field, error]) => (
              <li key={field}>
                <button type="button" id={`error-${field}`} onClick={() => focusError({ [field]: error })}>{error}</button>
              </li>
            ))}
          </ul>
        )}

        <div className={`readiness-banner ${Object.keys(checklist).length === 0 ? 'is-ready' : ''}`}>
          {Object.keys(checklist).length === 0 ? (
            <><CheckCircle2 size={18} aria-hidden="true" /><span>{role === 'admin' ? 'Alle Pflichtangaben vollständig – bereit zur direkten Freigabe.' : 'Alle Pflichtangaben vollständig – bereit zum Einreichen zur Prüfung.'}</span></>
          ) : (
            <span>Entwürfe dürfen unvollständig sein. Zum Veröffentlichen fehlen noch {Object.keys(checklist).length} Angaben.</span>
          )}
        </div>

        <ol className="stepper" aria-label="Editor-Schritte">
          {([
            ['basics', 'Grundlagen'],
            ['schedule', 'Termin & Preis'],
            ['places', 'Plätze'],
            ['location', 'Ort & Karte'],
            ['images', 'Bilder'],
            ['legal', 'Rechtliches'],
          ] as const).map(([key, label], index) => {
            const hasOpen = key === 'places'
              ? Boolean(formData.place_requests_enabled) && Object.keys(checklist).some((field) => fieldSection[field] === key)
              : key === 'images'
                ? Boolean(checklist.images)
                : key === 'legal'
                  ? false
                  : Object.keys(checklist).some((field) => fieldSection[field] === key);
            const active = activeEditorSection === key;
            return (
              <li key={key}>
                <button
                  type="button"
                  className={`stepper-item ${active ? 'is-active' : !hasOpen && key !== 'images' && key !== 'legal' ? 'is-complete' : ''}`}
                  aria-current={active ? 'step' : undefined}
                  onClick={() => setActiveEditorSection(key)}
                >
                  <span className="stepper-num" aria-hidden="true">{index + 1}</span>
                  <span>{label}</span>
                </button>
              </li>
            );
          })}
        </ol>

        {role === 'admin' ? (
          <p className="status-banner is-approved">
            Als Jugendring-Mitarbeitende kannst du Änderungen direkt freigeben und veröffentlichen – ohne erneute Prüfung.
          </p>
        ) : editApprovedPublic && (
          <p className={`status-banner ${needsReviewNow ? 'is-warning' : 'is-approved'}`}>
            {needsReviewNow
              ? 'Änderungen an Titel, Termin, Preis, Alter, Ort, Rechtlichem oder Mailhinweisen werden nach Jugendring-Prüfung übernommen. Bis dahin bleibt die bisherige Fassung online.'
              : 'Einfache Änderungen (Beschreibung, Kategorien, Bilder oder Kartenposition) werden direkt ohne erneute Jugendring-Prüfung veröffentlicht.'}
          </p>
        )}

        <AccessibleForm className="dashboard-form" noValidate onSubmit={handleSubmit} aria-describedby={formError ? 'camp-form-error' : undefined}>
          <section className="editor-step field-wide">
            <button className="editor-step-toggle" type="button" onClick={() => setActiveEditorSection('basics')} aria-expanded={activeEditorSection === 'basics'}>
              <span><strong>1. Grundlagen <span className="step-status">{Object.keys(checklist).some((field) => fieldSection[field] === 'basics') ? 'Angaben offen' : 'Vollständig'}</span></strong><small>Titel, Kategorie, Alter und Beschreibung</small></span>
              <ChevronDown size={18} aria-hidden="true" />
            </button>
            {activeEditorSection === 'basics' && <div className="editor-step-content dashboard-form-grid">
              <label className="field">
                <span>Titel</span>
                <input name="title" aria-invalid={Boolean(fieldErrors.title)} aria-describedby={fieldErrors.title ? 'error-title' : undefined} type="text" value={formData.title || ''} onChange={(event) => setFormData({ ...formData, title: event.target.value })} required />
              </label>

              <div className="field" data-field="categories">
                <span>Kategorien</span>
                <div className="multi-select-container" ref={typeDropdownRef}>
                  <button type="button" aria-expanded={isTypeDropdownOpen} aria-label="Kategorien wählen" className="multi-select-trigger" onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}>
                    <div className="multi-select-value">
                      <Tag size={18} aria-hidden="true" />
                      <span className={formData.categories?.length ? '' : 'is-placeholder'}>
                        {formData.categories?.length ? formData.categories.join(', ') : 'Kategorien wählen'}
                      </span>
                    </div>
                    <ChevronDown size={16} aria-hidden="true" />
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
                            <input type="checkbox" checked={formData.categories?.includes(type) ?? false} onChange={() => toggleCategory(type)} />
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
                  errorId={fieldErrors.description ? 'error-description' : undefined}
                  value={formData.description || ''}
                  onChange={(value: string) => setFormData((current) => current.description === value ? current : { ...current, description: value })}
                />
              </div>
            </div>}
          </section>

          <section className="editor-step field-wide">
            <button className="editor-step-toggle" type="button" onClick={() => setActiveEditorSection('schedule')} aria-expanded={activeEditorSection === 'schedule'}>
              <span><strong>2. Termin &amp; Preis <span className="step-status">{Object.keys(checklist).some((field) => fieldSection[field] === 'schedule') ? 'Angaben offen' : 'Vollständig'}</span></strong><small>Zeitraum, Teilnahmebeitrag und Anmeldeschluss</small></span>
              <ChevronDown size={18} aria-hidden="true" />
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
            <button className="editor-step-toggle" type="button" onClick={() => setActiveEditorSection('places')} aria-expanded={activeEditorSection === 'places'}>
              <span><strong>3. Plätze &amp; Reservierung <span className="step-status">{!formData.place_requests_enabled ? 'Optional' : Object.keys(checklist).some((field) => fieldSection[field] === 'places') ? 'Angaben offen' : 'Aktiv'}</span></strong><small>Kapazität, Vergabe und interne Empfängeradresse</small></span>
              <ChevronDown size={18} aria-hidden="true" />
            </button>
            {activeEditorSection === 'places' && <div className="editor-step-content dashboard-form-grid">
              <label className="toggle-field field-wide">
                <input name="place_requests_enabled" type="checkbox" checked={Boolean(formData.place_requests_enabled)} onChange={(event) => setFormData({ ...formData, place_requests_enabled: event.target.checked })} />
                <span>Anmeldungen mit vorläufiger Reservierung über das Portal ermöglichen</span>
              </label>
              <p className="field-wide editor-help">Anmeldungen reservieren sofort Plätze bis zu deiner Entscheidung. Bestätigungen, Stornierungen und Wartelisten bearbeitest du im Portal. Zahlungen werden noch nicht erfasst.</p>
              {formData.place_requests_enabled && <>
                <label className="field field-wide">
                  <span>Vergabeverfahren</span>
                  <select name="allocation_method" value={formData.allocation_method || 'request'} onChange={(event) => setFormData({ ...formData, allocation_method: event.target.value as 'request' | 'lottery', waitlist_enabled: event.target.value === 'lottery' ? false : formData.waitlist_enabled })} aria-invalid={Boolean(fieldErrors.allocation_method)}>
                    <option value="request">Direkte vorläufige Reservierung</option>
                  </select>
                </label>
                <label className="field">
                  <span>Plätze insgesamt</span>
                  <input
                    name="capacity_total"
                    type="number"
                    min="1"
                    max="10000"
                    value={formData.capacity_total ?? ''}
                    onChange={(event) => {
                      const capacity = event.target.value === '' ? undefined : Number(event.target.value);
                      const remaining = capacity == null ? formData.places_remaining : formData.places_remaining == null ? capacity : Math.min(formData.places_remaining, capacity);
                      setFormData({ ...formData, capacity_total: capacity, places_remaining: capacity == null ? remaining : Math.max(0, capacity - (formData.external_occupied ?? 0) - (formData.occupied_in_portal ?? 0)) });
                    }}
                    aria-invalid={Boolean(fieldErrors.capacity_total)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Extern belegte Plätze</span>
                  <input name="external_occupied" type="number" min="0" max={formData.capacity_total ?? 10000} value={formData.external_occupied ?? 0} onChange={event => { const external = Number(event.target.value); setFormData({ ...formData, external_occupied: external, places_remaining: Math.max(0, (formData.capacity_total ?? 0) - external - (formData.occupied_in_portal ?? 0)) }); }} />
                </label>
                {formData.capacity_total != null && formData.capacity_total > 0 && (() => {
                  const total = formData.capacity_total;
                  const portalOcc = formData.occupied_in_portal ?? 0;
                  const extOcc = formData.external_occupied ?? 0;
                  const free = Math.max(0, total - portalOcc - extOcc);
                  const overbooked = portalOcc + extOcc > total;
                  return (
                    <div className="capacity-meter field-wide" aria-label="Kapazitätsvorschau">
                      <div className="capacity-bar" aria-hidden="true">
                        <span className="capacity-fill-portal" style={{ width: `${Math.min(100, (portalOcc / total) * 100)}%` }} />
                        <span className="capacity-fill-external" style={{ width: `${Math.min(100, (extOcc / total) * 100)}%` }} />
                      </div>
                      <div className="capacity-legend">
                        <span><strong>{free}</strong> von {total} Plätzen frei</span>
                        <span>Im Portal belegt: {portalOcc}</span>
                        <span>Extern belegt: {extOcc}</span>
                      </div>
                      {overbooked && <p className="alert">Hinweis: Portal- und externe Belegung übersteigen die Gesamtkapazität.</p>}
                    </div>
                  );
                })()}
                <label className="field">
                  <span>Anmeldungen möglich ab (optional)</span>
                  <input name="request_opens_at" type="datetime-local" value={normalizeDateTimeLocal(formData.request_opens_at)} onChange={(event) => setFormData({ ...formData, request_opens_at: event.target.value })} aria-invalid={Boolean(fieldErrors.request_opens_at)} />
                </label>
                <label className="field">
                  <span>Interne Anfrageadresse (optional)</span>
                  <input name="place_request_email" type="email" maxLength={254} value={formData.place_request_email || ''} onChange={(event) => setFormData({ ...formData, place_request_email: event.target.value })} placeholder={ownerEmail || 'Konto-E-Mail wird verwendet'} aria-invalid={Boolean(fieldErrors.place_request_email)} />
                </label>
                <label className="field field-wide">
                  <span>Wichtige Informationen für Bestätigungsmails (optional)</span>
                  <textarea name="confirmation_information" rows={5} maxLength={5000} value={formData.confirmation_information || ''} onChange={event => setFormData({ ...formData, confirmation_information: event.target.value })} aria-invalid={Boolean(fieldErrors.confirmation_information)} aria-describedby="confirmation-information-help" />
                  <small id="confirmation-information-help">Zum Beispiel Treffpunkt oder Hinweise zur Anreise. Dieser Text wird mit jeder Anmelde- und Statusbestätigung dieser Freizeit verschickt. Änderungen werden mit dem Angebot zur Prüfung eingereicht.</small>
                </label>
                <label className="toggle-field field-wide">
                  <input name="waitlist_enabled" type="checkbox" checked={Boolean(formData.waitlist_enabled)} onChange={(event) => setFormData({ ...formData, waitlist_enabled: event.target.checked })} />
                  <span>Bei null freien Plätzen Wartelistenanmeldungen erlauben</span>
                </label>
              </>}
            </div>}
          </section>

          <section className="editor-step field-wide">
            <button className="editor-step-toggle" type="button" onClick={() => setActiveEditorSection('location')} aria-expanded={activeEditorSection === 'location'}>
              <span><strong>4. Ort &amp; Karte <span className="step-status">{Object.keys(checklist).some((field) => fieldSection[field] === 'location') ? 'Angaben offen' : 'Vollständig'}</span></strong><small>Adresse und Kartenposition</small></span>
              <ChevronDown size={18} aria-hidden="true" />
            </button>
            {activeEditorSection === 'location' && <div className="editor-step-content dashboard-form-grid">
              <label className="field field-wide">
                <span>Ort</span>
                <input name="location_text" aria-invalid={Boolean(fieldErrors.location_text)} aria-describedby={fieldErrors.location_text ? 'error-location_text' : undefined} type="text" value={formData.location_text || ''} onChange={(event) => setFormData({ ...formData, location_text: event.target.value })} required />
              </label>
              <details className="field-wide">
                <summary>Koordinaten manuell bearbeiten (optional)</summary>
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
              {role === 'provider' && !ownerContactInfo && <p data-field="contact_info">Bitte unter Konto &amp; Einstellungen eine öffentliche Kontaktmöglichkeit ergänzen.</p>}
              <div className="field field-wide">
                <span>Position auf Karte wählen</span>
                <MapPicker lat={formData.location_lat} lng={formData.location_lng} onChange={(lat, lng) => setFormData({ ...formData, location_lat: lat, location_lng: lng })} />
              </div>
            </div>}
          </section>

          <section className="editor-step field-wide">
            <button className="editor-step-toggle" type="button" onClick={() => setActiveEditorSection('images')} aria-expanded={activeEditorSection === 'images'}>
              <span><strong>5. Bilder <span className="step-status">{selectedFiles.length || formData.images?.length ? 'Bilder gewählt' : 'Optional'}</span></strong><small>Vorschaubild und Galerie</small></span>
              <ChevronDown size={18} aria-hidden="true" />
            </button>
            {activeEditorSection === 'images' && <div className="editor-step-content dashboard-form-grid">
              <ExistingImages images={formData.image_metadata || []} onChange={image_metadata => setFormData(current => ({ ...current, image_metadata }))} onDelete={url => { if (formData.id) void handleDeleteImage(formData.id, url); }} />
              <ImageSelection files={selectedFiles} onChange={setSelectedFiles} existingCount={formData.images?.length || 0} />
            </div>}
          </section>

          <section className="editor-step field-wide">
            <button className="editor-step-toggle" type="button" onClick={() => setActiveEditorSection('legal')} aria-expanded={activeEditorSection === 'legal'}>
              <span><strong>6. Rechtliches &amp; Teilnahmebedingungen <span className="step-status">{role === 'admin' ? 'Direktfreigabe' : 'Prüfungspflichtig'}</span></strong><small>Teilnahmebedingungen, Regeln und Mitbringliste</small></span>
              <ChevronDown size={18} aria-hidden="true" />
            </button>
            {activeEditorSection === 'legal' && <div className="editor-step-content dashboard-form-grid">
              <p className="field-wide info-hint">
                {role === 'admin'
                  ? 'Hier legst du fest, was Teilnehmende beachten und mitbringen müssen (z. B. Packliste, Einverständniserklärungen, Bade-/Schwimmerlaubnis, Teilnahmebedingungen). Als Jugendring-Mitarbeitende werden deine Änderungen über „Speichern & direkt freigeben“ sofort veröffentlicht.'
                  : 'Hier legst du fest, was Teilnehmende beachten und mitbringen müssen (z. B. Packliste, Einverständniserklärungen, Bade-/Schwimmerlaubnis, Teilnahmebedingungen). Änderungen in diesem Bereich müssen vom Jugendring geprüft werden und erscheinen auf der Detailseite, bei der Anmeldung und in Bestätigungsmails.'}
              </p>
              <label className="field field-wide">
                <span>Rechtliches, Teilnahmebedingungen &amp; Mitbringliste (optional)</span>
                <textarea
                  name="legal_and_requirements"
                  rows={6}
                  maxLength={5000}
                  value={formData.legal_and_requirements || ''}
                  onChange={event => setFormData({ ...formData, legal_and_requirements: event.target.value })}
                  aria-invalid={Boolean(fieldErrors.legal_and_requirements)}
                  placeholder="z. B. Festes Schuhwerk und Regenjacke mitbringen, unterschriebene Einverständniserklärung am ersten Tag vorlegen, Teilnahme auf eigene Verantwortung …"
                />
              </label>
            </div>}
          </section>

          <div className="form-actions field-wide">
            <button type="button" className="secondary-action" disabled={activeEditorSection === 'basics'} onClick={() => setActiveEditorSection(editorSections[Math.max(0, editorSections.indexOf(activeEditorSection) - 1)])}>Zurück</button>
            <button type="button" className="secondary-action" disabled={activeEditorSection === 'legal'} onClick={() => {
              const issues = Object.fromEntries(Object.entries(checklist).filter(([field]) => fieldSection[field] === activeEditorSection));
              if (Object.keys(issues).length) { focusError(issues); setFormError('Bitte prüfe diesen Abschnitt. Als Entwurf kannst du jederzeit speichern.'); return; }
              setActiveEditorSection(editorSections[Math.min(editorSections.length - 1, editorSections.indexOf(activeEditorSection) + 1)]);
            }}>Weiter</button>
          </div>

          <div className="form-actions editor-actions">
            {role === 'admin' ? (
              <>
                <button className="secondary-action" type="submit" name="status" value="draft">
                  Als Entwurf speichern
                </button>
                <button className="primary-action" type="submit" name="status" value="published">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  Speichern &amp; direkt freigeben
                </button>
                <button className="secondary-action" type="button" onClick={requestCancel}>Abbrechen</button>
                <button className="secondary-action" type="button" onClick={() => setIsPreviewOpen(true)} title="Vorschau" aria-label="Vorschau">
                  <Eye size={18} aria-hidden="true" />
                </button>
              </>
            ) : !isEditing || formData.status === 'draft' ? (
              <>
                <button className="secondary-action" type="submit" name="status" value="draft">
                  Als Entwurf speichern
                </button>
                <button className="primary-action" type="submit" name="status" value="published" disabled={isPastStart(formData.starts_at)}>
                  <Plus size={18} aria-hidden="true" />
                  Zur Prüfung einreichen
                </button>
                <button className="secondary-action" type="button" onClick={requestCancel}>Abbrechen</button>
                <button className="secondary-action" type="button" onClick={() => setIsPreviewOpen(true)} title="Vorschau" aria-label="Vorschau">
                  <Eye size={18} aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <button className="primary-action" type="submit" name="status" value="published">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  {Boolean(formData.approved_revision_id) && formData.review_status === 'approved' && !campChangeRequiresReview(initialCamp || {}, formData)
                    ? 'Änderungen direkt speichern'
                    : 'Änderungen zur Prüfung einreichen'}
                </button>
                <button className="secondary-action" type="button" onClick={requestCancel}>Abbrechen</button>
                <button className="secondary-action" type="button" onClick={() => setIsPreviewOpen(true)} title="Vorschau" aria-label="Vorschau">
                  <Eye size={18} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </AccessibleForm>
      </fieldset>

      {isPreviewOpen && (
        <PreviewModal
          camp={formData}
          selectedFiles={selectedFiles}
          onClose={() => setIsPreviewOpen(false)}
          clubName={ownerName || formData.club_name}
          contactInfo={ownerContactInfo}
        />
      )}

      {isDiscardDialogOpen && (
        <Modal title="Ungespeicherte Änderungen verwerfen?" onClose={() => setIsDiscardDialogOpen(false)}>
          <div className="delete-dialog-content">
            <h2 id="discard-changes-title">Ungespeicherte Änderungen verwerfen?</h2>
            <p>Deine Eingaben gehen verloren, wenn du den Editor jetzt verlässt.</p>
            <div>
              <button className="secondary-action" type="button" onClick={() => setIsDiscardDialogOpen(false)}>Weiter bearbeiten</button>
              <button className="danger-action" type="button" onClick={() => { setIsDiscardDialogOpen(false); onCancel(); }}>Änderungen verwerfen</button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
