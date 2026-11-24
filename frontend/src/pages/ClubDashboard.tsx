import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, CheckCircle2, ClipboardCheck, Copy, Eye, ImagePlus, MapPin, MoreHorizontal, Pencil, PlayCircle, Plus, Trash2, XCircle } from 'lucide-react';
import type { CampRecord } from '../components/CampEditorForm';
import { Modal } from '../components/Modal';
import { ProviderWorkspaceShell } from '../components/WorkspaceShell';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../utils/api';
import { providerStatus } from '../utils/portal';
import { useAction } from '../utils/useAction';

const parseFormDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatCampDate = (value?: string) => {
  const date = parseFormDate(value);
  return date ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date) : 'Termin offen';
};

export const ClubDashboard: React.FC = () => {
  const { user, csrfToken } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [camps, setCamps] = useState<CampRecord[]>([]);
  const [campToDelete, setCampToDelete] = useState<CampRecord | null>(null);
  const [activeCampView, setActiveCampView] = useState<'current' | 'past'>('current');
  const [dashboardError, setDashboardError] = useState('');
  const [notice, setNotice] = useState(() => (typeof location.state?.notice === 'string' ? location.state.notice : ''));
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('date');
  const { busy, runAction } = useAction(setDashboardError);

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
    apiFetch(`/api/camps?manage=1&club_id=${user.id}`)
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setCamps(Array.isArray(data) ? data : []); })
      .catch((error) => { if (!cancelled) setDashboardError(error instanceof Error ? error.message : 'Die Aktion ist fehlgeschlagen.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, csrfToken, navigate]);

  const handleDelete = (id: number) => runAction(async () => {
    await apiFetch(`/api/camps/${id}`, { method: 'DELETE' });
    setCampToDelete(null);
    setNotice('Freizeit gelöscht.');
    fetchCamps();
  });

  const handleDuplicate = (camp: CampRecord) => runAction(async () => {
    setDashboardError('');
    const response = await apiFetch(`/api/camps/${camp.id}/duplicate`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok || !data.camp) throw new Error(data.error || 'Kopie konnte nicht angelegt werden');
    navigate(`/dashboard/freizeiten/${data.camp.id}/bearbeiten`, {
      state: { notice: 'Kopie angelegt. Ergänze Termin, Preis und Anmeldeschluss, bevor du sie einreichst.' },
    });
  });

  const updateStatus = (camp: CampRecord, newStatus: string) => runAction(async () => {
    await apiFetch(`/api/camps/${camp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...camp, status: newStatus }),
    });
    setNotice('Status aktualisiert.');
    fetchCamps();
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

  const getLifecycleLabel = (lifecycleState?: CampRecord['lifecycle_state']) => {
    switch (lifecycleState) {
      case 'ongoing': return 'Läuft gerade';
      case 'past': return 'Vergangen';
      default: return '';
    }
  };

  const currentCamps = camps.filter((camp) => camp.lifecycle_state !== 'past');
  const pastCamps = camps.filter((camp) => camp.lifecycle_state === 'past');
  const visibleCamps = (activeCampView === 'past' ? pastCamps : currentCamps)
    .filter((camp) => (!statusFilter || camp.status === statusFilter) && `${camp.title} ${camp.location_text || ''}`.toLocaleLowerCase('de').includes(search.toLocaleLowerCase('de')))
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'de') : (a.starts_at || '9999').localeCompare(b.starts_at || '9999'));
  const publishedCamps = currentCamps.filter((camp) => camp.status === 'published').length;
  const draftCamps = currentCamps.filter((camp) => camp.status === 'draft').length;

  return (
    <ProviderWorkspaceShell>
      <div className="dashboard-page">
        {notice && <p className="success-alert" role="status">{notice}</p>}
        {busy && <p role="status">Änderung wird gespeichert …</p>}
        <fieldset className="action-scope" disabled={busy} inert={busy}>
          <section className="dashboard-hero">
            <div className="page-heading">
              <span className="eyebrow">Vereinsbereich</span>
              <h1>Meine Freizeiten</h1>
              <p>Wähle eine Freizeit aus, um ihre Übersicht zu öffnen, Inhalte zu bearbeiten oder Anmeldungen zu verwalten.</p>
            </div>
            <Link className="primary-action dashboard-create-action" to="/dashboard/freizeiten/neu">
              <Plus size={18} aria-hidden="true" />
              Freizeit anlegen
            </Link>
          </section>

          <section className="dashboard-summary" aria-label="Übersicht">
            <div><strong>{currentCamps.length}</strong><span>Aktuell</span></div>
            <div><strong>{publishedCamps}</strong><span>Veröffentlicht</span></div>
            <div><strong>{draftCamps}</strong><span>Entwürfe</span></div>
            <div><strong>{pastCamps.length}</strong><span>Vergangen</span></div>
          </section>

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
                <ImagePlus size={32} aria-hidden="true" />
                <h3>{search || statusFilter ? 'Keine passenden Freizeiten' : activeCampView === 'past' ? 'Noch keine vergangenen Freizeiten' : 'Noch keine aktuelle Freizeit angelegt'}</h3>
                <p>{activeCampView === 'past' ? 'Abgelaufene Angebote erscheinen hier automatisch.' : 'Lege dein erstes Angebot an und mache es für Familien sichtbar.'}</p>
                {activeCampView === 'current' && (
                  <Link className="primary-action" to="/dashboard/freizeiten/neu">
                    <Plus size={18} aria-hidden="true" /> Freizeit anlegen
                  </Link>
                )}
              </div>
            ) : (
              <ul className="management-list">
                {visibleCamps.map((camp) => (
                  <li key={camp.id} className="management-item">
                    <div className="management-main">
                      {camp.images?.length ? <img src={camp.images[0]} alt={`Bild zu ${camp.title}`} /> : <span className="thumb-placeholder"><ImagePlus size={22} aria-hidden="true" /></span>}
                      <div>
                        <h3>
                          <Link className="camp-title-link" to={`/dashboard/freizeiten/${camp.id}`}>
                            {camp.title?.trim() || 'Unbenannter Entwurf'}
                          </Link>
                        </h3>
                        <p>{camp.categories?.join(', ') || camp.type} · {camp.min_age}-{camp.max_age} Jahre</p>
                        <p className="management-meta">
                          <span><CalendarDays size={15} aria-hidden="true" /> {formatCampDate(camp.starts_at)}</span>
                          <span><MapPin size={15} aria-hidden="true" /> {camp.location_text || 'Ort offen'}</span>
                        </p>
                        <div className="detail-tags">
                          {(camp.lifecycle_state === 'past' || camp.lifecycle_state === 'ongoing') && (
                            <span className={`status-pill ${camp.lifecycle_state === 'past' ? 'is-past' : 'is-ongoing'}`}>
                              {camp.lifecycle_state === 'past' ? <CalendarDays size={15} aria-hidden="true" /> : <PlayCircle size={15} aria-hidden="true" />}
                              {getLifecycleLabel(camp.lifecycle_state)}
                            </span>
                          )}
                          <span className={`status-pill ${camp.status === 'published' ? 'is-live' : camp.status === 'fully_booked' ? 'is-danger' : 'is-muted'}`}>
                            {camp.status === 'published' ? <CheckCircle2 size={15} aria-hidden="true" /> : <XCircle size={15} aria-hidden="true" />}
                            {getStatusLabel(camp.status)}
                          </span>
                          <span className={`status-pill ${camp.review_status === 'approved' ? 'is-live' : camp.review_status === 'submitted' ? 'is-ongoing' : camp.review_status === 'changes_requested' ? 'is-danger' : ''}`}>
                            Prüfung: {providerStatus[camp.review_status || 'draft'] || camp.review_status}
                          </span>
                        </div>
                        {camp.review_reason && <p className="alert">{camp.review_reason}</p>}
                        {camp.place_requests_enabled && camp.capacity_total != null && camp.places_remaining != null && (
                          <div className="capacity-meter">
                            <div className="capacity-bar" aria-hidden="true">
                              <span className="capacity-fill-portal" style={{ width: `${Math.min(100, ((camp.occupied_in_portal || 0) / Math.max(1, camp.capacity_total)) * 100)}%` }} />
                              <span className="capacity-fill-external" style={{ width: `${Math.min(100, ((camp.external_occupied || 0) / Math.max(1, camp.capacity_total)) * 100)}%` }} />
                            </div>
                            <div className="capacity-legend">
                              <span><strong>{camp.places_remaining}</strong> von {camp.capacity_total} Plätzen frei</span>
                              <span>{camp.occupied_in_portal || 0} im Portal</span>
                              <span>{camp.external_occupied || 0} extern</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="item-actions">
                      <Link className="secondary-action" to={`/dashboard/freizeiten/${camp.id}`}>
                        <Eye size={17} aria-hidden="true" />
                        Übersicht
                      </Link>
                      <Link className="secondary-action management-edit-action" to={`/dashboard/freizeiten/${camp.id}/bearbeiten`}>
                        <Pencil size={17} aria-hidden="true" />
                        Bearbeiten
                      </Link>
                      {camp.place_requests_enabled && (
                        <Link className="secondary-action" to={`/dashboard/freizeiten/${camp.id}/buchungen`}>
                          <ClipboardCheck size={17} aria-hidden="true" />
                          Buchungen
                        </Link>
                      )}
                      <details className="camp-actions-menu">
                        <summary aria-label={`Weitere Aktionen für ${camp.title}`}><MoreHorizontal size={20} aria-hidden="true" /></summary>
                        <div>
                          {camp.lifecycle_state === 'past' && (
                            <button className="secondary-action" type="button" onClick={() => void handleDuplicate(camp)}>
                              <Copy size={17} aria-hidden="true" /> Für neues Jahr kopieren
                            </button>
                          )}
                          <button className="secondary-action" type="button" onClick={() => void updateStatus(camp, 'archived')}>Archivieren</button>
                          <button className="danger-action" type="button" onClick={() => setCampToDelete(camp)}>
                            <Trash2 size={17} aria-hidden="true" /> Freizeit löschen
                          </button>
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
                  <button className="danger-action" type="button" onClick={() => { void handleDelete(campToDelete.id); }}>
                    <Trash2 size={17} aria-hidden="true" /> Löschen
                  </button>
                </div>
              </div>
            </Modal>
          )}
        </fieldset>
      </div>
    </ProviderWorkspaceShell>
  );
};
