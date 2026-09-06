import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import '../utils/leafletIcons';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet


interface MapPickerProps {
  lat?: number;
  lng?: number;
  onChange: (lat: number, lng: number) => void;
}

const LocationMarker = ({ lat, lng, onChange }: MapPickerProps) => {
  const map = useMap();

  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });

  useEffect(() => {
    if (lat != null && lng != null) {
      map.setView([lat, lng], map.getZoom());
    }
  }, [lat, lng, map]);

  return lat != null && lng != null ? (
    <Marker position={[lat, lng]} />
  ) : null;
};

export const MapPicker: React.FC<MapPickerProps> = ({ lat, lng, onChange }) => {
  const center: [number, number] = lat != null && lng != null ? [lat, lng] : [50.719, 12.492]; // Default Zwickau/Westsachsen area

  return (
    <div className="map-picker">
      <MapContainer center={center} zoom={lat != null && lng != null ? 13 : 9} className="leaflet-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker lat={lat} lng={lng} onChange={onChange} />
      </MapContainer>
      <p>Klicke in die Karte, um die Position festzulegen.</p>
    </div>
  );
};
