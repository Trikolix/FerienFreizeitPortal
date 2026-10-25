import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { BookingStatistics, type BookingStatistic } from '../components/BookingStatistics';
import { MailDeliveryStatus } from '../components/MailDeliveryStatus';
import { bookingStatus, portalApi, portalDate } from '../utils/portal';
interface ManagedBooking { id: number; reference: string; status: string; participant_count: number; contact_name: string; contact_email: string; contact_phone: string; message: string; created_at: string; anonymized_at?: string; snapshot: { title: string }; participants: { first_name: string; last_name: string; birth_date: string }[]; events: { action: string; to_status: string; created_at: string }[] }
export function BookingManagementPage() {
  const user = useAuthStore(state => state.user); const [items, setItems] = useState<ManagedBooking[]>([]); const [statistics, setStatistics] = useState<BookingStatistic[]>([]);
  const [camps, setCamps] = useState<{ id: number; title: string }[]>([]); const [campId, setCampId] = useState(''); const [status, setStatus] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [total, setTotal] = useState(0); const [offset, setOffset] = useState(0); const [reload, setReload] = useState(0); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { if (user) portalApi<{ id: number; title: string }[]>(`/api/camps?club_id=${user.id}`).then(setCamps).catch(reason => setError(reason.message)); }, [user]);
  useEffect(() => {
    let active = true; const query = new URLSearchParams(); if (campId) query.set('camp_id', campId); if (status) query.set('status', status); if (from) query.set('from', from); if (to) query.set('to', to); query.set('offset', String(offset));
    Promise.all([portalApi<{ items: ManagedBooking[]; total: number }>(`/api/bookings?${query}`), portalApi<BookingStatistic[]>(`/api/booking-statistics?${query}`)]).then(([bookings, stats]) => { if (active) { setItems(bookings.items); setTotal(bookings.total); setStatistics(stats); } }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [campId, status, from, to, offset, reload]);
  function filter(update: () => void) { update(); setOffset(0); setLoading(true); setError(''); }
  async function action(booking: ManagedBooking, actionName: string) {
    if (busy) return; if (['cancel', 'reject'].includes(actionName) && !window.confirm(`Anmeldung ${booking.reference} wirklich ${actionName === 'cancel' ? 'stornieren' : 'ablehnen'}?`)) return;
    setBusy(true); setError(''); setMessage('');
    try { await portalApi(`/api/bookings/${booking.id}/actions`, { action: actionName }); setMessage('Buchungsstatus aktualisiert. Die Familie wird per E-Mail informiert.'); setReload(value => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Aktion fehlgeschlagen.'); }
    finally { setBusy(false); }
  }
  return <section className="portal-panel"><h1>Anmeldungen und Wartelisten</h1><p><Link to="/dashboard">Freizeiten verwalten</Link></p>
    <div className="portal-form-grid"><label className="field"><span>Freizeit</span><select value={campId} onChange={event => filter(() => setCampId(event.target.value))}><option value="">Alle Freizeiten</option>{camps.map(camp => <option key={camp.id} value={camp.id}>{camp.title}</option>)}</select></label><label className="field"><span>Buchungsstatus</span><select value={status} onChange={event => filter(() => setStatus(event.target.value))}><option value="">Alle Status</option>{Object.entries(bookingStatus).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field"><span>Eingegangen ab</span><input type="date" value={from} onChange={event => filter(() => setFrom(event.target.value))} /></label><label className="field"><span>Eingegangen bis</span><input type="date" min={from} value={to} onChange={event => filter(() => setTo(event.target.value))} /></label></div>
    {error && <p className="alert" role="alert">{error}</p>}{message && <p className="success-alert" role="status">{message}</p>}{loading && <p role="status">Anmeldungen werden geladen …</p>}
    <p>{total} Anmeldungen. Wartelisten werden in Eingangsreihenfolge angezeigt; über das Nachrücken entscheidet dein Träger.</p>
    <ul className="portal-list">{items.map(booking => <li className="portal-card" key={booking.id}><h2>{booking.snapshot.title}</h2><p><strong>{bookingStatus[booking.status]}</strong> · {booking.participant_count} Teilnehmende · {portalDate(booking.created_at)}</p><p>Anmeldenummer: {booking.reference}</p>
      {booking.anonymized_at ? <p>Personenbezogene Angaben wurden nach Ablauf der Aufbewahrungsfrist gelöscht.</p> : <><p>{booking.contact_name} · <a href={`mailto:${booking.contact_email}`}>{booking.contact_email}</a> · {booking.contact_phone}</p><ul>{booking.participants.map((person, index) => <li key={index}>{person.first_name} {person.last_name} · geboren am {person.birth_date}</li>)}</ul>{booking.message && <p className="preserve-lines">{booking.message}</p>}<div className="portal-actions">
      {booking.status === 'reserved' && <button type="button" className="primary-action" disabled={busy} onClick={() => void action(booking, 'confirm')}>Teilnahme bestätigen</button>}
      {booking.status === 'waitlist' && <button type="button" className="primary-action" disabled={busy} onClick={() => void action(booking, 'promote')}>Gruppe nachrücken lassen</button>}
      {['reserved', 'waitlist'].includes(booking.status) && <button type="button" className="secondary-action" disabled={busy} onClick={() => void action(booking, 'reject')}>Ablehnen</button>}
      {['reserved', 'waitlist', 'confirmed'].includes(booking.status) && <button type="button" className="secondary-action" disabled={busy} onClick={() => void action(booking, 'cancel')}>Stornieren</button>}
      </div></>}
      <details><summary>Bearbeitungsverlauf</summary><ul>{booking.events.map((event, index) => <li key={index}>{portalDate(event.created_at)}: {bookingStatus[event.to_status]}</li>)}</ul></details>
    </li>)}</ul>
    <div className="portal-actions"><button className="secondary-action" type="button" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 100))}>Vorherige Seite</button><button className="secondary-action" type="button" disabled={offset + 100 >= total} onClick={() => setOffset(value => value + 100)}>Nächste Seite</button></div>
    <BookingStatistics rows={statistics} /><MailDeliveryStatus key={reload} />
  </section>;
}
