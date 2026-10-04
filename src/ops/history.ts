import { useFleetStore } from '../store/useFleetStore';
import { PARAMETERS, ParamDef } from '../data/fleet';

export const findDef = (paramId: string): { def: ParamDef; subsystem: string } | undefined => {
  for (const [subsystem, defs] of Object.entries(PARAMETERS)) {
    const def = defs.find((d) => d.param_id === paramId);
    if (def) return { def, subsystem };
  }
  return undefined;
};

export const seeded = (key: string) => {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * History reconstructed around the current value, in the shape the archive would return.
 * It is a function of absolute time — an orbit-scale wave (~95 min), a daily one and a weekly
 * one, plus per-sample noise — so 1 h shows a slice of one orbit, 24 h shows fifteen, 7 d and 30 d
 * show the slow cycles, and the same instant reads the same in every range.
 * A `drift: 0` parameter is a flag or counter and is drawn flat: inventing a wander on a
 * value that never wanders would be a chart that lies.
 */
export function history(sat: string, def: ParamDef, live: number, timestamps: number[], anchorSec?: number): number[] {
  if (def.drift === 0) return timestamps.map(() => live);
  const rnd = seeded(`${sat}:${def.param_id}`);
  const span = def.critHi - def.critLo;
  const waves = [
    { period: 5700 * (0.97 + rnd() * 0.06), amp: Math.max(def.drift * 8, span * 0.035) },
    { period: 86400, amp: span * 0.02 },
    { period: 604800, amp: span * 0.015 },
  ].map((w) => ({ ...w, phase: rnd() * Math.PI * 2 }));
  const step = timestamps.length > 1 ? timestamps[1] - timestamps[0] : 1;
  // Each point is the mean over its sample window (what a rollup returns), so a wave much shorter
  // than the step averages out instead of aliasing into noise.
  const f = (t: number) => waves.reduce((acc, w) => {
    const om = (2 * Math.PI) / w.period;
    const x = om * step;
    const mean = x < 1e-6 ? Math.sin(om * t + w.phase) : (Math.cos(om * (t - step) + w.phase) - Math.cos(om * t + w.phase)) / x;
    return acc + w.amp * mean;
  }, 0);
  const noiseAmp = def.drift * 2 * Math.min(1, Math.sqrt(10 / step)); // averaging N raw samples shrinks noise by √N
  const noiseSeed = (t: number) => seeded(`${sat}:${def.param_id}:${Math.round(t / step)}`)();
  const last = anchorSec ?? timestamps[timestamps.length - 1]; // the instant `live` refers to
  const out = timestamps.map((t) => {
    const v = live + f(t) - f(last) + (noiseSeed(t) - 0.5) * noiseAmp;
    return Number(Math.min(def.critHi, Math.max(def.critLo, v)).toFixed(3));
  });
  if (anchorSec === undefined || timestamps[timestamps.length - 1] >= anchorSec) out[out.length - 1] = live; // the newest point is the live value
  return out;
}


// ---- number formatting ------------------------------------------------------------------------

/** One formatter for every telemetry number on screen: no raw floats, no NaN. */
export function fmtNum(v: number | null | undefined, digits?: number): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (digits === undefined && a > 0 && a < 1) return String(Number(v.toPrecision(3)));
  const d = digits ?? (a >= 1000 ? 0 : a >= 100 ? 1 : 2);
  return v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

/** What one chart point stands for, from the seconds between points. */
export function rollupLabel(stepSec: number): string {
  if (stepSec <= 1) return 'raw 1 Hz';
  if (stepSec < 60) return `${stepSec} s rollup`;
  if (stepSec < 3600) return `${stepSec / 60} min rollup`;
  return `${stepSec / 3600} h rollup`;
}

/** UTC time, with the date when it is not today. */
export function fmtUtc(ms: number, seconds = false): string {
  const iso = new Date(ms).toISOString();
  const time = iso.slice(11, seconds ? 19 : 16);
  return iso.slice(0, 10) === new Date().toISOString().slice(0, 10) ? time : `${iso.slice(0, 10)} ${time}`;
}

// ---- recent CVT samples ---------------------------------------------------------------------------

/**
 * A small ring buffer of real CVT values per satellite and parameter, so sparklines show what the
 * console actually received in the last few minutes instead of an invented curve. A value whose
 * timestamp has not moved is not a new sample (a stale parameter stays flat and is marked stale).
 */
const RING = 120;
const samples = new Map<string, { t: number; v: number }[]>();
const lastTs = new Map<string, string>();
useFleetStore.subscribe((s, prev) => {
  if (s.cvt === prev.cvt) return;
  const now = Date.now();
  for (const [sat, params] of Object.entries(s.cvt)) {
    if (params === prev.cvt[sat]) continue;
    for (const [id, p] of Object.entries(params)) {
      const k = `${sat}:${id}`;
      if (lastTs.get(k) === p.timestamp_utc || !Number.isFinite(p.eu_value)) continue;
      lastTs.set(k, p.timestamp_utc);
      const a = samples.get(k) ?? [];
      if (a.length && now - a[a.length - 1].t < 900) a[a.length - 1] = { t: now, v: p.eu_value };
      else a.push({ t: now, v: p.eu_value });
      if (a.length > RING) a.shift();
      samples.set(k, a);
    }
  }
});

export const recentSamples = (sat: string, paramId: string): { t: number; v: number }[] => samples.get(`${sat}:${paramId}`) ?? [];
