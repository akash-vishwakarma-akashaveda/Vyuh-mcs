/**
 * Mission database model and the pure logic behind the Mission database screen:
 * the dictionary shape, diffs between releases, the release check, derived-parameter
 * expressions and XTCE (CCSDS 660.0-B-2) import and export.
 */
import platform from '../../../config/dictionaries/platform.json';

export type Phase = 'LEOP' | 'NOMINAL' | 'SAFE';
export const PHASES: Phase[] = ['LEOP', 'NOMINAL', 'SAFE'];
export const PHASE_LABEL: Record<Phase, string> = { LEOP: 'LEOP', NOMINAL: 'Nominal', SAFE: 'Safe mode' };

/** Warning band l..h, critical band ll..hh. */
export interface Limits { ll: number; l: number; h: number; hh: number }
export interface DictParam {
  name: string; description: string; packet: string; apid: number; unit: string;
  type: 'INT' | 'UINT' | 'FLOAT'; bits: number; offset: number;
  /** Polynomial coefficients c0 + c1·DN + c2·DN² …; empty means the raw value is the engineering value. */
  calib: number[];
  /** NOMINAL is always present; LEOP and SAFE fall back to NOMINAL when absent. */
  limits: { NOMINAL: Limits } & Partial<Record<Phase, Limits>>;
  /** Consecutive out-of-limit samples before an alarm is raised. */
  persistence: number;
}
export interface DerivedParam { name: string; expression: string; unit: string; description: string }
export interface Dictionary { params: DictParam[]; derived: DerivedParam[] }
export interface DiffRow { change: 'ADDED' | 'CHANGED' | 'REMOVED'; item: string; from?: string; to?: string }

// ---------------------------------------------------------------------------------------------
// The dictionary the backend really decodes with (config/dictionaries/platform.json)

interface RawParam {
  param_name: string; description: string; eu_unit: string; data_type: string; bit_length: number; bit_offset: number;
  calib_type: string; calib_data?: number[];
  alarms?: { hysteresis_pct: number; low_low_limit?: number; low_limit?: number; high_limit?: number; high_high_limit?: number };
}
interface RawPacket { apid: number; name: string; parameters: RawParam[] }

/** A state readout or counter with no alarm ranges. */
export const NO_LIMITS: Limits = { ll: -Infinity, l: -Infinity, h: Infinity, hh: Infinity };

/** A missing side means no limit on that side; a missing warning level falls back to the critical one. */
const fromAlarms = (a: NonNullable<RawParam['alarms']>): Limits => {
  const ll = a.low_low_limit ?? -Infinity, hh = a.high_high_limit ?? Infinity;
  return { ll, l: a.low_limit ?? ll, h: a.high_limit ?? hh, hh };
};

export function platformDictionary(): Dictionary {
  const params = (platform as RawPacket[]).flatMap((pk) => pk.parameters.map((p): DictParam => ({
    name: p.param_name, description: p.description, packet: pk.name, apid: pk.apid, unit: p.eu_unit,
    type: p.data_type === 'UINT' ? 'UINT' : p.data_type === 'FLOAT' ? 'FLOAT' : 'INT', bits: p.bit_length, offset: p.bit_offset,
    calib: p.calib_type === 'POLYNOMIAL' ? p.calib_data ?? [] : [],
    limits: { NOMINAL: p.alarms ? fromAlarms(p.alarms) : { ...NO_LIMITS } },
    persistence: 1,
  })));
  return { params, derived: [] };
}

// ---------------------------------------------------------------------------------------------
// Formatting

/** "14:05 UTC" today, "2 Oct 14:05 UTC" on any other day. */
export function utc(iso: string | number | undefined): string {
  if (iso === undefined || iso === '') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const hm = d.toISOString().slice(11, 16);
  const today = new Date().toISOString().slice(0, 10) === d.toISOString().slice(0, 10);
  return today ? `${hm} UTC` : `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}${d.getUTCFullYear() !== new Date().getUTCFullYear() ? ` ${d.getUTCFullYear()}` : ''} ${hm} UTC`;
}

