import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ClipboardCheck, LayoutDashboard, Pencil } from 'lucide-react';
import { CampEditorForm, type CampRecord } from '../components/CampEditorForm';
import { Breadcrumbs, ProviderWorkspaceShell } from '../components/WorkspaceShell';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../utils/api';

export function ClubCampEditorPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [camp, setCamp] = useState<CampRecord | null>(null);
  const [allCamps, setAllCamps] = useState<CampRecord[]>([]);
  const [loading, setLoading] = useState(mode === 'edit');
  const [error, setError] = useState('');
  const flashNotice = typeof location.state?.notice === 'string' ? location.state.notice : '';

  useEffect(() => {
    if (!user) return;
    let active = true;
    apiFetch(`/api/camps?manage=1&club_id=${user.id}`)
      .then((res) => res.json())
      .then((rows) => { if (active && Array.isArray(rows)) setAllCamps(rows); })
      .catch(() => undefined);

    if (mode === 'edit' && id) {
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
  }, [id, mode, user]);

  const typeOptions = useMemo(() => {
    const base = ['Sport', 'Lager', 'Kreativ', 'Bildung', 'Natur'];
    const existing = Array.from(new Set(allCamps.flatMap(c => c.categories || [c.type]).filter(Boolean)));
    return Array.from(new Set([...base, ...existing]));
  }, [allCamps]);

  return (
    <ProviderWorkspaceShell>
      <Breadcrumbs
        items={
          mode === 'create'
            ? [{ label: 'Meine Freizeiten', to: '/dashboard' }, { label: 'Neue Freizeit anlegen' }]
            : [
                { label: 'Meine Freizeiten', to: '/dashboard' },
                { label: camp?.title || 'Freizeit', to: id ? `/dashboard/freizeiten/${id}` : undefined },
                { label: 'Bearbeiten' },
              ]
        }
      />

      {mode === 'create' ? (
        <section className="page-heading">
          <span className="eyebrow">Neue Freizeit</span>
          <h1>Freizeit anlegen</h1>
        </section>
      ) : (
        <header className="camp-hub-header">
          <div className="camp-hub-top">
            <div className="camp-hub-title-group">
              <h1>{camp?.title || 'Freizeit bearbeiten'}</h1>
            </div>
          </div>
          {id && camp && (
            <nav className="sub-tabs" aria-label="Freizeit-Navigation">
              <NavLink to={`/dashboard/freizeiten/${id}`} end><LayoutDashboard size={16} aria-hidden="true" />Übersicht</NavLink>
              <NavLink to={`/dashboard/freizeiten/${id}/bearbeiten`}><Pencil size={16} aria-hidden="true" />Bearbeiten</NavLink>
              {camp.place_requests_enabled && (
                <NavLink to={`/dashboard/freizeiten/${id}/buchungen`}><ClipboardCheck size={16} aria-hidden="true" />Buchungen</NavLink>
              )}
            </nav>
          )}
        </header>
      )}

      {flashNotice && <p className="success-alert" role="status">{flashNotice}</p>}
      {loading && <p role="status">Editor wird geladen …</p>}
      {error && <p className="alert" role="alert">{error}</p>}

      {!loading && !error && (mode === 'create' || camp) && (
        <CampEditorForm
          key={mode === 'create' ? 'create' : camp?.id}
          mode={mode}
          role="provider"
          initialCamp={mode === 'edit' && camp ? camp : undefined}
          typeOptions={typeOptions}
          ownerName={user?.club_name}
          ownerContactInfo={user?.contact_info}
          ownerEmail={user?.email}
          onSaved={({ id: savedId, notice }) => navigate(`/dashboard/freizeiten/${savedId}`, { state: { notice } })}
          onCancel={() => navigate(mode === 'edit' && id ? `/dashboard/freizeiten/${id}` : '/dashboard')}
        />
      )}
    </ProviderWorkspaceShell>
  );
}
