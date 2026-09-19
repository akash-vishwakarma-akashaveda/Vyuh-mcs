/**
 * Space-object catalogue for the globe: debris, spent rocket bodies and defunct satellites, and
 * the close approaches ("conjunctions") between them and our satellites.
 *
 * DEMO DATA. There is no live catalogue feed (space-track / CelesTrak) behind this: the populations
 * are seeded random objects placed in the altitude and inclination bands where the real debris clouds
 * sit (Fengyun-1C, Iridium-Cosmos 2009, Cosmos 1408 ...), and three encounters are constructed on purpose
 * so the conjunction screening has something to find. The screening itself is real geometry.
 */
import { Elements, ELEMENT_EPOCH_MS, meanMotion, propagate } from './orbit';

const MU = 3.986004418e14;
const RE = 6378137;
const J2 = 1.08263e-3;

export type ObjectKind = 'DEBRIS' | 'ROCKET_BODY' | 'DEFUNCT';
export interface SpaceObject { id: string; name: string; group: string; kind: ObjectKind; el: Elements; designed?: boolean }

export interface SatRef { id: string; el: Elements }
export interface Conjunction {
  satId: string; objectId: string; objectName: string; kind: ObjectKind;
  tcaMs: number; missKm: number; relSpeedKms: number;
  risk: 'CRITICAL' | 'WARNING' | 'WATCH';
}

const D2R = Math.PI / 180;

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const GROUPS: { name: string; n: number; alt: [number, number]; inc: [number, number]; kind: ObjectKind; prefix: string }[] = [
  { name: 'Fengyun-1C debris', n: 90, alt: [780, 900], inc: [98.4, 98.9], kind: 'DEBRIS', prefix: 'FY1C DEB' },
  { name: 'Iridium-33 / Cosmos-2251 debris', n: 70, alt: [740, 830], inc: [73, 87], kind: 'DEBRIS', prefix: 'COSMOS 2251 DEB' },
  { name: 'Cosmos 1408 debris', n: 45, alt: [420, 530], inc: [82.3, 82.9], kind: 'DEBRIS', prefix: 'COSMOS 1408 DEB' },
  { name: 'Fragmentation cloud', n: 60, alt: [450, 660], inc: [50, 100], kind: 'DEBRIS', prefix: 'FRAG' },
  { name: 'Spent rocket bodies', n: 30, alt: [500, 800], inc: [96, 99], kind: 'ROCKET_BODY', prefix: 'R/B' },
  { name: 'Defunct satellites', n: 25, alt: [500, 700], inc: [94, 99], kind: 'DEFUNCT', prefix: 'INACTIVE SAT' },
];

/** Keplerian elements at the instant of a state vector (inertial frame), radians. */
function rv2el(r: number[], v: number[]) {
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const rm = Math.hypot(...r), vm = Math.hypot(...v);
  const h = cross(r, v), hm = Math.hypot(...h);
  const nvec = [-h[1], h[0], 0], nm = Math.hypot(nvec[0], nvec[1]);
  const c = vm * vm - MU / rm, rv = dot(r, v);
  const ev = [0, 1, 2].map((k) => (c * r[k] - rv * v[k]) / MU);
  const e = Math.hypot(...ev);
  const a = -MU / (vm * vm - (2 * MU) / rm);
  const inc = Math.acos(h[2] / hm);
  let raan = Math.acos(Math.max(-1, Math.min(1, nvec[0] / nm))); if (nvec[1] < 0) raan = 2 * Math.PI - raan;
  let argp = Math.acos(Math.max(-1, Math.min(1, dot(nvec, ev) / (nm * e)))); if (ev[2] < 0) argp = 2 * Math.PI - argp;
  let nu = Math.acos(Math.max(-1, Math.min(1, dot(ev, r) / (e * rm)))); if (rv < 0) nu = 2 * Math.PI - nu;
  const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
  return { a, e, inc, raan, argp, m: E - e * Math.sin(E) };
}

/** Element set whose propagated state equals `k` at time `tMs` (undoes the J2 drift accumulated since the epoch). */
function elementsAt(k: ReturnType<typeof rv2el>, tMs: number): Elements {
  const dt = (tMs - ELEMENT_EPOCH_MS) / 1000;
  const n = meanMotion(k.a);
  const p = k.a * (1 - k.e * k.e);
  const rate = 1.5 * J2 * (RE / p) ** 2 * n;
  return {
    a: k.a, e: k.e, inc: k.inc,
    raan: k.raan + rate * Math.cos(k.inc) * dt,
    argp: k.argp - 0.5 * rate * (5 * Math.cos(k.inc) ** 2 - 1) * dt,
    m0: k.m - n * dt,
  };
}

