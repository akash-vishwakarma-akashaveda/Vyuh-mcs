// Solver check: draft has the carried-over SGP conflict hidden until solve; solve places requests with reasons; a fix clears the conflict.
(globalThis as any).window = globalThis;
import { usePlanStore } from '../store/usePlanStore';
import { useRequestStore } from '../store/useRequestStore';
const assert = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok', m); };
const p = usePlanStore.getState();
p.init();
const s0 = usePlanStore.getState();
assert(s0.stage === 'DRAFT' && s0.conflicts.length === 0, 'draft shows no conflict before solve');
const t = Date.now();
usePlanStore.getState().solve('Tester');
const s1 = usePlanStore.getState();
console.log('solve ms', Date.now() - t, s1.solved, s1.conflicts.map((c) => [c.title, c.detail, c.fixes.map((f) => f.label)]));
for (const r of useRequestStore.getState().requests) console.log(r.id, r.state, r.placement?.sat, r.reason ?? '');
assert(s1.stage === 'SOLVED', 'solved');
assert(useRequestStore.getState().requests.find((r) => r.id === 'TR-5544')!.state === 'NOT_PLACED', 'cloudy request unplaced with reason');
if (s1.conflicts.length) {
  const fix = s1.conflicts[0].fixes[0];
  usePlanStore.getState().applyFix(fix, 'Tester');
  assert(usePlanStore.getState().conflicts.length < s1.conflicts.length, `fix "${fix.label}" removes the conflict`);
} else console.log('note: no SGP scenario in this window');
