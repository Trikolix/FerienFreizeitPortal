import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CalendarDays, Euro, MapPin, Tag, UsersRound } from 'lucide-react';
import { ImageGallery } from '../components/ImageGallery';

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
  contact_info?: string;
  username?: string;
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
  const [camp, setCamp] = useState<Camp | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const [campRes, holidaysRes] = await Promise.all([
          fetch(`/api/camps/${id}`),
          fetch('/api/holidays')
        ]);
        
        if (!campRes.ok) throw new Error('Freizeit nicht gefunden');
        const campData = await campRes.json();
        const holidaysData = await holidaysRes.json();
        
        setCamp(campData);
        setHolidays(holidaysData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Laden');
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, [id]);

  if (loading) return <div className="empty-state"><h2>Laden...</h2></div>;
  if (error || !camp) return <div className="empty-state"><h2>{error || 'Freizeit nicht gefunden'}</h2><Link to="/">Zurück zur Suche</Link></div>;

  const holiday = getHolidayForCamp(camp, holidays);

  return (
    <article className="camp-detail-page">
      <Link className="secondary-action detail-back-link" to="/">
        <ArrowLeft size={17} />
        Zur Suche
      </Link>

      <section className="detail-hero">
        <ImageGallery images={camp.images} title={camp.title} />
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
          <div className="detail-description" dangerouslySetInnerHTML={{ __html: camp.description }} />
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
            <p>{camp.contact_info || camp.username || 'Keine Kontaktinformation hinterlegt.'}</p>
          </div>
        </aside>
      </section>
    </article>
  );
};
