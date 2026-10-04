import React, { useMemo } from 'react';

/**
 * A light-weight orthographic "dotted Earth" in SVG: land as brighter dots, ocean as faint
 * ones, with ground tracks, stations and satellites on top. Used where the full Cesium globe
 * would be too heavy (sign-in, dashboard cards). Positions are in degrees.
 */
export interface GlobeSat { id: string; lat: number; lon: number; color: string; label?: boolean; selected?: boolean }
export interface GlobeStation { id: string; name: string; lat: number; lon: number }
export interface GlobeTrack { points: { lat: number; lon: number }[]; color: string; dashed?: boolean; width?: number; opacity?: number }

const LAND: [number, number, number, number][] = [
  [52, 95, 16, 45], [35, 105, 12, 18], [21, 79, 11, 8], [25, 47, 9, 9], [33, 55, 6, 10], [20, 12, 12, 22],
  [-3, 22, 16, 13], [-22, 25, 9, 9], [50, 18, 9, 22], [14, 102, 8, 6], [-3, 114, 4, 13], [-25, 134, 10, 17],
  [37, 138, 6, 3], [-19, 47, 5, 2], [65, 60, 8, 40], [7.5, 81, 2, 1.5], [45, -100, 14, 25], [60, -110, 10, 30],
  [20, -100, 8, 8], [-10, -55, 18, 14], [-35, -65, 10, 6], [72, -40, 8, 14],
];
const isLand = (lat: number, lon: number) =>
  LAND.some(([a, b, ra, rb]) => {
    let d = lon - b; if (d > 180) d -= 360; if (d < -180) d += 360;
    return ((lat - a) / ra) ** 2 + (d / rb) ** 2 <= 1;
  });
const rad = (d: number) => (d * Math.PI) / 180;

export const DottedGlobe: React.FC<{
  centerLat?: number; centerLon?: number; size?: number;
  sats?: GlobeSat[]; stations?: GlobeStation[]; tracks?: GlobeTrack[];
  footprint?: { lat: number; lon: number; radiusDeg: number };
  onSelect?: (id: string) => void; className?: string; label?: string;
}> = ({ centerLat = 15, centerLon = 78, size = 520, sats = [], stations = [], tracks = [], footprint, onSelect, className, label }) => {
  const R = size * 0.44, cx = size / 2, cy = size / 2;
  const lat0 = rad(centerLat);
  const proj = (lat: number, lon: number) => {
    const la = rad(lat), dl = rad(lon - centerLon);
    const cosc = Math.sin(lat0) * Math.sin(la) + Math.cos(lat0) * Math.cos(la) * Math.cos(dl);
    return { v: cosc > 0, z: cosc, x: cx + R * Math.cos(la) * Math.sin(dl), y: cy - R * (Math.cos(lat0) * Math.sin(la) - Math.sin(lat0) * Math.cos(la) * Math.cos(dl)) };
  };

  const dots = useMemo(() => {
    const out: { x: number; y: number; r: number; c: string }[] = [];
    const step = 4.2;
    for (let lat = -80; lat <= 80; lat += step) {
      const lonStep = step / Math.max(0.2, Math.cos(rad(lat)));
      for (let lon = -180; lon < 180; lon += lonStep) {
        const p = proj(lat, lon); if (!p.v) continue;
        const L = isLand(lat, lon);
        out.push({ x: p.x, y: p.y, r: L ? size / 240 : size / 520, c: L ? `rgba(170,190,220,${(0.35 + 0.5 * p.z).toFixed(2)})` : `rgba(90,110,140,${(0.05 + 0.12 * p.z).toFixed(2)})` });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerLat, centerLon, size]);

  const path = (pts: { lat: number; lon: number }[]) => {
    let d = '', pen = false;
    for (const q of pts) { const p = proj(q.lat, q.lon); if (p.v) { d += `${pen ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)} `; pen = true; } else pen = false; }
    return d;
  };
  const fp = footprint && proj(footprint.lat, footprint.lon);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" className={className} role="img" aria-label={label ?? 'Earth with satellites and ground stations'}>
      <defs>
        <radialGradient id="dg-sphere" cx="50%" cy="45%" r="55%"><stop offset="0%" stopColor="#131925" /><stop offset="100%" stopColor="#0B0E14" /></radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={R} fill="url(#dg-sphere)" />
      {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.c} />)}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#1F2633" />
      {tracks.map((t, i) => (
        <path key={i} d={path(t.points)} fill="none" stroke={t.color} strokeOpacity={t.opacity ?? 1} strokeWidth={t.width ?? 1.6} strokeDasharray={t.dashed ? '3 4' : undefined} />
      ))}
      {fp?.v && <circle cx={fp.x} cy={fp.y} r={R * Math.sin(rad(footprint!.radiusDeg))} fill="#6CB8FF" fillOpacity={0.06} stroke="#6CB8FF" strokeOpacity={0.35} />}
      {stations.map((s) => { const p = proj(s.lat, s.lon); return p.v && (
        <g key={s.id}>
          <rect x={p.x - 4} y={p.y - 4} width="8" height="8" rx="2" fill="#F28C28" />
          <text x={p.x + 8} y={p.y + 4} fill="#C9CED6" fontSize={11}>{s.name}</text>
        </g>
      ); })}
      {sats.map((s) => { const p = proj(s.lat, s.lon); return p.v && (
        <g key={s.id} onClick={onSelect ? () => onSelect(s.id) : undefined} style={onSelect ? { cursor: 'pointer' } : undefined}>
          {/* Same marks as the 3D view: dark rim, selected = larger with a kesari ring. */}
          <circle cx={p.x} cy={p.y} r={s.selected ? 4.5 : 3} fill={s.color} stroke={s.selected ? '#F28C28' : '#090B10'} strokeWidth={s.selected ? 2 : 1} />
          {s.label && <text x={p.x + 9} y={p.y - 6} fill={s.selected ? '#FFFFFF' : '#C9CED6'} fontSize={11} fontFamily="Geist Mono, monospace">{s.id}</text>}
        </g>
      ); })}
    </svg>
  );
};
