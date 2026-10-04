/**
 * Headless checks of the mission database logic: derived-parameter expressions (parsed, never
 * eval'd), dictionary diffs and the release check. Run: npm run check
 */
import assert from 'node:assert/strict';
import { checkDict, diffDict, evalExpr, parseExpr, platformDictionary, refs, tryDerived } from '../screens/config/mdbLib';

/* --- expressions ---------------------------------------------------------- */
const v = { A: 2, B: 3, C: -4 } as Record<string, number>;
const ev = (s: string) => evalExpr(parseExpr(s), (n) => v[n]);
assert.equal(ev('A + B * 2'), 8);
assert.equal(ev('(A + B) * 2'), 10);
assert.equal(ev('2 ^ 3 ^ 2'), 512, 'power is right-associative');
assert.equal(ev('-A ^ 2'), 4, 'unary minus binds tighter than ^: (-A)^2');
assert.equal(ev('abs(C) + max(A, B, 1)'), 7);
assert.equal(ev('1.5e1 / .5'), 30);
assert.deepEqual(refs(parseExpr('BAT_VOLTAGE * BUS_CURRENT + BAT_VOLTAGE')).sort(), ['BAT_VOLTAGE', 'BUS_CURRENT']);
for (const bad of ['', 'A +', 'A B', 'foo(A)', 'A)', '(A', 'A; alert(1)', 'constructor.constructor']) {
  assert.throws(() => evalExpr(parseExpr(bad), (n) => v[n]), Error, `should reject: ${bad}`);
}
assert.match(tryDerived('A + Z', new Set(['A']), (n) => v[n]).error ?? '', /Not in the dictionary: Z/);
assert.match(tryDerived('A / 0', new Set(['A']), (n) => v[n]).error ?? '', /finite/);

/* --- diff and release check ------------------------------------------------ */
const base = platformDictionary();
assert.ok(base.params.length > 40 && base.params.every((p) => p.limits.NOMINAL));
const next = structuredClone(base);
next.params.find((p) => p.name === 'BAT_TEMP')!.limits.NOMINAL.l = 11;
next.params.find((p) => p.name === 'BAT_SOC')!.limits.SAFE = { ll: 15, l: 30, h: 100, hh: 100 };
next.params = next.params.filter((p) => p.name !== 'TASK_OVERRUNS');
next.derived.push({ name: 'BAT_POWER', expression: 'BAT_VOLTAGE * BUS_CURRENT', unit: 'W', description: '' });
const d = diffDict(base, next);
assert.deepEqual(d.map((x) => `${x.change} ${x.item}`).sort(), [
  'ADDED BAT_POWER (derived)', 'ADDED BAT_SOC safe mode limits', 'CHANGED BAT_TEMP nominal limits', 'REMOVED TASK_OVERRUNS',
]);
assert.equal(diffDict(base, base).length, 0);

const ok = checkDict(next, { 'AKV-01': { BAT_VOLTAGE: 28, BUS_CURRENT: 12, BAT_TEMP: 9 } });
assert.equal(ok.failures.length, 0, ok.failures.join('; '));
assert.ok(ok.warnings.some((w) => w.includes('BAT_TEMP') && w.includes('warning')));
const broken = structuredClone(next);
broken.params[0].limits.NOMINAL = { ll: 5, l: 1, h: 2, hh: 3 };
broken.derived.push({ name: 'BAD', expression: 'NOPE * 2', unit: '', description: '' });
const bad = checkDict(broken, { 'AKV-01': { BAT_VOLTAGE: 28, BUS_CURRENT: 12 } });
assert.ok(bad.failures.some((f) => f.includes('out of order')));
assert.ok(bad.failures.some((f) => f.includes('BAD')));

console.log('engineer checks passed');
