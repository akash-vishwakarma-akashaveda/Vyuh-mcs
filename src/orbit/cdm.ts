/**
 * CCSDS 508.0 conjunction data message, KVN form: parse the fields the console shows, validate them,
 * and three sample messages (marked sample) so the inbox has something real-shaped to work with.
 */
import { FLEET } from '../data/fleet';
import type { Cdm } from '../ops/conjunctionStore';

const num = (v: string | undefined) => (v === undefined ? NaN : Number(v.replace(/\[.*\]/, '').trim()));
const utc = (v: string) => Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(v) ? v : `${v}Z`);

export function parseCdm(text: string, sample = false): { cdm?: Cdm; errors: string[] } {
  const head: Record<string, string> = {};
  const objs: Record<string, string>[] = [];
  let cur: Record<string, string> = head;
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || m[1] === 'COMMENT') continue;
    const [, k, v] = m;
    if (k === 'OBJECT') { cur = { OBJECT: v }; objs.push(cur); continue; }
    cur[k] = v.replace(/\s*\[[^\]]*\]\s*$/, '');
  }
  const errors: string[] = [];
  if (!head.CCSDS_CDM_VERS) errors.push('Missing CCSDS_CDM_VERS: this does not look like a CDM in KVN form.');
  for (const k of ['MESSAGE_ID', 'TCA', 'MISS_DISTANCE']) if (!head[k]) errors.push(`Missing ${k}.`);
  if (objs.length !== 2) errors.push(`Expected OBJECT1 and OBJECT2 sections, found ${objs.length}.`);
  if (errors.length) return { errors };
  const [o1, o2] = objs;
  const tcaMs = utc(head.TCA);
  const missM = num(head.MISS_DISTANCE), pc = num(head.COLLISION_PROBABILITY);
  if (!Number.isFinite(tcaMs)) errors.push(`TCA "${head.TCA}" is not a valid UTC time.`);
  if (!Number.isFinite(missM) || missM < 0) errors.push('MISS_DISTANCE must be a non-negative number of metres.');
  if (!Number.isFinite(pc) || pc < 0 || pc > 1) errors.push('COLLISION_PROBABILITY must be between 0 and 1 (it is required here).');
  const satId = (o1.OBJECT_NAME ?? '').trim();
  if (!FLEET.some((s) => s.sat_id === satId)) errors.push(`OBJECT1 is "${satId || 'unnamed'}", which is not one of our satellites.`);
  if (errors.length) return { errors };
  return {
    errors: [],
    cdm: {
      messageId: head.MESSAGE_ID, created: head.CREATION_DATE ?? '', originator: head.ORIGINATOR ?? 'unknown', sample,
      satId, objectId: o2.OBJECT_DESIGNATOR ?? o2.OBJECT_NAME ?? 'unknown', objectName: o2.OBJECT_NAME ?? 'Unknown object', objectType: o2.OBJECT_TYPE ?? 'UNKNOWN',
      tcaMs, missM, relSpeedMs: num(head.RELATIVE_SPEED) || 0, pc,
      r: num(head.RELATIVE_POSITION_R) || 0, t: num(head.RELATIVE_POSITION_T) || 0, n: num(head.RELATIVE_POSITION_N) || 0,
      status: 'NEW', receivedAt: Date.now(), raw: text,
    },
  };
}

const iso = (ms: number) => new Date(ms).toISOString().replace('Z', '');

function kvn(id: string, tca: number, miss: number, pc: number, sat: string, satDes: string, obj: string, objDes: string, type: string, rtn: [number, number, number], speed: number) {
  return `CCSDS_CDM_VERS = 1.0
COMMENT SAMPLE message shipped with the VYUH console; not from Space-Track
CREATION_DATE = ${iso(tca - 30 * 3600_000)}
ORIGINATOR = SAMPLE-18SDS
MESSAGE_FOR = ${sat}
MESSAGE_ID = ${id}
TCA = ${iso(tca)}
MISS_DISTANCE = ${miss} [m]
RELATIVE_SPEED = ${speed} [m/s]
RELATIVE_POSITION_R = ${rtn[0]} [m]
RELATIVE_POSITION_T = ${rtn[1]} [m]
RELATIVE_POSITION_N = ${rtn[2]} [m]
COLLISION_PROBABILITY = ${pc}
COLLISION_PROBABILITY_METHOD = FOSTER-1992
OBJECT = OBJECT1
OBJECT_DESIGNATOR = ${satDes}
CATALOG_NAME = SATCAT
OBJECT_NAME = ${sat}
OBJECT_TYPE = PAYLOAD
MANEUVERABLE = YES
REF_FRAME = ITRF
OBJECT = OBJECT2
OBJECT_DESIGNATOR = ${objDes}
CATALOG_NAME = SATCAT
OBJECT_NAME = ${obj}
OBJECT_TYPE = ${type}
MANEUVERABLE = NO
REF_FRAME = ITRF
`;
}

/** Three sample CDMs with times relative to now: one above the default 1e-4 threshold, one between 1e-6 and 1e-4, one low. */
export function sampleCdms(now = Date.now()): string[] {
  const h = 3600_000;
  return [
    kvn('SAMPLE_CDM_90003_31117', now + 7.4 * h, 182, 3.2e-4, 'AKV-03', '90003', 'FENGYUN 1C DEB', '31117', 'DEBRIS', [-41.2, 171.5, -48.9], 14210),
    kvn('SAMPLE_CDM_90047_33774', now + 21.1 * h, 640, 4.1e-6, 'NBH-01', '90047', 'COSMOS 2251 DEB', '33774', 'DEBRIS', [12.4, -611.8, 186.0], 11870),
    kvn('SAMPLE_CDM_90012_25407', now + 39.6 * h, 2410, 8.7e-8, 'AKV-12', '90012', 'SL-16 R/B', '25407', 'ROCKET BODY', [310.5, 2205.1, -905.3], 9480),
  ];
}
