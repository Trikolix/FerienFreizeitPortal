import { useEffect, useMemo, useState } from 'react';
import { NavLink, useParams, useSearchParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, ClipboardCheck, Clock, LayoutDashboard, Mail, Pencil, Phone, Search, UserRound, UsersRound, XCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { BookingStatistics, type BookingStatistic } from '../components/BookingStatistics';
import { MailDeliveryStatus } from '../components/MailDeliveryStatus';
import { Breadcrumbs, ProviderWorkspaceShell } from '../components/WorkspaceShell';
import { bookingStatus, portalApi, portalDate } from '../utils/portal';

interface ManagedBooking {
  id: number;
  reference: string;
  status: string;
  participant_count: number;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  message: string;
  created_at: string;
  anonymized_at?: string;
  snapshot: { title: string };
  participants: { first_name: string; last_name: string; birth_date: string }[];
  events: { action: string; to_status: string; created_at: string }[];
}

function bookingStatusTone(value: string) {
  if (value === 'confirmed') return 'is-live';
  if (value === 'reserved' || value === 'waitlist') return 'is-warning';
  if (value === 'rejected' || value === 'cancelled') return 'is-danger';
  return '';
}

export function BookingManagementPage() {
  const user = useAuthStore(state => state.user);
  const { id: routeCampId } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<ManagedBooking[]>([]);
  const [statistics, setStatistics] = useState<BookingStatistic[]>([]);
  const [camps, setCamps] = useState<{ id: number; title: string }[]>([]);
  const [campId, setCampId] = useState(routeCampId || searchParams.get('camp_id') || '');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [textQuery, setTextQuery] = useState('');
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (user) portalApi<{ id: number; title: string }[]>(`/api/camps?club_id=${user.id}`).then(setCamps).catch(reason => setError(reason.message));
  }, [user]);

  useEffect(() => {
    if (routeCampId) return;
    const next = new URLSearchParams(searchParams);
    if (campId) next.set('camp_id', campId);
    else next.delete('camp_id');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [campId, routeCampId, searchParams, setSearchParams]);

  useEffect(() => {
    let active = true;
    const activeCamp = routeCampId || campId;
    const query = new URLSearchParams();
    if (activeCamp) query.set('camp_id', activeCamp);
    if (status) query.set('status', status);
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    query.set('offset', String(offset));
    Promise.all([
      portalApi<{ items: ManagedBooking[]; total: number }>(`/api/bookings?${query}`),
      portalApi<BookingStatistic[]>(`/api/booking-statistics?${query}`)
    ])
      .then(([bookings, stats]) => {
        if (active) {
          setItems(bookings.items);
          setTotal(bookings.total);
          setStatistics(stats);
        }
      })
      .catch(reason => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [campId, routeCampId, status, from, to, offset, reload]);

  function filter(update: () => void) {
    update();
    setOffset(0);
    setLoading(true);
    setError('');
  }

  async function action(booking: ManagedBooking, actionName: string) {
    if (busy) return;
    if (['cancel', 'reject'].includes(actionName) && !window.confirm(`Anmeldung ${booking.reference} wirklich ${actionName === 'cancel' ? 'stornieren' : 'ablehnen'}?`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await portalApi(`/api/bookings/${booking.id}/actions`, { action: actionName });
      setMessage('Buchungsstatus aktualisiert. Die Familie wird per E-Mail informiert.');
      setReload(value => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Aktion fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  const summary = useMemo(() => {
    const counts = { reserved: 0, waitlist: 0, confirmed: 0, activeParticipants: 0 };
    for (const row of statistics) {
      if (row.status === 'reserved') { counts.reserved += Number(row.bookings); counts.activeParticipants += Number(row.participants); }
      if (row.status === 'waitlist') counts.waitlist += Number(row.bookings);
      if (row.status === 'confirmed') { counts.confirmed += Number(row.bookings); counts.activeParticipants += Number(row.participants); }
    }
    return counts;
  }, [statistics]);

  const visibleItems = useMemo(() => {
    const q = textQuery.trim().toLocaleLowerCase('de');
    if (!q) return items;
    return items.filter(item =>
      `${item.reference} ${item.contact_name} ${item.contact_email} ${item.snapshot.title} ${item.participants.map(p => `${p.first_name} ${p.last_name}`).join(' ')}`
        .toLocaleLowerCase('de')
        .includes(q)
    );
  }, [items, textQuery]);

  const scopedCamp = routeCampId ? camps.find(c => String(c.id) === routeCampId) : undefined;

  return (
    <ProviderWorkspaceShell>
      <div className="dashboard-page">
        {routeCampId && (
          <Breadcrumbs
            items={[
              { label: 'Meine Freizeiten', to: '/dashboard' },
              { label: scopedCamp?.title || 'Freizeit', to: `/dashboard/freizeiten/${routeCampId}` },
              { label: 'Buchungen' },
            ]}
          />
        )}

        {routeCampId ? (
          <header className="camp-hub-header">
            <div className="camp-hub-top">
              <div className="camp-hub-title-group">
                <h1>{scopedCamp ? `Anmeldungen: ${scopedCamp.title}` : 'Anmeldungen und Wartelisten'}</h1>
              </div>
            </div>
            <nav className="sub-tabs" aria-label="Freizeit-Navigation">
              <NavLink to={`/dashboard/freizeiten/${routeCampId}`} end><LayoutDashboard size={16} aria-hidden="true" />Übersicht</NavLink>
              <NavLink to={`/dashboard/freizeiten/${routeCampId}/bearbeiten`}><Pencil size={16} aria-hidden="true" />Bearbeiten</NavLink>
              <NavLink to={`/dashboard/freizeiten/${routeCampId}/buchungen`}><ClipboardCheck size={16} aria-hidden="true" />Buchungen</NavLink>
            </nav>
          </header>
        ) : (
          <section className="page-heading">
            <span className="eyebrow">Buchungsverwaltung</span>
            <h1>Anmeldungen und Wartelisten</h1>
            <p>Bearbeite vorläufige Reservierungen, bestätige Teilnahmen oder lasse Gruppen von der Warteliste nachrücken.</p>
          </section>
        )}

        <section className="metric-row" aria-label="Buchungsübersicht">
          <div className="metric-card">
            <Clock size={22} aria-hidden="true" />
            <strong>{summary.reserved}</strong>
            <span>Offene Reservierungen</span>
          </div>
          <div className="metric-card">
            <CheckCircle2 size={22} aria-hidden="true" />
            <strong>{summary.confirmed}</strong>
            <span>Bestätigte Buchungen</span>
          </div>
          <div className="metric-card">
            <UsersRound size={22} aria-hidden="true" />
            <strong>{summary.waitlist}</strong>
            <span>Auf Warteliste</span>
          </div>
          <div className="metric-card">
            <CalendarDays size={22} aria-hidden="true" />
            <strong>{summary.activeParticipants}</strong>
            <span>Belegte Plätze (Portal)</span>
          </div>
        </section>

        <section className="portal-panel">
          <p className="info-hint">Zahlungen werden in dieser Ausbaustufe noch nicht im Portal erfasst und laufen weiterhin direkt über die zuständige Stelle im Hintergrund.</p>

          <div className="status-pills-filter" role="group" aria-label="Schnellfilter nach Status">
            <button type="button" className={`filter-pill ${status === '' ? 'is-active' : ''}`} onClick={() => filter(() => setStatus(''))}>Alle</button>
            {Object.entries(bookingStatus).map(([value, label]) => (
              <button key={value} type="button" className={`filter-pill ${status === value ? 'is-active' : ''}`} onClick={() => filter(() => setStatus(value))}>
                {label}
              </button>
            ))}
          </div>

          <div className="portal-form-grid">
            {!routeCampId && (
              <label className="field">
                <span>Freizeit</span>
                <select value={campId} onChange={event => filter(() => setCampId(event.target.value))}>
                  <option value="">Alle Freizeiten</option>
                  {camps.map(camp => <option key={camp.id} value={camp.id}>{camp.title}</option>)}
                </select>
              </label>
            )}
            <label className="field">
              <span>Eingegangen ab</span>
              <input type="date" value={from} onChange={event => filter(() => setFrom(event.target.value))} />
            </label>
            <label className="field">
              <span>Eingegangen bis</span>
              <input type="date" min={from} value={to} onChange={event => filter(() => setTo(event.target.value))} />
            </label>
            <label className="field">
              <span>Anmeldung suchen</span>
              <div className="input-with-icon">
                <Search size={18} aria-hidden="true" />
                <input type="search" value={textQuery} onChange={event => setTextQuery(event.target.value)} placeholder="Name, E-Mail oder Nummer" />
              </div>
            </label>
          </div>

          {error && <p className="alert" role="alert">{error}</p>}
          {message && <p className="success-alert" role="status">{message}</p>}
          {loading && <p role="status">Anmeldungen werden geladen …</p>}
          <p className="editor-help">{total} Anmeldungen gesamt. Wartelisten werden in Eingangsreihenfolge angezeigt; über das Nachrücken entscheidet dein Träger.</p>

          {!loading && visibleItems.length === 0 ? (
            <div className="empty-state compact">
              <UsersRound size={32} aria-hidden="true" />
              <h2>Keine Anmeldungen in dieser Auswahl</h2>
              <p>Passe die Filter oben an oder wähle eine andere Freizeit aus.</p>
            </div>
          ) : (
            <ul className="portal-list">
              {visibleItems.map(booking => (
                <li className="portal-card" key={booking.id}>
                  <div className="booking-card-header">
                    <div>
                      <h2>{booking.snapshot.title}</h2>
                      <p className="management-meta">
                        <span className="booking-ref">{booking.reference}</span>
                        <span>{booking.participant_count} Teilnehmende</span>
                        <span>Eingang: {portalDate(booking.created_at)}</span>
                      </p>
                    </div>
                    <span className={`status-pill ${bookingStatusTone(booking.status)}`}>
                      <strong>{bookingStatus[booking.status]}</strong>
                    </span>
                  </div>

                  {booking.anonymized_at ? (
                    <p className="editor-help">Personenbezogene Angaben wurden nach Ablauf der Aufbewahrungsfrist gelöscht.</p>
                  ) : (
                    <>
                      <div className="booking-contact-row">
                        <span><UserRound size={16} aria-hidden="true" /> {booking.contact_name}</span>
                        <a href={`mailto:${booking.contact_email}`}><Mail size={16} aria-hidden="true" /> {booking.contact_email}</a>
                        <a href={`tel:${booking.contact_phone}`}><Phone size={16} aria-hidden="true" /> {booking.contact_phone}</a>
                      </div>
                      <ul className="participant-chips" aria-label="Teilnehmende">
                        {booking.participants.map((person, index) => (
                          <li className="participant-chip" key={index}>
                            {person.first_name} {person.last_name} · geb. {person.birth_date}
                          </li>
                        ))}
                      </ul>
                      {booking.message && <p className="booking-message-box preserve-lines">{booking.message}</p>}
                      <div className="portal-actions">
                        {booking.status === 'reserved' && (
                          <button type="button" className="primary-action" disabled={busy} onClick={() => void action(booking, 'confirm')}>
                            <CheckCircle2 size={17} aria-hidden="true" />
                            Teilnahme bestätigen
                          </button>
                        )}
                        {booking.status === 'waitlist' && (
                          <button type="button" className="primary-action" disabled={busy} onClick={() => void action(booking, 'promote')}>
                            <UsersRound size={17} aria-hidden="true" />
                            Gruppe nachrücken lassen
                          </button>
                        )}
                        {['reserved', 'waitlist'].includes(booking.status) && (
                          <button type="button" className="secondary-action" disabled={busy} onClick={() => void action(booking, 'reject')}>
                            <XCircle size={17} aria-hidden="true" />
                            Ablehnen
                          </button>
                        )}
                        {['reserved', 'waitlist', 'confirmed'].includes(booking.status) && (
                          <button type="button" className="danger-action" disabled={busy} onClick={() => void action(booking, 'cancel')}>
                            Stornieren
                          </button>
                        )}
                      </div>
                    </>
                  )}

                  <details>
                    <summary>Bearbeitungsverlauf</summary>
                    <ul className="status-timeline">
                      {booking.events.map((event, index) => (
                        <li key={index}>{portalDate(event.created_at)}: {bookingStatus[event.to_status]}</li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          )}

          <div className="portal-actions">
            <button className="secondary-action" type="button" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 100))}>Vorherige Seite</button>
            <button className="secondary-action" type="button" disabled={offset + 100 >= total} onClick={() => setOffset(value => value + 100)}>Nächste Seite</button>
          </div>

          <BookingStatistics rows={statistics} />
          <MailDeliveryStatus key={reload} />
        </section>
      </div>
    </ProviderWorkspaceShell>
  );
}
