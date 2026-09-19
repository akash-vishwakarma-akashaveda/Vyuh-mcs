import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Satellite } from '../../types';

// Fix Leaflet icon URLs in React environment
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface OrbitalMapProps {
  satellites: Satellite[];
  onSelectSat?: (satId: string) => void;
}

export const OrbitalMap: React.FC<OrbitalMapProps> = ({ satellites, onSelectSat }) => {
  const defaultCenter: [number, number] = [15, 0];

  return (
    <div className="w-full h-full min-h-[360px] rounded-lg overflow-hidden border border-[var(--color-border)] relative">
      <MapContainer
        center={defaultCenter}
        zoom={2}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%', background: 'var(--color-bg-canvas)' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {satellites.slice(0, 20).map((sat) => {
          const isCritical = sat.health_state === 'CRITICAL';
          const isWarning = sat.health_state === 'WARNING';

          const customIcon = L.divIcon({
            className: 'custom-sat-marker',
            html: `<div style="
              width: 12px;
              height: 12px;
              border-radius: 50%;
              background: ${isCritical ? 'var(--danger-text)' : isWarning ? 'var(--warning)' : 'var(--success)'};
              border: 2px solid var(--color-bg-canvas);
              box-shadow: 0 0 8px ${isCritical ? 'var(--danger)' : isWarning ? 'var(--warning)' : 'var(--action-primary)'};
            "></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          });

          return (
            <Marker
              key={sat.sat_id}
              position={[sat.latitude, sat.longitude]}
              icon={customIcon}
              eventHandlers={{
                click: () => onSelectSat && onSelectSat(sat.sat_id),
              }}
            >
              <Popup className="custom-popup font-mono-code text-xs">
                <div className="p-1 flex flex-col gap-1 text-[var(--color-bg-canvas)]">
                  <span className="font-bold">{sat.sat_id} ({sat.name})</span>
                  <span>Orbit: {sat.altitude_km} km</span>
                  <span>Health: {sat.health_state}</span>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};
