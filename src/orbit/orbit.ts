/**
 * Orbit propagation for the console: two-body motion with J2 secular drift of the node
 * and perigee, rotated into the Earth-fixed frame, so satellites sit where a real
 * constellation with these elements would be at this instant — ground tracks, eclipses,
 * beta angle and station passes all follow from the same numbers.
 *
 * Accuracy: this is not SGP4 (no drag, no higher-order terms). Position error grows to
 * kilometres over days, which is invisible on a globe. Swap `propagate` for satellite.js
 * when real TLEs are available; every caller goes through it.
 */

const MU = 3.986004418e14;       // m³/s²
const RE = 6378137;              // WGS-84 equatorial radius, m
const J2 = 1.08263e-3;
const F = 1 / 298.257223563;     // WGS-84 flattening
const E2 = F * (2 - F);
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Epoch of the element sets; `mean_anomaly` and RAAN are given at this instant. */
export const ELEMENT_EPOCH_MS = Date.UTC(2026, 0, 1, 0, 0, 0);

export interface Elements {
  a: number;        // semi-major axis, m
  e: number;
  inc: number;      // rad
  raan: number;     // rad at epoch
  argp: number;     // rad at epoch
  m0: number;       // mean anomaly at epoch, rad
}

export interface State {
  lat: number; lon: number; altKm: number;       // geodetic, degrees / km
  speedKms: number;
  trueAnomalyDeg: number;
  eci: [number, number, number];                 // m
  ecef: [number, number, number];                // m
  velEci: [number, number, number];              // m/s
  orbitNumber: number;
}

export const meanMotion = (a: number) => Math.sqrt(MU / (a * a * a));
export const periodMinutes = (a: number) => (2 * Math.PI) / meanMotion(a) / 60;

export function elementsFrom(p: { altitude_km: number; eccentricity: number; inclination_deg: number; raan_deg: number; arg_of_perigee_deg: number; mean_anomaly_deg: number }): Elements {
  return {
    a: RE + p.altitude_km * 1000, e: p.eccentricity, inc: p.inclination_deg * D2R,
    raan: p.raan_deg * D2R, argp: p.arg_of_perigee_deg * D2R, m0: p.mean_anomaly_deg * D2R,
  };
}

/** Greenwich mean sidereal time, radians. */
export function gmst(ms: number): number {
  const d = ms / 86400000 + 2440587.5 - 2451545.0; // days since J2000
  const t = d / 36525;
  const deg = 280.46061837 + 360.98564736629 * d + 0.000387933 * t * t;
  return (((deg % 360) + 360) % 360) * D2R;
}

function solveKepler(m: number, e: number): number {
  let E = m + e * Math.sin(m);
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
  return E;
}

export function propagate(el: Elements, ms: number): State {
  const dt = (ms - ELEMENT_EPOCH_MS) / 1000;
  const n = meanMotion(el.a);
  const p = el.a * (1 - el.e * el.e);
  const k = 1.5 * J2 * (RE / p) ** 2 * n;
  const raan = el.raan - k * Math.cos(el.inc) * dt;
  const argp = el.argp + 0.5 * k * (5 * Math.cos(el.inc) ** 2 - 1) * dt;
  const mAll = el.m0 + n * dt;
  const m = ((mAll % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  const E = solveKepler(m, el.e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2), Math.sqrt(1 - el.e) * Math.cos(E / 2));
  const r = el.a * (1 - el.e * Math.cos(E));
  const xp = r * Math.cos(nu), yp = r * Math.sin(nu);
  const vf = Math.sqrt(MU / p);
  const vxp = -vf * Math.sin(nu), vyp = vf * (el.e + Math.cos(nu));

  const cO = Math.cos(raan), sO = Math.sin(raan), ci = Math.cos(el.inc), si = Math.sin(el.inc), cw = Math.cos(argp), sw = Math.sin(argp);
  const rot = (x: number, y: number): [number, number, number] => [
    (cO * cw - sO * sw * ci) * x + (-cO * sw - sO * cw * ci) * y,
    (sO * cw + cO * sw * ci) * x + (-sO * sw + cO * cw * ci) * y,
    sw * si * x + cw * si * y,
  ];
  const eci = rot(xp, yp), velEci = rot(vxp, vyp);
  return stateFromEci(eci, velEci, ms, Math.floor(mAll / (2 * Math.PI)), ((nu * R2D) + 360) % 360);
}

/** Earth-fixed position, geodetic latitude/longitude/altitude and speed of an inertial state (m, m/s). Shared with the SGP4 propagator. */
export function stateFromEci(eci: [number, number, number], velEci: [number, number, number], ms: number, orbitNumber: number, trueAnomalyDeg: number): State {
  const g = gmst(ms), cg = Math.cos(g), sg = Math.sin(g);
  const ecef: [number, number, number] = [cg * eci[0] + sg * eci[1], -sg * eci[0] + cg * eci[1], eci[2]];

  // Geodetic latitude/altitude (Bowring iteration).
  const lon = Math.atan2(ecef[1], ecef[0]);
  const rho = Math.hypot(ecef[0], ecef[1]);
  let lat = Math.atan2(ecef[2], rho * (1 - E2));
  let h = 0;
  for (let i = 0; i < 4; i++) {
    const N = RE / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
    h = rho / Math.cos(lat) - N;
    lat = Math.atan2(ecef[2], rho * (1 - (E2 * N) / (N + h)));
  }

  return {
    lat: lat * R2D, lon: lon * R2D, altKm: h / 1000,
    speedKms: Math.hypot(...velEci) / 1000, trueAnomalyDeg,
    eci, ecef, velEci, orbitNumber,
  };
}

/** Unit vector from Earth to the Sun in the inertial frame (low-precision, ~0.01°). */
export function sunEci(ms: number): [number, number, number] {
  const d = ms / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.460 + 0.9856474 * d) * D2R;
  const g = (357.528 + 0.9856003 * d) * D2R;
  const lam = L + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;
  const eps = (23.439 - 0.0000004 * d) * D2R;
  return [Math.cos(lam), Math.cos(eps) * Math.sin(lam), Math.sin(eps) * Math.sin(lam)];
}

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Cylindrical-shadow eclipse test. */
export function isSunlit(s: State, ms: number): boolean {
  const sun = sunEci(ms);
  const along = dot(s.eci, sun);
  if (along > 0) return true;
  const perp = Math.sqrt(Math.max(0, dot(s.eci, s.eci) - along * along));
  return perp > RE;
}

