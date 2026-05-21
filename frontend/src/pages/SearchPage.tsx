import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { motion } from 'framer-motion';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <h1 style={{ fontSize: '2.5rem', fontWeight: 700, margin: 0 }}>Entdecke Ferienfreizeiten in Westsachsen</h1>

      <section className="card" aria-label="Suchfilter" style={{ padding: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '200px' }}>
          <label htmlFor="age-filter" style={{ fontWeight: 500 }}>Alter (Jahre): </label>
          <input
            id="age-filter"
            type="number"
            value={ageFilter}
            onChange={(e) => setAgeFilter(e.target.value)}
            placeholder="z.B. 12"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '200px' }}>
          <label htmlFor="type-filter" style={{ fontWeight: 500 }}>Art der Freizeit: </label>
          <select id="type-filter" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Alle Kategorien</option>
            <option value="Sport">Sport</option>
            <option value="Lager">Lager</option>
            <option value="Kreativ">Kreativ</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
           <button
             onClick={() => setViewMode('list')}
             aria-pressed={viewMode === 'list'}
             style={{ backgroundColor: viewMode === 'list' ? 'var(--primary-color)' : 'var(--bg-color)', color: viewMode === 'list' ? '#fff' : 'var(--text-color)', border: '1px solid var(--border-color)' }}
           >
             Listenansicht
           </button>
           <button
             onClick={() => setViewMode('map')}
             aria-pressed={viewMode === 'map'}
             style={{ backgroundColor: viewMode === 'map' ? 'var(--primary-color)' : 'var(--bg-color)', color: viewMode === 'map' ? '#fff' : 'var(--text-color)', border: '1px solid var(--border-color)' }}
           >
             Kartenansicht
           </button>
        </div>
      </section>

      {viewMode === 'list' ? (
        <section aria-label="Ergebnisliste">
          {camps.length === 0 ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-color-muted)' }}>
              Keine passenden Freizeiten gefunden. Bitte passe deine Filter an.
            </div>
          ) : (
            <motion.ul
              initial="hidden"
              animate="show"
              variants={{
                hidden: { opacity: 0 },
                show: {
                  opacity: 1,
                  transition: { staggerChildren: 0.1 }
                }
              }}
              style={{ listStyle: 'none', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}
            >
              {camps.map(camp => (
                <motion.li
                  variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
                  key={camp.id}
                  className="card"
                  style={{ display: 'flex', flexDirection: 'column' }}
                  whileHover={{ y: -5, transition: { duration: 0.2 } }}
                >
                  {/* Image Placeholder if actual images were fetched we'd display them here */}
                  <div style={{ height: '150px', backgroundColor: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-color-muted)' }}>
                    Bilder-Vorschau
                  </div>
                  <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{camp.title}</h2>
                    <p style={{ margin: 0, color: 'var(--primary-color)', fontWeight: 500 }}>{camp.club_name}</p>
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem', color: 'var(--text-color-muted)' }}>
                      <span>👤 {camp.age_from} - {camp.age_to} Jahre</span>
                      <span>🏷️ {camp.type}</span>
                    </div>
                    <p style={{ margin: '1rem 0 0 0', flex: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{camp.description}</p>
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </section>
      ) : (
        <section aria-label="Kartenansicht" className="card" style={{ height: '600px', width: '100%', overflow: 'hidden' }}>
          <MapContainer center={[50.7189, 12.4944]} zoom={9} style={{ height: '100%', width: '100%' }} aria-label="Interaktive Karte der Ferienfreizeiten">
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
