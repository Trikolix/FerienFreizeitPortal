import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix leafet icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface Camp {
  id: number;
  title: string;
  club_name: string;
  age_from: number;
  age_to: number;
  description: string;
  type: string;
  location_lat: number;
  location_lng: number;
}

export const SearchPage: React.FC = () => {
  const [camps, setCamps] = useState<Camp[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // Filters
  const [ageFilter, setAgeFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [bounds, setBounds] = useState<{ minLat: number, maxLat: number, minLng: number, maxLng: number } | null>(null);

  useEffect(() => {
    fetchCamps();
  }, [ageFilter, typeFilter, bounds]);

  const fetchCamps = async () => {
    let url = 'http://localhost:8000/api/camps?';
    if (ageFilter) url += `age=${ageFilter}&`;
    if (typeFilter) url += `type=${typeFilter}&`;

    if (viewMode === 'map' && bounds) {
      url += `minLat=${bounds.minLat}&maxLat=${bounds.maxLat}&minLng=${bounds.minLng}&maxLng=${bounds.maxLng}&`;
    }

    try {
      const res = await fetch(url);
      const data = await res.json();
      setCamps(data);
    } catch (error) {
      console.error('Error fetching camps:', error);
    }
  };

  const MapEvents = () => {
    const map = useMapEvents({
      moveend: () => {
        const b = map.getBounds();
        setBounds({
          minLat: b.getSouth(),
          maxLat: b.getNorth(),
          minLng: b.getWest(),
          maxLng: b.getEast(),
        });
      }
    });
    return null;
  };

  useEffect(() => {
    if (viewMode === 'list') {
      setBounds(null); // Clear map bounds when switching to list view
    }
  }, [viewMode]);

  return (
    <div>
      <h1>Ferienfreizeiten in Westsachsen</h1>

      <section aria-label="Suchfilter" style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div>
            <label htmlFor="age-filter">Alter (Jahre): </label>
            <input
              id="age-filter"
              type="number"
              value={ageFilter}
              onChange={(e) => setAgeFilter(e.target.value)}
              placeholder="z.B. 12"
            />
          </div>
          <div>
            <label htmlFor="type-filter">Art der Freizeit: </label>
            <select id="type-filter" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">Alle</option>
              <option value="Sport">Sport</option>
              <option value="Lager">Lager</option>
              <option value="Kreativ">Kreativ</option>
            </select>
          </div>
          <div>
             <button onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'}>Listenansicht</button>
             <button onClick={() => setViewMode('map')} aria-pressed={viewMode === 'map'}>Kartenansicht</button>
          </div>
        </div>
      </section>

      {viewMode === 'list' ? (
        <section aria-label="Ergebnisliste">
          {camps.length === 0 ? (
            <p>Keine Freizeiten gefunden.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {camps.map(camp => (
                <li key={camp.id} style={{ border: '1px solid var(--border-color)', margin: '1rem 0', padding: '1rem' }}>
                  <h2>{camp.title}</h2>
                  <p><strong>Anbieter:</strong> {camp.club_name}</p>
                  <p><strong>Alter:</strong> {camp.age_from} bis {camp.age_to} Jahre</p>
                  <p><strong>Art:</strong> {camp.type}</p>
                  <p>{camp.description}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section aria-label="Kartenansicht" style={{ height: '500px', width: '100%' }}>
          <MapContainer center={[50.7189, 12.4944]} zoom={10} style={{ height: '100%', width: '100%' }} aria-label="Interaktive Karte der Ferienfreizeiten">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapEvents />
            {camps.filter(c => c.location_lat && c.location_lng).map(camp => (
              <Marker key={camp.id} position={[camp.location_lat, camp.location_lng]}>
                <Popup>
                  <strong>{camp.title}</strong><br/>
                  {camp.club_name}<br/>
                  {camp.age_from} - {camp.age_to} Jahre
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </section>
      )}
    </div>
  );
};
