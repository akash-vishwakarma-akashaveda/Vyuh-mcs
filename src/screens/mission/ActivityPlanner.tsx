import React, { useState } from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, Check, Plus, Zap } from 'lucide-react';
import { create } from 'zustand';
import { Button } from '../../components/atoms/Button';
import { Banner, Card, KpiTile, PageHead, Td, Th } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { can } from '../../auth/policy';
import { useAuthStore } from '../../store/useAuthStore';
import { useMissionStore } from '../../store/useMissionStore';
import { toast } from '../../store/useToastStore';

type Kind = 'IMG' | 'DL' | 'MNT' | 'RES';
type Block = [sat: string, start: number, dur: number, kind: Kind, label: string];
type PlanState = 'DRAFT' | 'SOLVING' | 'SOLVED' | 'APPROVED' | 'UPLINKED';

const KIND: Record<Kind, [string, string]> = { IMG: ['Imaging', '#2DCCFF'], DL: ['Downlink', '#4DACFF'], MNT: ['Maintenance', '#FCE83A'], RES: ['Reserved', '#FF3838'] };
const SATS = ['AKV-01', 'AKV-02', 'AKV-03', 'AKV-04', 'AKV-05', 'AKV-06', 'AKV-07', 'AKV-09', 'NBH-01', 'NBH-02'];
const BASE: Block[] = [
  ['AKV-01', 0.4, 0.5, 'IMG', 'TR-5530 Pune'], ['AKV-01', 1.6, 0.25, 'DL', 'HYD'], ['AKV-01', 6.2, 0.6, 'IMG', 'TR-5534 Nagpur'], ['AKV-01', 7.4, 0.25, 'DL', 'BLR'],
  ['AKV-02', 1.1, 0.7, 'IMG', 'TR-5531 Indore'], ['AKV-02', 2.3, 0.3, 'DL', 'SVL'], ['AKV-02', 9.0, 0.5, 'MNT', 'RW desat'],
  ['AKV-03', 0.0, 0.35, 'RES', 'Heater recovery'], ['AKV-03', 3.2, 0.5, 'IMG', 'TR-5536 Kochi'], ['AKV-03', 4.1, 0.25, 'DL', 'HYD'],
  ['AKV-04', 2.0, 0.6, 'IMG', 'TR-5538 Surat'], ['AKV-04', 5.5, 0.3, 'DL', 'PTH'], ['AKV-04', 10.2, 0.8, 'MNT', 'TIME_SYNC'],
  ['AKV-05', 0.0, 0.4, 'DL', 'HYD dump'], ['AKV-05', 4.8, 0.7, 'IMG', 'TR-5540 Jaipur'], ['AKV-05', 8.1, 0.3, 'DL', 'SVL'],
  ['AKV-06', 1.4, 0.5, 'MNT', 'RW1 check'], ['AKV-06', 6.8, 0.6, 'IMG', 'TR-5541 Delta'], ['AKV-06', 7.9, 0.25, 'DL', 'PTH'],
  ['AKV-07', 0.9, 0.8, 'IMG', 'TR-5533 Chennai'], ['AKV-07', 3.0, 0.3, 'DL', 'SGP'], ['AKV-07', 3.1, 0.6, 'IMG', 'TR-5539 Madurai'],
  ['AKV-09', 2.6, 0.5, 'IMG', 'TR-5542 Bhopal'], ['AKV-09', 3.6, 0.25, 'DL', 'BLR'], ['AKV-09', 11.0, 0.5, 'RES', 'FDS manoeuvre'],
  ['NBH-01', 1.8, 0.4, 'IMG', 'TR-5521 Ludhiana'], ['NBH-01', 2.5, 0.25, 'DL', 'HYD'], ['NBH-02', 5.0, 0.5, 'IMG', 'TR-5525 Nashik'], ['NBH-02', 6.1, 0.25, 'DL', 'BLR'],
];
const SOLVED_PATCH = (b: Block): Block => (b[0] === 'AKV-07' && b[3] === 'DL' ? ['AKV-07', 4.3, 0.3, 'DL', 'HYD'] : b);
const ADDED: Block[] = [['AKV-10', 3.9, 0.5, 'IMG', 'TR-5543 Raipur'], ['AKV-10', 4.8, 0.25, 'DL', 'BLR']];
const UNSCHED: Record<string, string> = { 'TR-5544': 'Cloud forecast 78 % exceeds the request maximum of 30 %', 'TR-5545': 'No X-band downlink before the delivery deadline: SGP is in maintenance, HYD and BLR are fully booked' };
interface Req { id: string; prio: 'P1' | 'P2' | 'P3'; target: string; sat: string; state: 'Queued' | 'Scheduled' }
const REQS: Req[] = [
  { id: 'TR-5543', prio: 'P1', target: 'Raipur flood extent', sat: 'AKV-*', state: 'Queued' }, { id: 'TR-5544', prio: 'P2', target: 'Assam paddy survey', sat: 'AKV-*', state: 'Queued' },
  { id: 'TR-5545', prio: 'P3', target: 'Goa coastline', sat: 'AKV-*', state: 'Queued' }, { id: 'TR-5539', prio: 'P2', target: 'Madurai urban', sat: 'AKV-07', state: 'Scheduled' },
  { id: 'TR-5526', prio: 'P2', target: 'Ludhiana wheat NDVI', sat: 'NBH-01', state: 'Queued' },
];

