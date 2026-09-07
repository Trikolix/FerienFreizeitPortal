import { safeHtml } from '../utils/safeHtml';
import { apiFetch } from '../utils/api';
import React, { useEffect, useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CalendarDays, Euro, MapPin, Tag, UsersRound } from 'lucide-react';
import { ImageGallery } from '../components/ImageGallery';
import { PlaceRequestModal } from '../components/PlaceRequestModal';
import { availabilityLabel, availabilityTone, placeRequestActionLabel, type AvailabilityState } from '../utils/placeRequests';

interface Holiday {
  id: number;
  name: string;
  starts_at: string;
  ends_at: string;
}

interface Camp {
  id: number;
  title: string;
  club_name: string;
  min_age: number;
  max_age: number;
  description: string;
  type: string;
  categories?: string[];
  location_text: string;
  location_lat: number;
  location_lng: number;
  starts_at: string;
  ends_at: string;
  price_eur: number;
  registration_deadline: string;
  status: 'draft' | 'published' | 'fully_booked' | 'archived';
  images?: string[];
  image_metadata?: import('../utils/imageMetadata').ImageMetadata[];
  contact_info?: string;
  username?: string;
  allocation_method?: 'request' | 'lottery';
  request_opens_at?: string | null;
  availability_state?: AvailabilityState;
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

const getHolidayForCamp = (camp: Camp, holidays: Holiday[]) => holidays.find((holiday) => {
  if (!camp.starts_at || !camp.ends_at) return false;
  const campStart = camp.starts_at.split(' ')[0];
  const campEnd = camp.ends_at.split(' ')[0];
  const holidayStart = holiday.starts_at.split(' ')[0];
  const holidayEnd = holiday.ends_at.split(' ')[0];
  return campStart >= holidayStart && campEnd <= holidayEnd;
});

export const CampDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const returnSearch = typeof location.state?.search === 'string' ? location.state.search : '';
  const [camp, setCamp] = useState<Camp | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPlaceRequestOpen, setIsPlaceRequestOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const loadData = async () => {
      setLoading(true);
      setError('');
      try {
        const [campRes, holidaysRes] = await Promise.all([
          apiFetch(`/api/camps/${id}`, { signal: controller.signal }),
          apiFetch('/api/holidays', { signal: controller.signal }).catch(() => new Response('[]'))
        ]);
        
        if (!campRes.ok) throw new Error('Freizeit nicht gefunden');
        const campData = await campRes.json();
        const holidaysData = await holidaysRes.json();
        
        setCamp(campData);
        setHolidays(holidaysData);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Fehler beim Laden');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void loadData();
    return () => controller.abort();
  }, [id]);

  if (loading) return <div className="empty-state"><p role="status">Freizeit wird geladen …</p></div>;
  if (error || !camp) return <div className="empty-state"><h1>Freizeit nicht verfügbar</h1><p role="alert">{error || 'Freizeit nicht gefunden'}</p><Link to="/">Zurück zur Suche</Link></div>;

  const holiday = getHolidayForCamp(camp, holidays);
  const placeStatus = availabilityLabel(camp);
  const placeAction = placeRequestActionLabel(camp.availability_state);

  return (
    <article className="camp-detail-page">
      <Link className="secondary-action detail-back-link" to={returnSearch ? `/?${returnSearch}` : '/'}>
        <ArrowLeft size={17} />
        Zur Suche
      </Link>

      <section className="detail-hero">
        <ImageGallery metadata={camp.image_metadata} images={camp.images} title={camp.title} />
      </section>

      <section className="detail-layout">
        <div className="detail-main">
          <div className="detail-tags">
            {camp.categories?.map(cat => (
              <span key={cat} className="camp-type">{cat}</span>
            )) || <span className="camp-type">{camp.type}</span>}
            {holiday && (
              <span className="status-pill is-live">
                <CalendarDays size={14} /> {holiday.name}
              </span>
            )}
          </div>
          <h1>{camp.title}</h1>
          <p className="provider">{camp.club_name}</p>
          <div className="detail-description" dangerouslySetInnerHTML={{ __html: safeHtml(camp.description) }} />
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
              <span>Kategorien</span>
              <strong>{camp.categories?.join(', ') || camp.type || 'Nicht angegeben'}</strong>
            </div>
          </div>
          <div className="detail-fact">
            <MapPin size={20} />
            <div>
              <span>Ort</span>
              <strong>{camp.location_text || 'Nicht angegeben'}</strong>
            </div>
          </div>
          <div className="detail-contact">
            <span>Anbieter</span>
            <strong>{camp.club_name}</strong>
            <p>{camp.contact_info || 'Keine Kontaktinformation hinterlegt.'}</p>
            {placeStatus && <span className={`status-pill ${availabilityTone(camp.availability_state)}`} role="status">{placeStatus}</span>}
            <p>Eine Anfrage ist unverbindlich. Buchung, Bestätigung und Bezahlung erfolgen direkt beim Anbieter.</p>
            {placeAction && <button className="primary-action detail-request-action" type="button" onClick={() => setIsPlaceRequestOpen(true)}>{placeAction}</button>}
          </div>
        </aside>
      </section>
      {isPlaceRequestOpen && <PlaceRequestModal camp={camp} onClose={() => setIsPlaceRequestOpen(false)} />}
    </article>
  );
};
