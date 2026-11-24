import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Pencil, Plus, Search, Trash2, UserPlus, X } from 'lucide-react';
import { AccessibleForm } from '../components/AccessibleForm';
import { AdminWorkspaceShell } from '../components/WorkspaceShell';
import { useAuthStore } from '../store/authStore';
import { fetchJsonArray, parseJson, type ClubUser } from '../utils/adminApi';
import { apiFetch } from '../utils/api';
import { portalApi, providerStatus, type ProviderRecord } from '../utils/portal';
import { useAction } from '../utils/useAction';

export const AdminClubsPage: React.FC = () => {
  const { user, csrfToken } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMasterAdmin = user?.role === 'master_admin';
  const isAdmin = user?.role === 'admin' || user?.role === 'master_admin';

  const [clubs, setClubs] = useState<ClubUser[]>([]);
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'invited'>('all');
  const [isInviteOpen, setIsInviteOpen] = useState(searchParams.get('einladen') === '1');
  const [formData, setFormData] = useState({ email: '', display_name: '', role: 'user', contact_info: '' });
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userEditData, setUserEditData] = useState({ display_name: '', role: 'user', contact_info: '' });
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [deleteUserConfirmation, setDeleteUserConfirmation] = useState('');
  const { busy, runAction } = useAction(setError);

  const fetchClubs = async () => {
    try {
      setClubs(await fetchJsonArray<ClubUser>('/api/admin/users'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vereine konnten nicht geladen werden');
    }
  };

  useEffect(() => {
    if (!user || !isAdmin || !csrfToken) {
      navigate('/login');
      return;
    }
    let cancelled = false;
    Promise.all([
      fetchJsonArray<ClubUser>('/api/admin/users'),
      portalApi<ProviderRecord[]>('/api/admin/providers').catch(() => []),
    ])
      .then(([clubRows, providerRows]) => {
        if (!cancelled) {
          setClubs(clubRows);
          setProviders(Array.isArray(providerRows) ? providerRows : []);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Vereine konnten nicht geladen werden');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, csrfToken, navigate, isAdmin]);

  const providerByEmail = useMemo(() => {
    const map = new Map<string, ProviderRecord>();
    for (const p of providers) {
      if (p.email) map.set(p.email.toLowerCase(), p);
    }
    return map;
  }, [providers]);

  const visibleClubs = clubs.filter((club) => {
    const matchesSearch = `${club.display_name} ${club.email}`.toLocaleLowerCase('de').includes(userSearch.toLocaleLowerCase('de'));
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? Boolean(club.is_active) : !club.is_active);
    return matchesSearch && matchesStatus;
  });

  const handleInviteSubmit = (event: React.FormEvent) => runAction(async () => {
    event.preventDefault();
    setError('');
    const res = await apiFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Fehler beim Erstellen');
      return;
    }
    setNotice(data.message);
    setFormData({ email: '', display_name: '', role: 'user', contact_info: '' });
    fetchClubs();
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
  });

  return (
    <AdminWorkspaceShell>
      <div className="dashboard-page">
        <section className="dashboard-hero">
          <div className="page-heading">
            <span className="eyebrow">Administration</span>
            <h1>Vereine &amp; Konten</h1>
            <p>Lade neue Vereine ein, verwalte bestehende Konten und behalte den Aktivierungsstatus im Blick.</p>
          </div>
          <button className="primary-action" type="button" onClick={() => setIsInviteOpen((open) => !open)}>
            {isInviteOpen ? <X size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
            {isInviteOpen ? 'Einladungsformular schließen' : 'Verein / Nutzer einladen'}
          </button>
        </section>

        {notice && <p role="status" className="success-alert">{notice}</p>}
        {error && <p role="alert" className="alert">{error}</p>}
        {busy && <p role="status">Änderung wird gespeichert …</p>}

        {isInviteOpen && (
          <section className="form-panel">
            <div className="section-heading">
              <div>
                <h2>Nutzer einladen</h2>
                <p className="editor-help" style={{ margin: 0 }}>Eingeladene Vereine setzen ihr Passwort per E-Mail-Link, ergänzen ihr Trägerprofil und werden danach unter „Prüfungen &amp; Freigaben“ freigeschaltet.</p>
              </div>
              <span>Aktivierung per E-Mail</span>
            </div>
            <AccessibleForm className="dashboard-form" onSubmit={handleInviteSubmit}>
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
                  <option value="user">Verein / Anbieter</option>
                  {isMasterAdmin && <option value="admin">Jugendring-Mitarbeiter (Admin)</option>}
                </select>
              </label>
              <label className="field">
                <span>Kontaktinfo</span>
                <input type="text" value={formData.contact_info} onChange={(event) => setFormData({ ...formData, contact_info: event.target.value })} />
              </label>
              <div className="form-actions field-wide">
                <button className="primary-action" type="submit" disabled={busy}>
                  <UserPlus size={18} aria-hidden="true" />
                  Einladung senden
                </button>
              </div>
            </AccessibleForm>
          </section>
        )}

        <section className="list-panel">
          <div className="section-heading">
            <h2>Registrierte Vereine</h2>
            <span>{visibleClubs.length} Konten</span>
          </div>

          <div className="status-pills-filter" role="group" aria-label="Nach Kontostatus filtern">
            <button type="button" className={`filter-pill ${statusFilter === 'all' ? 'is-active' : ''}`} onClick={() => setStatusFilter('all')}>Alle ({clubs.length})</button>
            <button type="button" className={`filter-pill ${statusFilter === 'active' ? 'is-active' : ''}`} onClick={() => setStatusFilter('active')}>Aktiv</button>
            <button type="button" className={`filter-pill ${statusFilter === 'invited' ? 'is-active' : ''}`} onClick={() => setStatusFilter('invited')}>Eingeladen</button>
          </div>

          <label className="field">
            <span>Vereine suchen</span>
            <div className="input-with-icon">
              <Search size={18} aria-hidden="true" />
              <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Name oder E-Mail" />
            </div>
          </label>

          {loading && <p role="status">Vereine werden geladen …</p>}
          {!loading && visibleClubs.length === 0 ? (
            <p className="empty-line">Keine passenden Vereine gefunden.</p>
          ) : (
            <ul className="club-grid" style={{ marginTop: '1rem' }}>
              {visibleClubs.map((club) => (
                <li key={club.id} className="club-card">
                  <span className="club-icon"><Building2 size={21} aria-hidden="true" /></span>
                  {editingUserId === club.id ? (
                    <AccessibleForm className="inline-edit-form user-edit-form" onSubmit={(event) => handleSaveUser(event, club)}>
                      <label className="field">
                        <span>Name / Verein</span>
                        <input value={userEditData.display_name} onChange={(event) => setUserEditData({ ...userEditData, display_name: event.target.value })} required />
                      </label>
                      <label className="field">
                        <span>Rolle</span>
                        <select value={userEditData.role} onChange={(event) => setUserEditData({ ...userEditData, role: event.target.value })} disabled={club.role === 'master_admin'}>
                          <option value="user">Verein / Anbieter</option>
                          {isMasterAdmin && <option value="admin">Jugendring-Mitarbeiter (Admin)</option>}
                          {club.role === 'master_admin' && <option value="master_admin">Master-Admin</option>}
                        </select>
                      </label>
                      <label className="field">
                        <span>Kontaktinfo</span>
                        <textarea value={userEditData.contact_info} onChange={(event) => setUserEditData({ ...userEditData, contact_info: event.target.value })} />
                      </label>
                      <div className="inline-actions">
                        <button className="primary-action" type="submit" disabled={busy}>Speichern</button>
                        <button className="secondary-action" type="button" onClick={() => setEditingUserId(null)}>Abbrechen</button>
                      </div>
                    </AccessibleForm>
                  ) : (
                    <>
                      <h3>{club.display_name || club.club_name || club.email}</h3>
                      <p>{club.email}</p>
                      <div className="detail-tags">
                        <span className={`status-pill ${club.is_active ? 'is-live' : 'is-warning'}`}>
                          {club.role === 'master_admin' ? 'Master-Admin' : club.role === 'admin' ? 'Admin' : 'Nutzer'} · {club.is_active ? 'aktiv' : 'eingeladen'}
                        </span>
                        {club.role === 'user' && providerByEmail.get(club.email.toLowerCase()) && (() => {
                          const prov = providerByEmail.get(club.email.toLowerCase())!;
                          return (
                            <span className={`status-pill ${prov.status === 'approved' ? 'is-live' : prov.status === 'submitted' ? 'is-ongoing' : prov.status === 'suspended' || prov.status === 'changes_requested' ? 'is-danger' : ''}`}>
                              Träger: {providerStatus[prov.status] || prov.status}
                            </span>
                          );
                        })()}
                      </div>
                      <small>{club.contact_info || 'Keine Kontaktinfo hinterlegt'}</small>
                      {!club.is_active && (
                        <div>
                          <p>{club.delivery_status === 'failed' ? 'Einladung konnte nicht versendet werden.' : club.delivery_status === 'sent' ? 'Einladung versendet; Aktivierung steht aus.' : 'Einladung steht aus.'}</p>
                          <button type="button" className="secondary-action" disabled={busy} onClick={() => void runAction(async () => {
                            try {
                              const response = await apiFetch(`/api/admin/users/${club.id}/resend-invite`, { method: 'POST' });
                              const data = await response.json();
                              setNotice(data.message);
                            } finally {
                              await fetchClubs();
                            }
                          })}>Einladung erneut senden</button>
                        </div>
                      )}
                      <small>{club.camp_count ?? 0} Freizeiten im Konto</small>
                      <div className="club-card-actions">
                        {club.id !== user?.id && club.role !== 'master_admin' && (
                          <button className="secondary-action" type="button" onClick={() => startEditUser(club)}>
                            <Pencil size={17} aria-hidden="true" />
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
                            <Trash2 size={17} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      {deleteUserId === club.id && (
                        <div className="delete-confirm-panel">
                          <strong>Verein dauerhaft löschen?</strong>
                          <p>Zur Bestätigung bitte die E-Mail-Adresse eingeben.</p>
                          <input type="text" value={deleteUserConfirmation} onChange={(event) => setDeleteUserConfirmation(event.target.value)} placeholder={club.email} aria-label="E-Mail zur Löschbestätigung" />
                          <div className="inline-actions">
                            <button className="danger-action" type="button" disabled={busy} onClick={() => handleDeleteUser(club)}>Löschen</button>
                            <button className="secondary-action" type="button" onClick={() => { setDeleteUserId(null); setDeleteUserConfirmation(''); }}>Abbrechen</button>
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
      </div>
    </AdminWorkspaceShell>
  );
};
