import React, { useEffect, useRef, useState } from 'react';
import { FLEET, STATIONS } from '../../data/fleet';
import { satElements } from '../../orbit/fleetOrbit';
import { gmst, isSunlit, lookAngles, propagate, sunEci } from '../../orbit/orbit';
import { useTheme } from '../../lib/theme';

const PLANE: Record<string, string> = { 'Plane A': '#5B8DEF', 'Plane B': '#A78BFA', 'Plane C': '#22D3EE', 'Plane D': '#F472B6' };
const D2R = Math.PI / 180;
const ELEMENTS = FLEET.map((s) => ({ id: s.sat_id, plane: s.constellation_group, el: satElements(s) }));

export interface ConstellationStats { total: number; inContact: number; inEclipse: number }

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/**
 * The fleet drawn from the real orbit model: every dot is where that satellite is right now
 * (orthographic view, refreshed once a second). No decoration moves; only positions change.
 */
export const LiveConstellation: React.FC<{ size?: number; onStats?: (s: ConstellationStats) => void }> = ({ size = 460, onStats }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  const [, setTick] = useState(0);

  useEffect(() => {
    const draw = () => {
      const canvas = ref.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = size * dpr; canvas.height = size * dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      const now = Date.now();
      const R = size * 0.36, cx = size / 2, cy = size / 2;
      const lat0 = 22 * D2R;
      const sun = sunEci(now);
      // Sub-solar point in Earth-fixed longitude, so the lit side of the globe is where the Sun really is.
      const sunLon = Math.atan2(sun[1], sun[0]) - gmst(now), sunLat = Math.asin(sun[2]);
      const lon0 = (sunLon * 180 / Math.PI + 70) * D2R; // centre the view a little east of noon

      const project = (lat: number, lon: number, alt = 0) => {
        const φ = lat * D2R, λ = lon * D2R - lon0;
        const r = 1 + alt / 6371;
        const x = Math.cos(φ) * Math.sin(λ);
        const y = Math.cos(lat0) * Math.sin(φ) - Math.sin(lat0) * Math.cos(φ) * Math.cos(λ);
        const z = Math.sin(lat0) * Math.sin(φ) + Math.cos(lat0) * Math.cos(φ) * Math.cos(λ);
        return { x: cx + R * r * x, y: cy - R * r * y, front: z > 0 || (r > 1 && x * x + y * y > 1) };
      };

      // Globe body with light from the sub-solar side.
      const sp = project(sunLat / D2R, sunLon * 180 / Math.PI);
      const body = ctx.createRadialGradient(cx + (sp.x - cx) * 0.55, cy + (sp.y - cy) * 0.55, R * 0.1, cx, cy, R * 1.05);
      body.addColorStop(0, css('--neutral-500') || '#2B303B');
      body.addColorStop(1, css('--neutral-900') || '#0C0D10');
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = body; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = css('--neutral-500') || '#2B303B'; ctx.stroke();

      // Graticule every 30°.
      ctx.strokeStyle = css('--neutral-500') || '#2B303B'; ctx.globalAlpha = 0.9; ctx.lineWidth = 0.7;
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath(); let pen = false;
        for (let lon = -180; lon <= 180; lon += 4) { const p = project(lat, lon); if (p.front) { pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; } else pen = false; }
        ctx.stroke();
      }
      for (let lon = -180; lon < 180; lon += 30) {
        ctx.beginPath(); let pen = false;
        for (let lat = -90; lat <= 90; lat += 4) { const p = project(lat, lon); if (p.front) { pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; } else pen = false; }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Ground stations.
      const states = ELEMENTS.map((e) => ({ ...e, st: propagate(e.el, now) }));
      let inContact = 0, inEclipse = 0;
      states.forEach((s) => { if (!isSunlit(s.st, now)) inEclipse++; if (STATIONS.some((gs) => lookAngles(s.st, gs).elevationDeg > 10)) inContact++; });
      ctx.fillStyle = '#FACC15';
      STATIONS.forEach((gs) => {
        const p = project(gs.lat, gs.lon);
        if (!p.front) return;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4); ctx.fillRect(-2.6, -2.6, 5.2, 5.2); ctx.restore();
      });

      // Satellites, with the next ten minutes of ground track behind the dot.
      states.forEach((s) => {
        const color = PLANE[s.plane] ?? '#94A3B8';
        ctx.strokeStyle = color; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.beginPath(); let pen = false;
        for (let k = 0; k <= 10; k++) {
          const t = propagate(s.el, now + k * 60_000);
          const p = project(t.lat, t.lon, t.altKm);
          if (p.front) { pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; } else pen = false;
        }
        ctx.stroke(); ctx.globalAlpha = 1;
        const p = project(s.st.lat, s.st.lon, s.st.altKm);
        if (!p.front) return;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      });

      onStats?.({ total: states.length, inContact, inEclipse });
    };

    draw();
    const t = window.setInterval(() => { draw(); setTick((n) => n + 1); }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, theme]);

  return <canvas ref={ref} style={{ width: size, height: size }} role="img" aria-label="Live positions of the constellation" />;
};
