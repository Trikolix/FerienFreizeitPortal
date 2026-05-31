import React from 'react';
import { CalendarClock, CalendarDays, Euro, MapPin, Tag, UsersRound, X } from 'lucide-react';

interface PreviewModalProps {
  camp: any;
  onClose: () => void;
  clubName?: string;
  contactInfo?: string;
}

const formatDateTime = (value?: string) => {
  if (!value) return 'Nicht angegeben';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
};

const formatPrice = (value?: number | string) => {
  if (value === undefined || value === null || value === '') return 'Teilnahmebeitrag auf Anfrage';
  const amount = Number(value);
  if (Number.isNaN(amount)) return String(value);

  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
};

export const PreviewModal: React.FC<PreviewModalProps> = ({ camp, onClose, clubName, contactInfo }) => {
  const hasLocation = camp.location_lat !== undefined && camp.location_lng !== undefined;
  // Use existing images, or selected files if provided (we'll implement this later, for now just existing images)
  const previewImageUrl = camp.images?.length ? camp.images[0] : null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2rem'
    }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{
        backgroundColor: 'var(--background)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '1000px',
        maxHeight: '90vh', overflowY: 'auto', position: 'relative'
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', zIndex: 10
        }} aria-label="Schließen">
          <X size={24} color="white" style={{ background: 'rgba(0,0,0,0.5)', borderRadius: '50%', padding: '4px' }} />
        </button>

        <article className="camp-detail-page" style={{ padding: '0', margin: '0', maxWidth: 'none' }}>
          <section className="detail-hero" style={{ marginTop: '0', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0' }}>
            {previewImageUrl ? (
              <img src={previewImageUrl} alt={`Vorschau Bild`} />
            ) : (
              <div className="camp-media-fallback">
                <MapPin size={42} />
              </div>
            )}
          </section>

          <section className="detail-layout" style={{ padding: '2rem' }}>
            <div className="detail-main">
              <span className="eyebrow">{camp.type || 'Kategorie'}</span>
              <h1>{camp.title || 'Titel der Freizeit'}</h1>
              <p className="provider">{clubName}</p>
              <div className="detail-description" dangerouslySetInnerHTML={{ __html: camp.description || 'Keine Beschreibung hinterlegt.' }} />
            </div>

            <aside className="detail-sidebar" aria-label="Freizeitdetails">
              <div className="detail-fact">
                <CalendarDays size={20} />
                <div>
                  <span>Beginn</span>
                  <strong>{formatDateTime(camp.starts_at)}</strong>
                </div>
              </div>
              <div className="detail-fact">
                <CalendarClock size={20} />
                <div>
                  <span>Ende</span>
                  <strong>{formatDateTime(camp.ends_at)}</strong>
                </div>
              </div>
              <div className="detail-fact">
                <UsersRound size={20} />
                <div>
                  <span>Alter</span>
                  <strong>{camp.min_age || 0}-{camp.max_age || 0} Jahre</strong>
                </div>
              </div>
              <div className="detail-fact">
                <Euro size={20} />
                <div>
                  <span>Teilnahmebeitrag</span>
                  <strong>{formatPrice(camp.price_eur)}</strong>
                </div>
              </div>
              <div className="detail-fact">
                <CalendarClock size={20} />
                <div>
                  <span>Anmeldeschluss</span>
                  <strong>{formatDateTime(camp.registration_deadline)}</strong>
                </div>
              </div>
              <div className="detail-fact">
                <Tag size={20} />
                <div>
                  <span>Kategorie</span>
                  <strong>{camp.type || 'Nicht angegeben'}</strong>
                </div>
              </div>
              <div className="detail-fact">
                <MapPin size={20} />
                <div>
                  <span>Ort</span>
                  <strong>
                    {camp.location_text || (hasLocation ? `${camp.location_lat}, ${camp.location_lng}` : 'Nicht angegeben')}
                  </strong>
                </div>
              </div>
              <div className="detail-contact">
                <span>Anbieter</span>
                <strong>{clubName}</strong>
                <p>{contactInfo || 'Keine Kontaktinformation hinterlegt.'}</p>
              </div>
            </aside>
          </section>
        </article>
      </div>
    </div>
  );
};
