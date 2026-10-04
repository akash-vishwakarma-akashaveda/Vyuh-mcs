/**
 * TLE ingest and SGP4 propagation (near-Earth branch of Vallado's 2006 revision, WGS-72 constants).
 *
 * ponytail: near-Earth only. Orbits with a period of 225 min or more need SDP4 (deep-space lunar and
 * solar terms); `parseTle` refuses them with a reason instead of propagating them wrongly. Add SDP4,
 * or an Orekit sidecar, when a MEO/GEO customer brings TLEs.
 *
 * Output frame is TEME; it is rotated to Earth-fixed with GMST only (no polar motion), which is
 * what pass prediction needs.
 */
import { Elements, ELEMENT_EPOCH_MS, State, meanMotion, stateFromEci } from './orbit';

const RE = 6378.135;                     // km, WGS-72
const MU = 398600.8;                     // km³/s²
const XKE = 60 / Math.sqrt((RE * RE * RE) / MU);
const J2 = 0.001082616, J3 = -0.00000253881, J4 = -0.00000165597;
const J3OJ2 = J3 / J2;
const X2O3 = 2 / 3;
const TWOPI = 2 * Math.PI;
const D2R = Math.PI / 180;

export interface Tle {
  name?: string;
  line1: string;
  line2: string;
  catnr: string;
  epochMs: number;
  bstar: number;
  inclDeg: number;
  raanDeg: number;
  ecc: number;
  argpDeg: number;
  maDeg: number;
  revPerDay: number;
}

const checksum = (line: string) => {
  let s = 0;
  for (const c of line.slice(0, 68)) s += c === '-' ? 1 : c >= '0' && c <= '9' ? +c : 0;
  return s % 10;
};

/** "-11606-4" → -0.11606e-4 (TLE implied-decimal exponent field). */
const expField = (f: string) => {
  const t = f.trim();
  if (!t) return 0;
  const m = /^([+-]?)(\d{1,5})([+-]\d)$/.exec(t.replace(/\s/g, ''));
  if (!m) return NaN;
  return Number(`${m[1]}0.${m[2]}e${m[3]}`);
};

/** Parse and validate a two- or three-line element set. Returns the TLE or a list of reasons it was refused. */
export function parseTle(text: string): { tle?: Tle; errors: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim());
  const errors: string[] = [];
  if (lines.length < 2 || lines.length > 3) return { errors: ['Paste two lines (or a name line and two lines).'] };
  const [name, l1, l2] = lines.length === 3 ? [lines[0].trim(), lines[1], lines[2]] : [undefined, lines[0], lines[1]];
  if (!l1.startsWith('1 ')) errors.push('Line 1 must start with "1 ".');
  if (!l2.startsWith('2 ')) errors.push('Line 2 must start with "2 ".');
  if (l1.length !== 69) errors.push(`Line 1 is ${l1.length} characters; a TLE line is 69.`);
  if (l2.length !== 69) errors.push(`Line 2 is ${l2.length} characters; a TLE line is 69.`);
  if (errors.length) return { errors };
  if (checksum(l1) !== +l1[68]) errors.push(`Line 1 checksum is ${l1[68]}, computed ${checksum(l1)}.`);
  if (checksum(l2) !== +l2[68]) errors.push(`Line 2 checksum is ${l2[68]}, computed ${checksum(l2)}.`);
  const catnr = l1.slice(2, 7).trim();
  if (catnr !== l2.slice(2, 7).trim()) errors.push(`Catalogue numbers differ (${catnr} and ${l2.slice(2, 7).trim()}).`);

  const yy = +l1.slice(18, 20), doy = +l1.slice(20, 32);
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const epochMs = Date.UTC(year, 0, 1) + (doy - 1) * 86400_000;
  const bstar = expField(l1.slice(53, 61));
  const inclDeg = +l2.slice(8, 16), raanDeg = +l2.slice(17, 25), ecc = +`0.${l2.slice(26, 33).trim()}`;
  const argpDeg = +l2.slice(34, 42), maDeg = +l2.slice(43, 51), revPerDay = +l2.slice(52, 63);
  const nums = { epoch: doy, bstar, inclination: inclDeg, RAAN: raanDeg, eccentricity: ecc, 'argument of perigee': argpDeg, 'mean anomaly': maDeg, 'mean motion': revPerDay };
  for (const [k, v] of Object.entries(nums)) if (!Number.isFinite(v)) errors.push(`Could not read the ${k} field.`);
  if (!errors.length) {
    if (inclDeg < 0 || inclDeg > 180) errors.push('Inclination must be between 0 and 180°.');
    if (ecc >= 1) errors.push('Eccentricity must be below 1.');
    if (revPerDay <= 0) errors.push('Mean motion must be positive.');
    else if (1440 / revPerDay >= 225) errors.push(`Period ${(1440 / revPerDay).toFixed(0)} min is deep space (225 min or more); SDP4 is not supported yet.`);
  }
  if (errors.length) return { errors };
  return { tle: { name, line1: l1, line2: l2, catnr, epochMs, bstar, inclDeg, raanDeg, ecc, argpDeg, maDeg, revPerDay }, errors: [] };
}

