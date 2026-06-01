import React from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { Camp } from '../pages/SearchPage';

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

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
  return (
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
              <Link to={`/freizeiten/${camp.id}`} className="map-popup-link">
                Details ansehen
              </Link>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </section>
  );
};
