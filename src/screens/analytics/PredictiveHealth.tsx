import React, { useMemo, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Pill } from '../../components/atoms/Badge';
import { Banner, Card, KpiRow, KpiTile, PageHead, SampleTag, Segmented, Tile } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { FLEET } from '../../data/fleet';
import { seeded } from '../../ops/history';
import { RoleLink } from '../telemetry/RoleLink';
import { useAuthStore } from '../../store/useAuthStore';
import { usePlanNoteStore } from '../../store/usePlanNoteStore';
import { toast } from '../../store/useToastStore';
import { utc } from '../config/mdbLib';
import { Select } from '../../components/molecules/Select';

type Key = 'battery' | 'wheels' | 'solar' | 'propulsion';
interface Comp { name: string; metric: string; unit: string; start: number; rate: number; noise: number; threshold: number; dir: 1 | -1; factors: [string, number][]; model: string; shadow: boolean; dp: number }
const COMPONENTS: Record<Key, Comp> = {
  battery: { name: 'Battery', metric: 'Capacity retention', unit: '%', start: 99.2, rate: -0.013, noise: 0.25, threshold: 70, dir: -1, dp: 1, factors: [['Depth of discharge', 0.41], ['BAT_TEMP cycling', 0.27], ['Eclipse count', 0.19], ['Charge rate', 0.08]], model: 'hf-battery-gpr 1.8.0', shadow: false },
  wheels: { name: 'Reaction wheels', metric: 'RW1 friction torque', unit: 'mNm', start: 0.62, rate: 0.0003, noise: 0.018, threshold: 1.6, dir: 1, dp: 2, factors: [['RW1 speed zero-crossings', 0.38], ['Bearing temperature', 0.29], ['Desaturation count', 0.21], ['Lubricant age', 0.1]], model: 'hf-rw-weibull 2.1.0', shadow: false },
  solar: { name: 'Solar array', metric: 'Array output at normal incidence', unit: 'W', start: 118, rate: -0.005, noise: 0.5, threshold: 96, dir: -1, dp: 1, factors: [['Radiation dose', 0.46], ['Thermal cycles', 0.31], ['Sibling current delta', 0.15], ['String faults', 0.05]], model: 'hf-solar-linear 1.2.4', shadow: false },
  propulsion: { name: 'Propulsion', metric: 'Xenon remaining', unit: 'kg', start: 4.8, rate: -0.0011, noise: 0.01, threshold: 0.6, dir: -1, dp: 1, factors: [['Station-keeping burns', 0.52], ['Collision avoidance', 0.24], ['Tank temperature', 0.13], ['Valve leak rate', 0.06]], model: 'hf-prop-bayes 0.9.0', shadow: true },
};
const H = 60, F = 31, STEP = 15;
const yrs = (d: number) => (d >= 365 ? `${(d / 365).toFixed(1)} y` : `${Math.round(d)} d`);

function forecast(satId: string, key: Key) {
  const c = COMPONENTS[key];
  const idx = Math.max(0, FLEET.findIndex((s) => s.sat_id === satId));
  const r = seeded(`${satId}-${key}`);
  const age = 0.55 + ((idx * 37) % 20) / 32;
  const rate = c.rate * age * (satId === 'AKV-06' && key === 'wheels' ? 3.6 : 1) * (satId === 'AKV-09' && key === 'solar' ? 3 : 1);
  const hist = Array.from({ length: H }, (_, i) => c.start + rate * i * STEP * (1 + i / 180) + (r() - 0.5) * c.noise * 2);
  const last = hist[H - 1];
  const fc = Array.from({ length: F }, (_, i) => last + rate * i * STEP * (1 + (H + i) / 180));
  const ci = fc.map((v, i) => { const w = c.noise + Math.abs(rate) * STEP * i * 0.28; return [v - w, v + w] as [number, number]; });
  const perDayReal = (rate * (1 + H / 180));
  const rulDays = Math.max(30, (c.threshold - last) / perDayReal);
  const margin = Math.abs(last - c.threshold) / Math.abs(c.start - c.threshold);
  const score = Math.round(Math.max(4, Math.min(98, margin * 100 - (age - 0.55) * 10)));
  return { hist, fc, ci, last, rulDays, lo: rulDays * 0.72, hi: rulDays * 1.34, score, perDay: perDayReal };
}

const DAY = 86400000;
const dateOf = (i: number) => new Date(Date.now() + (i - (H - 1)) * STEP * DAY);
const mon = (d: Date) => `${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })} ${String(d.getUTCFullYear()).slice(2)}`;