export interface Satrec {
  tle: Tle; isimp: boolean; no: number; ecco: number; inclo: number; argpo: number; nodeo: number; mo: number; bstar: number;
  ao: number; con41: number; x1mth2: number; x7thm1: number; cc1: number; cc4: number; cc5: number; d2: number; d3: number; d4: number;
  delmo: number; eta: number; sinmao: number; t2cof: number; t3cof: number; t4cof: number; t5cof: number; xlcof: number; aycof: number;
  mdot: number; argpdot: number; nodedot: number; nodecf: number; omgcof: number; xmcof: number;
}

/** sgp4init, near-Earth branch. */
export function sgp4init(tle: Tle): Satrec {
  const ecco = tle.ecc, inclo = tle.inclDeg * D2R, argpo = tle.argpDeg * D2R, nodeo = tle.raanDeg * D2R, mo = tle.maDeg * D2R, bstar = tle.bstar;
  let no = (tle.revPerDay * TWOPI) / 1440;
  const ss = 78 / RE + 1, qzms2t = ((120 - 78) / RE) ** 4;

  // initl: un-Kozai the mean motion.
  const eccsq = ecco * ecco, omeosq = 1 - eccsq, rteosq = Math.sqrt(omeosq);
  const cosio = Math.cos(inclo), cosio2 = cosio * cosio;
  const ak = (XKE / no) ** X2O3;
  const d1 = (0.75 * J2 * (3 * cosio2 - 1)) / (rteosq * omeosq);
  let del = d1 / (ak * ak);
  const adel = ak * (1 - del * del - del * (1 / 3 + (134 * del * del) / 81));
  del = d1 / (adel * adel);
  no = no / (1 + del);
  const ao = (XKE / no) ** X2O3;
  const sinio = Math.sin(inclo), po = ao * omeosq, con42 = 1 - 5 * cosio2, con41 = -con42 - cosio2 - cosio2;
  const posq = po * po, rp = ao * (1 - ecco);

  const isimp = rp < 220 / RE + 1;
  let sfour = ss, qzms24 = qzms2t;
  const perige = (rp - 1) * RE;
  if (perige < 156) {
    sfour = perige < 98 ? 20 : perige - 78;
    qzms24 = ((120 - sfour) / RE) ** 4;
    sfour = sfour / RE + 1;
  }
  const pinvsq = 1 / posq, tsi = 1 / (ao - sfour), eta = ao * ecco * tsi, etasq = eta * eta, eeta = ecco * eta;
  const psisq = Math.abs(1 - etasq), coef = qzms24 * tsi ** 4, coef1 = coef / psisq ** 3.5;
  const cc2 = coef1 * no * (ao * (1 + 1.5 * etasq + eeta * (4 + etasq)) + ((0.375 * J2 * tsi) / psisq) * con41 * (8 + 3 * etasq * (8 + etasq)));
  const cc1 = bstar * cc2;
  const cc3 = ecco > 1e-4 ? (-2 * coef * tsi * J3OJ2 * no * sinio) / ecco : 0;
  const x1mth2 = 1 - cosio2;
  const cc4 = 2 * no * coef1 * ao * omeosq * (eta * (2 + 0.5 * etasq) + ecco * (0.5 + 2 * etasq) -
    ((J2 * tsi) / (ao * psisq)) * (-3 * con41 * (1 - 2 * eeta + etasq * (1.5 - 0.5 * eeta)) + 0.75 * x1mth2 * (2 * etasq - eeta * (1 + etasq)) * Math.cos(2 * argpo)));
  const cc5 = 2 * coef1 * ao * omeosq * (1 + 2.75 * (etasq + eeta) + eeta * etasq);
  const cosio4 = cosio2 * cosio2;
  const temp1 = 1.5 * J2 * pinvsq * no, temp2 = 0.5 * temp1 * J2 * pinvsq, temp3 = -0.46875 * J4 * pinvsq * pinvsq * no;
  const mdot = no + 0.5 * temp1 * rteosq * con41 + 0.0625 * temp2 * rteosq * (13 - 78 * cosio2 + 137 * cosio4);
  const argpdot = -0.5 * temp1 * con42 + 0.0625 * temp2 * (7 - 114 * cosio2 + 395 * cosio4) + temp3 * (3 - 36 * cosio2 + 49 * cosio4);
  const xhdot1 = -temp1 * cosio;
  const nodedot = xhdot1 + (0.5 * temp2 * (4 - 19 * cosio2) + 2 * temp3 * (3 - 7 * cosio2)) * cosio;
  const omgcof = bstar * cc3 * Math.cos(argpo);
  const xmcof = ecco > 1e-4 ? (-X2O3 * coef * bstar) / eeta : 0;
  const nodecf = 3.5 * omeosq * xhdot1 * cc1;
  const t2cof = 1.5 * cc1;
  const xlcof = (-0.25 * J3OJ2 * sinio * (3 + 5 * cosio)) / (Math.abs(cosio + 1) > 1.5e-12 ? 1 + cosio : 1.5e-12);
  const aycof = -0.5 * J3OJ2 * sinio;
  const delmo = (1 + eta * Math.cos(mo)) ** 3;
  const sinmao = Math.sin(mo);
  const x7thm1 = 7 * cosio2 - 1;

  let d2 = 0, d3 = 0, d4 = 0, t3cof = 0, t4cof = 0, t5cof = 0;
  if (!isimp) {
    const cc1sq = cc1 * cc1;
    d2 = 4 * ao * tsi * cc1sq;
    const temp = (d2 * tsi * cc1) / 3;
    d3 = (17 * ao + sfour) * temp;
    d4 = 0.5 * temp * ao * tsi * (221 * ao + 31 * sfour) * cc1;
    t3cof = d2 + 2 * cc1sq;
    t4cof = 0.25 * (3 * d3 + cc1 * (12 * d2 + 10 * cc1sq));
    t5cof = 0.2 * (3 * d4 + 12 * cc1 * d3 + 6 * d2 * d2 + 15 * cc1sq * (2 * d2 + cc1sq));
  }
  return { tle, isimp, no, ecco, inclo, argpo, nodeo, mo, bstar, ao, con41, x1mth2, x7thm1, cc1, cc4, cc5, d2, d3, d4, delmo, eta, sinmao, t2cof, t3cof, t4cof, t5cof, xlcof, aycof, mdot, argpdot, nodedot, nodecf, omgcof, xmcof };
}