// The plan survives leaving the screen: a solve or an approval is not undone by navigating away.
interface PlanStore { state: PlanState; extra: Req[]; set: (s: PlanState) => void; add: (r: Req) => void }
const usePlan = create<PlanStore>((set) => ({ state: 'DRAFT', extra: [], set: (state) => set({ state }), add: (r) => set((s) => ({ extra: [r, ...s.extra] })) }));
let reqSeq = 5546;

const STATE_TONE: Record<PlanState, string> = { DRAFT: 'text-[#A3B1C2] border-[#3E5370]', SOLVING: 'text-[#2DCCFF] border-[#2DCCFF]/50', SOLVED: 'text-[#9C9AEC] border-[#9C9AEC]/50', APPROVED: 'text-[#56F000] border-[#56F000]/50', UPLINKED: 'text-[#56F000] border-[#56F000]/50' };
const STATE_LABEL: Record<PlanState, string> = { DRAFT: 'Draft', SOLVING: 'Solving', SOLVED: 'Solved', APPROVED: 'Approved', UPLINKED: 'Uplinked as PUS 11 schedule' };
const hm = (ms: number) => new Date(ms).toISOString().slice(11, 16);

const Tracks: React.FC<{ blocks: Block[]; sat: string; L: number; W: number }> = ({ blocks, sat, L, W }) => {
  const N = 72; let st = 44, pw = 84; const S: number[] = [], P: number[] = [];
  for (let k = 0; k < N; k++) {
    const h = (k / N) * 12; const act = blocks.find((b) => b[0] === sat && h >= b[1] && h < b[1] + b[2]);
    st += act?.[3] === 'IMG' ? 6.5 : act?.[3] === 'DL' ? -14 : 0.1; st = Math.max(8, Math.min(100, st));
    pw += (act ? -2.6 : 0) + (h % 1.58 > 1.0 ? -0.9 : 1.2); pw = Math.max(20, Math.min(98, pw));
    S.push(st); P.push(pw);
  }
  const track = (data: number[], cap: number, color: string, name: string, y0: number) => {
    const H = 54, x = (i: number) => L + (i / (N - 1)) * (W - L), y = (v: number) => y0 + H - (v / 100) * H;
    const d = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const breach = name === 'Storage' ? data.some((v) => v > cap) : data.some((v) => v < cap);
    return (
      <g key={name}>
        <text x="4" y={y0 + 22} fontSize="12" fill="#BCC8D8">{name}</text><text x="4" y={y0 + 38} fontSize="10.5" fill={breach ? '#FF3838' : '#97A6BA'}>{name === 'Storage' ? `cap ${cap} %` : `min ${cap} %`}</text>
        <rect x={L} y={y0} width={W - L} height={H} fill="#0A1018" />
        <path d={`${d}L${W},${y0 + H}L${L},${y0 + H}Z`} fill={color} fillOpacity=".16" /><path d={d} fill="none" stroke={color} strokeWidth="1.5" />
        <line x1={L} x2={W} y1={y(cap)} y2={y(cap)} stroke="#D42C2C" strokeDasharray="6 4" />
      </g>
    );
  };
  return <svg viewBox={`0 0 ${W} 140`} width="100%" style={{ minWidth: 640, display: 'block' }} role="img" aria-label={`Resources for ${sat}`}>{track(S, 95, '#2DCCFF', 'Storage', 8)}{track(P, 35, '#4DACFF', 'Battery SOC', 76)}</svg>;
};

