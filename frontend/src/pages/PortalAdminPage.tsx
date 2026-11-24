import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, CheckCircle2, ClipboardCheck, XCircle } from 'lucide-react';
import { portalApi, portalDate, portalPrice, providerStatus, type ProviderRecord } from '../utils/portal';
import { safeHtml } from '../utils/safeHtml';
import { useAuthStore } from '../store/authStore';
import { ProviderDetails } from './ProviderProfilePage';
import { ImageGallery } from '../components/ImageGallery';
import { AdminWorkspaceShell } from '../components/WorkspaceShell';

interface ReviewCamp {
  id: number;
  revision_id: number;
  title: string;
  club_name: string;
  description: string;
  confirmation_information?: string;
  legal_and_requirements?: string;
  starts_at: string;
  ends_at: string;
  min_age: number;
  max_age: number;
  location_text: string;
  price_eur: number;
  categories: string[];
  image_metadata: import('../utils/imageMetadata').ImageMetadata[];
}

function providerStatusTone(value: string) {
  if (value === 'approved') return 'is-live';
  if (value === 'submitted') return 'is-ongoing';
  if (value === 'changes_requested') return 'is-warning';
  if (value === 'suspended') return 'is-danger';
  return '';
}

export function PortalAdminPage() {
  const user = useAuthStore(state => state.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewCamp[]>([]);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const [status, setStatus] = useState('submitted');
  const activeTab = searchParams.get('tab') === 'providers' ? 'providers' : 'camps';

  useEffect(() => {
    if (!user || user.role === 'user') return;
    let active = true;
    Promise.all([
      portalApi<ProviderRecord[]>('/api/admin/providers'),
      portalApi<ReviewCamp[]>('/api/admin/reviews'),
    ])
      .then(([providerRows, campRows]) => {
        if (active) {
          setProviders(providerRows);
          setReviews(campRows);
        }
      })
      .catch(reason => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, reload]);

  if (!user || user.role === 'user') return <p>Die Prüfverwaltung ist dem Jugendring vorbehalten. <Link to="/login">Anmelden</Link></p>;

  async function review(kind: 'provider' | 'camp', id: number, decision: string, revision?: number, profileVersion?: string) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await portalApi(kind === 'provider' ? `/api/admin/providers/${id}/review` : `/api/admin/camps/${id}/review`, {
        decision,
        reason: reason[`${kind}-${id}`] || '',
        revision_id: revision,
        profile_version: profileVersion
      });
      setMessage('Prüfergebnis gespeichert.');
      setReload(value => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Prüfung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  const submittedProviders = providers.filter(provider => provider.status === 'submitted').length;
  const filteredProviders = providers.filter(provider => !status || provider.status === status);
  const setTab = (tab: 'camps' | 'providers') => setSearchParams({ tab }, { replace: true });

  return (
    <AdminWorkspaceShell pendingCount={reviews.length + submittedProviders}>
      <div className="dashboard-page">
        <section className="page-heading">
          <span className="eyebrow">Jugendring-Moderation</span>
          <h1>Trägerprüfung und Angebotsfreigabe</h1>
          <p>Prüfe eingereichte Freizeitangebote sowie Trägerstammdaten vor ihrer Veröffentlichung.</p>
        </section>

        <div className="sub-tabs" role="tablist" aria-label="Prüfungsbereiche">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'camps'}
            className={activeTab === 'camps' ? 'is-active' : ''}
            onClick={() => setTab('camps')}
          >
            <ClipboardCheck size={17} aria-hidden="true" />
            Eingereichte Angebote ({reviews.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'providers'}
            className={activeTab === 'providers' ? 'is-active' : ''}
            onClick={() => setTab('providers')}
          >
            <Building2 size={17} aria-hidden="true" />
            Trägerprofile ({submittedProviders} offen)
          </button>
        </div>

        {error && <p role="alert" className="alert">{error}</p>}
        {message && <p role="status" className="success-alert">{message}</p>}
        {loading && <p role="status">Prüfungen werden geladen …</p>}

        {activeTab === 'camps' ? (
          <section className="portal-panel" style={{ marginBlock: 0 }}>
            <div className="section-heading">
              <div>
                <h2>Eingereichte Angebote ({reviews.length})</h2>
                <p className="editor-help" style={{ margin: 0 }}>Erstveröffentlichungen sowie Änderungen an Eckdaten, Rechtlichem und Mailhinweisen erscheinen nach deiner Freigabe.</p>
              </div>
            </div>
            {reviews.length === 0 && !loading ? (
              <div className="empty-state compact">
                <CheckCircle2 size={28} aria-hidden="true" />
                <h3>Keine offenen Angebotsprüfungen</h3>
                <p>Alle eingereichten Freizeiten wurden bereits geprüft.</p>
              </div>
            ) : (
              <ul className="portal-list">
                {reviews.map(camp => (
                  <li className="portal-card" key={camp.id}>
                    <div className="booking-card-header">
                      <div>
                        <h3>{camp.title}</h3>
                        <p className="management-meta">
                          <span>Anbieter: <strong>{camp.club_name}</strong></span>
                          <span>{portalDate(camp.starts_at)} – {portalDate(camp.ends_at)}</span>
                          <span>{camp.min_age}–{camp.max_age} Jahre</span>
                          <span>{portalPrice(Number(camp.price_eur))}</span>
                        </p>
                      </div>
                      <span className="status-pill is-ongoing">Zur Prüfung</span>
                    </div>
                    <p>{camp.location_text} · {camp.categories?.join(', ')}</p>
                    {camp.legal_and_requirements && <p><span className="status-pill is-warning">Enthält Rechtliches &amp; Teilnahmebedingungen</span></p>}
                    <details>
                      <summary>Inhalt und Bilder prüfen</summary>
                      <div dangerouslySetInnerHTML={{ __html: safeHtml(camp.description) }} />
                      {camp.legal_and_requirements && (
                        <div className="detail-legal-box">
                          <h4>Rechtliches &amp; Teilnahmebedingungen</h4>
                          <p className="preserve-lines">{camp.legal_and_requirements}</p>
                        </div>
                      )}
                      {camp.confirmation_information && (
                        <>
                          <h4>Informationen für Bestätigungsmails</h4>
                          <p className="preserve-lines">{camp.confirmation_information}</p>
                        </>
                      )}
                      <ImageGallery title={camp.title} images={camp.image_metadata.map(image => image.image_url)} metadata={camp.image_metadata} />
                    </details>
                    <label className="field">
                      <span>Rückmeldung zu {camp.title}</span>
                      <textarea maxLength={2000} value={reason[`camp-${camp.id}`] || ''} onChange={event => setReason({ ...reason, [`camp-${camp.id}`]: event.target.value })} placeholder="Bei Rückgabe zur Überarbeitung bitte einen kurzen Hinweis angeben …" />
                    </label>
                    <div className="portal-actions">
                      <button type="button" className="primary-action" disabled={busy} onClick={() => void review('camp', camp.id, 'approved', camp.revision_id)}>
                        <CheckCircle2 size={17} aria-hidden="true" />
                        Angebot freigeben
                      </button>
                      <button type="button" className="secondary-action" disabled={busy} onClick={() => void review('camp', camp.id, 'changes_requested', camp.revision_id)}>
                        <XCircle size={17} aria-hidden="true" />
                        Zur Überarbeitung zurückgeben
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className="portal-panel" style={{ marginBlock: 0 }}>
            <div className="section-heading">
              <div>
                <h2>Trägerprofile</h2>
                <p className="editor-help" style={{ margin: 0 }}>Prüfe Organisations-, Kontakt- und Nachweisdaten, bevor ein Verein Angebote veröffentlichen darf.</p>
              </div>
            </div>
            <div className="status-pills-filter" role="group" aria-label="Trägerstatus schnell filtern">
              <button type="button" className={`filter-pill ${status === '' ? 'is-active' : ''}`} onClick={() => setStatus('')}>Alle ({providers.length})</button>
              {Object.entries(providerStatus).map(([key, label]) => (
                <button key={key} type="button" className={`filter-pill ${status === key ? 'is-active' : ''}`} onClick={() => setStatus(key)}>
                  {label}
                </button>
              ))}
            </div>

            {filteredProviders.length === 0 && !loading ? (
              <div className="empty-state compact">
                <Building2 size={28} aria-hidden="true" />
                <h3>Keine Träger in diesem Status</h3>
                <p>Wähle oben einen anderen Filter, um weitere Trägerkonten anzuzeigen.</p>
              </div>
            ) : (
              <ul className="portal-list">
                {filteredProviders.map(provider => (
                  <li className="portal-card" key={provider.id}>
                    <div className="booking-card-header">
                      <div>
                        <h3>{provider.profile.public_name || provider.profile.legal_name || 'Neuer Träger'}</h3>
                        <p className="management-meta">
                          <span>{provider.email}</span>
                          <span>E-Mail {provider.email_verified ? 'bestätigt' : 'noch nicht bestätigt'}</span>
                        </p>
                      </div>
                      <span className={`status-pill ${providerStatusTone(provider.status)}`}>
                        <strong>{providerStatus[provider.status]}</strong>
                      </span>
                    </div>
                    <details>
                      <summary>Geschützte Stammdaten und Prüfhistorie ansehen</summary>
                      <ProviderDetails profile={provider.profile} />
                      <ul className="status-timeline">
                        {provider.history.map((entry, index) => (
                          <li key={index}>{portalDate(entry.created_at)}: {providerStatus[entry.status]}{entry.reason ? `: ${entry.reason}` : ''}</li>
                        ))}
                      </ul>
                    </details>
                    {provider.review_reason && <p className="booking-message-box">Bisherige Rückmeldung: {provider.review_reason}</p>}
                    <label className="field">
                      <span>Rückmeldung für {provider.profile.public_name || 'diesen Träger'}</span>
                      <textarea maxLength={2000} value={reason[`provider-${provider.id}`] || ''} onChange={event => setReason({ ...reason, [`provider-${provider.id}`]: event.target.value })} placeholder="Hinweis bei Rückgabe oder Sperrung …" />
                    </label>
                    <div className="portal-actions">
                      <button type="button" className="primary-action" disabled={busy || !provider.email_verified} onClick={() => void review('provider', provider.id, 'approved', undefined, provider.version)}>
                        <CheckCircle2 size={17} aria-hidden="true" />
                        Träger freigeben
                      </button>
                      <button type="button" className="secondary-action" disabled={busy} onClick={() => void review('provider', provider.id, 'changes_requested', undefined, provider.version)}>
                        Zur Überarbeitung zurückgeben
                      </button>
                      <button type="button" className="danger-action" disabled={busy} onClick={() => void review('provider', provider.id, 'suspended', undefined, provider.version)}>
                        Träger sperren
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </AdminWorkspaceShell>
  );
}
