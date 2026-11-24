import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, ClipboardCheck, Copy, Euro, ExternalLink, Eye, LayoutDashboard, MapPin, Pencil, Trash2, UsersRound } from 'lucide-react';
import type { CampRecord } from '../components/CampEditorForm';
import type { BookingStatistic } from '../components/BookingStatistics';
import { Modal } from '../components/Modal';
import { PreviewModal } from '../components/PreviewModal';
import { Breadcrumbs, ProviderWorkspaceShell } from '../components/WorkspaceShell';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../utils/api';
import { portalApi, portalDate, portalPrice, providerStatus } from '../utils/portal';
import { useAction } from '../utils/useAction';

const statusLabels: Record<string, string> = {
  draft: 'Entwurf',
  published: 'Veröffentlicht',
  fully_booked: 'Ausgebucht',
  archived: 'Archiv',
};

export function ClubCampDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [camp, setCamp] = useState<CampRecord | null>(null);
  const [stats, setStats] = useState<BookingStatistic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(() => (typeof location.state?.notice === 'string' ? location.state.notice : ''));
  const [placesDraft, setPlacesDraft] = useState<number | undefined>(undefined);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const { busy, runAction } = useAction(setError);

  useEffect(() => {
    if (!id) return;
    let active = true;
    Promise.all([
      apiFetch(`/api/camps/${id}`).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Freizeit konnte nicht geladen werden.');
        return data as CampRecord;
      }),
      portalApi<BookingStatistic[]>(`/api/booking-statistics?camp_id=${id}`).catch(() => []),
    ])
      .then(([campData, statRows]) => {
        if (active) {
          setCamp(campData);
          setStats(Array.isArray(statRows) ? statRows : []);
        }
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const updateAvailability = () => runAction(async () => {
    if (!camp || placesDraft === undefined) return;
    const response = await apiFetch(`/api/camps/${camp.id}/availability`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ places_remaining: placesDraft }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Freie Plätze konnten nicht aktualisiert werden.');
    if (data.camp) setCamp(data.camp as CampRecord);
    setPlacesDraft(undefined);
    setNotice('Freie Plätze aktualisiert.');
  });

  const handleDuplicate = () => runAction(async () => {
    if (!camp) return;
    const response = await apiFetch(`/api/camps/${camp.id}/duplicate`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok || !data.camp) throw new Error(data.error || 'Kopie konnte nicht angelegt werden');
    navigate(`/dashboard/freizeiten/${data.camp.id}/bearbeiten`, {
      state: { notice: 'Kopie angelegt. Ergänze Termin, Preis und Anmeldeschluss, bevor du sie einreichst.' },
    });
  });

  const handleArchive = () => runAction(async () => {
    if (!camp) return;
    const response = await apiFetch(`/api/camps/${camp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...camp, status: 'archived' }),
    });
    if (!response.ok) throw new Error('Archivieren fehlgeschlagen.');
    setCamp({ ...camp, status: 'archived' });
    setNotice('Freizeit archiviert.');
  });

  const handleDelete = () => runAction(async () => {
    if (!camp) return;
    const response = await apiFetch(`/api/camps/${camp.id}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || 'Löschen fehlgeschlagen.');
    }
    navigate('/dashboard', { state: { notice: 'Freizeit gelöscht.' } });
  });

  const reservedCount = stats.find((s) => s.status === 'reserved')?.bookings ?? 0;
  const confirmedCount = stats.find((s) => s.status === 'confirmed')?.bookings ?? 0;
  const waitlistCount = stats.find((s) => s.status === 'waitlist')?.bookings ?? 0;

  return (
    <ProviderWorkspaceShell>
      <Breadcrumbs items={[{ label: 'Meine Freizeiten', to: '/dashboard' }, { label: camp?.title || 'Freizeit-Übersicht' }]} />

      {loading && <p role="status">Freizeit wird geladen …</p>}
      {error && <p className="alert" role="alert">{error}</p>}
      {notice && <p className="success-alert" role="status">{notice}</p>}

      {camp && (
        <div className="dashboard-page">
          <header className="camp-hub-header">
            <div className="camp-hub-top">
              <div className="camp-hub-title-group">
                <h1>{camp.title?.trim() || 'Unbenannter Entwurf'}</h1>
                <div className="detail-tags">
                  <span className={`status-pill ${camp.status === 'published' ? 'is-live' : camp.status === 'fully_booked' ? 'is-danger' : ''}`}>
                    {statusLabels[camp.status] || camp.status}
                  </span>
                  <span className={`status-pill ${camp.review_status === 'approved' ? 'is-live' : camp.review_status === 'submitted' ? 'is-ongoing' : camp.review_status === 'changes_requested' ? 'is-danger' : ''}`}>
                    Prüfung: {providerStatus[camp.review_status || 'draft'] || camp.review_status}
                  </span>
                </div>
              </div>
              <div className="camp-hub-actions">
                <button className="secondary-action" type="button" onClick={() => setIsPreviewOpen(true)}>
                  <Eye size={16} aria-hidden="true" />
                  Vorschau
                </button>
                {camp.approved_revision_id && ['published', 'fully_booked'].includes(camp.status) && (
                  <Link className="secondary-action" to={`/freizeiten/${camp.id}`}>
                    <ExternalLink size={16} aria-hidden="true" />
                    Öffentliche Seite
                  </Link>
                )}
              </div>
            </div>

            <nav className="sub-tabs" aria-label="Freizeit-Navigation">
              <NavLink to={`/dashboard/freizeiten/${camp.id}`} end><LayoutDashboard size={16} aria-hidden="true" />Übersicht</NavLink>
              <NavLink to={`/dashboard/freizeiten/${camp.id}/bearbeiten`}><Pencil size={16} aria-hidden="true" />Bearbeiten</NavLink>
              {camp.place_requests_enabled && (
                <NavLink to={`/dashboard/freizeiten/${camp.id}/buchungen`}><ClipboardCheck size={16} aria-hidden="true" />Buchungen</NavLink>
              )}
            </nav>
          </header>

          {camp.review_reason && (
            <div className="status-banner is-warning">
              <strong>Rückmeldung vom Jugendring:</strong>
              <p style={{ margin: 0 }}>{camp.review_reason}</p>
            </div>
          )}

          <div className="camp-overview-grid">
            <section className="portal-panel" style={{ marginBlock: 0 }}>
              <h2 style={{ marginBottom: '.65rem' }}>Eckdaten</h2>
              <dl className="fact-list">
                <div>
                  <dt>Zeitraum</dt>
                  <dd><CalendarDays size={15} aria-hidden="true" /> {camp.starts_at ? `${portalDate(camp.starts_at)} – ${portalDate(camp.ends_at)}` : 'Termin offen'}</dd>
                </div>
                <div>
                  <dt>Alter</dt>
                  <dd><UsersRound size={15} aria-hidden="true" /> {camp.min_age ?? '?'}–{camp.max_age ?? '?'} Jahre</dd>
                </div>
                <div>
                  <dt>Ort</dt>
                  <dd><MapPin size={15} aria-hidden="true" /> {camp.location_text || 'Ort offen'}</dd>
                </div>
                <div>
                  <dt>Teilnahmebeitrag</dt>
                  <dd><Euro size={15} aria-hidden="true" /> {camp.price_eur != null ? portalPrice(Number(camp.price_eur)) : 'Nicht angegeben'}</dd>
                </div>
                <div>
                  <dt>Kategorien</dt>
                  <dd>{camp.categories?.join(', ') || camp.type || 'Keine'}</dd>
                </div>
              </dl>
            </section>

            <section className="portal-panel" style={{ marginBlock: 0 }}>
              <h2 style={{ marginBottom: '.65rem' }}>Plätze &amp; Buchungen</h2>
              {camp.place_requests_enabled && camp.capacity_total != null && camp.places_remaining != null ? (
                <>
                  <div className="capacity-meter">
                    <div className="capacity-bar" aria-hidden="true">
                      <span className="capacity-fill-portal" style={{ width: `${Math.min(100, ((camp.occupied_in_portal || 0) / Math.max(1, camp.capacity_total)) * 100)}%` }} />
                      <span className="capacity-fill-external" style={{ width: `${Math.min(100, ((camp.external_occupied || 0) / Math.max(1, camp.capacity_total)) * 100)}%` }} />
                    </div>
                    <div className="capacity-legend">
                      <span><strong>{camp.places_remaining}</strong> von {camp.capacity_total} Plätzen frei</span>
                      <span>{camp.occupied_in_portal || 0} im Portal belegt</span>
                      <span>{camp.external_occupied || 0} extern belegt</span>
                    </div>
                  </div>
                  <div className="detail-tags" style={{ marginTop: '.75rem' }}>
                    <span className="status-pill is-warning">{reservedCount} Reserviert</span>
                    <span className="status-pill is-live">{confirmedCount} Bestätigt</span>
                    <span className="status-pill">{waitlistCount} Warteliste</span>
                  </div>
                  <div className="availability-quick-edit">
                    <label>
                      Freie Plätze nach externer Belegung
                      <input
                        type="number"
                        min="0"
                        max={camp.capacity_total}
                        value={placesDraft ?? camp.places_remaining}
                        onChange={(event) => setPlacesDraft(Number(event.target.value))}
                      />
                    </label>
                    <button className="secondary-action" type="button" disabled={busy || placesDraft === undefined || placesDraft === camp.places_remaining} onClick={() => void updateAvailability()}>
                      <CheckCircle2 size={16} aria-hidden="true" />
                      Bestand speichern
                    </button>
                  </div>
                  <p className="portal-actions" style={{ marginBottom: 0 }}>
                    <Link className="primary-action" to={`/dashboard/freizeiten/${camp.id}/buchungen`}>
                      <ClipboardCheck size={17} aria-hidden="true" />
                      Buchungen &amp; Wartelisten öffnen
                    </Link>
                  </p>
                </>
              ) : (
                <>
                  <p className="editor-help">Die direkte Portal-Anmeldung ist für diese Freizeit derzeit deaktiviert.</p>
                  <Link className="secondary-action" to={`/dashboard/freizeiten/${camp.id}/bearbeiten`}>Im Editor aktivieren</Link>
                </>
              )}
            </section>
          </div>

          <section className="compact-action-bar" aria-label="Weitere Aktionen">
            <h2>Weitere Aktionen</h2>
            <div className="inline-actions">
              {camp.lifecycle_state === 'past' && (
                <button className="primary-action" type="button" disabled={busy} onClick={() => void handleDuplicate()}>
                  <Copy size={17} aria-hidden="true" />
                  Für neues Jahr kopieren
                </button>
              )}
              {camp.status !== 'archived' && (
                <button className="secondary-action" type="button" disabled={busy} onClick={() => void handleArchive()}>
                  Archivieren
                </button>
              )}
              <button className="danger-action" type="button" disabled={busy} onClick={() => setShowDelete(true)}>
                <Trash2 size={17} aria-hidden="true" />
                Freizeit löschen
              </button>
            </div>
          </section>

          {isPreviewOpen && (
            <PreviewModal camp={camp} onClose={() => setIsPreviewOpen(false)} clubName={user?.club_name} contactInfo={user?.contact_info} />
          )}

          {showDelete && (
            <Modal title="Freizeit löschen?" onClose={() => setShowDelete(false)}>
              <div className="delete-dialog-content">
                <h2 id="delete-camp-title">Freizeit löschen?</h2>
                <p>„{camp.title}“ und die zugehörigen Bilder werden dauerhaft entfernt.</p>
                <div>
                  <button className="secondary-action" type="button" onClick={() => setShowDelete(false)}>Abbrechen</button>
                  <button className="danger-action" type="button" onClick={() => void handleDelete()}>
                    <Trash2 size={17} aria-hidden="true" /> Löschen
                  </button>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}
    </ProviderWorkspaceShell>
  );
}
