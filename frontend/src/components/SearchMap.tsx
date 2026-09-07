import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import '../utils/leafletIcons';
import type { Camp } from '../pages/SearchPage';
import { availabilityLabel } from '../utils/placeRequests';



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

interface SearchMapProps {
  camps: Camp[];
  setBounds: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null) => void;
}

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(date);
};

export const SearchMap: React.FC<SearchMapProps> = ({ camps, setBounds }) => {
  const location = useLocation();
  return (
    <section aria-label="Kartenansicht" className="map-panel">
      <MapContainer center={[50.7189, 12.4944]} zoom={9} className="leaflet-map" aria-label="Interaktive Karte der Ferienfreizeiten">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapBoundsEvents onBoundsChange={setBounds} />
        {camps.filter((camp) => camp.location_lat != null && camp.location_lng != null).map((camp) => (
          <Marker key={camp.id} position={[camp.location_lat, camp.location_lng]} title={camp.title} alt={`Freizeit: ${camp.title}`}>
            <Popup>
              <strong className="map-popup-title">{camp.title}</strong>
              <span className="map-popup-line">{camp.club_name}</span>
              {camp.starts_at && camp.ends_at && (
                <span className="map-popup-meta">
                  {formatDate(camp.starts_at)} - {formatDate(camp.ends_at)}
                </span>
              )}
              {camp.location_text && (
                <span className="map-popup-line">
                  {camp.location_text}
                </span>
              )}
              <span className="map-popup-line">{camp.min_age}-{camp.max_age} Jahre</span>
              {availabilityLabel(camp) && <span className="map-popup-line"><strong>{availabilityLabel(camp)}</strong></span>}
              <Link to={`/freizeiten/${camp.id}`} state={{ search: location.search.replace(/^\?/, '') }} className="map-popup-link">
                Details ansehen
              </Link>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </section>
  );
};