/** Angle between the orbit plane and the Sun direction, degrees. */
export function betaAngleDeg(s: State, ms: number): number {
  const r = s.eci, v = s.velEci;
  const h = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]];
  const hm = Math.hypot(h[0], h[1], h[2]);
  return Math.asin(dot(h, sunEci(ms)) / hm) * R2D;
}

export interface Station { lat: number; lon: number }

/** Azimuth / elevation / range from a station to a satellite (spherical-Earth ENU, adequate for visibility). */
export function lookAngles(s: State, st: Station) {
  const la = st.lat * D2R, lo = st.lon * D2R;
  const N = RE / Math.sqrt(1 - E2 * Math.sin(la) ** 2);
  const gx = N * Math.cos(la) * Math.cos(lo), gy = N * Math.cos(la) * Math.sin(lo), gz = N * (1 - E2) * Math.sin(la);
  const d = [s.ecef[0] - gx, s.ecef[1] - gy, s.ecef[2] - gz];
  const e = -Math.sin(lo) * d[0] + Math.cos(lo) * d[1];
  const nn = -Math.sin(la) * Math.cos(lo) * d[0] - Math.sin(la) * Math.sin(lo) * d[1] + Math.cos(la) * d[2];
  const u = Math.cos(la) * Math.cos(lo) * d[0] + Math.cos(la) * Math.sin(lo) * d[1] + Math.sin(la) * d[2];
  const range = Math.hypot(d[0], d[1], d[2]);
  return { elevationDeg: Math.asin(u / range) * R2D, azimuthDeg: ((Math.atan2(e, nn) * R2D) + 360) % 360, rangeKm: range / 1000 };
}

export interface Pass { aos: number; los: number; maxElevationDeg: number }

/** Passes over a station in [fromMs, fromMs + horizonMs], found by stepping and refining the edges. */
export function passes(el: Elements, st: Station, fromMs: number, horizonMs: number, minElDeg = 5, stepMs = 30_000): Pass[] {
  return passesOf((t) => propagate(el, t), st, fromMs, horizonMs, minElDeg, stepMs);
}

/** Same as `passes`, for any propagator (the SGP4 one in sgp4.ts when a TLE has been ingested). */
export function passesOf(stateAt: (ms: number) => State, st: Station, fromMs: number, horizonMs: number, minElDeg = 5, stepMs = 30_000): Pass[] {
  const out: Pass[] = [];
  let cur: Pass | null = null;
  for (let t = fromMs; t <= fromMs + horizonMs; t += stepMs) {
    const elv = lookAngles(stateAt(t), st).elevationDeg;
    if (elv >= minElDeg) {
      if (!cur) cur = { aos: t, los: t, maxElevationDeg: elv };
      cur.los = t;
      cur.maxElevationDeg = Math.max(cur.maxElevationDeg, elv);
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Sub-satellite points for the next `minutes`, as [lat, lon] pairs. */
export function groundTrack(el: Elements, fromMs: number, minutes: number, points = 90): [number, number][] {
  return Array.from({ length: points + 1 }, (_, i) => {
    const s = propagate(el, fromMs + (i / points) * minutes * 60_000);
    return [s.lat, s.lon] as [number, number];
  });
}