const mod2pi = (x: number) => ((x % TWOPI) + TWOPI) % TWOPI;

/** Position (km) and velocity (km/s) in TEME, `tsince` minutes from the TLE epoch. Throws when the orbit has decayed. */
export function sgp4(r: Satrec, tsince: number): { r: [number, number, number]; v: [number, number, number] } {
  const t = tsince;
  const xmdf = r.mo + r.mdot * t, argpdf = r.argpo + r.argpdot * t, nodedf = r.nodeo + r.nodedot * t;
  let argpm = argpdf, mm = xmdf;
  const t2 = t * t;
  let nodem = nodedf + r.nodecf * t2;
  let tempa = 1 - r.cc1 * t, tempe = r.bstar * r.cc4 * t, templ = r.t2cof * t2;
  if (!r.isimp) {
    const delomg = r.omgcof * t;
    const delm = r.xmcof * ((1 + r.eta * Math.cos(xmdf)) ** 3 - r.delmo);
    const temp = delomg + delm;
    mm = xmdf + temp; argpm = argpdf - temp;
    const t3 = t2 * t, t4 = t3 * t;
    tempa = tempa - r.d2 * t2 - r.d3 * t3 - r.d4 * t4;
    tempe = tempe + r.bstar * r.cc5 * (Math.sin(mm) - r.sinmao);
    templ = templ + r.t3cof * t3 + t4 * (r.t4cof + t * r.t5cof);
  }
  const am = (XKE / r.no) ** X2O3 * tempa * tempa;
  const nm = XKE / am ** 1.5;
  let em = r.ecco - tempe;
  if (em >= 1 || em < -0.001 || am < 0.95) throw new Error('Orbit has decayed or the elements are out of range at this time.');
  if (em < 1e-6) em = 1e-6;
  mm = mm + r.no * templ;
  let xlm = mm + argpm + nodem;
  nodem = mod2pi(nodem); argpm = mod2pi(argpm); xlm = mod2pi(xlm);
  mm = mod2pi(xlm - argpm - nodem);

  const sinip = Math.sin(r.inclo), cosip = Math.cos(r.inclo);
  const axnl = em * Math.cos(argpm);
  let temp = 1 / (am * (1 - em * em));
  const aynl = em * Math.sin(argpm) + temp * r.aycof;
  const xl = mm + argpm + nodem + temp * r.xlcof * axnl;
  const u = mod2pi(xl - nodem);
  let eo1 = u, tem5 = 9999.9, sineo1 = 0, coseo1 = 0;
  for (let k = 0; Math.abs(tem5) >= 1e-12 && k < 10; k++) {
    sineo1 = Math.sin(eo1); coseo1 = Math.cos(eo1);
    tem5 = 1 - coseo1 * axnl - sineo1 * aynl;
    tem5 = (u - aynl * coseo1 + axnl * sineo1 - eo1) / tem5;
    if (Math.abs(tem5) >= 0.95) tem5 = tem5 > 0 ? 0.95 : -0.95;
    eo1 += tem5;
  }
  const ecose = axnl * coseo1 + aynl * sineo1, esine = axnl * sineo1 - aynl * coseo1;
  const el2 = axnl * axnl + aynl * aynl, pl = am * (1 - el2);
  if (pl < 0) throw new Error('Semi-latus rectum is negative.');
  const rl = am * (1 - ecose), rdotl = (Math.sqrt(am) * esine) / rl, rvdotl = Math.sqrt(pl) / rl, betal = Math.sqrt(1 - el2);
  temp = esine / (1 + betal);
  const sinu = (am / rl) * (sineo1 - aynl - axnl * temp), cosu = (am / rl) * (coseo1 - axnl + aynl * temp);
  let su = Math.atan2(sinu, cosu);
  const sin2u = (cosu + cosu) * sinu, cos2u = 1 - 2 * sinu * sinu;
  temp = 1 / pl;
  const temp1 = 0.5 * J2 * temp, temp2 = temp1 * temp;
  const mrt = rl * (1 - 1.5 * temp2 * betal * r.con41) + 0.5 * temp1 * r.x1mth2 * cos2u;
  su = su - 0.25 * temp2 * r.x7thm1 * sin2u;
  const xnode = nodem + 1.5 * temp2 * cosip * sin2u;
  const xinc = r.inclo + 1.5 * temp2 * cosip * sinip * cos2u;
  const mvt = rdotl - (nm * temp1 * r.x1mth2 * sin2u) / XKE;
  const rvdot = rvdotl + (nm * temp1 * (r.x1mth2 * cos2u + 1.5 * r.con41)) / XKE;
  if (mrt < 1) throw new Error('Satellite has decayed.');

  const sinsu = Math.sin(su), cossu = Math.cos(su), snod = Math.sin(xnode), cnod = Math.cos(xnode), sini = Math.sin(xinc), cosi = Math.cos(xinc);
  const xmx = -snod * cosi, xmy = cnod * cosi;
  const ux = xmx * sinsu + cnod * cossu, uy = xmy * sinsu + snod * cossu, uz = sini * sinsu;
  const vx = xmx * cossu - cnod * sinsu, vy = xmy * cossu - snod * sinsu, vz = sini * cossu;
  const vk = (RE * XKE) / 60;
  return {
    r: [mrt * ux * RE, mrt * uy * RE, mrt * uz * RE],
    v: [(mvt * ux + rvdot * vx) * vk, (mvt * uy + rvdot * vy) * vk, (mvt * uz + rvdot * vz) * vk],
  };
}

