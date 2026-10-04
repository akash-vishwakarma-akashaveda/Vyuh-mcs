import React, { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '../../components/atoms/Button';
import { Pill, Tone } from '../../components/atoms/Badge';
import { Banner, Card, PageHead, SampleTag, Segmented, Tile } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { RoleLink } from '../telemetry/RoleLink';
import { parseHash } from '../../router/routes';
import { useMissionStore } from '../../store/useMissionStore';
import { useFleetStore } from '../../store/useFleetStore';
import { useAuthStore } from '../../store/useAuthStore';
import { UNDO_WINDOW_MS, canDecide, useAdvisoryStore } from '../../store/useAdvisoryStore';
import { toast } from '../../store/useToastStore';
import { findDef, history } from '../../ops/history';
import { utc } from '../config/mdbLib';
import { Advisory } from '../../types';

const SUBSYSTEMS = ['POWER', 'ADCS', 'THERMAL', 'COMMS', 'PAYLOAD', 'OBC'];
const SUB_LABEL: Record<string, string> = { POWER: 'Power', ADCS: 'ADCS', THERMAL: 'Thermal', COMMS: 'Comms', PAYLOAD: 'Payload', OBC: 'OBC' };
const STATE_TONE: Record<Advisory['state'], Tone> = { NEW: 'action', CONFIRMED: 'ok', DISMISSED: 'neutral', LINKED: 'info' };
const STATE_LABEL: Record<Advisory['state'], string> = { NEW: 'New', CONFIRMED: 'Confirmed', DISMISSED: 'Dismissed', LINKED: 'Linked' };
const TIER_TONE: Record<Advisory['tier'], Tone> = { T1: 'crit', T2: 'warn', T3: 'info', T4: 'neutral' };
type Filter = 'ALL' | Advisory['state'];

const subsystemOf = (a: Advisory) => findDef(a.contributors[0]?.param ?? '')?.subsystem ?? 'OBC';
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

/** S20 · Anomaly advisories: the model advises, people decide. Each decision trains the next model. */
export const AnomalyDashboard: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const advisories = useMissionStore((s) => s.advisories);
  const { decisions, decide, undo, compare, setCompare, watch } = useAdvisoryStore();
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const actor = { id: user.id, name: user.name, role };
  const gate = canDecide(role);

  const params = parseHash().params;
  const filter = (['ALL', 'NEW', 'CONFIRMED', 'DISMISSED'].includes(params.f) ? params.f : 'ALL') as Filter;
  const go = (p: { id?: string; f?: Filter }) => onNavigate(`anomalies?${new URLSearchParams({ id: p.id ?? params.id ?? '', f: p.f ?? filter }).toString()}`);

  const rows = advisories.filter((a) => filter === 'ALL' || a.state === filter).sort((a, b) => Date.parse(b.detected_utc || new Date().toISOString()) - Date.parse(a.detected_utc || new Date().toISOString()));
  const selected = advisories.find((a) => a.advisory_id === params.id) ?? rows[0];
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => { watch(advisories.flatMap((a) => a.contributors.slice(0, 1).map((c) => `${a.sat_id}:${c.param}`))); }, [advisories, watch]);

  const labels = Object.values(decisions);
  const decision = selected ? decisions[selected.advisory_id] : undefined;
  const canUndo = selected && selected.state !== 'NEW' && decision && Date.now() - Date.parse(decision.at) < UNDO_WINDOW_MS;

  // Heatmap: every satellite with an advisory × the subsystem of its top contributing parameter.
  const heat = useMemo(() => {
    const sats = [...new Set(advisories.map((a) => a.sat_id))].sort();
    return sats.map((sat) => ({ sat, cells: SUBSYSTEMS.map((sub) => advisories.filter((a) => a.sat_id === sat && subsystemOf(a) === sub)) }));
  }, [advisories]);

  return (
    <>
      <PageHead title="Anomaly advisories" sub="The model advises, people decide. Each decision trains the next model." />
      <Banner kind="advisory" lead="Advisory only.">Never escalated on its own. A person confirms or dismisses with a reason; decisions are audited and can be changed for 24 h.</Banner>

      <div className="flex flex-wrap gap-4 items-start">
        <Card className="flex-[1_1_320px] min-w-0" title="Advisories" actions={<span className="text-[#7C8594]">{rows.length} shown</span>}>
          <Segmented<Filter> size="sm" className="mb-3" value={filter} onChange={(f) => go({ f })}
            options={(['ALL', 'NEW', 'CONFIRMED', 'DISMISSED'] as Filter[]).map((f) => ({ value: f, label: f === 'ALL' ? 'All' : STATE_LABEL[f as Advisory['state']] }))} />
          <div className="flex flex-col gap-2">
            {rows.length === 0 && <p className="text-[13px] text-[#7C8594]">No advisories in this filter.</p>}
            {rows.map((a) => (
              <button key={a.advisory_id} type="button" aria-pressed={selected?.advisory_id === a.advisory_id} onClick={() => go({ id: a.advisory_id })}
                className={clsx('text-left rounded-xl border px-3.5 py-3 flex flex-col gap-1.5', selected?.advisory_id === a.advisory_id ? 'bg-[#1B2130] border-[#232936]' : 'bg-[#161A22] border-[#161A22] hover:bg-[#1A1E27]')}>
                <span className="flex items-center justify-between gap-2"><Pill tone={TIER_TONE[a.tier]}>Tier {a.tier.slice(1)}</Pill><Pill tone={STATE_TONE[a.state]}>{STATE_LABEL[a.state]}{decisions[a.advisory_id] ? ` · ${decisions[a.advisory_id].by.split(' ').map((w) => w[0]).join('')}` : ''}</Pill></span>
                <span className="text-[14px]"><span className="font-mono-code">{a.sat_id}</span> · {a.title}</span>
                <span className="text-[12px] text-[#7C8594]">score <span className="font-mono-code text-[#C9CED6]">{a.score.toFixed(2)}</span> · {a.detected_utc ? ago(a.detected_utc) : 'just now'}</span>
              </button>
            ))}
          </div>
        </Card>

        <div className="flex-[999_1_560px] min-w-0 flex flex-col gap-4">
          {selected ? (
            <>
              <Card>
                <div className="flex flex-col gap-2 mb-3">
                  <span className="flex flex-wrap gap-1.5"><Pill tone={TIER_TONE[selected.tier]}>Tier {selected.tier.slice(1)}</Pill><Pill><span className="font-mono-code">{selected.advisory_id}</span></Pill><Pill tone="info">Model {selected.model}</Pill><Pill tone={STATE_TONE[selected.state]}>{STATE_LABEL[selected.state]}</Pill></span>
                  <h2 className="text-[20px] font-semibold tracking-[-0.01em]"><span className="font-mono-code">{selected.sat_id}</span> {selected.title}</h2>
                  <p className="text-[13px] text-[#9AA3B2]">{selected.detail} Detected {utc(selected.detected_utc || new Date().toISOString())}.{' '}
                    {selected.linked_alarm_id && <>Linked alarm <RoleLink to={`alarms?alarm=${selected.linked_alarm_id}&sat=${selected.sat_id}`} onNavigate={onNavigate}><span className="font-mono-code">{selected.linked_alarm_id}</span></RoleLink></>}
                  </p>
                </div>
                <EvidenceChart a={selected} />
                <div className="flex flex-wrap justify-between gap-2 mt-2 text-[12.5px]">
                  <span className="flex flex-wrap gap-3">{selected.contributors.map((c) => <span key={c.param} className="text-[#9AA3B2]"><span className="font-mono-code text-[#C9CED6]">{c.param}</span> {(c.contribution * 100).toFixed(0)} %</span>)}</span>
                  <RoleLink to={`parameter?sat=${selected.sat_id}&param=${selected.contributors[0]?.param ?? ''}`} onNavigate={onNavigate}>Open parameter history</RoleLink>
                </div>
              </Card>

              <div className="flex flex-wrap gap-4">
                <Card className="flex-[1_1_320px] min-w-0" title="Your decision">
                  <div className="flex flex-col gap-3">
                    {selected.state === 'NEW' ? (
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => { const r = decide(selected.advisory_id, 'CONFIRMED', '', actor); r.ok ? toast.success(`${selected.advisory_id} confirmed`) : toast.warning('Not recorded', { body: r.reason }); }} disabled={!gate.ok}>Confirm: real anomaly</Button>
                        <Button variant="secondary" onClick={() => setDismissing(true)} disabled={!gate.ok} reason={gate.ok ? undefined : gate.reason}>Dismiss with reason</Button>
                      </div>
                    ) : (
                      <Tile className="text-[13px] flex flex-col gap-1">
                        <span><Pill tone={STATE_TONE[selected.state]}>{STATE_LABEL[selected.state]}</Pill> {decision ? <>by {decision.by} ({decision.role}), {utc(decision.at)}</> : 'before this shift'}</span>
                        {decision?.reason && <span className="text-[#9AA3B2]">“{decision.reason}”</span>}
                      </Tile>
                    )}
                    {selected.state !== 'NEW' && (
                      <Button variant="secondary" className="self-start" onClick={() => { const r = undo(selected.advisory_id, actor); r.ok ? toast.info(`${selected.advisory_id} is new again`) : toast.warning('Not undone', { body: r.reason }); }}
                        disabled={!gate.ok || !canUndo} reason={!gate.ok ? gate.reason : !canUndo ? 'Decisions can be changed for 24 h after they are made in this console.' : undefined}>Undo decision</Button>
                    )}
                    <p className="text-[12px] text-[#7C8594]">Recorded in the audit ledger with your name; can be changed within 24 h.</p>
                  </div>
                </Card>

                <Card className="flex-[1_1_320px] min-w-0" title="Model on OPS-SAT flight data"
                  actions={<button type="button" onClick={() => setCompare(!compare)} className="text-[#F2A65A] hover:text-[#FFC48A]">{compare ? 'Hide comparison' : 'Compare a retrained model'}</button>}>
                  <div className="grid grid-cols-3 gap-2.5 mb-3">
                    {[['0.42', 'F1'], ['0.31', 'precision'], ['0.65', 'recall']].map(([v, l]) => (
                      <Tile key={l} className="flex flex-col gap-0.5"><span className="text-[30px] font-semibold tracking-[-0.02em]">{v}</span><span className="text-[12px] text-[#7C8594]">{l}</span></Tile>
                    ))}
                  </div>
                  <Bar label="Model F1" v={0.42} color="#6CB8FF" />
                  <Bar label="Limits alone F1" v={0.06} color="#7C8594" />
                  {compare && <>
                    <Bar label="Retrained candidate F1" v={0.47} color="#9B8CFF" />
                    <p className="text-[12px] text-[#7C8594] mt-1 flex flex-wrap items-center gap-2"><SampleTag>Candidate is a sample</SampleTag>
                      No retraining pipeline runs yet. Labels collected this shift: {labels.filter((d) => d.state === 'CONFIRMED').length} confirmed, {labels.filter((d) => d.state === 'DISMISSED').length} dismissed.</p>
                  </>}
                  <p className="text-[12px] text-[#7C8594] mt-2">Offline evaluation on the OPS-SAT-AD labelled segments (ESA, CC-BY-4.0). Triage help, not detection of record.</p>
                </Card>
              </div>
            </>
          ) : <Card><p className="text-[13px] text-[#7C8594]">No advisory selected.</p></Card>}

          <Card title="Advisories by satellite and subsystem" actions={<span className="text-[#7C8594]">from the {advisories.length} advisories above</span>}>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-1 text-[12px]">
                <thead><tr><th />{SUBSYSTEMS.map((s) => <th key={s} className="px-1 font-normal text-[#6B7383]">{SUB_LABEL[s]}</th>)}</tr></thead>
                <tbody>
                  {heat.map(({ sat, cells }) => (
                    <tr key={sat}>
                      <td className="pr-2 font-mono-code text-[#9AA3B2]">{sat}</td>
                      {cells.map((list, i) => {
                        const open = list.filter((a) => a.state !== 'DISMISSED');
                        const top = Math.max(0, ...open.map((a) => a.score));
                        const bg = list.length === 0 ? '#161A22' : open.length === 0 ? '#232936' : top >= 0.7 ? 'rgba(255,107,107,0.35)' : 'rgba(245,196,81,0.28)';
                        return (
                          <td key={i}>
                            <button type="button" disabled={!list.length} onClick={() => go({ id: list[0].advisory_id, f: 'ALL' })}
                              title={list.length ? list.map((a) => `${a.advisory_id} ${STATE_LABEL[a.state]} ${a.score.toFixed(2)}`).join('\n') : 'No advisories'}
                              className={clsx('w-[64px] h-[30px] rounded-lg font-mono-code', list.some((a) => a.advisory_id === selected?.advisory_id) && 'outline outline-2 outline-[#F28C28]')} style={{ background: bg }}>
                              {list.length || ''}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-[#7C8594] mt-2">Count per cell; red when an open advisory scores 0.70 or more, amber below, grey when all were dismissed. Subsystem is that of the top contributing parameter.</p>
          </Card>
        </div>
      </div>

      {dismissing && selected && <DismissModal id={selected.advisory_id} onClose={() => setDismissing(false)} onConfirm={(reason) => { const r = decide(selected.advisory_id, 'DISMISSED', reason, actor); if (r.ok) { toast.info(`${selected.advisory_id} dismissed`); setDismissing(false); } else toast.warning('Not recorded', { body: r.reason }); }} />}
    </>
  );
};

const Bar: React.FC<{ label: string; v: number; color: string }> = ({ label, v, color }) => (
  <div className="flex flex-col gap-1 mb-2 text-[12px] text-[#7C8594]">
    <span className="flex justify-between"><span>{label}</span><span className="font-mono-code text-[#C9CED6]">{v.toFixed(2)}</span></span>
    <span className="h-1.5 rounded-full bg-[#1A1E27] block"><span className="h-1.5 rounded-full block" style={{ width: `${v * 100}%`, background: color }} /></span>
  </div>
);

const DismissModal: React.FC<{ id: string; onClose: () => void; onConfirm: (reason: string) => void }> = ({ id, onClose, onConfirm }) => {
  const [reason, setReason] = useState('');
  const short = reason.trim().length < 8;
  return (
    <Modal title={`Dismiss ${id}`} onClose={onClose}
      footer={<><Button variant="secondary" autoFocus onClick={onClose}>Cancel</Button><Button onClick={() => onConfirm(reason)} disabled={short} reason={short ? 'At least 8 characters.' : undefined}>Dismiss</Button></>}>
      <label className="flex flex-col gap-1.5 text-[12px] text-[#7C8594]">Why is this not an anomaly?
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="For example: expected after the payload calibration run"
          className="rounded-[10px] bg-[#161A22] border border-[#1A1E27] p-3 text-[13px] text-[#E9ECF1] outline-none focus:border-[#6CB8FF]" />
      </label>
      <p className="text-[12px] text-[#7C8594]">The reason becomes the training label and is written to the audit ledger.</p>
    </Modal>
  );
};

/** Expected band (mean ± 3σ of the first 30 samples) against the parameter's recent values. */
const EvidenceChart: React.FC<{ a: Advisory }> = ({ a }) => {
  const param = a.contributors[0]?.param ?? '';
  const found = findDef(param);
  const live = useFleetStore((s) => s.cvt[a.sat_id]?.[param]);
  const samples = useAdvisoryStore((s) => s.samples[`${a.sat_id}:${param}`]) ?? [];
  if (!found) return <p className="text-[13px] text-[#7C8594]">{param} is not in the dictionary.</p>;
  const def = found.def;
  const liveV = live?.eu_value ?? def.value;
  const firstLive = samples[0]?.t ?? Date.now();
  // Before the console started sampling, the same history reconstruction the parameter screen uses.
  const ts = Array.from({ length: 40 }, (_, i) => Math.round(firstLive / 1000) - (40 - i) * 60);
  const hist = history(a.sat_id, def, samples[0]?.v ?? liveV, ts, Math.round(firstLive / 1000));
  const pts = [...ts.map((t, i) => ({ t: t * 1000, v: hist[i], live: false })), ...samples.map((s) => ({ ...s, live: true }))];
  const base = pts.slice(0, 30).map((p) => p.v);
  const mean = base.reduce((x, y) => x + y, 0) / base.length;
  const sd = Math.max(Math.sqrt(base.reduce((x, y) => x + (y - mean) ** 2, 0) / base.length), def.drift || 0.01);
  const lo = mean - 3 * sd, hi = mean + 3 * sd;
  const leave = pts.findIndex((p, i) => i >= 30 && (p.v < lo || p.v > hi));
  const W = 700, H = 200, L = 52, B = 22;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const vmin = Math.min(lo, ...pts.map((p) => p.v)), vmax = Math.max(hi, ...pts.map((p) => p.v));
  const span = vmax - vmin || 1;
  const x = (t: number) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - 8);
  const y = (v: number) => 8 + (1 - (v - vmin) / span) * (H - B - 16);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const fmt = (v: number) => Number(v.toPrecision(3)).toString();
  const hm = (t: number) => new Date(t).toISOString().slice(11, 16);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`${param} on ${a.sat_id} against its expected band`}>
        {[vmin, (vmin + vmax) / 2, vmax].map((v) => <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="#1A1E27" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#7C8594">{fmt(v)}</text></g>)}
        <rect x={L} y={y(hi)} width={W - L} height={Math.max(1, y(lo) - y(hi))} fill="rgba(74,222,154,0.08)" />
        <path d={`M${L} ${y(hi)}H${W}M${L} ${y(lo)}H${W}`} stroke="#4ADE9A" strokeOpacity=".35" strokeDasharray="4 5" />
        {samples.length > 0 && <line x1={x(firstLive)} x2={x(firstLive)} y1={8} y2={H - B} stroke="#343B4A" strokeDasharray="2 3" />}
        <path d={path} fill="none" stroke="#6CB8FF" strokeWidth="2" />
        {leave > 0 && <><line x1={x(pts[leave].t)} x2={x(pts[leave].t)} y1={8} y2={H - B} stroke="#7C8594" strokeDasharray="2 4" />
          <text x={x(pts[leave].t) + 6} y={20} fontSize="11.5" fill="#C9CED6">Leaves expected band {hm(pts[leave].t)}</text></>}
        <circle cx={x(t1)} cy={y(pts[pts.length - 1].v)} r="4" fill="#6CB8FF" />
        <text x={L} y={H - 4} fontSize="11" fill="#7C8594">{hm(t0)} UTC</text>
        <text x={W - 4} y={H - 4} textAnchor="end" fontSize="11" fill="#7C8594">{hm(t1)} UTC</text>
      </svg>
      <p className="text-[12px] text-[#7C8594]"><span className="text-[#4ADE9A]">■</span> Expected band, mean ± 3σ of the first 30 samples · <span className="text-[#6CB8FF]">—</span> {param} ({def.unit || 'no unit'}), now <span className="font-mono-code text-[#C9CED6]">{fmt(liveV)}</span>.
        {' '}{samples.length ? `Right of the dotted line: ${samples.length} values received live; left: archive reconstruction.` : 'Archive reconstruction; live values are added as they arrive.'}</p>
    </>
  );
};