const Chart: React.FC<{ c: Comp; f: ReturnType<typeof forecast> }> = ({ c, f }) => {
  const W = 800, HH = 320, L = 56, B = 26, T = 10, n = H + F - 1;
  const all = [...f.hist, ...f.ci.flat(), c.threshold];
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const x = (i: number) => L + (i / (n - 1)) * (W - L - 10);
  const y = (v: number) => T + (1 - (v - lo) / span) * (HH - T - B);
  const line = (d: number[], off = 0) => d.map((v, i) => `${i ? 'L' : 'M'}${x(i + off).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const band = `${f.ci.map((b, i) => `${i ? 'L' : 'M'}${x(H - 1 + i).toFixed(1)},${y(b[1]).toFixed(1)}`).join('')}${[...f.ci].reverse().map((b, i) => `L${x(n - 1 - i).toFixed(1)},${y(b[0]).toFixed(1)}`).join('')}Z`;
  const yTicks = Array.from({ length: 5 }, (_, k) => lo + (span * k) / 4);
  const xTicks = Array.from({ length: 7 }, (_, k) => Math.round((k * (n - 1)) / 6));
  return (
    <svg viewBox={`0 0 ${W} ${HH}`} width="100%" height={HH} role="img" aria-label={`${c.metric} history and forecast`}>
      {yTicks.map((v) => <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="#1A1E27" /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#7C8594">{v.toFixed(c.dp)}</text></g>)}
      {xTicks.map((i) => <text key={i} x={x(i)} y={HH - 6} textAnchor="middle" fontSize="11" fill="#7C8594">{mon(dateOf(i))}</text>)}
      <path d={band} fill="#6CB8FF" fillOpacity=".14" />
      <line x1={L} x2={W} y1={y(c.threshold)} y2={y(c.threshold)} stroke="#FF6B6B" strokeDasharray="6 4" />
      <text x={W - 6} y={y(c.threshold) - 6} textAnchor="end" fontSize="11" fill="#FF7A7A">limit {c.threshold} {c.unit}</text>
      <path d={line(f.hist)} fill="none" stroke="#6CB8FF" strokeWidth="1.8" />
      <path d={line(f.fc, H - 1)} fill="none" stroke="#6CB8FF" strokeWidth="1.8" strokeDasharray="6 5" />
      <line x1={x(H - 1)} x2={x(H - 1)} y1={T} y2={HH - B} stroke="#6B7383" strokeDasharray="2 3" />
      <text x={x(H - 1) + 6} y={T + 12} fontSize="11" fill="#C9CED6">today</text>
    </svg>
  );
};

/** S21 · Health forecast: remaining useful life per component, always with its 90 % interval. */
export const PredictiveHealth: React.FC<{ satId: string; onNavigate: (path: string) => void }> = ({ satId: routeSat, onNavigate }) => {
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const notes = usePlanNoteStore((s) => s.notes);
  const addNote = usePlanNoteStore((s) => s.add);
  const sats = FLEET.filter((s) => role !== 'Customer User' || user.satellite_scope.includes(s.sat_id));
  const satId = sats.some((s) => s.sat_id === routeSat) ? routeSat : sats.find((s) => s.sat_id === 'AKV-03')?.sat_id ?? sats[0]?.sat_id ?? 'AKV-03';
  const [key, setKey] = useState<Key>('battery');
  const [noting, setNoting] = useState(false);
  const [text, setText] = useState('');
  const c = COMPONENTS[key];
  const f = useMemo(() => forecast(satId, key), [satId, key]);
  const planDate = new Date(Date.now() + f.lo * DAY).toISOString().slice(0, 10);
  const soon = f.lo < 540;
  const tone = f.score >= 70 ? 'ok' : f.score >= 40 ? 'warn' : 'crit';
  const advice = key === 'wheels' ? 'Reduce desaturation frequency and schedule a wheel speed bias change.' : key === 'battery' ? 'Cap depth of discharge at 25 % on imaging orbits.' : key === 'propulsion' ? 'Review the station-keeping cadence with flight dynamics.' : 'Reduce payload duty on eclipse-exit orbits.';
  const mine = notes.filter((n) => n.sat_id === satId);

  return (
    <>
      <PageHead title="Health forecast" sub={<span className="flex flex-wrap items-center gap-2">Remaining useful life per component, always with its uncertainty interval <SampleTag>Model output is sample data</SampleTag></span>}
        actions={<>
          <Select value={satId} onChange={(e) => onNavigate(`forecast?sat=${e.target.value}`)} aria-label="Satellite" className="h-10 rounded-xl bg-[#161A22] border border-[#232936] px-3 font-mono-code text-[13px] text-[#E9ECF1]">{sats.map((s) => <option key={s.sat_id}>{s.sat_id}</option>)}</Select>
          <RoleLink to={`satellite?sat=${satId}`} onNavigate={onNavigate}>Open {satId}</RoleLink>
        </>} />

      <Segmented<Key> className="mb-4 max-w-full overflow-x-auto" value={key} onChange={setKey} options={(Object.keys(COMPONENTS) as Key[]).map((k) => ({ value: k, label: COMPONENTS[k].name }))} />
      {c.shadow && <Banner kind="info" lead="Model in shadow.">{c.model} runs alongside the physics estimate and is not approved for planning decisions. Values are shown for evaluation.</Banner>}

      <KpiRow>
        <KpiTile label="Health score" value={f.score} tone={tone} sub="100 is new, 0 is at the limit" />
        <KpiTile label="Remaining useful life" value={yrs(f.rulDays)} sub={<>90 % interval <span className="font-mono-code text-[#C9CED6]">{yrs(f.lo)} – {yrs(f.hi)}</span></>} />
        <KpiTile label={c.metric} value={<>{f.last.toFixed(c.dp)} <span className="text-[15px] text-[#7C8594]">{c.unit}</span></>} sub={`limit ${c.threshold} ${c.unit} · ${(f.perDay * 30).toFixed(c.dp + 1)} ${c.unit} per month`} />
        <KpiTile label="Model" value={<span className="font-mono-code text-[16px]">{c.model}</span>} tone={c.shadow ? 'plain' : 'ok'} sub={`${c.shadow ? 'in shadow' : 'current'} · nightly 02:00 UTC · backtest error ${c.shadow ? '11.8' : '4.2'} %`} />
      </KpiRow>

      <div className="flex flex-wrap gap-4">
        <Card className="flex-[999_1_560px] min-w-0" title={`${c.metric} · ${satId}`}>
          <Chart c={c} f={f} />
          <p className="text-[12px] text-[#7C8594] mt-1">Solid: measured, one point per {STEP} days. Dashed: forecast. Shaded: 90 % interval. Red dashed: the limit.</p>
        </Card>
        <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-4">
          <Card title="Planning recommendation">
            <p className="text-[13px] leading-relaxed text-[#C9CED6] mb-3">
              {soon ? <>Plan mitigation for {satId} {c.name.toLowerCase()} before <b className="font-mono-code">{planDate}</b>, the lower bound of the 90 % interval. {advice}</>
                : <>No action needed for {satId} {c.name.toLowerCase()}. The earliest threshold crossing in the 90 % interval is <b>{yrs(f.lo)}</b> away.</>}
            </p>
            <Button size="sm" variant="secondary" onClick={() => { setText(`${c.name}: ${soon ? advice : 'review at the next nightly run.'} Earliest limit crossing ${planDate}.`); setNoting(true); }}><CalendarPlus size={14} /> Add note to mission plan</Button>
          </Card>
          <Card title="Contributing factors">
            <div className="flex flex-col gap-2.5">{c.factors.map(([n, v]) => <div key={n} className="text-[12.5px]"><div className="flex justify-between"><span>{n}</span><span className="font-mono-code text-[#9AA3B2]">{v.toFixed(2)}</span></div><span className="block h-1.5 rounded-full bg-[#1A1E27] mt-1"><span className="block h-full rounded-full bg-[#6CB8FF]" style={{ width: `${(v / 0.6) * 100}%` }} /></span></div>)}</div>
          </Card>
          <Card title={`Plan notes for ${satId}`}>
            <div className="flex flex-col gap-2">
              {mine.length === 0 && <p className="text-[13px] text-[#7C8594]">None raised yet.</p>}
              {mine.map((n) => (
                <Tile key={n.id} className="flex flex-col gap-1 text-[13px]">
                  <span className="flex items-center justify-between gap-2"><span className="font-mono-code text-[12px] text-[#9AA3B2]">{n.id}</span><Pill tone={n.state === 'OPEN' ? 'action' : 'ok'}>{n.state === 'OPEN' ? 'Waiting for planner' : n.state === 'PLANNED' ? 'Planned' : 'Closed'}</Pill></span>
                  <span>{n.text}</span>
                  <span className="text-[12px] text-[#7C8594]">{n.by}, {utc(n.at)} · plan before {n.due}</span>
                </Tile>
              ))}
              {mine.length > 0 && <RoleLink to="plan" onNavigate={onNavigate}>Open the mission plan</RoleLink>}
            </div>
          </Card>
        </div>
      </div>

      {noting && (
        <Modal title="Add note to mission plan" sub={`${satId} · ${c.name}`} onClose={() => setNoting(false)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setNoting(false)}>Cancel</Button>
            <Button disabled={text.trim().length < 8} reason={text.trim().length < 8 ? 'Write at least 8 characters.' : undefined}
              onClick={() => { const n = addNote({ sat_id: satId, subject: `${satId} ${c.name}`, text: text.trim(), due: planDate, by: user.name, source: 'forecast' }, user.id); setNoting(false); toast.success(`${n.id} added to the mission plan`, { body: 'The Mission Planner sees it on the plan.' }); }}>Add note</Button></>}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label="Note" className="rounded-[10px] bg-[#161A22] border border-[#1A1E27] p-3 text-[13px] text-[#E9ECF1] outline-none focus:border-[#6CB8FF]" />
          <p className="text-[12px] text-[#7C8594]">Plan before <span className="font-mono-code">{planDate}</span>. Recorded in the audit ledger with your name.</p>
        </Modal>
      )}
    </>
  );
};