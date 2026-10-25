import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AccessibleForm } from '../components/AccessibleForm';
import { ProviderNotice } from '../components/ProviderNotice';
import { ApiError } from '../utils/api';
import { bookingStatus, fragmentToken, portalApi, portalDate, portalPrice, type PublicProvider } from '../utils/portal';

interface BookingCamp { id: number; title: string; club_name: string; provider: PublicProvider; provider_notice: string; min_age: number; max_age: number; starts_at: string; ends_at: string; price_eur: number; waitlist_enabled?: boolean }
interface Person { id: number; first_name: string; last_name: string; birth_date: string }

export function BookingPage() {
  const { campId } = useParams();
  return <BookingForm key={campId} campId={campId} />;
}

function BookingForm({ campId }: { campId?: string }) {
  const [linkToken] = useState(fragmentToken); const [token, setToken] = useState('');
  const [camp, setCamp] = useState<BookingCamp | null>(null); const [email, setEmail] = useState(''); const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1); const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [message, setMessage] = useState('');
  const [people, setPeople] = useState<Person[]>([{ id: 1, first_name: '', last_name: '', birth_date: '' }]); const nextId = useRef(2);
  const [privacy, setPrivacy] = useState(false); const [waitlist, setWaitlist] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [fields, setFields] = useState<Record<string, string>>({}); const [result, setResult] = useState<{ reference?: string; status?: string; message: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let active = true;
    portalApi<BookingCamp>(`/api/camps/${campId}?public=1`).then(value => { if (active) setCamp(value); }).catch(() => undefined);
    const access = linkToken ? portalApi<{ camp?: BookingCamp; email?: string; token?: string; submitted?: boolean; message?: string }>('/api/booking-access', { token: linkToken }) : portalApi<{ camp?: BookingCamp; email?: string; token?: string; submitted?: boolean; message?: string }>(`/api/camps/${campId}/booking-form`, {});
    access.then(value => {
      if (!active) return;
      if (value.submitted) setResult({ message: value.message || 'Anmeldung bereits gespeichert.' });
      else if (String(value.camp?.id) !== campId) setError('Dieser Anmeldelink gehört zu einem anderen Angebot.');
      else { setCamp(value.camp!); setEmail(value.email || ''); setToken(value.token || linkToken); }
    }).catch(reason => { if (active) { setToken(''); setError(reason.message); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [campId, linkToken]);
  useEffect(() => { heading.current?.focus(); }, [step, result]);
  const personField = (id: number, key: 'first_name' | 'last_name' | 'birth_date', value: string) => setPeople(current => current.map(person => person.id === id ? { ...person, [key]: value } : person));
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || !camp || !token) return;
    if (step === 1) { setStep(2); setError(''); return; }
    setBusy(true); setError(''); setFields({});
    try {
      const response = await portalApi<{ reference: string; status: string; message: string }>(`/api/camps/${camp.id}/bookings`, { token, contact_name: name, contact_email: email, contact_phone: phone, participants: people.map(({ first_name, last_name, birth_date }) => ({ first_name, last_name, birth_date })), message, privacy_acknowledged: privacy, waitlist_consent: waitlist });
      setResult(response);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Anmeldung fehlgeschlagen.'); if (reason instanceof ApiError) { setFields(reason.fields); if (Object.keys(reason.fields).some(key => key.startsWith('participants') || key.startsWith('contact_'))) setStep(1); } }
    finally { setBusy(false); }
  }
  return <section className="portal-panel narrow-panel"><h1 ref={heading} tabIndex={-1}>{result ? 'Deine Anmeldung' : `Anmeldung${camp ? `: ${camp.title}` : ''}`}</h1>
    {camp && <ProviderNotice name={camp.club_name} provider={camp.provider} notice={camp.provider_notice} links={Boolean(result)} />}
    {loading && <p role="status">Anmeldeformular wird geladen …</p>}{error && <p className="alert" role="alert">{error}</p>}
    {Object.keys(fields).length > 0 && <ul className="validation-summary">{Object.entries(fields).map(([key, text]) => <li key={key}>{text}</li>)}</ul>}
    {result ? <div role="status"><p>{result.message}</p>{result.reference && <p>Anmeldenummer: <strong>{result.reference}</strong></p>}{result.status && <p>Status: <strong>{bookingStatus[result.status]}</strong></p>}<p>Für Änderungen und Stornierungen wende dich bitte direkt an den Anbieter.</p></div> : !loading && camp && token && <AccessibleForm onSubmit={submit}>
      <p>Schritt {step} von 2: {step === 1 ? 'Kontakt und Teilnehmende' : 'Angaben prüfen und anmelden'}</p>
      {step === 1 ? <fieldset disabled={busy}><legend>Kontakt und Teilnehmende</legend>
        <label className="field"><span>Name der Kontaktperson</span><input autoComplete="name" minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} required /></label>
        <label className="field"><span>Deine E-Mail-Adresse</span><input type="email" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} required /></label>
        <p>An diese Adresse senden wir die Bestätigung mit Zusammenfassung und deinen persönlichen Statuslink. Bitte prüfe die Schreibweise.</p>
        <label className="field"><span>Telefonnummer</span><input type="tel" autoComplete="tel" minLength={3} maxLength={50} value={phone} onChange={event => setPhone(event.target.value)} required /></label>
        <p>Das Alter muss am Beginn der Freizeit zwischen {camp.min_age} und {camp.max_age} Jahren liegen. Mehrere Teilnehmende werden als gemeinsame Gruppe angemeldet.</p>
        {people.map((person, index) => <fieldset className="participant-card" key={person.id}><legend>Person {index + 1}</legend><div className="portal-form-grid">
          <label className="field"><span>Vorname</span><input maxLength={120} value={person.first_name} onChange={event => personField(person.id, 'first_name', event.target.value)} required /></label>
          <label className="field"><span>Nachname</span><input maxLength={120} value={person.last_name} onChange={event => personField(person.id, 'last_name', event.target.value)} required /></label>
          <label className="field"><span>Geburtsdatum</span><input type="date" max={camp.starts_at.slice(0, 10)} value={person.birth_date} onChange={event => personField(person.id, 'birth_date', event.target.value)} required /></label>
        </div>{people.length > 1 && <button type="button" className="text-button" onClick={() => setPeople(current => current.filter(value => value.id !== person.id))}>Person {index + 1} entfernen</button>}</fieldset>)}
        <button type="button" className="secondary-action" disabled={people.length >= 10} onClick={() => setPeople(current => [...current, { id: nextId.current++, first_name: '', last_name: '', birth_date: '' }])}>Weitere Person hinzufügen</button>
        <label className="field"><span>Nachricht an den Anbieter (optional)</span><textarea maxLength={2000} value={message} onChange={event => setMessage(event.target.value)} /></label><p>Bitte keine Gesundheitsdaten oder andere besonders vertrauliche Angaben eintragen.</p>
      </fieldset> : <div>
        <dl className="booking-summary"><dt>Freizeit</dt><dd>{camp.title}</dd><dt>Zeitraum</dt><dd>{portalDate(camp.starts_at)} – {portalDate(camp.ends_at)}</dd><dt>Teilnahmebeitrag je Person</dt><dd>{portalPrice(Number(camp.price_eur))}</dd><dt>Teilnahmebeitrag für die Gruppe</dt><dd>{portalPrice(Number(camp.price_eur) * people.length)}</dd><dt>Kontaktperson</dt><dd>{name}, {phone}, {email}</dd><dt>Teilnehmende</dt><dd>{people.map(person => `${person.first_name} ${person.last_name} (${person.birth_date})`).join('; ')}</dd></dl>
        <p>Bei freien Plätzen wird die gesamte Gruppe vorläufig reserviert. Der Anbieter entscheidet über die verbindliche Zusage. Zahlungen werden direkt mit dem Anbieter vereinbart und hier nicht erfasst.</p>
        {camp.waitlist_enabled && <label className="toggle-field"><input type="checkbox" checked={waitlist} onChange={event => setWaitlist(event.target.checked)} /><span>Falls nicht genügend Plätze frei sind, möchte ich die gesamte Gruppe auf die Warteliste setzen lassen.</span></label>}
        <label className="toggle-field"><input type="checkbox" checked={privacy} onChange={event => setPrivacy(event.target.checked)} required /><span>Ich habe die <Link to="/datenschutz" target="_blank" rel="noreferrer">Datenschutzhinweise</Link> zur Speicherung und Bearbeitung meiner Anmeldung gelesen.</span></label>
      </div>}
      <div className="portal-actions">{step === 2 && <button type="button" className="secondary-action" disabled={busy} onClick={() => setStep(1)}>Angaben ändern</button>}<button className="primary-action" disabled={busy}>{busy ? 'Anmeldung wird gespeichert …' : step === 1 ? 'Weiter zur Zusammenfassung' : 'Anmeldung an den Anbieter senden'}</button></div>
    </AccessibleForm>}
    <p><Link to={camp ? `/freizeiten/${camp.id}` : '/'}>Zur Freizeitübersicht</Link></p>
  </section>;
}