export const num = (v: number) => (!Number.isFinite(v) ? (v > 0 ? '∞' : '−∞') : Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(6))));
export const fmtLimits = (x?: Limits) => (x && !Number.isFinite(x.h) && !Number.isFinite(x.l) ? 'no limits' : x ? `${num(x.l)} … ${num(x.h)} (crit ${num(x.ll)} … ${num(x.hh)})` : 'inherits nominal');
export function fmtCalib(c: number[]): string {
  if (c.length === 0) return 'EU = DN';
  const terms = c.map((k, i) => (k === 0 ? '' : i === 0 ? num(k) : `${num(k)}·DN${i > 1 ? `^${i}` : ''}`)).filter(Boolean);
  return `EU = ${terms.join(' + ') || '0'}`;
}
export const limitsFor = (p: DictParam, phase: Phase): Limits => p.limits[phase] ?? p.limits.NOMINAL;

// ---------------------------------------------------------------------------------------------
// Diff

export function diffDict(base: Dictionary | undefined, next: Dictionary): DiffRow[] {
  const out: DiffRow[] = [];
  const b = new Map((base?.params ?? []).map((p) => [p.name, p]));
  const n = new Map(next.params.map((p) => [p.name, p]));
  for (const p of next.params) {
    const o = b.get(p.name);
    if (!o) { out.push({ change: 'ADDED', item: p.name, to: `${p.type}${p.bits}, ${fmtCalib(p.calib)}${p.unit ? ` ${p.unit}` : ''}` }); continue; }
    if (o.unit !== p.unit) out.push({ change: 'CHANGED', item: `${p.name} unit`, from: o.unit || '—', to: p.unit || '—' });
    if (o.calib.join() !== p.calib.join()) out.push({ change: 'CHANGED', item: `${p.name} calibration`, from: fmtCalib(o.calib), to: fmtCalib(p.calib) });
    if (o.bits !== p.bits || o.offset !== p.offset || o.type !== p.type) out.push({ change: 'CHANGED', item: `${p.name} encoding`, from: `${o.type}${o.bits} @${o.offset}`, to: `${p.type}${p.bits} @${p.offset}` });
    for (const ph of PHASES) {
      const a = o.limits[ph], c = p.limits[ph];
      if (JSON.stringify(a) !== JSON.stringify(c)) out.push({ change: !a ? 'ADDED' : !c ? 'REMOVED' : 'CHANGED', item: `${p.name} ${PHASE_LABEL[ph].toLowerCase()} limits`, from: a ? fmtLimits(a) : undefined, to: c ? fmtLimits(c) : undefined });
    }
    if (o.persistence !== p.persistence) out.push({ change: 'CHANGED', item: `${p.name} persistence`, from: `${o.persistence} samples`, to: `${p.persistence} samples` });
  }
  for (const o of base?.params ?? []) if (!n.has(o.name)) out.push({ change: 'REMOVED', item: o.name, from: `${o.type}${o.bits}` });
  const bd = new Map((base?.derived ?? []).map((d) => [d.name, d]));
  const nd = new Map(next.derived.map((d) => [d.name, d]));
  for (const d of next.derived) {
    const o = bd.get(d.name);
    if (!o) out.push({ change: 'ADDED', item: `${d.name} (derived)`, to: d.expression });
    else if (o.expression !== d.expression || o.unit !== d.unit) out.push({ change: 'CHANGED', item: `${d.name} (derived)`, from: o.expression, to: d.expression });
  }
  for (const o of base?.derived ?? []) if (!nd.has(o.name)) out.push({ change: 'REMOVED', item: `${o.name} (derived)`, from: o.expression });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Derived parameter expressions: a small arithmetic language, parsed, never eval'd.

export type Expr =
  | { k: 'n'; v: number }
  | { k: 'v'; name: string }
  | { k: 'neg'; a: Expr }
  | { k: 'b'; op: '+' | '-' | '*' | '/' | '^'; a: Expr; b: Expr }
  | { k: 'f'; name: string; args: Expr[] };

const FUNCS: Record<string, (...x: number[]) => number> = {
  abs: Math.abs, sqrt: Math.sqrt, min: Math.min, max: Math.max, pow: Math.pow, exp: Math.exp, log10: Math.log10, ln: Math.log,
  sin: Math.sin, cos: Math.cos, atan2: Math.atan2, hypot: Math.hypot,
};
export const FUNCTION_NAMES = Object.keys(FUNCS);

export function parseExpr(src: string): Expr {
  const toks = src.match(/\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+|[A-Za-z_][A-Za-z0-9_]*|[-+*/^(),]|\S/g) ?? [];
  let i = 0;
  const peek = () => toks[i];
  const take = (t?: string) => {
    const x = toks[i];
    if (t !== undefined && x !== t) throw new Error(x === undefined ? `Expected "${t}" at the end` : `Expected "${t}" but found "${x}"`);
    i++;
    return x;
  };
  const expr = (): Expr => {
    let a = term();
    while (peek() === '+' || peek() === '-') { const op = take() as '+' | '-'; a = { k: 'b', op, a, b: term() }; }
    return a;
  };
  const term = (): Expr => {
    let a = power();
    while (peek() === '*' || peek() === '/') { const op = take() as '*' | '/'; a = { k: 'b', op, a, b: power() }; }
    return a;
  };
  const power = (): Expr => {
    const a = unary();
    return peek() === '^' ? (take(), { k: 'b', op: '^', a, b: power() }) : a;
  };
  const unary = (): Expr => (peek() === '-' ? (take(), { k: 'neg', a: unary() }) : peek() === '+' ? (take(), unary()) : primary());
  const primary = (): Expr => {
    const t = take();
    if (t === undefined) throw new Error('The expression ends too early');
    if (t === '(') { const e = expr(); take(')'); return e; }
    if (/^[\d.]/.test(t)) return { k: 'n', v: Number(t) };
    if (/^[A-Za-z_]/.test(t)) {
      if (peek() !== '(') return { k: 'v', name: t };
      if (!FUNCS[t]) throw new Error(`Unknown function "${t}". Available: ${FUNCTION_NAMES.join(', ')}`);
      take('(');
      const args: Expr[] = [];
      if (peek() !== ')') { args.push(expr()); while (peek() === ',') { take(); args.push(expr()); } }
      take(')');
      return { k: 'f', name: t, args };
    }
    throw new Error(`Unexpected "${t}"`);
  };
  if (!src.trim()) throw new Error('Write an expression, for example BAT_VOLTAGE * BUS_CURRENT');
  const e = expr();
  if (i < toks.length) throw new Error(`Unexpected "${toks[i]}"`);
  return e;
}

export function refs(e: Expr, out = new Set<string>()): string[] {
  if (e.k === 'v') out.add(e.name);
  else if (e.k === 'neg') refs(e.a, out);
  else if (e.k === 'b') { refs(e.a, out); refs(e.b, out); }
  else if (e.k === 'f') e.args.forEach((a) => refs(a, out));
  return [...out];
}

export function evalExpr(e: Expr, get: (name: string) => number | undefined): number {
  switch (e.k) {
    case 'n': return e.v;
    case 'v': { const v = get(e.name); if (v === undefined) throw new Error(`No value for ${e.name}`); return v; }
    case 'neg': return -evalExpr(e.a, get);
    case 'f': return FUNCS[e.name](...e.args.map((a) => evalExpr(a, get)));
    case 'b': {
      const a = evalExpr(e.a, get), b = evalExpr(e.b, get);
      return e.op === '+' ? a + b : e.op === '-' ? a - b : e.op === '*' ? a * b : e.op === '/' ? a / b : a ** b;
    }
  }
}

/** Parse, check references against the dictionary, and evaluate in one go — for previews. */
export function tryDerived(expression: string, known: Set<string>, get: (name: string) => number | undefined): { value?: number; error?: string; refs: string[] } {
  try {
    const e = parseExpr(expression);
    const r = refs(e);
    const unknown = r.filter((x) => !known.has(x));
    if (unknown.length) return { error: `Not in the dictionary: ${unknown.join(', ')}`, refs: r };
    const value = evalExpr(e, get);
    return Number.isFinite(value) ? { value, refs: r } : { error: 'The result is not a finite number with the current values', refs: r };
  } catch (x) {
    return { error: (x as Error).message, refs: [] };
  }
}

// ---------------------------------------------------------------------------------------------
// Release check: everything a dictionary must satisfy before it may be scheduled.

export interface CheckResult { checks: number; failures: string[]; warnings: string[] }

export function checkDict(dict: Dictionary, values: Record<string, Record<string, number>>): CheckResult {
  const failures: string[] = [], warnings: string[] = [];
  let checks = 0;
  const known = new Set(dict.params.map((p) => p.name));
  for (const p of dict.params) {
    for (const ph of PHASES) {
      const x = p.limits[ph];
      if (!x) continue;
      checks++;
      if (!(x.ll <= x.l && x.l <= x.h && x.h <= x.hh)) failures.push(`${p.name} ${PHASE_LABEL[ph].toLowerCase()} limits are out of order (${fmtLimits(x)})`);
    }
    checks++;
    if (p.bits <= 0 || p.bits > 64) failures.push(`${p.name} has an impossible size of ${p.bits} bits`);
  }
  const byPacket = new Map<string, DictParam[]>();
  dict.params.forEach((p) => byPacket.set(p.packet, [...(byPacket.get(p.packet) ?? []), p]));
  for (const [packet, ps] of byPacket) {
    const sorted = [...ps].sort((a, b) => a.offset - b.offset);
    for (let k = 1; k < sorted.length; k++) {
      checks++;
      if (sorted[k].offset < sorted[k - 1].offset + sorted[k - 1].bits) failures.push(`${packet}: ${sorted[k].name} overlaps ${sorted[k - 1].name}`);
    }
  }
  for (const d of dict.derived) {
    checks++;
    if (known.has(d.name)) failures.push(`Derived ${d.name} has the same name as a telemetry parameter`);
    for (const [sat, v] of Object.entries(values)) {
      const r = tryDerived(d.expression, known, (n) => v[n]);
      checks++;
      if (r.error) { failures.push(`Derived ${d.name} on ${sat}: ${r.error}`); break; }
    }
  }
  // Would the new nominal limits put a satellite into alarm the moment they load?
  for (const [sat, v] of Object.entries(values)) {
    for (const p of dict.params) {
      const val = v[p.name];
      if (val === undefined) continue;
      checks++;
      const x = p.limits.NOMINAL;
      if (val < x.ll || val > x.hh) warnings.push(`${sat} ${p.name} = ${num(val)} ${p.unit} would be critical`);
      else if (val < x.l || val > x.h) warnings.push(`${sat} ${p.name} = ${num(val)} ${p.unit} would be in warning`);
    }
  }
  return { checks, failures, warnings };
}

// ---------------------------------------------------------------------------------------------
// XTCE 660.0-B-2

const XNS = 'http://www.omg.org/spec/XTCE/20180204';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const bound = (k: string, v: number) => (Number.isFinite(v) ? ` ${k}="${v}"` : '');
const ranges = (x: Limits) => `<xtce:StaticAlarmRanges><xtce:WarningRange${bound('minInclusive', x.l)}${bound('maxInclusive', x.h)}/><xtce:CriticalRange${bound('minInclusive', x.ll)}${bound('maxInclusive', x.hh)}/></xtce:StaticAlarmRanges>`;

export function toXtce(name: string, dict: Dictionary): string {
  const L: string[] = [];
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  L.push(`<xtce:SpaceSystem xmlns:xtce="${XNS}" name="${esc(name)}">`);
  L.push('  <xtce:TelemetryMetaData>');
  L.push('    <xtce:ParameterTypeSet>');
  for (const p of dict.params) {
    const terms = p.calib.map((c, i) => `<xtce:Term coefficient="${c}" exponent="${i}"/>`).join('');
    const enc = p.type === 'FLOAT'
      ? `<xtce:FloatDataEncoding sizeInBits="${p.bits}"/>`
      : `<xtce:IntegerDataEncoding sizeInBits="${p.bits}" encoding="${p.type === 'UINT' ? 'unsigned' : 'twosComplement'}">${terms ? `<xtce:DefaultCalibrator><xtce:PolynomialCalibrator>${terms}</xtce:PolynomialCalibrator></xtce:DefaultCalibrator>` : ''}</xtce:IntegerDataEncoding>`;
    const ctx = (['LEOP', 'SAFE'] as Phase[]).filter((ph) => p.limits[ph]).map((ph) =>
      `<xtce:ContextAlarm minViolations="${p.persistence}"><xtce:ContextMatch><xtce:Comparison parameterRef="MISSION_PHASE" value="${ph}"/></xtce:ContextMatch>${ranges(p.limits[ph]!)}</xtce:ContextAlarm>`).join('');
    L.push(`      <xtce:FloatParameterType name="${esc(p.name)}_Type">`);
    L.push(`        <xtce:UnitSet>${p.unit ? `<xtce:Unit>${esc(p.unit)}</xtce:Unit>` : ''}</xtce:UnitSet>`);
    L.push(`        ${enc}`);
    L.push(`        <xtce:DefaultAlarm minViolations="${p.persistence}">${ranges(p.limits.NOMINAL)}</xtce:DefaultAlarm>`);
    if (ctx) L.push(`        <xtce:ContextAlarmList>${ctx}</xtce:ContextAlarmList>`);
    L.push('      </xtce:FloatParameterType>');
  }
  for (const d of dict.derived) L.push(`      <xtce:FloatParameterType name="${esc(d.name)}_Type"><xtce:UnitSet>${d.unit ? `<xtce:Unit>${esc(d.unit)}</xtce:Unit>` : ''}</xtce:UnitSet></xtce:FloatParameterType>`);
  L.push('    </xtce:ParameterTypeSet>');
  L.push('    <xtce:ParameterSet>');
  for (const p of [...dict.params, ...dict.derived]) L.push(`      <xtce:Parameter name="${esc(p.name)}" parameterTypeRef="${esc(p.name)}_Type" shortDescription="${esc(p.description)}"/>`);
  L.push('    </xtce:ParameterSet>');
  L.push('    <xtce:ContainerSet>');
  const packets = new Map<string, DictParam[]>();
  dict.params.forEach((p) => packets.set(p.packet, [...(packets.get(p.packet) ?? []), p]));
  for (const [pk, ps] of packets) {
    L.push(`      <xtce:SequenceContainer name="${esc(pk)}">`);
    L.push('        <xtce:EntryList>');
    for (const p of ps) L.push(`          <xtce:ParameterRefEntry parameterRef="${esc(p.name)}"><xtce:LocationInContainerInBits referenceLocation="containerStart"><xtce:FixedValue>${p.offset}</xtce:FixedValue></xtce:LocationInContainerInBits></xtce:ParameterRefEntry>`);
    L.push('        </xtce:EntryList>');
    L.push(`        <xtce:BaseContainer containerRef="CCSDS_Packet"><xtce:RestrictionCriteria><xtce:Comparison parameterRef="CCSDS_APID" value="${ps[0].apid}"/></xtce:RestrictionCriteria></xtce:BaseContainer>`);
    L.push('      </xtce:SequenceContainer>');
  }
  L.push('    </xtce:ContainerSet>');
  if (dict.derived.length) {
    L.push('    <xtce:AlgorithmSet>');
    for (const d of dict.derived) L.push(`      <xtce:CustomAlgorithm name="${esc(d.name)}_Algo"><xtce:AlgorithmText language="vyuh-expr">${esc(d.expression)}</xtce:AlgorithmText><xtce:OutputSet><xtce:OutputParameterRef parameterRef="${esc(d.name)}"/></xtce:OutputSet></xtce:CustomAlgorithm>`);
    L.push('    </xtce:AlgorithmSet>');
  }
  L.push('  </xtce:TelemetryMetaData>');
  L.push('</xtce:SpaceSystem>');
  return L.join('\n');
}

export interface XtceImport { name: string; dict: Dictionary; containers: number; warnings: string[] }

/** Reads the XTCE subset a telemetry dictionary needs: parameter types, parameters, sequence containers, algorithms. */
export function fromXtce(xml: string): XtceImport {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('This is not well-formed XML.');
  const all = (el: Element | Document, tag: string) => Array.from(el.getElementsByTagNameNS('*', tag));
  const one = (el: Element | Document, tag: string) => all(el, tag)[0] as Element | undefined;
  const root = doc.documentElement;
  if (root.localName !== 'SpaceSystem') throw new Error(`The root element is <${root.localName}>, expected <SpaceSystem>.`);
  const warnings: string[] = [];
  const numAttr = (el: Element | undefined, a: string) => (el && el.getAttribute(a) !== null ? Number(el.getAttribute(a)) : undefined);
  const readRanges = (el: Element | undefined): Limits | undefined => {
    if (!el) return undefined;
    const w = one(el, 'WarningRange'), c = one(el, 'CriticalRange');
    if (!w && !c) return undefined;
    const lo = (r?: Element) => numAttr(r, 'minInclusive') ?? numAttr(r, 'minExclusive');
    const hi = (r?: Element) => numAttr(r, 'maxInclusive') ?? numAttr(r, 'maxExclusive');
    const ll = lo(c) ?? -Infinity, hh = hi(c) ?? Infinity;
    return { ll, l: lo(w) ?? ll, h: hi(w) ?? hh, hh };
  };

  interface T { unit: string; type: DictParam['type']; bits: number; calib: number[]; limits: DictParam['limits']; persistence: number }
  const types = new Map<string, T>();
  const typeSet = one(doc, 'ParameterTypeSet');
  for (const t of typeSet ? Array.from(typeSet.children) : []) {
    const name = t.getAttribute('name');
    if (!name) continue;
    const ie = one(t, 'IntegerDataEncoding'), fe = one(t, 'FloatDataEncoding');
    const terms = all(t, 'Term').map((x) => [Number(x.getAttribute('exponent') ?? 0), Number(x.getAttribute('coefficient') ?? 0)] as const);
    const calib: number[] = [];
    terms.forEach(([e, c]) => { for (let k = calib.length; k <= e; k++) calib[k] = 0; calib[e] = c; });
    const def = one(t, 'DefaultAlarm');
    const nominal = readRanges(def);
    const limits: DictParam['limits'] = { NOMINAL: nominal ?? NO_LIMITS };
    for (const ca of all(t, 'ContextAlarm')) {
      const v = one(ca, 'Comparison')?.getAttribute('value')?.toUpperCase();
      const r = readRanges(ca);
      if ((v === 'LEOP' || v === 'SAFE' || v === 'NOMINAL') && r) limits[v] = r;
      else warnings.push(`${name}: context alarm on "${v ?? '?'}" ignored (only LEOP, NOMINAL, SAFE phases are supported)`);
    }
    if (!nominal && t.localName !== 'EnumeratedParameterType' && t.localName !== 'BooleanParameterType') warnings.push(`${name}: no default alarm ranges, imported without limits`);
    types.set(name, {
      unit: one(t, 'Unit')?.textContent?.trim() ?? '',
      type: fe ? 'FLOAT' : ie?.getAttribute('encoding') === 'unsigned' ? 'UINT' : 'INT',
      bits: numAttr(fe ?? ie, 'sizeInBits') ?? (t.localName === 'BooleanParameterType' ? 1 : 16),
      calib, limits, persistence: numAttr(def, 'minViolations') ?? 1,
    });
  }

  // Parameters produced by an algorithm are derived, not decoded from a packet.
  const derived: DerivedParam[] = [];
  const derivedNames = new Set<string>();
  for (const a of all(doc, 'CustomAlgorithm').concat(all(doc, 'MathAlgorithm'))) {
    const out = one(a, 'OutputParameterRef')?.getAttribute('parameterRef');
    const text = one(a, 'AlgorithmText')?.textContent?.trim();
    if (out && text) { derivedNames.add(out); derived.push({ name: out, expression: text, unit: '', description: `Imported algorithm ${a.getAttribute('name') ?? ''}`.trim() }); }
    else warnings.push(`Algorithm ${a.getAttribute('name') ?? '?'} skipped: only single-output text algorithms are imported`);
  }

  const location = new Map<string, { packet: string; apid: number; offset: number }>();
  const containers = all(doc, 'SequenceContainer');
  for (const c of containers) {
    const packet = c.getAttribute('name') ?? 'UNNAMED';
    const apidEl = all(c, 'Comparison').find((x) => /apid/i.test(x.getAttribute('parameterRef') ?? ''));
    const apid = Number(apidEl?.getAttribute('value') ?? 0);
    let cursor = 0;
    for (const e of all(c, 'ParameterRefEntry')) {
      const ref = e.getAttribute('parameterRef');
      if (!ref) continue;
      const fixed = one(e, 'FixedValue')?.textContent;
      const offset = fixed !== undefined && fixed !== null ? Number(fixed) : cursor;
      location.set(ref, { packet, apid, offset });
      cursor = offset + (types.get(`${ref}_Type`)?.bits ?? 16);
    }
  }

  const params: DictParam[] = [];
  for (const p of all(doc, 'Parameter')) {
    if (p.parentElement?.localName !== 'ParameterSet') continue;
    const name = p.getAttribute('name');
    if (!name) continue;
    const t = types.get(p.getAttribute('parameterTypeRef') ?? '');
    const desc = p.getAttribute('shortDescription') ?? one(p, 'LongDescription')?.textContent?.trim() ?? '';
    if (derivedNames.has(name)) {
      const d = derived.find((x) => x.name === name)!;
      d.unit = t?.unit ?? ''; if (desc) d.description = desc;
      continue;
    }
    if (!t) { warnings.push(`${name}: type ${p.getAttribute('parameterTypeRef')} not found, skipped`); continue; }
    const loc = location.get(name);
    if (!loc) warnings.push(`${name}: not in any sequence container, imported as unassigned`);
    params.push({ name, description: desc, packet: loc?.packet ?? 'UNASSIGNED', apid: loc?.apid ?? 0, unit: t.unit, type: t.type, bits: t.bits, offset: loc?.offset ?? 0, calib: t.calib, limits: t.limits, persistence: t.persistence });
  }
  if (params.length === 0) throw new Error('No parameters found. The file needs a ParameterSet with Parameters that reference types in the ParameterTypeSet.');
  return { name: root.getAttribute('name') ?? 'imported', dict: { params, derived }, containers: containers.length, warnings };
}
