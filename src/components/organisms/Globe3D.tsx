import React, { useEffect, useRef, useState } from 'react';
import Globe from 'globe.gl';
import { Satellite } from '../../types';

interface Globe3DProps {
  satellites: Satellite[];
  onSelectSat?: (satId: string) => void;
}

export const Globe3D: React.FC<Globe3DProps> = ({ satellites, onSelectSat }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeInstance = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Ground Station locations
    const groundStations = [
      { name: 'KSAT-Svalbard', lat: 78.22, lng: 15.65, color: '#0F6E56' },
      { name: 'SGS-Chile', lat: -33.45, lng: -70.66, color: '#0F6E56' },
      { name: 'SANSA-Hartebeeshoek', lat: -25.88, lng: 27.7, color: '#0F6E56' },
    ];

    // Format satellite data points for 3D Globe
    const satPoints = satellites.map((s) => ({
      satId: s.sat_id,
      name: s.name,
      lat: s.latitude,
      lng: s.longitude,
      alt: s.altitude_km / 3000, // Normalized altitude for 3D globe display
      health: s.health_state,
      color: s.health_state === 'CRITICAL' ? '#C62828' : s.health_state === 'WARNING' ? '#E8943A' : '#4CAF81',
      radius: s.health_state === 'CRITICAL' ? 0.8 : 0.5,
    }));

    // Create 3D arcs connecting satellites to active ground stations
    const arcsData = satellites.slice(0, 10).map((s, idx) => {
      const gs = groundStations[idx % groundStations.length];
      return {
        startLat: s.latitude,
        startLng: s.longitude,
        endLat: gs.lat,
        endLng: gs.lng,
        color: s.health_state === 'CRITICAL' ? ['#C62828', '#C62828'] : ['#0F6E56', '#4CAF81'],
      };
    });

    const globe = (Globe as any)()(containerRef.current)
      .globeImageUrl('//unpkg.com/three-globe/example/img/earth-dark.jpg')
      .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
      .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
      .showAtmosphere(true)
      .atmosphereColor('#0F6E56')
      .atmosphereAltitude(0.15)
      // Satellites 3D Points
      .pointsData(satPoints)
      .pointLat('lat')
      .pointLng('lng')
      .pointAltitude('alt')
      .pointColor('color')
      .pointRadius('radius')
      .pointLabel((d: any) => `
        <div style="
          background: var(--color-bg-surface);
          border: 1px solid var(--color-border);
          color: var(--color-text-primary);
          padding: 6px 10px;
          border-radius: 6px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
        ">
          <strong style="color: var(--action-primary);">${d.satId}</strong> (${d.name})<br/>
          Health: <span style="color: ${d.color};">${d.health}</span><br/>
          Lat/Lng: ${d.lat.toFixed(2)}°, ${d.lng.toFixed(2)}°
        </div>
      `)
      .onPointClick((d: any) => {
        if (onNavigateRef.current) onNavigateRef.current(d.satId);
      })
      // 3D Arcs (Downlink / Uplink RF paths)
      .arcsData(arcsData)
      .arcStartLat('startLat')
      .arcStartLng('startLng')
      .arcEndLat('endLat')
      .arcEndLng('endLng')
      .arcColor('color')
      .arcDashLength(0.4)
      .arcDashGap(0.2)
      .arcDashAnimateTime(1500)
      .arcStroke(1.2)
      // Ground Stations Rings
      .ringsData(groundStations)
      .ringLat('lat')
      .ringLng('lng')
      .ringColor(() => '#0F6E56')
      .ringMaxRadius(4)
      .ringPropagationSpeed(2)
      .ringRepeatPeriod(1000);

    // Initial Camera View Position
    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.5;
    globe.pointOfView({ lat: 15, lng: 20, altitude: 2.2 });

    globeInstance.current = globe;

    const handleResize = () => {
      if (containerRef.current && globeInstance.current) {
        globeInstance.current.width(containerRef.current.clientWidth);
        globeInstance.current.height(containerRef.current.clientHeight);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, []);

  const onNavigateRef = useRef(onSelectSat);
  onNavigateRef.current = onSelectSat;

  // Update satellite positions dynamically in real-time
  useEffect(() => {
    if (globeInstance.current && satellites.length > 0) {
      const satPoints = satellites.map((s) => ({
        satId: s.sat_id,
        name: s.name,
        lat: s.latitude,
        lng: s.longitude,
        alt: s.altitude_km / 3000,
        health: s.health_state,
        color: s.health_state === 'CRITICAL' ? '#C62828' : s.health_state === 'WARNING' ? '#E8943A' : '#4CAF81',
        radius: s.health_state === 'CRITICAL' ? 0.8 : 0.5,
      }));
      globeInstance.current.pointsData(satPoints);
    }
  }, [satellites]);

  return (
    <div className="w-full h-full min-h-[380px] rounded-lg overflow-hidden border border-[var(--color-border)] relative bg-[var(--color-bg-canvas)]">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-3 left-3 bg-[color-mix(in_srgb,var(--color-bg-surface)_80%,transparent)] backdrop-blur-md border border-[var(--color-border)] px-3 py-1.5 rounded text-[10px] font-mono-code text-[var(--color-text-secondary)] pointer-events-none flex items-center gap-3">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--success)]" /> NOMINAL</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--warning)]" /> WARNING</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--danger-text)]" /> CRITICAL</span>
        <span>• 3D WEBGL ENGINE ACTIVE</span>
      </div>
    </div>
  );
};
