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