export function BookingStatusPage() {
  const [token] = useState(fragmentToken); const [error, setError] = useState('');
  const [booking, setBooking] = useState<{ reference: string; status: string; participant_count: number; snapshot: BookingCamp & { total_price_cents: number }; events: { to_status: string; created_at: string }[] } | null>(null);
  useEffect(() => { let active = true; portalApi<typeof booking>('/api/bookings/status', { token }).then(value => { if (active) setBooking(value); }).catch(reason => { if (active) setError(reason.message); }); return () => { active = false; }; }, [token]);
  return <section className="portal-panel narrow-panel"><h1>Status deiner Anmeldung</h1>{error && <p role="alert" className="alert">{error}</p>}
    {!booking && !error && <p role="status">Anmeldung wird geladen …</p>}
    {booking && <><ProviderNotice name={booking.snapshot.club_name} notice={booking.snapshot.provider_notice} provider={booking.snapshot.provider} links /><h2>{booking.snapshot.title}</h2><p>Anmeldenummer: <strong>{booking.reference}</strong></p><p>Status: <strong>{bookingStatus[booking.status]}</strong></p><p>{booking.participant_count} Teilnehmende · {portalDate(booking.snapshot.starts_at)} – {portalDate(booking.snapshot.ends_at)}</p><p>Teilnahmebeitrag laut Anmeldung: {portalPrice(booking.snapshot.total_price_cents / 100)}</p><p>Für Änderungen oder Stornierungen kontaktiere bitte den oben genannten Anbieter. Der Jugendring betreibt das Vermittlungsportal.</p><h3>Verlauf</h3><ul>{booking.events.map((event, index) => <li key={index}>{portalDate(event.created_at)}: {bookingStatus[event.to_status]}</li>)}</ul></>}
  </section>;
}