/** The console's `State` (Earth-fixed, geodetic) from SGP4 at a UTC instant. */
export function sgp4State(rec: Satrec, ms: number): State {
  const { r, v } = sgp4(rec, (ms - rec.tle.epochMs) / 60_000);
  const revs = rec.tle.revPerDay * ((ms - rec.tle.epochMs) / 86400_000);
  return stateFromEci([r[0] * 1000, r[1] * 1000, r[2] * 1000], [v[0] * 1000, v[1] * 1000, v[2] * 1000], ms, Math.floor(revs), 0);
}

/* ---------- writing a TLE (for the sample that mirrors the console's own element sets) ---------- */

const pad = (s: string, n: number) => s.padStart(n, ' ');
const withSum = (l: string) => l + checksum(l);

/**
 * A TLE whose mean elements equal the console's model elements at `ms`. Used for the "sample TLE" button so
 * SGP4 and the J2 model agree to within the model difference; marked as sample on screen.
 */
export function tleFromElements(satId: string, catnr: number, el: Elements, ms: number): string {
  const dt = (ms - ELEMENT_EPOCH_MS) / 1000;
  const n = meanMotion(el.a);
  const p = el.a * (1 - el.e * el.e);
  const k = 1.5 * 1.08263e-3 * (6378137 / p) ** 2 * n;
  const deg = (x: number) => ((((x / D2R) % 360) + 360) % 360);
  const raan = deg(el.raan - k * Math.cos(el.inc) * dt);
  const argp = deg(el.argp + 0.5 * k * (5 * Math.cos(el.inc) ** 2 - 1) * dt);
  const ma = deg(el.m0 + n * dt);
  const revDay = (n * 86400) / TWOPI;
  const d = new Date(ms);
  const doy = (ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400_000 + 1;
  const id = String(catnr).padStart(5, '0');
  const l1 = withSum(`1 ${id}U 26001A   ${String(d.getUTCFullYear() % 100).padStart(2, '0')}${doy.toFixed(8).padStart(12, '0')}  .00000000  00000-0  10000-3 0  999`);
  const l2 = withSum(`2 ${id} ${pad((el.inc / D2R).toFixed(4), 8)} ${pad(raan.toFixed(4), 8)} ${el.e.toFixed(7).slice(2)} ${pad(argp.toFixed(4), 8)} ${pad(ma.toFixed(4), 8)} ${pad(revDay.toFixed(8), 11)}    1`);
  return `${satId}\n${l1}\n${l2}`;
}