export function generateDebris(sats: SatRef[], nowMs: number): SpaceObject[] {
  const r = rng(20260918);
  const out: SpaceObject[] = [];
  let serial = 29000;
  for (const g of GROUPS) {
    for (let i = 0; i < g.n; i++) {
      const alt = g.alt[0] + r() * (g.alt[1] - g.alt[0]);
      const inc = g.inc[0] + r() * (g.inc[1] - g.inc[0]);
      serial += 1 + Math.floor(r() * 40);
      out.push({
        id: `${serial}`, name: `${g.prefix} ${serial}`, group: g.name, kind: g.kind,
        el: { a: RE + alt * 1000, e: 0.0005 + r() * 0.012, inc: inc * D2R, raan: r() * 2 * Math.PI, argp: r() * 2 * Math.PI, m0: r() * 2 * Math.PI },
      });
    }
  }

  // Three constructed encounters: a real close approach with one of our satellites at a known time.
  const targets = [
    { sat: 4, minutes: 75, miss: 2.4, cross: 78 },
    { sat: 11, minutes: 160, miss: 6.8, cross: 112 },
    { sat: 20, minutes: 215, miss: 14, cross: 95 },
  ];
  targets.forEach((t, k) => {
    const s = sats[t.sat % sats.length];
    if (!s) return;
    const T = nowMs + t.minutes * 60_000;
    const st = propagate(s.el, T);
    const rr = st.eci, vv = st.velEci;
    const rhat = rr.map((x) => x / Math.hypot(...rr));
    // Displace the debris by `miss` km perpendicular to the satellite's velocity, and swing its velocity by the crossing angle.
    const vhat = vv.map((x) => x / Math.hypot(...vv));
    const side = [rhat[1] * vhat[2] - rhat[2] * vhat[1], rhat[2] * vhat[0] - rhat[0] * vhat[2], rhat[0] * vhat[1] - rhat[1] * vhat[0]];
    const pos = rr.map((x, i) => x + side[i] * t.miss * 1000);
    const ang = t.cross * D2R;
    const vrot = vv.map((_, i) => vv[i] * Math.cos(ang) + side[i] * Math.hypot(...vv) * Math.sin(ang));
    const el = elementsAt(rv2el(pos, vrot), T);
    serial += 7;
    out.push({ id: `${serial}`, name: `COSMOS 1408 DEB ${serial}`, group: 'Cosmos 1408 debris', kind: 'DEBRIS', el, designed: true });
  });
  return out;
}

const RISK = (missKm: number): Conjunction['risk'] => (missKm < 5 ? 'CRITICAL' : missKm < 25 ? 'WARNING' : 'WATCH');

/**
 * Screens every satellite against every object that shares its altitude band, over `horizonMs`.
 * Coarse 30 s pass to find approaches under ~300 km, then a 1 s refinement around each to get the true miss distance.
 */
export function findConjunctions(sats: SatRef[], objects: SpaceObject[], fromMs: number, horizonMs: number, thresholdKm = 50): Conjunction[] {
  const STEP = 30_000;
  const steps = Math.floor(horizonMs / STEP);
  const out: Conjunction[] = [];

  const track = (el: Elements) => {
    const a = new Float64Array((steps + 1) * 3);
    for (let k = 0; k <= steps; k++) {
      const p = propagate(el, fromMs + k * STEP).ecef;
      a[k * 3] = p[0]; a[k * 3 + 1] = p[1]; a[k * 3 + 2] = p[2];
    }
    return a;
  };

  const satTracks = new Map<string, Float64Array>();
  const objTracks = new Map<string, Float64Array>();

  for (const s of sats) {
    const sAlt = (s.el.a - RE) / 1000;
    for (const o of objects) {
      const perigee = (o.el.a * (1 - o.el.e) - RE) / 1000, apogee = (o.el.a * (1 + o.el.e) - RE) / 1000;
      if (sAlt < perigee - 40 || sAlt > apogee + 40) continue; // never in the same shell
      let A = satTracks.get(s.id); if (!A) satTracks.set(s.id, (A = track(s.el)));
      let B = objTracks.get(o.id); if (!B) objTracks.set(o.id, (B = track(o.el)));

      const d = new Float64Array(steps + 1);
      for (let k = 0; k <= steps; k++) d[k] = Math.hypot(A[k * 3] - B[k * 3], A[k * 3 + 1] - B[k * 3 + 1], A[k * 3 + 2] - B[k * 3 + 2]) / 1000;

      let best: { missKm: number; tcaMs: number; rel: number } | null = null;
      for (let k = 1; k < steps; k++) {
        if (d[k] > 300 || d[k] > d[k - 1] || d[k] > d[k + 1]) continue;
        for (let ms = fromMs + (k - 1) * STEP; ms <= fromMs + (k + 1) * STEP; ms += 1000) {
          const ps = propagate(s.el, ms), po = propagate(o.el, ms);
          const dist = Math.hypot(ps.ecef[0] - po.ecef[0], ps.ecef[1] - po.ecef[1], ps.ecef[2] - po.ecef[2]) / 1000;
          if (!best || dist < best.missKm) {
            best = { missKm: dist, tcaMs: ms, rel: Math.hypot(ps.velEci[0] - po.velEci[0], ps.velEci[1] - po.velEci[1], ps.velEci[2] - po.velEci[2]) / 1000 };
          }
        }
      }
      if (best && best.missKm <= thresholdKm) {
        out.push({ satId: s.id, objectId: o.id, objectName: o.name, kind: o.kind, tcaMs: best.tcaMs, missKm: best.missKm, relSpeedKms: best.rel, risk: RISK(best.missKm) });
      }
    }
  }
  return out.sort((a, b) => a.missKm - b.missKm);
}
