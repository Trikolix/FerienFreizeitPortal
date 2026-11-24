import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { BookingStatistics, type BookingStatistic } from '../components/BookingStatistics';
import { MailDeliveryStatus } from '../components/MailDeliveryStatus';
import { AdminWorkspaceShell } from '../components/WorkspaceShell';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../utils/api';
import { portalApi } from '../utils/portal';

export function AdminReportsPage() {
  const user = useAuthStore(state => state.user);
  const [statistics, setStatistics] = useState<BookingStatistic[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || user.role === 'user') return;
    let active = true;
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    portalApi<BookingStatistic[]>(`/api/booking-statistics?${query}`)
      .then((stats) => { if (active) setStatistics(stats); })
      .catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [user, from, to]);

  async function download() {
    setBusy(true); setError('');
    try {
      const response = await apiFetch(`/api/admin/providers/export?year=${year}`);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Anbieter-${year}.xlsx`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Export fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminWorkspaceShell>
      <div className="dashboard-page">
        <section className="page-heading" style={{ marginBottom: 0 }}>
          <span className="eyebrow">Berichte &amp; Versand</span>
          <h1>Auswertung &amp; Anbieterexport</h1>
          <p>Lade die jährliche Anbieterübersicht als Excel herunter und prüfe anonyme Buchungszahlen sowie offene E-Mails.</p>
        </section>

        {error && <p role="alert" className="alert">{error}</p>}

        <section className="portal-panel" style={{ marginBlock: 0 }}>
          <h2>Jährliche Anbieterübersicht</h2>
          <p className="editor-help">Enthält die Anbieterstammdaten des gewählten Jahres einschließlich inaktiver oder gesperrter Träger. Zahlungen und Umsätze werden noch nicht erfasst. Die Datei ersetzt keine vollständige PStTG-Meldung.</p>
          <div className="portal-actions align-end">
            <label className="field" style={{ maxWidth: '10rem' }}>
              <span>Berichtsjahr</span>
              <input type="number" min={2000} max={new Date().getFullYear()} value={year} onChange={event => setYear(Number(event.target.value))} />
            </label>
            <button className="primary-action" type="button" disabled={busy} onClick={() => void download()}>
              <Download size={17} aria-hidden="true" />
              Anbieter als Excel herunterladen
            </button>
          </div>
        </section>

        <section className="portal-panel" style={{ marginBlock: 0 }}>
          <div className="portal-form-grid">
            <label className="field">
              <span>Anmeldungen ab</span>
              <input type="date" value={from} onChange={event => setFrom(event.target.value)} />
            </label>
            <label className="field">
              <span>Anmeldungen bis</span>
              <input type="date" min={from} value={to} onChange={event => setTo(event.target.value)} />
            </label>
          </div>
          <BookingStatistics rows={statistics} />
          <MailDeliveryStatus />
        </section>
      </div>
    </AdminWorkspaceShell>
  );
}
