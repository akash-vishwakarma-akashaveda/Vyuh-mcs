/**
 * Generates the backend platform dictionary and the simulator's behaviour model from the
 * console's own parameter table (src/data/fleet.ts), so the console and the Go backend can
 * never disagree about which parameters exist, their units or their limits.
 *
 *   npm run gen:dictionary
 *
 * Outputs (embedded by the Go `config` package):
 *   config/dictionaries/platform.json   one ParameterSet per subsystem APID (Mission Database input)
 *   config/dictionaries/sim-model.json  per-parameter baseline / drift / kind (spacecraft simulator only)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { PARAMETERS } from '../src/data/fleet';

const TIME_HEADER_BYTES = 6; // CUC: 4 coarse + 2 fine bytes
const FIRST_APID = 100;

type Kind = 'analog' | 'state' | 'counter';

function kindOf(unit: string): Kind {
  if (unit === '') return 'state';
  if (unit === 'cnt') return 'counter';
  return 'analog';
}

/** Finest gain (EU per count) that still fits the parameter's range in a signed 16-bit raw value. */
function gainFor(maxAbs: number): number {
  for (const g of [0.0001, 0.001, 0.01, 0.1, 1, 10]) {
    if (maxAbs / g <= 30000) return g;
  }
  return 10;
}

const round = (n: number, digits = 6) => Number(n.toFixed(digits));

const sets: unknown[] = [];
const model: Record<string, { subsystem: string; apid: number; base: number; drift: number; kind: Kind }> = {};

Object.entries(PARAMETERS).forEach(([subsystem, defs], idx) => {
  const apid = FIRST_APID + idx;
  let bitOffset = TIME_HEADER_BYTES * 8;

  const parameters = defs.map((d) => {
    const kind = kindOf(d.unit);
    model[d.param_id] = { subsystem, apid, base: d.value, drift: d.drift, kind };
    // A counter that has an upper limit restarts before reaching it (e.g. a per-orbit count), so it never alarms by just running long.
    if (kind === 'counter' && d.warnHi !== -1 && d.warnHi > d.value) (model[d.param_id] as Record<string, unknown>).wrap = Math.floor(d.warnHi * 0.9);

    const p: Record<string, unknown> = {
      apid,
      param_name: d.param_id,
      description: d.name,
      byte_order: 'BIG_ENDIAN',
      eu_unit: d.unit,
      bit_offset: bitOffset,
    };

    if (kind === 'state') {
      Object.assign(p, { data_type: 'UINT', bit_length: 8, calib_type: 'NONE' });
      bitOffset += 8;
    } else if (kind === 'counter') {
      Object.assign(p, { data_type: 'UINT', bit_length: 32, calib_type: 'NONE' });
      bitOffset += 32;
    } else {
      const maxAbs = Math.max(
        Math.abs(d.value) * 2,
        ...[d.critLo, d.critHi, d.warnLo, d.warnHi].filter((x) => x !== -1).map(Math.abs),
        1e-9,
      );
      const gain = gainFor(maxAbs);
      Object.assign(p, { data_type: 'INT', bit_length: 16, calib_type: 'POLYNOMIAL', calib_data: [0, gain] });
      bitOffset += 16;
    }

    // Only encode a limit the parameter can't reach in normal operation (wander is ~8 drifts),
    // so nominal telemetry never alarms — alarms in the demo mean something.
    if (kind !== 'state') {
      const clear = (lim: number) => lim !== -1 && Math.abs(lim - d.value) > Math.max(10 * d.drift, 0.02 * Math.max(Math.abs(d.value), 1));
      const alarms: Record<string, unknown> = { alarm_enabled: true, hysteresis_pct: 0 };
      if (clear(d.critLo) && d.critLo < d.value) alarms.low_low_limit = d.critLo;
      if (clear(d.warnLo) && d.warnLo < d.value) alarms.low_limit = d.warnLo;
      if (clear(d.warnHi) && d.warnHi > d.value) alarms.high_limit = d.warnHi;
      if (clear(d.critHi) && d.critHi > d.value) alarms.high_high_limit = d.critHi;
      if (Object.keys(alarms).length > 2) p.alarms = alarms;
    }
    return p;
  });

  sets.push({
    apid,
    name: subsystem,
    time_header_bytes: TIME_HEADER_BYTES,
    time_epoch: '2026-01-01T00:00:00Z',
    time_ticks_per_sec: 65536,
    parameters,
  });
});

mkdirSync('config/dictionaries', { recursive: true });
writeFileSync('config/dictionaries/platform.json', JSON.stringify(sets, null, 2) + '\n');
writeFileSync('config/dictionaries/sim-model.json', JSON.stringify(model, null, 2) + '\n');
console.log(`wrote ${sets.length} parameter sets, ${Object.keys(model).length} parameters`);
