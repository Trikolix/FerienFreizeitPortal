import { AccessibleForm } from '../components/AccessibleForm';
import { apiFetch } from '../utils/api';
import { useSearchParams } from 'react-router-dom';
import React, { useState } from 'react';
import { Mail, MessageSquare, Send, UserRound } from 'lucide-react';

const successMessage = 'Danke, deine Nachricht wurde übermittelt. Wir melden uns bei Bedarf per E-Mail.';

export const ContactPage: React.FC = () => {
  const [params] = useSearchParams();
  const [formStartedAt] = useState(() => Date.now());
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(() => params.get('anliegen') === 'barrierefreiheit' ? 'Ich möchte eine Barriere melden.\n\nBetroffene Seite:\n\nBei diesem Schritt tritt das Problem auf:\n\nBeschreibung des Problems:\n' : '');
  const [website, setWebsite] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    try {
      const response = await apiFetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          message,
          website,
          form_started_at: formStartedAt,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Die Nachricht konnte nicht gesendet werden.');
        return;
      }

      setSuccess(data.message || successMessage);
      setName('');
      setEmail('');
      setMessage('');
      setWebsite('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Anfrage fehlgeschlagen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="contact-page">
      <section className="contact-card">
        <div className="page-heading contact-heading">
          <span className="eyebrow">Kontakt</span>
          <h1>Nachricht an das Ferienfreizeitportal</h1>
          <p>Fragen zur Plattform, Hinweise zu Einträgen oder technische Probleme erreichen das Betreiberteam direkt.</p>
        </div>

        <AccessibleForm className="contact-form" onSubmit={handleSubmit}>
          {error && <p className="alert" role="alert">{error}</p>}
          {success && <p className="success-alert" role="status">{success}</p>}

          <label className="field">
            <span>Name</span>
            <div className="input-with-icon">
              <UserRound size={18} />
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={2}
                maxLength={120}
                autoComplete="name"
                required
              />
            </div>
          </label>

          <label className="field">
            <span>E-Mail-Adresse</span>
            <div className="input-with-icon">
              <Mail size={18} />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                autoComplete="email"
                required
              />
            </div>
          </label>

          <label className="field visually-hidden-field" aria-hidden="true">
            <span>Website</span>
            <input
              type="text"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </label>

          <label className="field field-wide">
            <span>Nachricht</span>
            <div className="textarea-with-icon">
              <MessageSquare size={18} />
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                minLength={20}
                maxLength={4000}
                required
              />
            </div>
          </label>

          <button className="primary-action" type="submit" disabled={isSubmitting}>
            <Send size={18} />
            {isSubmitting ? 'Wird gesendet...' : 'Nachricht senden'}
          </button>
        </AccessibleForm>
      </section>
    </div>
  );
};
