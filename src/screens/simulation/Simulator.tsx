import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { FlaskConical } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Pill } from '../../components/atoms/Badge';
import { Banner, Card, KpiTile, PageHead, Segmented, Td, Th, Tile } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { SCENARIOS } from '../../data/fleet';
import { LIVE_SATELLITES } from '../../live/api';
import { can } from '../../auth/policy';
import { useAuthStore } from '../../store/useAuthStore';
import { AUTOMATED, BUILT_IN_SAT, CLEAN, FIELDS, Impairments, PRESETS, useSimulatorStore } from '../../store/useSimulatorStore';
import { toast } from '../../store/useToastStore';
import { Select } from '../../components/molecules/Select';

const SPEEDS: [number, string][] = [[1, '1×'], [10, '10×'], [100, '100×'], [1000, '1000×'], [0, 'max']];
const FAULT_SATS = LIVE_SATELLITES.filter((s) => s !== 'OPSSAT-1');
const fmt = (n: number | undefined) => (n ?? 0).toLocaleString('en-US');
const field = 'h-9 rounded-[10px] bg-[#161A22] border border-[#1A1E27] px-3 text-[13px] text-[#E9ECF1] outline-none focus:border-[#6CB8FF] min-w-0';

type Confirm = { title: string; body: string; label: string; run: () => Promise<unknown> | unknown };

