import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, CalendarDays, CheckCircle2, ClipboardCheck, FileSpreadsheet, ShieldCheck, UserPlus } from 'lucide-react';
import type { CampRecord } from '../components/CampEditorForm';
import { AdminWorkspaceShell } from '../components/WorkspaceShell';
import { useAuthStore } from '../store/authStore';
import { fetchJsonArray, type ClubUser } from '../utils/adminApi';
import { portalApi, portalDate, type ProviderRecord } from '../utils/portal';

interface ReviewSummaryCamp {
  id: number;
  title: string;
  club_name: string;
  starts_at: string;
}

export const AdminDashboard: React.FC = () => {
  const { user, csrfToken } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin' || user?.role === 'master_admin';

  const [clubs, setClubs] = useState<ClubUser[]>([]);
  const [camps, setCamps] = useState<CampRecord[]>([]);
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewSummaryCamp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !isAdmin || !csrfToken) {
      navigate('/login');
      return;
    }
    let cancelled = false;
    Promise.all([
      fetchJsonArray<ClubUser>('/api/admin/users'),
      fetchJsonArray<CampRecord>('/api/camps?all=1'),
      portalApi<ProviderRecord[]>('/api/admin/providers').catch(() => []),
      portalApi<ReviewSummaryCamp[]>('/api/admin/reviews').catch(() => []),
    ])
      .then(([clubsData, campsData, providerRows, reviewRows]) => {
        if (!cancelled) {
          setClubs(clubsData);
          setCamps(campsData);
          setProviders(Array.isArray(providerRows) ? providerRows : []);
          setReviews(Array.isArray(reviewRows) ? reviewRows : []);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Übersicht konnte nicht geladen werden.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, csrfToken, navigate, isAdmin]);

  const submittedProviders = providers.filter((p) => p.status === 'submitted');
  const pendingCount = reviews.length + submittedProviders.length;

  return (
    <AdminWorkspaceShell pendingCount={pendingCount}>
      <div className="dashboard-page">
        <section className="page-heading" style={{ marginBottom: 0 }}>
          <span className="eyebrow">Administration</span>
          <h1>Portal-Übersicht</h1>
          <p>Alle Aufgaben des Jugendrings im Überblick – von der Vereinsfreigabe bis zur Angebotsprüfung.</p>
        </section>

        {loading && <p role="status">Verwaltung wird geladen …</p>}
        {error && <p className="alert" role="alert">{error}</p>}

        <section className="metric-row" aria-label="Kennzahlen">
          <Link className="metric-card metric-card-link" to="/admin/pruefungen?tab=camps">
            <ClipboardCheck size={22} aria-hidden="true" />
            <strong>{reviews.length}</strong>
            <span>Offene Angebotsprüfungen</span>
          </Link>
          <Link className="metric-card metric-card-link" to="/admin/pruefungen?tab=providers">
            <UserPlus size={22} aria-hidden="true" />
            <strong>{submittedProviders.length}</strong>
            <span>Offene Trägerprüfungen</span>
          </Link>
          <Link className="metric-card metric-card-link" to="/admin/vereine">
            <Building2 size={22} aria-hidden="true" />
            <strong>{clubs.length}</strong>
            <span>Registrierte Vereine</span>
          </Link>
          <Link className="metric-card metric-card-link" to="/admin/freizeiten">
            <ShieldCheck size={22} aria-hidden="true" />
            <strong>{camps.length}</strong>
            <span>Freizeiten im System</span>
          </Link>
        </section>

        <section className="portal-panel" style={{ marginBlock: 0 }}>
          <div className="section-heading">
            <div>
              <h2>Aktueller Handlungsbedarf</h2>
              <p className="editor-help" style={{ margin: 0 }}>Eingereichte Freizeiten und Trägerprofile, die auf Freigabe warten.</p>
            </div>
            <Link className="primary-action" to="/admin/pruefungen">
              Prüfungen öffnen
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>

          {pendingCount === 0 && !loading ? (
            <div className="status-banner is-approved">
              <p style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: '.5rem' }}>
                <CheckCircle2 size={17} aria-hidden="true" /> Alle eingereichten Angebote und Trägerprofile sind aktuell geprüft.
              </p>
            </div>
          ) : (
            <ul className="portal-list">
              {reviews.slice(0, 5).map((camp) => (
                <li key={`camp-${camp.id}`} className="management-item">
                  <div>
                    <span className="status-pill is-ongoing">Freizeit zur Prüfung</span>
                    <h3 style={{ marginTop: '.35rem' }}>{camp.title}</h3>
                    <p className="management-meta">
                      <span>{camp.club_name}</span>
                      {camp.starts_at && <span>Beginn: {portalDate(camp.starts_at)}</span>}
                    </p>
                  </div>
                  <Link className="primary-action" to="/admin/pruefungen?tab=camps">Prüfen</Link>
                </li>
              ))}
              {submittedProviders.slice(0, 5).map((provider) => (
                <li key={`prov-${provider.id}`} className="management-item">
                  <div>
                    <span className="status-pill is-warning">Trägerprofil zur Prüfung</span>
                    <h3 style={{ marginTop: '.35rem' }}>{provider.profile.public_name || provider.profile.legal_name || provider.email}</h3>
                    <p className="management-meta"><span>{provider.email}</span></p>
                  </div>
                  <Link className="primary-action" to="/admin/pruefungen?tab=providers">Prüfen</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Schnellzugriff">
          <h2 style={{ marginBottom: '.75rem' }}>Schnellzugriff</h2>
          <div className="quick-action-grid">
            <Link className="quick-action-card" to="/admin/vereine?einladen=1">
              <strong><UserPlus size={18} aria-hidden="true" /> Neuen Verein einladen</strong>
              <span>Neues Vereinskonto per E-Mail-Aktivierung anlegen.</span>
            </Link>
            <Link className="quick-action-card" to="/admin/freizeiten">
              <strong><ShieldCheck size={18} aria-hidden="true" /> Alle Freizeiten verwalten</strong>
              <span>Angebote durchsuchen, bearbeiten oder Status anpassen.</span>
            </Link>
            <Link className="quick-action-card" to="/admin/ferien">
              <strong><CalendarDays size={18} aria-hidden="true" /> Ferienzeiten pflegen</strong>
              <span>Schulferien und Anlässe für Suchfilter verwalten.</span>
            </Link>
            <Link className="quick-action-card" to="/admin/auswertung">
              <strong><FileSpreadsheet size={18} aria-hidden="true" /> Auswertung &amp; Export</strong>
              <span>Jährliche Anbieter-Excel, Statistiken und Mailstatus.</span>
            </Link>
          </div>
        </section>
      </div>
    </AdminWorkspaceShell>
  );
};