/** S17 · Mission plan: solve, review and approve the next 12 h; approval uplinks it as a PUS 11 schedule. */
export const ActivityPlanner: React.FC<{ onNavigate: (path: string) => void }> = () => {
  const { state, extra, set, add } = usePlan();
  const role = useAuthStore((s) => s.activeRole);
  const mayPlan = can('plan:edit', role);
  const maySubmit = can('tasking:submit', role);
  const [sel, setSel] = useState('AKV-07');
  const [filter, setFilter] = useState<'ALL' | 'P1' | 'P2' | 'P3'>('ALL');
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState('');
  const [prio, setPrio] = useState<Req['prio']>('P2');

  const solved = state !== 'DRAFT' && state !== 'SOLVING';
  const conflict = !solved;
  const blocks = solved ? [...BASE.map(SOLVED_PATCH), ...ADDED] : BASE;
  const sats = solved ? [...SATS.slice(0, 8), 'AKV-10', ...SATS.slice(8)] : SATS;
  const start = Math.floor(Date.now() / 3600_000) * 3600_000;
  const W = 1000, L = 90, rowH = 30, x = (h: number) => L + (h / 12) * (W - L);
  const all = [...extra, ...REQS];
  const reqState = (r: Req) => (!solved ? r.state : UNSCHED[r.id] ? 'Unscheduled' : 'Scheduled');
  const unscheduledCount = solved ? Object.keys(UNSCHED).length : 0;

  const solve = () => {
    set('SOLVING');
    window.setTimeout(() => { usePlan.getState().set('SOLVED'); toast.success('Plan solved', { body: `Score 0.947 · ${Object.keys(UNSCHED).length} requests unscheduled` }); }, 2000);
  };
  const approve = () => {
    set('APPROVED');
    useMissionStore.getState().appendAudit({ timestamp_utc: new Date().toISOString(), operator_id: 'PLAN', operator_name: useAuthStore.getState().user.name, sat_id: 'FLEET', command_mnemonic: 'PLAN_APPROVE', procedure_id: 'P-2026-261', procedure_version: '1', sequence_count: 27, result: 'ACK', params_summary: 'Plan P-2026-261 approved and uplinked as PUS 11 time-based schedule' });
    toast.success('Plan approved', { body: 'Plan P-2026-261 is being uplinked as a PUS 11 schedule.' });
    window.setTimeout(() => usePlan.getState().set('UPLINKED'), 1500);
  };

  return (
    <>
      <PageHead title="Mission plan" sub="The next 12 hours by satellite: imaging, downlinks and maintenance, solved against storage, power and station bookings"
        actions={<>
          <span className={clsx('inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-bold', STATE_TONE[state])}>{STATE_LABEL[state]}</span>
          <Button variant="secondary" onClick={solve} disabled={!mayPlan.allowed || state === 'SOLVING' || state === 'APPROVED' || state === 'UPLINKED'} title={mayPlan.reason}><Zap size={15} /> {state === 'SOLVING' ? 'Solving' : solved ? 'Re-solve' : 'Solve plan'}</Button>
          <Button onClick={approve} disabled={!mayPlan.allowed || state !== 'SOLVED'} title={mayPlan.reason}><Check size={15} /> Approve plan</Button>
        </>} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <KpiTile value="P-2026-261" label="Plan" sub={`${hm(start)}–${hm(start + 12 * 3600_000)} UTC`} />
        <KpiTile value={solved ? '0.947' : '—'} label="Solver score" sub="CP-SAT · 1.8 s · gap 0.4 %" tone={solved ? 'ok' : 'plain'} />
        <KpiTile value={blocks.length} label="Activities" sub={`${blocks.filter((b) => b[3] === 'DL').length} downlinks booked`} />
        <KpiTile value={solved ? unscheduledCount : '—'} label="Unscheduled" sub="each with a reason" tone={solved ? 'warn' : 'plain'} />
        <KpiTile value={conflict ? 1 : 0} label="Conflicts" sub={conflict ? 'storage over capacity' : 'none'} tone={conflict ? 'crit' : 'ok'} />
      </div>
      {state === 'SOLVING' && <Banner kind="info" lead="Solving.">The solver is running with stability penalties on 27 approved activities, using the current bookings and health forecasts.</Banner>}
      {conflict && state !== 'SOLVING' && <Banner kind="crit" lead="Conflict on AKV-07.">Imaging TR-5539 overlaps the SGP downlink at +3.0 h and storage reaches 100 % (cap 95 %). SGP is in maintenance. Solve the plan to re-book the downlink.</Banner>}
      {state === 'UPLINKED' && <Banner kind="ok" lead="Uplinked.">Plan P-2026-261 is loaded on board as a PUS 11 time-based schedule on 11 satellites.</Banner>}

      <Card title="Plan timeline" actions={<span className="flex gap-3 text-[11.5px] text-[#A3B1C2]">{Object.values(KIND).map(([l, c]) => <span key={l} className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{l}</span>)}</span>}>
        <div className="-m-4 overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${sats.length * rowH + 26}`} width="100%" style={{ minWidth: 760, display: 'block' }} role="img" aria-label="Plan timeline">
            {Array.from({ length: 13 }, (_, h) => <g key={h}><line x1={x(h)} x2={x(h)} y1={0} y2={sats.length * rowH} stroke="#213044" /><text x={x(h)} y={sats.length * rowH + 17} fontSize="10.5" fill="#97A6BA" textAnchor={h === 0 ? 'start' : h === 12 ? 'end' : 'middle'}>{hm(start + h * 3600_000)}</text></g>)}
            {sats.map((s, r) => (
              <g key={s} style={{ cursor: 'pointer' }} onClick={() => setSel(s)}>
                <rect x="0" y={r * rowH} width={W} height={rowH} fill={sel === s ? 'rgba(46, 111, 216,.16)' : 'transparent'} />
                <text x="8" y={r * rowH + 19} fontSize="12" fontWeight="700" fill={sel === s ? '#E6EDF3' : '#BCC8D8'} className="font-mono-code">{s}</text>
                {blocks.filter((b) => b[0] === s).map((b, k) => {
                  const bad = conflict && s === 'AKV-07' && b[1] >= 3 && b[1] < 3.2;
                  const fresh = solved && (ADDED.includes(b) || (s === 'AKV-07' && b[3] === 'DL'));
                  const w = Math.max(4, x(b[1] + b[2]) - x(b[1]));
                  return (
                    <g key={k}>
                      <rect x={x(b[1])} y={r * rowH + 5} width={w} height={rowH - 10} rx="2" fill={KIND[b[3]][1]} fillOpacity={b[3] === 'RES' ? 0.55 : 0.85} stroke={bad ? '#FF3838' : fresh ? '#E6EDF3' : 'none'} strokeWidth={bad ? 2 : 1} strokeDasharray={fresh ? '3 2' : ''} />
                      <title>{`${s} · ${KIND[b[3]][0]} · ${b[4]} · ${hm(start + b[1] * 3600_000)}–${hm(start + (b[1] + b[2]) * 3600_000)} UTC`}</title>
                      {w > 52 && <text x={x(b[1]) + 4} y={r * rowH + 19} fontSize="10" fill="#0A1018" fontWeight="700" className="font-mono-code">{b[4].split(' ')[0].slice(0, 8)}</text>}
                    </g>
                  );
                })}
              </g>
            ))}
          </svg>
        </div>
      </Card>

      <div className="grid xl:grid-cols-2 gap-4 my-4">
        <Card title={`Resource tracks · ${sel}`}>
          <div className="overflow-x-auto"><Tracks blocks={blocks} sat={sel} L={L} W={W} /></div>
          <p className="text-[12px] text-[#8496AB] mt-2">Re-planning applies stability penalties so approved activities move as little as possible.</p>
        </Card>
        <Card title="Solver result">
          {!solved ? <p className="text-[13px] text-[#8496AB]">{state === 'SOLVING' ? 'Solving. The result is ready in about 2 s.' : 'Draft plan. Run the solver to score it and place the queued requests.'}</p> : (
            <div className="flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-y-1.5 text-[13px]"><dt className="text-[#8496AB]">Score</dt><dd className="font-mono-code">0.947</dd><dt className="text-[#8496AB]">Moved activities</dt><dd className="font-mono-code">1 (AKV-07 downlink SGP → HYD)</dd><dt className="text-[#8496AB]">Stability penalty</dt><dd className="font-mono-code">0.012</dd></dl>
              <span className="label-caps">Unscheduled</span>
              {Object.entries(UNSCHED).map(([id, why]) => (
                <div key={id} className="flex gap-2 rounded-lg border border-[#213044] p-2.5"><AlertTriangle size={15} className="text-[#FCE83A] shrink-0 mt-0.5" /><span><b className="font-mono-code text-[12.5px]">{id}</b><span className="block text-[12px] text-[#A3B1C2]">{why}</span></span></div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Requests queue" actions={<>
        <div className="flex rounded-md border border-[#2A3B52] overflow-hidden text-[12px]" role="group" aria-label="Priority">
          {(['ALL', 'P1', 'P2', 'P3'] as const).map((p) => <button key={p} onClick={() => setFilter(p)} aria-pressed={filter === p} className={clsx('px-2.5 h-7', filter === p ? 'bg-[#2E6FD8] text-white' : 'text-[#A3B1C2] hover:bg-[#172434]')}>{p === 'ALL' ? 'All' : p}</button>)}
        </div>
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)} disabled={!maySubmit.allowed} title={maySubmit.reason}><Plus size={14} /> New request</Button>
      </>}>
        <div className="-m-4 overflow-x-auto">
          <table className="w-full text-[12.5px] border-collapse">
            <thead><tr><Th>Request</Th><Th>Priority</Th><Th>Target</Th><Th>Satellite</Th><Th>State</Th><Th>Reason</Th></tr></thead>
            <tbody>
              {all.filter((r) => filter === 'ALL' || r.prio === filter).map((r) => {
                const st = reqState(r);
                return (
                  <tr key={r.id}>
                    <Td className="font-mono-code">{r.id}</Td>
                    <Td><span className={clsx('text-[11px] font-bold', r.prio === 'P1' ? 'text-[#FF3838]' : r.prio === 'P2' ? 'text-[#FCE83A]' : 'text-[#8496AB]')}>{r.prio}</span></Td>
                    <Td>{r.target}</Td>
                    <Td className="font-mono-code">{r.sat === 'AKV-*' && solved && st === 'Scheduled' ? 'AKV-10' : r.sat}</Td>
                    <Td><span className={clsx('text-[11.5px] font-bold', st === 'Scheduled' ? 'text-[#56F000]' : st === 'Unscheduled' ? 'text-[#FCE83A]' : 'text-[#A3B1C2]')}>{st}</span></Td>
                    <Td className="text-[12px] text-[#A3B1C2]">{solved ? UNSCHED[r.id] ?? '—' : '—'}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {adding && (
        <Modal title="New imaging request" onClose={() => setAdding(false)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setAdding(false)}>Cancel</Button>
            <Button disabled={target.trim().length < 3} onClick={() => { const id = `TR-${reqSeq++}`; add({ id, prio, target: target.trim(), sat: 'AKV-*', state: 'Queued' }); setAdding(false); setTarget(''); toast.info(`Request ${id} queued`, { body: 'It is placed at the next solve.' }); }}>Queue request</Button></>}>
          <label className="flex flex-col gap-1 text-[12px] text-[#A3B1C2]">Target
            <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Area or place to image" className="h-9 rounded-md bg-[#0A1018] border border-[#2A3B52] px-2.5 text-[13px] text-[#E6EDF3] outline-none focus:border-[#2DCCFF]" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-[#A3B1C2]">Priority
            <select value={prio} onChange={(e) => setPrio(e.target.value as Req['prio'])} className="h-9 rounded-md bg-[#0A1018] border border-[#2A3B52] px-2.5 text-[13px] text-[#E6EDF3]"><option>P1</option><option>P2</option><option>P3</option></select>
          </label>
        </Modal>
      )}
    </>
  );
};
