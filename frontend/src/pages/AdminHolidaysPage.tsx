import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Trash2 } from 'lucide-react';
import { AccessibleForm } from '../components/AccessibleForm';
import { AdminWorkspaceShell } from '../components/WorkspaceShell';
import { useAuthStore } from '../store/authStore';
import { fetchJsonArray, parseJson, type HolidayRecord } from '../utils/adminApi';
import { apiFetch } from '../utils/api';

export const AdminHolidaysPage: React.FC = () => {
  const { user, csrfToken } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin' || user?.role === 'master_admin';

  const [holidays, setHolidays] = useState<HolidayRecord[]>([]);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayStart, setNewHolidayStart] = useState('');
  const [newHolidayEnd, setNewHolidayEnd] = useState('');
  const [isCreatingHoliday, setIsCreatingHoliday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!user || !isAdmin || !csrfToken) {
      navigate('/login');
      return;
    }
    let cancelled = false;
    fetchJsonArray<HolidayRecord>('/api/holidays')
      .then((rows) => { if (!cancelled) setHolidays(rows); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Ferienzeiten konnten nicht geladen werden'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, csrfToken, navigate, isAdmin]);

  return (
    <AdminWorkspaceShell>
      <div className="dashboard-page">
        <section className="page-heading" style={{ marginBottom: 0 }}>
          <span className="eyebrow">Administration</span>
          <h1>Ferienzeiten verwalten</h1>
          <p>Lege Schulferien und Anlässe fest, nach denen Familien in der Suche schnell filtern können.</p>
        </section>

        {notice && <p role="status" className="success-alert">{notice}</p>}
        {error && <p role="alert" className="alert">{error}</p>}

        <section className="form-panel">
          <div className="section-heading">
            <h2>Neuen Ferienzeitraum anlegen</h2>
          </div>
          <AccessibleForm
            className="admin-form compact"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!csrfToken || isCreatingHoliday) return;
              setIsCreatingHoliday(true);
              setError('');
              setNotice('');
              try {
                const response = await apiFetch('/api/admin/holidays', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: newHolidayName, starts_at: newHolidayStart, ends_at: newHolidayEnd }),
                });
                const data = await parseJson(response);
                if (!response.ok) throw new Error(data?.error || 'Fehler beim Erstellen der Ferien');
                setNewHolidayName('');
                setNewHolidayStart('');
                setNewHolidayEnd('');
                setHolidays(await fetchJsonArray<HolidayRecord>('/api/holidays'));
                setNotice('Ferien gespeichert.');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Fehler beim Erstellen der Ferien');
              } finally {
                setIsCreatingHoliday(false);
              }
            }}
          >
            <div className="admin-holiday-grid">
              <label className="field">
                <span>Name des Ferienzeitraums</span>
                <input type="text" value={newHolidayName} onChange={(e) => setNewHolidayName(e.target.value)} placeholder="z. B. Sommerferien 2027" required />
              </label>
              <label className="field">
                <span>Startdatum</span>
                <input type="date" value={newHolidayStart} onChange={(e) => setNewHolidayStart(e.target.value)} required />
              </label>
              <label className="field">
                <span>Enddatum</span>
                <input type="date" value={newHolidayEnd} min={newHolidayStart} onChange={(e) => setNewHolidayEnd(e.target.value)} required />
              </label>
              <button className="primary-action" type="submit" disabled={isCreatingHoliday}>Speichern</button>
            </div>
          </AccessibleForm>
        </section>

        <section className="list-panel">
          <div className="section-heading">
            <h2>Hinterlegte Zeiträume ({holidays.length})</h2>
          </div>
          {loading && <p role="status">Ferienzeiten werden geladen …</p>}
          {!loading && holidays.length === 0 ? (
            <p className="empty-line">Keine Ferien angelegt.</p>
          ) : (
            <ul className="management-list">
              {holidays.map(holiday => (
                <li key={holiday.id} className="management-item">
                  <div className="management-main no-thumb">
                    <div>
                      <h3>{holiday.name}</h3>
                      <p className="management-meta">
                        <CalendarDays size={15} aria-hidden="true" />
                        {new Date(holiday.starts_at).toLocaleDateString('de-DE')} – {new Date(holiday.ends_at).toLocaleDateString('de-DE')}
                      </p>
                    </div>
                  </div>
                  <div className="item-actions">
                    <button
                      className="danger-action"
                      type="button"
                      onClick={async () => {
                        if (!csrfToken || !confirm('Wirklich löschen?')) return;
                        try {
                          const response = await apiFetch(`/api/admin/holidays/${holiday.id}`, { method: 'DELETE' });
                          if (!response.ok) throw new Error('Fehler beim Löschen');
                          setHolidays(holidays.filter(h => h.id !== holiday.id));
                          setNotice('Ferienzeitraum gelöscht.');
                        } catch {
                          setError('Fehler beim Löschen der Ferien');
                        }
                      }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      Löschen
                    </button>
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
