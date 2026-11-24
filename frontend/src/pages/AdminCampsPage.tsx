import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, ClipboardCheck, ImagePlus, Pencil, Search, Trash2, XCircle } from 'lucide-react';
import { CampEditorForm, type CampRecord } from '../components/CampEditorForm';
import { AdminWorkspaceShell, Breadcrumbs } from '../components/WorkspaceShell';
import { useAuthStore } from '../store/authStore';
import { fetchJsonArray } from '../utils/adminApi';
import { apiFetch } from '../utils/api';
import { providerStatus } from '../utils/portal';
import { useAction } from '../utils/useAction';

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'draft': return 'Entwurf';
    case 'published': return 'Veröffentlicht';
    case 'fully_booked': return 'Ausgebucht';
    case 'archived': return 'Archiv';
    default: return 'Unbekannt';
  }
};

export const AdminCampsPage: React.FC = () => {
  const { user, csrfToken } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = user?.role === 'admin' || user?.role === 'master_admin';

  const [camps, setCamps] = useState<CampRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(() => (typeof location.state?.notice === 'string' ? location.state.notice : ''));
  const [campSearch, setCampSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reviewFilter, setReviewFilter] = useState('');
  const [sort, setSort] = useState('date');
  const [deleteCampId, setDeleteCampId] = useState<number | null>(null);
  const { busy, runAction } = useAction(setError);

  const fetchCamps = async () => {
    try {
      setCamps(await fetchJsonArray<CampRecord>('/api/camps?all=1'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Freizeiten konnten nicht geladen werden');
    }
  };

  useEffect(() => {
    if (!user || !isAdmin || !csrfToken) {
      navigate('/login');
      return;
    }
    let cancelled = false;
    fetchJsonArray<CampRecord>('/api/camps?all=1')
      .then((rows) => { if (!cancelled) setCamps(rows); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Freizeiten konnten nicht geladen werden'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, csrfToken, navigate, isAdmin]);

  const visibleCamps = camps
    .filter((camp) =>
      (!statusFilter || camp.status === statusFilter)
      && (!reviewFilter || (camp.review_status || 'draft') === reviewFilter)
      && `${camp.title} ${camp.club_name || ''} ${camp.location_text || ''}`.toLocaleLowerCase('de').includes(campSearch.toLocaleLowerCase('de'))
    )
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'de') : (a.starts_at || '9999').localeCompare(b.starts_at || '9999'));

  const updateStatus = (camp: CampRecord, newStatus: string) => runAction(async () => {
    const response = await apiFetch(`/api/camps/${camp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...camp, status: newStatus }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Status konnte nicht aktualisiert werden');
    setNotice(data.message || 'Status gespeichert.');
    fetchCamps();
  });

  const handleDeleteCamp = (id: number) => runAction(async () => {
    await apiFetch(`/api/camps/${id}`, { method: 'DELETE' });
    setDeleteCampId(null);
    setNotice('Freizeit gelöscht.');
    fetchCamps();
  });

  return (
    <AdminWorkspaceShell>
      <div className="dashboard-page">
        <section className="page-heading" style={{ marginBottom: 0 }}>
          <span className="eyebrow">Moderation</span>
          <h1>Alle Freizeiten</h1>
          <p>Durchsuche alle Angebote im System, bearbeite Inhalte auf einer eigenen Seite oder wechsle bei eingereichten Freizeiten zur Prüfung.</p>
        </section>

        {notice && <p role="status" className="success-alert">{notice}</p>}
        {error && <p role="alert" className="alert">{error}</p>}
        {busy && <p role="status">Änderung wird gespeichert …</p>}

        <section className="list-panel">
          <div className="section-heading">
            <h2>Angebote ({visibleCamps.length})</h2>
            <span>Bestand</span>
          </div>

          <div className="management-filters">
            <label>
              Freizeiten suchen
              <div className="input-with-icon">
                <Search size={18} aria-hidden="true" />
                <input value={campSearch} onChange={(e) => setCampSearch(e.target.value)} placeholder="Titel, Verein oder Ort" />
              </div>
            </label>
            <label>
              Status
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Alle Status</option>
                <option value="draft">Entwurf</option>
                <option value="published">Veröffentlicht</option>
                <option value="fully_booked">Ausgebucht</option>
                <option value="archived">Archiv</option>
              </select>
            </label>
            <label>
              Prüfstatus
              <select value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value)}>
                <option value="">Alle Prüfstatus</option>
                <option value="submitted">Zur Prüfung eingereicht</option>
                <option value="approved">Freigegeben</option>
                <option value="changes_requested">Überarbeitung erforderlich</option>
                <option value="draft">In Bearbeitung</option>
              </select>
            </label>
            <label>
              Sortieren
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="date">Beginn</option>
                <option value="title">Titel</option>
              </select>
            </label>
          </div>

          {loading && <p role="status">Freizeiten werden geladen …</p>}
          {!loading && visibleCamps.length === 0 ? (
            <p className="empty-line">Keine Freizeiten vorhanden.</p>
          ) : (
            <ul className="management-list">
              {visibleCamps.map((camp) => (
                <li key={camp.id} className="management-item">
                  <div className="management-main">
                    {camp.images?.length ? <img src={camp.images[0]} alt="" /> : <span className="thumb-placeholder"><ImagePlus size={22} aria-hidden="true" /></span>}
                    <div>
                      <h3>{camp.title?.trim() || 'Unbenannter Entwurf'}</h3>
                      <p>{camp.club_name} · {camp.categories?.join(', ') || camp.type} · {camp.location_text || 'Ort offen'}</p>
                      <p className="management-meta">
                        {camp.starts_at && <span><CalendarDays size={15} aria-hidden="true" /> {new Date(camp.starts_at.replace(' ', 'T')).toLocaleDateString('de-DE')}</span>}
                        {camp.min_age != null && camp.max_age != null && <span>{camp.min_age}–{camp.max_age} Jahre</span>}
                        {camp.place_requests_enabled && camp.capacity_total != null && <span>{camp.places_remaining ?? 0} von {camp.capacity_total} Plätzen frei</span>}
                      </p>
                      <div className="detail-tags">
                        <span className={`status-pill ${camp.status === 'published' ? 'is-live' : camp.status === 'fully_booked' ? 'is-danger' : 'is-muted'}`}>
                          {camp.status === 'published' ? <CheckCircle2 size={15} aria-hidden="true" /> : <XCircle size={15} aria-hidden="true" />}
                          {getStatusLabel(camp.status)}
                        </span>
                        {camp.review_status && (
                          <span className={`status-pill ${camp.review_status === 'approved' ? 'is-live' : camp.review_status === 'submitted' ? 'is-ongoing' : camp.review_status === 'changes_requested' ? 'is-danger' : ''}`}>
                            Prüfung: {providerStatus[camp.review_status] || camp.review_status}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="item-actions">
                    {camp.review_status === 'submitted' && (
                      <Link className="primary-action" to="/admin/pruefungen?tab=camps">
                        <ClipboardCheck size={16} aria-hidden="true" />
                        Prüfen
                      </Link>
                    )}
                    <Link className="secondary-action" to={`/admin/freizeiten/${camp.id}/bearbeiten`} aria-label={`${camp.title?.trim() || 'Unbenannter Entwurf'} bearbeiten`}>
                      <Pencil size={17} aria-hidden="true" />
                      Bearbeiten
                    </Link>
                    <select className="status-select" aria-label={`Status für ${camp.title}`} value={camp.status} disabled={busy} onChange={(e) => updateStatus(camp, e.target.value)}>
                      <option value="draft">Entwurf</option>
                      <option value="published">Veröffentlicht</option>
                      <option value="fully_booked">Ausgebucht</option>
                      <option value="archived">Archiv</option>
                    </select>
                    {deleteCampId === camp.id ? (
                      <div className="inline-confirm" role="group" aria-label={`${camp.title} wirklich löschen`}>
                        <span>Löschen?</span>
                        <button className="danger-action" type="button" disabled={busy} onClick={() => handleDeleteCamp(camp.id)}>Ja</button>
                        <button className="secondary-action" type="button" onClick={() => setDeleteCampId(null)}>Nein</button>
                      </div>
                    ) : (
                      <button className="danger-action" type="button" onClick={() => setDeleteCampId(camp.id)} aria-label={`${camp.title} löschen`}>
                        <Trash2 size={17} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminWorkspaceShell>
  );
};

export const AdminCampEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [camp, setCamp] = useState<CampRecord | null>(null);
  const [allCamps, setAllCamps] = useState<CampRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchJsonArray<CampRecord>('/api/camps?all=1').then((rows) => { if (active) setAllCamps(rows); }).catch(() => undefined);
    if (id) {
      apiFetch(`/api/camps/${id}`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || 'Freizeit konnte nicht geladen werden.');
          return data as CampRecord;
        })
        .then((data) => { if (active) setCamp(data); })
        .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen.'); })
        .finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; };
  }, [id]);

  const typeOptions = useMemo(() => {
    const base = ['Sport', 'Lager', 'Kreativ', 'Bildung', 'Natur'];
    const existing = Array.from(new Set(allCamps.flatMap(c => c.categories || [c.type]).filter(Boolean)));
    return Array.from(new Set([...base, ...existing]));
  }, [allCamps]);

  return (
    <AdminWorkspaceShell>
      <Breadcrumbs
        items={[
          { label: 'Alle Freizeiten', to: '/admin/freizeiten' },
          { label: camp?.title || 'Freizeit', to: '/admin/freizeiten' },
          { label: 'Bearbeiten' },
        ]}
      />
      <section className="page-heading">
        <h1>{camp?.title ? `${camp.title} bearbeiten` : 'Freizeit bearbeiten'}</h1>
        <p>Bearbeite die Angaben des Anbieters. Mit „Speichern &amp; direkt freigeben“ werden Änderungen sofort freigegeben und veröffentlicht.</p>
      </section>

      {loading && <p role="status">Freizeit wird geladen …</p>}
      {error && <p className="alert" role="alert">{error}</p>}

      {!loading && !error && camp && (
        <CampEditorForm
          key={camp.id}
          mode="edit"
          role="admin"
          initialCamp={camp}
          typeOptions={typeOptions}
          ownerName={camp.club_name}
          onSaved={({ notice }) => navigate('/admin/freizeiten', { state: { notice } })}
          onCancel={() => navigate('/admin/freizeiten')}
        />
      )}
    </AdminWorkspaceShell>
  );
};
