import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CalendarDays, Euro, MapPin, Tag, UsersRound } from 'lucide-react';

interface CampDetail {
  id: number;
  title: string;
  club_name: string;
  contact_info?: string;
  username?: string;
  min_age: number;
  max_age: number;
  description: string;
  type: string;
  location_text?: string;
  location_lat?: number;
  location_lng?: number;
  starts_at?: string;
  ends_at?: string;
  price_eur?: number | string;
  registration_deadline?: string;
  images?: string[];
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

export const CampDetailPage: React.FC = () => {
  const { id } = useParams();
  const [camp, setCamp] = useState<CampDetail | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchCamp = async () => {
      setIsLoading(true);
      setError('');

      try {
        const response = await fetch(`/api/camps/${id}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Freizeit konnte nicht geladen werden');
        }

        if (!cancelled) {
          setCamp(data);
        }
      } catch (err) {
        if (!cancelled) {
          setCamp(null);
          setError(err instanceof Error ? err.message : 'Freizeit konnte nicht geladen werden');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchCamp();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (isLoading) {
    return (
      <div className="empty-state" role="status">
        <p>Freizeit wird geladen...</p>
      </div>
    );
  }

  if (error || !camp) {
    return (
      <div className="empty-state">
        <h1>Freizeit nicht gefunden</h1>
        <p>{error || 'Diese Freizeit ist nicht verfügbar.'}</p>
        <Link className="secondary-action" to="/">
          <ArrowLeft size={17} />
          Zur Suche
        </Link>
      </div>
    );
  }

  const hasLocation = camp.location_lat !== undefined && camp.location_lng !== undefined;

  return (
    <article className="camp-detail-page">
      <Link className="secondary-action detail-back-link" to="/">
        <ArrowLeft size={17} />
        Zur Suche
      </Link>

      <section className="detail-hero">
        {camp.images?.length ? (
          <img src={camp.images[0]} alt={`Bild zu ${camp.title}`} />
        ) : (
          <div className="camp-media-fallback">
            <MapPin size={42} />
          </div>
        )}
      </section>

      <section className="detail-layout">
        <div className="detail-main">
          <span className="eyebrow">{camp.type}</span>
          <h1>{camp.title}</h1>
          <p className="provider">{camp.club_name}</p>
          <p className="detail-description">{camp.description || 'Keine Beschreibung hinterlegt.'}</p>
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
              <strong>{camp.min_age}-{camp.max_age} Jahre</strong>
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
            <strong>{camp.club_name}</strong>
            <p>{camp.contact_info || camp.username || 'Keine Kontaktinformation hinterlegt.'}</p>
          </div>
        </aside>
      </section>
    </article>
  );
};