/** S23 · Simulator: drives the backend simulator (faults, OPS-SAT replay, link impairments) and shows the pipeline counters live. */
export const Simulator: React.FC = () => {
  const sim = useSimulatorStore();
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const actor = { id: user.id, name: user.name, role };
  const gate = can('sim:run', role);
  const off = !gate.allowed || !sim.online;
  // Heater faults on AKV-03 also run in the console's own simulation when the backend is off.
  const offReason = !gate.allowed ? gate.reason : sim.online === false ? 'The backend simulator is offline.' : sim.online === null ? 'Connecting to the simulator…' : undefined;

  useEffect(() => sim.start(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [sat, setSat] = useState('AKV-03');
  const [runSat, setRunSat] = useState('AKV-03');
  const [speed, setSpeed] = useState(100);
  const [draft, setDraft] = useState<Impairments | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const link = draft ?? sim.link;

  const report = (r: { ok: boolean; reason?: string }, ok: string) => (r.ok ? toast.success(ok) : toast.warning('Not done', { body: r.reason }));
  const applyLink = (next: Impairments) => {
    const go = async () => { report(await sim.applyLink(next, actor), next.enabled ? 'Link impairments applied' : 'Link clean'); setDraft(null); };
    if (next.enabled && next.scope === '' && (sim.link.scope !== '' || !sim.link.enabled)) {
      setConfirm({ title: 'Impair the link for every spacecraft?', body: 'Every simulated satellite and the OPS-SAT replay will lose, corrupt or reorder frames until you turn this off. Operators watching any satellite will see gaps.', label: 'Apply to every spacecraft', run: go });
    } else void go();
  };

  const g = (st: string, k: string) => sim.stats?.stages[st]?.[k] ?? 0;
  const rate = (st: string, k: string) => {
    const a = sim.stats, b = sim.prev;
    if (!a || !b) return 0;
    return Math.max(0, (a.stages[st]?.[k] ?? 0) - (b.stages[st]?.[k] ?? 0)) / Math.max(0.5, a.uptime_s - b.uptime_s);
  };
  const lat = sim.stats?.latency?.ert_to_ws;
  const rp = sim.replay;
  const pct = rp && rp.samples ? (100 * rp.position) / rp.samples : 0;
  const fault = sim.faults[sat];
  const heaterOff = !gate.allowed || (!sim.online && !(sim.online === false && sat === BUILT_IN_SAT));

  const pipe: [string, string, string, string][] = [
    ['Frames sent', fmt(g('sim', 'frames_generated')), `${rate('sim', 'frames_generated').toFixed(0)}/s`, '#7C8594'],
    ['Received in order', fmt(g('frame', 'processed')), `${fmt(g('frame', 'lost'))} lost`, g('frame', 'lost') ? '#F5C451' : '#7C8594'],
    ['CRC failed', fmt(g('frame', 'crc_error')), 'quarantined', g('frame', 'crc_error') ? '#F5C451' : '#7C8594'],
    ['Recovered', fmt(g('gapreplay', 'recovered')), 'from recording', '#4ADE9A'],
    ['Packets', fmt(g('packet', 'forwarded')), `${fmt(g('packet', 'seq_gap'))} sequence gaps`, g('packet', 'seq_gap') ? '#F5C451' : '#4ADE9A'],
    ['Parameters', fmt(g('tm', 'params_out')), `${rate('tm', 'params_out').toFixed(0)}/s`, '#7C8594'],
    ['Alarms', fmt(g('alarm', 'raised')), `raised · ${fmt(g('alarm', 'cleared'))} cleared`, '#7C8594'],
    ['To screen p50', lat ? `${lat.p50_ms.toFixed(0)} ms` : '—', lat ? `p95 ${lat.p95_ms.toFixed(0)} ms` : 'no samples yet', '#7C8594'],
  ];

  return (
    <>
      <PageHead title="Simulated spacecraft and ground link" sub="Drives the backend simulator: the simulated satellites plus OPSSAT-1 replaying ESA flight data." />

      <div role="note" className="flex items-center gap-2.5 rounded-xl bg-[#6CB8FF]/12 text-[#8CC8FF] px-3.5 py-2.5 text-[13px] mb-4">
        <FlaskConical size={16} aria-hidden="true" /><span><b className="font-semibold">Simulation</b> · no real spacecraft is commanded from this screen</span>
        <span className="ml-auto text-[12px] text-[#7C8594]">{sim.online ? `simulator up ${Math.round(sim.stats?.uptime_s ?? 0)} s` : sim.online === false ? 'simulator offline' : 'connecting…'}</span>
      </div>

      {sim.error && <Banner kind="crit" lead="Simulator." action={<Button size="sm" variant="ghost" onClick={sim.clearError}>Dismiss</Button>}>{sim.error}</Banner>}
      {!gate.allowed && <Banner kind="info" lead="Read only.">{gate.reason}</Banner>}

      <div className="flex justify-between items-baseline mb-2"><h2 className="text-[14px] font-medium">Pipeline</h2><span className="text-[12px] text-[#7C8594]">live counters since the last reset</span></div>
      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {pipe.map(([n, v, x, c]) => <KpiTile key={n} label={n} value={v} sub={<span style={{ color: c }}>{x}</span>} />)}
      </div>

      <div className="flex flex-wrap gap-4 mb-4">
        <Card className="flex-[999_1_560px] min-w-0" title="Faults on a satellite"
          actions={<label className="flex items-center gap-2 text-[#7C8594]">Satellite<Select value={sat} onChange={(e) => setSat(e.target.value)} className={clsx(field, 'font-mono-code')}>{FAULT_SATS.map((s) => <option key={s}>{s}</option>)}</Select></label>}>
          <div className="flex flex-col gap-2">
            <FaultRow name="Heater A failure" desc={fault === 'HEATER_A_FAIL' ? 'battery cools toward 1.5 °C · active now' : 'heater A stops; the battery cools toward 1.5 °C'} active={fault === 'HEATER_A_FAIL'}
              action={fault ? <Button size="sm" variant="secondary" disabled={heaterOff} onClick={async () => report(await sim.clearFault(sat, actor), `Faults cleared on ${sat}`)}>Clear fault</Button>
                : <Button size="sm" variant="secondary" disabled={heaterOff} onClick={() => setConfirm({ title: `Inject heater A failure on ${sat}?`, body: `The simulator stops heater A on ${sat}. BAT_TEMP falls and alarms will be raised for anyone watching it.`, label: 'Inject fault', run: async () => report(await sim.inject(sat, 'HEATER_A_FAIL', actor), `Heater A failure on ${sat}`) })}>Inject…</Button>} />
            <FaultRow name="Heater B on" desc="the recovery action from PR-THM-004; the battery warms toward 20 °C" active={false}
              action={<Button size="sm" variant="secondary" disabled={heaterOff} onClick={async () => report(await sim.inject(sat, 'HTR_B_ON', actor), `Heater B on, ${sat}`)}>Switch on</Button>} />
            <FaultRow name="Lose the next telecommand" desc="drops the next TC frame on the forward link; tests COP-1 retransmission" active={false}
              action={<Button size="sm" variant="secondary" disabled={off} onClick={() => setConfirm({ title: 'Lose the next telecommand?', body: 'The next telecommand frame sent to any spacecraft is dropped on the forward link. COP-1 should retransmit it.', label: 'Drop next frame', run: async () => report(await sim.dropNextTc(actor), 'Next telecommand frame will be lost') })}>Inject…</Button>} />
            <FaultRow name="Stale interlock telemetry" desc="the command console treats interlock values as stale, so critical-command gates must fail closed" active={sim.staleInterlock}
              action={<Button size="sm" variant="secondary" disabled={!gate.allowed} onClick={() => report(sim.setStaleInterlock(!sim.staleInterlock, actor), sim.staleInterlock ? 'Interlock telemetry back to normal' : 'Interlock telemetry is stale')}>{sim.staleInterlock ? 'Turn off' : 'Turn on'}</Button>} />
            {offReason && <p className="text-[12.5px] text-[#9AA3B2]">{offReason}{sim.online === false && gate.allowed ? ` Heater faults on ${BUILT_IN_SAT} still run in the console's own simulation.` : ''}</p>}
            <p className="text-[12px] text-[#7C8594]">Reaction wheel and receiver lockout faults are not in the backend simulator yet. Active faults: {Object.keys(sim.faults).length ? Object.entries(sim.faults).map(([k, v]) => `${k} ${v}`).join(', ') : 'none'}.</p>
          </div>
        </Card>

        <Card className="flex-[1_1_320px] min-w-0" title="OPS-SAT flight data replay"
          actions={<Pill tone={rp?.state === 'running' ? 'ok' : rp?.state === 'paused' ? 'warn' : 'neutral'} glyph={rp?.state === 'running' ? 'normal' : undefined}>{rp ? `${rp.state[0].toUpperCase()}${rp.state.slice(1)}${rp.state === 'running' ? ` ${rp.speed ? `${rp.speed}×` : 'max'}` : ''}` : '—'}</Pill>}>
          <div className="flex flex-col gap-3">
            <span className="flex items-baseline gap-2"><span className="text-[32px] font-semibold tracking-[-0.02em]">{pct.toFixed(0)}%</span><span className="text-[13px] text-[#7C8594]">sample <span className="font-mono-code text-[#C9CED6]">{fmt(rp?.position)}</span> of <span className="font-mono-code text-[#C9CED6]">{fmt(rp?.samples)}</span></span></span>
            <input type="range" min={0} max={100} step={0.5} value={pct} aria-label="Replay position" disabled={off} onChange={(e) => void sim.replayControl({ action: 'seek', position_pct: Number(e.target.value) }, actor)} />
            <Segmented size="sm" value={String(speed)} options={SPEEDS.map(([v, l]) => ({ value: String(v), label: l }))}
              onChange={(v) => { setSpeed(Number(v)); if (rp?.state === 'running' || rp?.state === 'paused') void sim.replayControl({ action: 'speed', speed: Number(v) }, actor); }} />
            <div className="flex flex-wrap gap-2">
              {rp?.state === 'running'
                ? <Button className="flex-1" variant="secondary" disabled={off} onClick={() => void sim.replayControl({ action: 'pause' }, actor)}>Pause</Button>
                : rp?.state === 'paused'
                  ? <Button className="flex-1" variant="secondary" disabled={off} onClick={() => void sim.replayControl({ action: 'resume' }, actor)}>Resume</Button>
                  : <Button className="flex-1" disabled={off} onClick={() => void sim.replayControl({ action: 'start', speed, position_pct: pct >= 99.9 ? 0 : pct }, actor)}>Start</Button>}
              <Button className="flex-1" variant="danger" disabled={off || !rp || rp.state === 'stopped' || rp.state === 'idle'} onClick={() => void sim.replayControl({ action: 'stop' }, actor)}>Stop</Button>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-[#9AA3B2]"><input type="checkbox" disabled={off} checked={rp?.loop ?? false} onChange={(e) => void sim.replayControl({ action: 'speed', loop: e.target.checked }, actor)}  /> Loop at the end</label>
            <p className="text-[12px] text-[#7C8594]">{fmt(rp?.segments)} segments, {fmt(rp?.anomaly_segments)} labelled anomalous · {fmt(rp?.samples_emitted)} samples emitted · recorded {rp?.recorded_utc?.slice(0, 10) ?? '—'}</p>
          </div>
        </Card>
      </div>

      <Card title="Space-to-ground link" className="mb-4"
        actions={<label className="flex items-center gap-2 text-[13px] text-[#C9CED6]"><input type="checkbox" disabled={off} checked={link.enabled} onChange={(e) => applyLink({ ...link, enabled: e.target.checked })}  /> Impairments on</label>}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(PRESETS).map(([name, p]) => (
              <button key={name} type="button" disabled={off} onClick={() => applyLink({ ...CLEAN, scope: link.scope, ...p, enabled: name !== 'Clean link' })}
                className="h-8 px-3 rounded-full bg-[#161A22] text-[12.5px] text-[#C9CED6] hover:bg-[#1B2130] disabled:opacity-40">{name}</button>
            ))}
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <label className="flex flex-col gap-1.5 text-[12px] text-[#7C8594]">Applies to
              <Select disabled={off} value={link.scope} onChange={(e) => applyLink({ ...link, scope: e.target.value })} className={clsx(field, 'font-mono-code')}>
                {LIVE_SATELLITES.map((s) => <option key={s} value={s}>{s} only</option>)}<option value="">every spacecraft</option>
              </Select>
            </label>
            {FIELDS.map(([k, l, min, max, step]) => (
              <label key={k} className="flex flex-col gap-1.5 text-[12px] text-[#7C8594]">{l}
                <input type="number" disabled={off} min={min} max={max} step={step} value={link[k] as number}
                  onChange={(e) => setDraft({ ...link, [k]: Math.min(max, Math.max(min, Number(e.target.value) || 0)) })}
                  onBlur={() => { if (draft) applyLink(draft); }} className={clsx(field, 'font-mono-code')} />
              </label>
            ))}
          </div>
          <p className="text-[12px] text-[#7C8594]">Fields apply when you leave them. {link.enabled ? `Now impairing ${link.scope || 'every spacecraft'}.` : 'The link is clean.'}</p>
        </div>
      </Card>

      <div className="flex flex-wrap gap-4">
        <Card flush className="flex-[999_1_560px] min-w-0" title="Scenarios"
          actions={<label className="flex items-center gap-2 text-[#7C8594]">Run on<Select value={runSat} onChange={(e) => setRunSat(e.target.value)} className={clsx(field, 'h-8 font-mono-code')}>{FAULT_SATS.map((s) => <option key={s}>{s}</option>)}</Select></label>}>
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead><tr><Th>Scenario</Th><Th>Last run</Th><Th /></tr></thead>
              <tbody>
                {SCENARIOS.map((s) => {
                  const run = sim.runs[s.id];
                  const auto = AUTOMATED[s.id];
                  return (
                    <tr key={s.id}>
                      <Td><span className="font-mono-code text-[12px] text-[#9AA3B2]">{s.id}</span><span className="block text-[#E9ECF1]">{s.name}</span><span className="block text-[12px] text-[#7C8594]">{auto ?? `${s.description} Not automated against the backend yet.`}</span></Td>
                      <Td>{run ? <><Pill tone={run.verdict === 'PASSED' ? 'ok' : run.verdict === 'FAILED' ? 'crit' : run.verdict === 'RUNNING' ? 'info' : 'neutral'}>{run.verdict === 'RUNNING' ? 'Running' : run.verdict[0] + run.verdict.slice(1).toLowerCase()}</Pill><span className="block text-[12px] text-[#7C8594] mt-1">{run.sat} · {run.by}</span></> : <span className="text-[#7C8594]">No run recorded</span>}</Td>
                      <Td className="text-right">{auto && <Button size="sm" variant="secondary" disabled={off || run?.verdict === 'RUNNING'} onClick={() => report(sim.runScenario(s.id, runSat, actor), `${s.id} started on ${runSat}`)}>Run</Button>}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="flex-[1_1_320px] min-w-0" title="Event log">
          <div className="flex flex-col gap-1 max-h-[340px] overflow-y-auto">
            {Object.values(sim.runs).flatMap((r) => r.log.map((l) => `${l}  [${r.id}]`)).reverse().concat(sim.log).slice(0, 80).map((l, i) => <span key={i} className="font-mono-code text-[12px] text-[#9AA3B2]">{l}</span>)}
            {sim.log.length === 0 && Object.keys(sim.runs).length === 0 && <span className="text-[13px] text-[#7C8594]">Nothing yet. Actions on this screen are listed here and in the audit ledger.</span>}
          </div>
        </Card>
      </div>

      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setConfirm(null)}>Cancel</Button><Button variant="warning" onClick={() => { const c = confirm; setConfirm(null); void c.run(); }}>{confirm.label}</Button></>}>
          <p className="text-[13px] text-[#C9CED6]">{confirm.body}</p>
        </Modal>
      )}
    </>
  );
};

const FaultRow: React.FC<{ name: string; desc: string; active: boolean; action: React.ReactNode }> = ({ name, desc, active, action }) => (
  <Tile className={clsx('flex justify-between items-center gap-3 text-[13px]', active && '!bg-[#F5C451]/[0.06]')}>
    <span className="flex flex-col gap-0.5 min-w-0"><span className="flex items-center gap-2">{name}{active && <Pill tone="warn">Active</Pill>}</span><span className="text-[12px] text-[#7C8594]">{desc}</span></span>
    {action}
  </Tile>
);
