import { AccessibleForm } from './AccessibleForm';
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, Plus, Send, Trash2, UserRound, X } from 'lucide-react';
import { ApiError, apiFetch } from '../utils/api';
import { placeRequestActionLabel, type AvailabilityState } from '../utils/placeRequests';
import { Modal } from './Modal';

interface PlaceRequestCamp {
  id: number;
  title: string;
  starts_at: string;
  min_age: number;
  max_age: number;
  allocation_method?: 'request' | 'lottery';
  availability_state?: AvailabilityState;
}

interface ParticipantInput {
  id: number;
  first_name: string;
  last_name: string;
  birth_date: string;
}

const newParticipant = (id: number): ParticipantInput => ({ id, first_name: '', last_name: '', birth_date: '' });

export function PlaceRequestModal({ camp, onClose }: { camp: PlaceRequestCamp; onClose: () => void }) {
  const [formStartedAt] = useState(() => Date.now());
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [participants, setParticipants] = useState<ParticipantInput[]>([newParticipant(1)]);
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<{ message: string; requestId?: string; confirmationSent: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const nextParticipantId = useRef(2);
  const successHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (success) successHeading.current?.focus(); }, [success]);
  const actionLabel = placeRequestActionLabel(camp.availability_state) || 'Anfrage senden';

  const updateParticipant = (id: number, field: keyof Omit<ParticipantInput, 'id'>, value: string) => {
    setParticipants((current) => current.map((participant) => participant.id === id ? { ...participant, [field]: value } : participant));
  };

  const addParticipant = () => {
    if (participants.length >= 10) return;
    setParticipants((current) => [...current, newParticipant(nextParticipantId.current++)]);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      const response = await apiFetch(`/api/camps/${camp.id}/place-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_name: contactName,
          contact_email: contactEmail,
          contact_phone: contactPhone,
          participants: participants.map(({ first_name, last_name, birth_date }) => ({ first_name, last_name, birth_date })),
          message,
          website,
          privacy_acknowledged: privacyAcknowledged,
          form_started_at: formStartedAt,
        }),
      });
      const data = await response.json();
      setSuccess({ message: data.message, requestId: data.request_id, confirmationSent: data.confirmation_email_sent !== false });
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
        setFieldErrors(submitError.fields);
        const firstField = Object.keys(submitError.fields)[0];
        if (firstField) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-request-field="${firstField}"]`)?.focus());
      } else {
        setError(submitError instanceof Error ? submitError.message : 'Die Anfrage konnte nicht gesendet werden.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={actionLabel} onClose={onClose}>
      <div className="place-request-dialog">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Anfrageformular schließen"><X size={22} /></button>
        {success ? (
          <div className="place-request-success">
            <span className="eyebrow">Anfrage übermittelt</span>
            <h2 tabIndex={-1} ref={successHeading}>Danke für dein Interesse</h2>
            <p role="status">{success.message}</p>
            {success.requestId && <p><strong>Request-ID:</strong> {success.requestId}</p>}
            {!success.confirmationSent && <p className="alert" role="alert">Die Anfrage ist beim Anbieter angekommen, aber die Bestätigungsmail konnte nicht versendet werden.</p>}
            <p>Der Anbieter meldet sich direkt bei dir. Buchung, Zusage und Bezahlung erfolgen nicht über dieses Portal.</p>
            <button className="primary-action" type="button" onClick={onClose}>Schließen</button>
          </div>
        ) : (
          <AccessibleForm className="place-request-form" onSubmit={submit}>
            <div>
              <span className="eyebrow">{camp.allocation_method === 'lottery' ? 'Bewerbung' : camp.availability_state === 'waitlist' ? 'Warteliste' : 'Platzanfrage'}</span>
              <h2>{actionLabel}</h2>
              <p>für <strong>{camp.title}</strong></p>
            </div>
            <p className="place-request-notice">Diese Anfrage ist unverbindlich und reserviert keinen Platz. Der Anbieter bestätigt die Teilnahme und wickelt eine mögliche Zahlung direkt mit dir ab.</p>
            {camp.allocation_method === 'lottery' && <p className="place-request-notice">Alle rechtzeitig eingegangenen Bewerbungen werden vom Anbieter nach Ende der Frist extern bearbeitet. Das Absenden garantiert keinen Platz.</p>}
            {error && <p className="alert" id="place-request-error" role="alert">{error}</p>}
            {Object.keys(fieldErrors).length > 0 && <ul className="validation-summary" aria-label="Bitte prüfe diese Angaben">{Object.entries(fieldErrors).map(([field, fieldError]) => <li key={field} id={`request-error-${field}`}><button type="button" onClick={() => document.querySelector<HTMLElement>(`[data-request-field="${field}"]`)?.focus()}>{fieldError}</button></li>)}</ul>}

            <fieldset>
              <legend>Kontaktperson</legend>
              <div className="place-request-grid">
                <label className="field field-wide">
                  <span>Name</span>
                  <div className="input-with-icon"><UserRound size={18} /><input data-request-field="contact_name" value={contactName} onChange={(event) => setContactName(event.target.value)} minLength={2} maxLength={120} autoComplete="name" aria-invalid={Boolean(fieldErrors.contact_name)} aria-describedby={fieldErrors.contact_name ? 'request-error-contact_name' : undefined} required /></div>
                </label>
                <label className="field">
                  <span>E-Mail-Adresse</span>
                  <div className="input-with-icon"><Mail size={18} /><input data-request-field="contact_email" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} maxLength={254} autoComplete="email" aria-invalid={Boolean(fieldErrors.contact_email)} aria-describedby={fieldErrors.contact_email ? 'request-error-contact_email' : undefined} required /></div>
                </label>
                <label className="field">
                  <span>Telefonnummer</span>
                  <div className="input-with-icon"><Phone size={18} /><input data-request-field="contact_phone" type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} minLength={3} maxLength={50} autoComplete="tel" aria-invalid={Boolean(fieldErrors.contact_phone)} aria-describedby={fieldErrors.contact_phone ? 'request-error-contact_phone' : undefined} required /></div>
                </label>
              </div>
            </fieldset>

            <fieldset tabIndex={-1} data-request-field="participants" aria-describedby={fieldErrors.participants ? "request-error-participants" : undefined}>
              <legend>Teilnehmende</legend>
              <p>Das Alter wird zum Beginn der Freizeit geprüft ({camp.min_age}–{camp.max_age} Jahre).</p>
              <div className="participant-list">
                {participants.map((participant, index) => (
                  <section className="participant-card" key={participant.id} aria-labelledby={`participant-${participant.id}`}>
                    <div className="participant-heading">
                      <h3 id={`participant-${participant.id}`}>Person {index + 1}</h3>
                      {participants.length > 1 && <button type="button" className="danger-action" onClick={() => setParticipants((current) => current.filter((entry) => entry.id !== participant.id))} aria-label={`Person ${index + 1} entfernen`}><Trash2 size={17} /></button>}
                    </div>
                    <div className="place-request-grid">
                      <label className="field"><span>Vorname</span><input data-request-field={`participants.${index}.first_name`} value={participant.first_name} onChange={(event) => updateParticipant(participant.id, 'first_name', event.target.value)} maxLength={120} aria-invalid={Boolean(fieldErrors[`participants.${index}.first_name`])} aria-describedby={fieldErrors[`participants.${index}.first_name`] ? `request-error-participants.${index}.first_name` : undefined} required /></label>
                      <label className="field"><span>Nachname</span><input data-request-field={`participants.${index}.last_name`} value={participant.last_name} onChange={(event) => updateParticipant(participant.id, 'last_name', event.target.value)} maxLength={120} aria-invalid={Boolean(fieldErrors[`participants.${index}.last_name`])} aria-describedby={fieldErrors[`participants.${index}.last_name`] ? `request-error-participants.${index}.last_name` : undefined} required /></label>
                      <label className="field field-wide"><span>Geburtsdatum</span><input data-request-field={`participants.${index}.birth_date`} type="date" max={camp.starts_at?.slice(0, 10)} value={participant.birth_date} onChange={(event) => updateParticipant(participant.id, 'birth_date', event.target.value)} aria-invalid={Boolean(fieldErrors[`participants.${index}.birth_date`])} aria-describedby={fieldErrors[`participants.${index}.birth_date`] ? `request-error-participants.${index}.birth_date` : undefined} required /></label>
                    </div>
                  </section>
                ))}
              </div>
              <button className="secondary-action" type="button" onClick={addParticipant} disabled={participants.length >= 10}><Plus size={17} /> Weitere Person hinzufügen</button>
            </fieldset>

            <label className="field">
              <span>Nachricht an den Anbieter (optional)</span>
              <textarea data-request-field="message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} aria-invalid={Boolean(fieldErrors.message)} aria-describedby={fieldErrors.message ? 'request-error-message' : undefined} />
              <small>Bitte übermittle hier keine Gesundheitsdaten oder andere besonders vertrauliche Informationen.</small>
            </label>
            <label className="field visually-hidden-field" aria-hidden="true"><span>Website</span><input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" /></label>
            <label className="privacy-check">
              <input data-request-field="privacy_acknowledged" type="checkbox" checked={privacyAcknowledged} onChange={(event) => setPrivacyAcknowledged(event.target.checked)} aria-invalid={Boolean(fieldErrors.privacy_acknowledged)} aria-describedby={fieldErrors.privacy_acknowledged ? 'request-error-privacy_acknowledged' : undefined} required />
              <span>Ich habe die <Link to="/datenschutz" target="_blank" rel="noreferrer">Datenschutzhinweise</Link> zur Übermittlung an den Anbieter gelesen.</span>
            </label>
            <button className="primary-action" type="submit" disabled={submitting}><Send size={18} /> {submitting ? 'Wird gesendet …' : actionLabel}</button>
          </AccessibleForm>
        )}
      </div>
    </Modal>
  );
}
