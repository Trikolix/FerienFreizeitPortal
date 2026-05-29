import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { motion } from 'framer-motion';
import { CalendarDays, Euro, Filter, List, Map, MapPin, Search, Tag, UsersRound } from 'lucide-react';

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface Camp {
  id: number;
  title: string;
  club_name: string;
  min_age: number;
  max_age: number;
  description: string;
  type: string;
  location_text?: string;
  location_lat: number;
  location_lng: number;
  starts_at?: string;
  ends_at?: string;
  price_eur?: number | string;
  registration_deadline?: string;
  images?: string[];
}

interface MapBoundsEventsProps {
  onBoundsChange: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
}

const MapBoundsEvents: React.FC<MapBoundsEventsProps> = ({ onBoundsChange }) => {
  const map = useMapEvents({
    moveend: () => {
      const mapBounds = map.getBounds();
      onBoundsChange({
        minLat: mapBounds.getSouth(),
        maxLat: mapBounds.getNorth(),
        minLng: mapBounds.getWest(),
        maxLng: mapBounds.getEast(),
      });
    },
  });
  return null;
};

const parseDateTime = (value?: string) => {
  if (!value) return null;
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateRange = (startValue?: string, endValue?: string) => {
  const start = parseDateTime(startValue);
  const end = parseDateTime(endValue);

  if (!start || !end) return null;

  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    const day = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(start);
    const startTime = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(start);
    const endTime = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(end);
    return `${day} ${startTime}-${endTime}`;
  }

  const formatDay = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
  return `${formatDay.format(start)} - ${formatDay.format(end)}`;
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

const isRegistrationClosed = (value?: string) => {
  const deadline = parseDateTime(value);
  return Boolean(deadline && deadline < new Date());
};

export const SearchPage: React.FC = () => {
  const [camps, setCamps] = useState<Camp[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [ageFilter, setAgeFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [bounds, setBounds] = useState<{ minLat: number; maxLat: number; minLng: number; maxLng: number } | null>(null);

  useEffect(() => {
    const fetchCamps = async () => {
      const params = new URLSearchParams();
      if (ageFilter) params.set('age', ageFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (viewMode === 'map' && bounds) {
        params.set('minLat', String(bounds.minLat));
        params.set('maxLat', String(bounds.maxLat));
        params.set('minLng', String(bounds.minLng));
        params.set('maxLng', String(bounds.maxLng));
      }

      try {
        const res = await fetch(`/api/camps?${params.toString()}`);
        const data = await res.json();
        setCamps(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error fetching camps:', error);
        setCamps([]);
      }
    };

    fetchCamps();
  }, [ageFilter, typeFilter, bounds, viewMode]);

  const typeOptions = useMemo(() => {
    const fallback = ['Sport', 'Lager', 'Kreativ', 'Bildung', 'Natur'];
    const fromCamps = Array.from(new Set(camps.map((camp) => camp.type).filter(Boolean)));
    return Array.from(new Set([...fallback, ...fromCamps]));
  }, [camps]);

  return (
    <div className="search-page">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">Ferien, Vereine, Orte</span>
          <h1>Ferienfreizeiten in Westsachsen finden.</h1>
          <p>
            Angebote von Jugendvereinen und Trägern mit klaren Terminen, Altersangaben und Teilnahmebeiträgen.
          </p>
        </div>
        <div className="hero-stats" aria-label="Überblick">
          <div>
            <strong>{camps.length}</strong>
            <span>sichtbare Angebote</span>
          </div>
          <div>
            <strong>{typeOptions.length}</strong>
            <span>Kategorien</span>
          </div>
        </div>
      </section>

      <section className="filter-panel" aria-label="Suchfilter">
        <div className="filter-title">
          <Filter size={20} />
          <span>Filter</span>
        </div>

        <label className="field">
          <span>Alter</span>
          <div className="input-with-icon">
            <UsersRound size={18} />
            <input
              id="age-filter"
              type="number"
              value={ageFilter}
              onChange={(event) => setAgeFilter(event.target.value)}
              placeholder="z.B. 12"
              min="0"
            />
          </div>
        </label>

        <label className="field">
          <span>Kategorie</span>
          <div className="input-with-icon">
            <Tag size={18} />
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">Alle Kategorien</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </label>

        <div className="segmented-control" role="group" aria-label="Darstellung wählen">
          <button
            type="button"
            className={viewMode === 'list' ? 'is-active' : ''}
            onClick={() => {
              setViewMode('list');
              setBounds(null);
            }}
            aria-pressed={viewMode === 'list'}
          >
            <List size={18} />
            Liste
          </button>
          <button
            type="button"
            className={viewMode === 'map' ? 'is-active' : ''}
            onClick={() => setViewMode('map')}
            aria-pressed={viewMode === 'map'}
          >
            <Map size={18} />
            Karte
          </button>
        </div>
      </section>

      {viewMode === 'list' ? (
        <section aria-label="Ergebnisliste">
          {camps.length === 0 ? (
            <div className="empty-state">
              <Search size={36} />
              <h2>Keine passenden Freizeiten gefunden</h2>
              <p>Ändere Alter oder Kategorie, um mehr Angebote zu sehen.</p>
            </div>
          ) : (
            <motion.ul
              className="camp-grid"
              initial="hidden"
              animate="show"
              variants={{
                hidden: { opacity: 0 },
                show: { opacity: 1, transition: { staggerChildren: 0.07 } },
              }}
            >
              {camps.map((camp) => (
                <motion.li
                  variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                  key={camp.id}
                  className="camp-card"
                  whileHover={{ y: -4, transition: { duration: 0.18 } }}
                >
                  <Link className="camp-card-link" to={`/freizeiten/${camp.id}`}>
                    <div className="camp-media">
                      {camp.images?.length ? (
                        <img src={camp.images[0]} alt="" />
                      ) : (
                        <div className="camp-media-fallback">
                          <MapPin size={30} />
                        </div>
                      )}
                      <span className="camp-type">{camp.type}</span>
                    </div>
                    <div className="camp-body">
                      <div>
                        <h2>{camp.title}</h2>
                        <p className="provider">{camp.club_name}</p>
                      </div>
                      <div className="camp-meta">
                        <span>
                          <UsersRound size={16} />
                          {camp.min_age}-{camp.max_age} Jahre
                        </span>
                        <span>
                          <MapPin size={16} />
                          {camp.location_text || 'Ort offen'}
                        </span>
                        {formatDateRange(camp.starts_at, camp.ends_at) && (
                          <span>
                            <CalendarDays size={16} />
                            {formatDateRange(camp.starts_at, camp.ends_at)}
                          </span>
                        )}
                      </div>
                      <p className="camp-description">{camp.description}</p>
                      <div className="camp-footer">
                        <span>
                          <Euro size={16} />
                          {formatPrice(camp.price_eur)}
                        </span>
                        {isRegistrationClosed(camp.registration_deadline) && <span className="is-warning">Anmeldeschluss vorbei</span>}
                      </div>
                    </div>
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </section>
      ) : (
        <section aria-label="Kartenansicht" className="map-panel">
          <MapContainer center={[50.7189, 12.4944]} zoom={9} className="leaflet-map" aria-label="Interaktive Karte der Ferienfreizeiten">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapBoundsEvents onBoundsChange={setBounds} />
            {camps.filter((camp) => camp.location_lat && camp.location_lng).map((camp) => (
              <Marker key={camp.id} position={[camp.location_lat, camp.location_lng]}>
                <Popup>
                  <strong>{camp.title}</strong>
                  <br />
                  {camp.club_name}
                  <br />
                  {camp.location_text && (
                    <>
                      {camp.location_text}
                      <br />
                    </>
                  )}
                  {camp.min_age}-{camp.max_age} Jahre
                  <br />
                  <Link to={`/freizeiten/${camp.id}`}>Details ansehen</Link>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </section>
      )}
    </div>
  );
};
