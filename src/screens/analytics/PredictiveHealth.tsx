import React, { useMemo } from 'react';
import { clsx } from 'clsx';
import { CalendarPlus } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Banner, Card, PageHead } from '../../components/molecules/Page';
import { FLEET } from '../../data/fleet';
import { seeded } from '../../ops/history';
import { toast } from '../../store/useToastStore';

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

const Gauge: React.FC<{ value: number }> = ({ value }) => {
  const R = 54, C = Math.PI * R, tone = value >= 70 ? '#56F000' : value >= 40 ? '#FCE83A' : '#FF3838';
  return (
    <svg viewBox="0 0 140 90" width="150" role="img" aria-label={`Health score ${value}`}>
      <path d="M16 76 A54 54 0 0 1 124 76" fill="none" stroke="#1F2D40" strokeWidth="12" strokeLinecap="round" />
      <path d="M16 76 A54 54 0 0 1 124 76" fill="none" stroke={tone} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(value / 100) * C} ${C}`} />
      <text x="70" y="70" textAnchor="middle" fontSize="28" fontWeight="700" fill="#E6EDF3">{value}</text>
      <text x="70" y="86" textAnchor="middle" fontSize="9.5" fill="#8496AB">health score</text>
    </svg>
  );
};

const Chart: React.FC<{ c: Comp; f: ReturnType<typeof forecast> }> = ({ c, f }) => {
  const W = 800, HH = 340, pad = 8, n = H + F - 1;
  const all = [...f.hist, ...f.ci.flat(), c.threshold];
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const x = (i: number) => (i / (n - 1)) * W, y = (v: number) => pad + (1 - (v - lo) / span) * (HH - 2 * pad);
  const line = (d: number[], off = 0) => d.map((v, i) => `${i ? 'L' : 'M'}${x(i + off).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const band = `${f.ci.map((b, i) => `${i ? 'L' : 'M'}${x(H - 1 + i).toFixed(1)},${y(b[1]).toFixed(1)}`).join('')}${[...f.ci].reverse().map((b, i) => `L${x(n - 1 - i).toFixed(1)},${y(b[0]).toFixed(1)}`).join('')}Z`;
  return (
    <svg viewBox={`0 0 ${W} ${HH}`} width="100%" height={HH} preserveAspectRatio="none" role="img" aria-label={`${c.metric} history and forecast`}>
      <path d={band} fill="#2DCCFF" fillOpacity=".16" />
      <line x1="0" x2={W} y1={y(c.threshold)} y2={y(c.threshold)} stroke="#D42C2C" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
      <path d={line(f.hist)} fill="none" stroke="#4DACFF" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <path d={line(f.fc, H - 1)} fill="none" stroke="#2DCCFF" strokeWidth="1.6" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
      <line x1={x(H - 1)} x2={x(H - 1)} y1="0" y2={HH} stroke="#5F7087" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

/** S21 · Health forecast: remaining useful life with its 90 % interval, per component. */
export const PredictiveHealth: React.FC<{ satId: string; onNavigate: (path: string) => void }> = ({ satId: routeSat, onNavigate }) => {
  const satId = FLEET.some((s) => s.sat_id === routeSat) ? routeSat : 'AKV-03';
  const [key, setKey] = React.useState<Key>('battery');
  const c = COMPONENTS[key];
  const f = useMemo(() => forecast(satId, key), [satId, key]);
  const outdated = satId === 'AKV-08';
  const planDate = new Date(Date.now() + f.lo * 86400000).toISOString().slice(0, 7);
  const soon = f.lo < 540;

  return (
    <>
      <PageHead title="Health forecast" sub="Remaining useful life per component, always with its uncertainty interval"
        actions={<>
          <select value={satId} onChange={(e) => onNavigate(`forecast?sat=${e.target.value}`)} aria-label="Satellite" className="h-9 rounded-md bg-[#111A25] border border-[#2A3B52] px-2.5 font-mono-code text-[13px]">{FLEET.map((s) => <option key={s.sat_id}>{s.sat_id}</option>)}</select>
          <Button variant="ghost" onClick={() => onNavigate(`/satellites/${satId}`)}>Open {satId}</Button>
        </>} />

      <div className="flex gap-1 border-b border-[#2A3B52] mb-4 overflow-x-auto" role="tablist">
        {(Object.keys(COMPONENTS) as Key[]).map((k) => <button key={k} role="tab" aria-selected={key === k} onClick={() => setKey(k)} className={clsx('px-4 py-2.5 text-[13px] font-semibold border-b-2 -mb-px whitespace-nowrap', key === k ? 'border-[#4DACFF] text-[#E6EDF3]' : 'border-transparent text-[#A3B1C2]')}>{COMPONENTS[k].name}</button>)}
      </div>
      {outdated && <Banner kind="warn" lead="Forecast outdated.">The last nightly run for AKV-08 was 3 days ago. The satellite is in safe mode and the telemetry used for training is incomplete.</Banner>}
      {c.shadow && <Banner kind="info" lead="Model in shadow.">{c.model} runs alongside the physics estimate and is not yet approved for planning decisions. Values are shown for evaluation.</Banner>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="surface p-4 flex items-center justify-center"><Gauge value={f.score} /></div>
        <div className="surface p-4"><span className="label-caps">Remaining useful life</span><div className="text-[34px] font-semibold leading-tight mt-1">{yrs(f.rulDays)}</div><span className="text-[12px] text-[#8496AB]">90 % interval <b className="text-[#BCC8D8] tabular-nums">{yrs(f.lo)} – {yrs(f.hi)}</b></span></div>
        <div className="surface p-4"><span className="label-caps">{c.metric}</span><div className="text-[28px] font-semibold leading-tight mt-1">{f.last.toFixed(c.dp)} <span className="text-[14px] text-[#8496AB]">{c.unit}</span></div><span className="text-[12px] text-[#8496AB]">limit {c.threshold} {c.unit} · {(f.perDay * 30).toFixed(c.dp + 1)} {c.unit}/month</span></div>
        <div className="surface p-4"><span className="label-caps">Model</span><div className="font-mono-code text-[13px] mt-2">{c.model}</div><span className={clsx('text-[12px] font-bold', c.shadow ? 'text-[#8496AB]' : outdated ? 'text-[#FCE83A]' : 'text-[#56F000]')}>{c.shadow ? 'in shadow' : outdated ? 'outdated' : 'current'}</span><span className="text-[12px] text-[#8496AB]"> · nightly 02:00 UTC</span></div>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
        <Card title={`${c.metric} · ${satId}`}>
          <Chart c={c} f={f} />
          <p className="text-[11.5px] text-[#8496AB] mt-2">History solid · forecast dashed · shaded 90 % band · red line is the limit ({c.threshold} {c.unit}) · vertical line is today.</p>
        </Card>
        <div className="flex flex-col gap-4 min-w-0">
          <Card title="Contributing factors">
            <div className="flex flex-col gap-2.5">{c.factors.map(([n, v]) => <div key={n} className="text-[12.5px]"><div className="flex justify-between"><span>{n}</span><span className="tabular-nums text-[#A3B1C2]">{v.toFixed(2)}</span></div><div className="h-1.5 rounded-full bg-[#1F2D40] mt-1"><i className="block h-full rounded-full bg-[#2DCCFF]" style={{ width: `${(v / 0.6) * 100}%` }} /></div></div>)}</div>
          </Card>
          <Card title="Planning recommendation">
            <p className="text-[13px] leading-relaxed mb-3">
              {soon
                ? <>Plan mitigation for {satId} {c.name.toLowerCase()} before <b className="tabular-nums">{planDate}</b>, the lower bound of the 90 % interval. {key === 'wheels' ? 'Reduce desaturation frequency and schedule a wheel speed bias change.' : key === 'battery' ? 'Cap depth of discharge at 25 % on imaging orbits.' : key === 'propulsion' ? 'Review the station-keeping cadence with flight dynamics.' : 'Reduce payload duty on eclipse-exit orbits.'}</>
                : <>No action needed for {satId} {c.name.toLowerCase()}. The earliest threshold crossing in the 90 % interval is <b className="tabular-nums">{yrs(f.lo)}</b> away. Review at the next nightly run.</>}
            </p>
            <Button size="sm" variant="secondary" onClick={() => { toast.info('Sent to mission plan', { body: `${satId} ${c.name} review added as a planning note` }); onNavigate('plan'); }}><CalendarPlus size={14} /> Add note to mission plan</Button>
          </Card>
          <Card title="Model status">
            <dl className="grid grid-cols-2 gap-y-1.5 text-[12.5px]"><dt className="text-[#8496AB]">Production</dt><dd className="font-mono-code">{c.shadow ? 'physics baseline' : c.model}</dd><dt className="text-[#8496AB]">Shadow</dt><dd className="font-mono-code">{c.shadow ? c.model : '—'}</dd><dt className="text-[#8496AB]">Backtest error</dt><dd>{c.shadow ? '11.8 %' : '4.2 %'}</dd></dl>
          </Card>
        </div>
      </div>
    </>
  );
};
