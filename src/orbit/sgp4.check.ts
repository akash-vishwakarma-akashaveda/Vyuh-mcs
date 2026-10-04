import { parseTle, sgp4init, sgp4, tleFromElements, sgp4State } from './sgp4';
import { elementsFrom, propagate } from './orbit';
const assert = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok', m); };
const t = parseTle('1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753\n2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667');
assert(!!t.tle, 'parse vanguard ' + t.errors.join(';'));
const rec = sgp4init(t.tle!);
const a = sgp4(rec, 0), b = sgp4(rec, 360);
console.log(a, b);
const near = (x: number[], y: number[], tol: number) => x.every((v, i) => Math.abs(v - y[i]) < tol);
assert(near(a.r, [7022.46529266, -1400.08296755, 0.03995155], 1e-3), 't=0 position');
assert(near(a.v, [1.893841015, 6.405893759, 4.534807250], 1e-6), 't=0 velocity');
assert(near(b.r, [-7154.03120202, -3783.17682504, -3536.19412294], 1e-2), 't=360 position');
assert(parseTle('1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4754\n2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667').errors.length > 0, 'bad checksum refused');
const el = elementsFrom({ altitude_km: 520, eccentricity: 0.001, inclination_deg: 97.5, raan_deg: 30, arg_of_perigee_deg: 90, mean_anomaly_deg: 10 });
const now = Date.UTC(2026, 9, 4, 12);
const txt = tleFromElements('AKV-03', 90003, el, now);
console.log(txt);
const p = parseTle(txt);
assert(!!p.tle, 'generated TLE parses ' + p.errors.join(';'));
const s1 = sgp4State(sgp4init(p.tle!), now), s2 = propagate(el, now);
const d = Math.hypot(s1.ecef[0] - s2.ecef[0], s1.ecef[1] - s2.ecef[1], s1.ecef[2] - s2.ecef[2]) / 1000;
console.log('sgp4 vs model km', d.toFixed(1));
assert(d < 50, 'sgp4 agrees with the J2 model within 50 km');

// CDM parse: samples parse; a broken one is refused with reasons.
import { parseCdm, sampleCdms } from './cdm';
for (const t of sampleCdms(Date.UTC(2026, 9, 4))) { const p = parseCdm(t, true); assert(!!p.cdm, 'sample CDM parses ' + p.errors.join(';')); }
assert(parseCdm('CCSDS_CDM_VERS = 1.0\nMESSAGE_ID = X').errors.length >= 2, 'incomplete CDM refused');
assert(parseCdm(sampleCdms()[0], true).cdm!.pc === 3.2e-4, 'Pc read');
