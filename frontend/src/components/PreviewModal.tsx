import React from 'react';
import { CalendarClock, CalendarDays, Euro, MapPin, Tag, UsersRound, X } from 'lucide-react';
import { ImageGallery } from './ImageGallery';
import { Modal } from './Modal';
import { safeHtml } from '../utils/safeHtml';
import { useImagePreviews } from '../utils/useImagePreviews';

const noFiles: File[] = [];

interface PreviewModalProps {
  camp: Partial<{
    title: string;
    min_age: number;
    max_age: number;
    description: string;
    type: string;
    categories: string[];
    location_text: string;
    location_lat: number;
    location_lng: number;
    starts_at: string;
    ends_at: string;
    price_eur: number | string;
    registration_deadline: string;
    images: string[];
  }>;
  onClose: () => void;
  clubName?: string;
  contactInfo?: string;
  selectedFiles?: File[];
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

export const PreviewModal: React.FC<PreviewModalProps> = ({ camp, onClose, clubName, contactInfo, selectedFiles = noFiles }) => {
  const previews = useImagePreviews(selectedFiles);
  const hasLocation = camp.location_lat != null && camp.location_lng != null;

  return (
    <Modal title="Freizeitvorschau" onClose={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Schließen">
          <X size={22} />
        </button>

        <article className="camp-detail-page preview-detail">
          <section className="detail-hero preview-hero">
            <ImageGallery images={[...(camp.images || []), ...previews]} title={camp.title} />
          </section>

          <section className="detail-layout preview-layout">
            <div className="detail-main">
              <span className="eyebrow">{camp.categories?.join(', ') || camp.type || 'Kategorie'}</span>
              <h1>{camp.title || 'Titel der Freizeit'}</h1>
              <p className="provider">{clubName}</p>
              <div className="detail-description" dangerouslySetInnerHTML={{ __html: safeHtml(camp.description || 'Keine Beschreibung hinterlegt.') }} />
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
                  <strong>{camp.min_age == null || camp.max_age == null ? 'Noch nicht angegeben' : `${camp.min_age}–${camp.max_age} Jahre`}</strong>
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
                  <span>Kategorien</span>
                  <strong>{camp.categories?.join(', ') || camp.type || 'Nicht angegeben'}</strong>
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
    </Modal>
  );
};
