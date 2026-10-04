import React, { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Pill, Tone } from '../../components/atoms/Badge';
import { Banner, Card, PageHead, SampleTag, Segmented, Td, Th, Tile } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { can } from '../../auth/policy';
import { STATIONS } from '../../data/fleet';
import { profile, SOC_MIN, STORAGE_CAP } from '../../orbit/planSolver';
import { tenantOfPerson, useAuthStore } from '../../store/useAuthStore';
import { useMissionStore } from '../../store/useMissionStore';
import { resources, usePlanStore } from '../../store/usePlanStore';
import { ImagingRequest, useRequestStore } from '../../store/useRequestStore';
import { PlanNote, usePlanNoteStore } from '../../store/usePlanNoteStore';
import { hm, ImagingRequestForm, RoleLink, useHashParams, utc } from './shared';

const KIND = { IMG: ['#3DD9C1', '#06221E', 'Imaging'], DL: ['#6CB8FF', '#071A2E', 'Downlink'], MNT: ['#9B8CFF', '#15102E', 'Maintenance'] } as const;
const NOTE_STATE: Record<PlanNote['state'], [string, Tone]> = { OPEN: ['Open', 'action'], PLANNED: ['Planned', 'info'], CLOSED: ['Closed', 'neutral'] };

/** Notes raised for the plan from other screens (the health forecast first): the planner marks them planned or closed. */
const EngineeringNotes: React.FC<{ editReason?: string; onNavigate: (p: string) => void }> = ({ editReason, onNavigate }) => {
  const notes = usePlanNoteStore((s) => s.notes);
  const setState = usePlanNoteStore((s) => s.setState);
  const open = notes.filter((n) => n.state !== 'CLOSED').length;
  return (
    <Card title="Notes from engineering" actions={notes.length > 0 && <span className="text-[12px] text-[#7C8594]">{open} open</span>}>
      {notes.length === 0 ? (
        <p className="text-[13px] text-[#7C8594]">No notes yet. Engineers raise them from the health forecast when a satellite needs planning attention.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {notes.map((n) => (
            <li key={n.id} className="bg-[#161A22] rounded-xl px-3.5 py-3 flex flex-col gap-1.5">
              <span className="flex items-center gap-2 min-w-0">
                <span className="font-mono-code text-[13px] text-[#E9ECF1]">{n.sat_id}</span>
                <span className="text-[13px] font-medium truncate flex-1 min-w-0">{n.subject}</span>
                <Pill tone={NOTE_STATE[n.state][1]}>{NOTE_STATE[n.state][0]}</Pill>
              </span>
              <span className="text-[12.5px] text-[#9AA3B2] leading-[1.45]">{n.text}</span>
              <span className="text-[12px] text-[#7C8594]">Plan before <span className="font-mono-code text-[#C9CED6]">{n.due}</span> · {n.by} · {utc(Date.parse(n.at))} · <RoleLink to={`forecast?sat=${n.sat_id}`} onNavigate={onNavigate}>Forecast</RoleLink></span>
              {n.state !== 'CLOSED' && (
                <span className="flex flex-wrap gap-2 pt-0.5">
                  {n.state === 'OPEN' && <Button size="sm" variant="secondary" disabled={!!editReason} onClick={() => setState(n.id, 'PLANNED')}>Mark planned</Button>}
                  <Button size="sm" variant="ghost" disabled={!!editReason} reason={editReason} onClick={() => setState(n.id, 'CLOSED')}>Close</Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const STAGES = ['Draft', 'Solved', 'Approval', 'Approved', 'Uplinked'];

function reqStatus(r: ImagingRequest): [string, Tone] {
  const p = r.placement;
  switch (r.state) {
    case 'NEW': return ['New · solve to place', 'action'];
    case 'PLACED': return [`Placed · ${p?.sat} ${p ? hm(p.at) : ''}`, 'ok'];
    case 'NOT_PLACED': return [`Not placed · ${r.reason ?? ''}`, 'neutral'];
    case 'DROPPED': return ['Dropped', 'neutral'];
    case 'SCHEDULED': return [`Scheduled · ${p?.sat ?? ''} ${p ? hm(p.at) : ''}`, 'ok'];
    case 'ACQUIRED': return ['Acquired', 'info'];
    default: return ['Delivered', 'neutral'];
  }
}

/** Storage and battery through the window for one satellite, from the plan's own activities. */
const Tracks: React.FC<{ sat: string }> = ({ sat }) => {
  const { activities, from, span } = usePlanStore();
  const { series } = profile(sat, activities, resources, from, span);
  const W = 1000, L = 96, H = 54;
  const track = (key: 'storage' | 'soc', y0: number, limit: number, color: string, name: string, rule: string) => {
    const x = (i: number) => L + (i / (series.length - 1)) * (W - L), y = (v: number) => y0 + H - (Math.min(100, Math.max(0, v)) / 100) * H;
    const d = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');
    const bad = key === 'storage' ? series.some((p) => p.storage > limit) : series.some((p) => p.soc < limit);
    return (
      <g>
        <text x="4" y={y0 + 22} fontSize="12" fill="#C9CED6">{name}</text>
        <text x="4" y={y0 + 38} fontSize="10.5" fill={bad ? '#FF7A7A' : '#7C8594'}>{rule}</text>
        <rect x={L} y={y0} width={W - L} height={H} rx="6" fill="#161A22" />
        <path d={`${d}L${W},${y0 + H}L${L},${y0 + H}Z`} fill={color} fillOpacity=".14" /><path d={d} fill="none" stroke={color} strokeWidth="1.5" />
        <line x1={L} x2={W} y1={y(limit)} y2={y(limit)} stroke="#FF6B6B" strokeDasharray="6 4" />
      </g>
    );
  };
  return (
    <svg viewBox={`0 0 ${W} 132`} width="100%" style={{ minWidth: 560, display: 'block' }} role="img" aria-label={`Storage and battery for ${sat}`}>
      {track('storage', 4, STORAGE_CAP * 100, '#6CB8FF', 'Storage', `cap ${STORAGE_CAP * 100} %`)}
      {track('soc', 72, SOC_MIN, '#4ADE9A', 'Battery', `min ${SOC_MIN} %`)}
    </svg>
  );
};

/** S17 · Mission plan: solve requests against contacts, storage and power; approval by a Flight Director; uplink as PUS-11. */
export const ActivityPlanner: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const plan = usePlanStore();
  const requests = useRequestStore((s) => s.requests);
  const approvals = useMissionStore((s) => s.approvals);
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const mayPlan = can('plan:edit', role);
  const maySubmit = can('tasking:submit', role);
  const [q, setQ] = useHashParams();
  const [adding, setAdding] = useState(false);
  const [solving, setSolving] = useState(false);
  const [confirmUplink, setConfirmUplink] = useState(false);
  const view = (q.view ?? 'open') as 'open' | 'all';

  useEffect(() => { plan.init(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const appr = approvals.find((a) => a.approval_id === plan.approvalId);
  const eff = plan.stage !== 'PENDING_APPROVAL' ? plan.stage : appr?.state === 'APPROVED' ? 'APPROVED' : appr?.state === 'REJECTED' ? 'REJECTED' : appr?.state === 'PENDING' ? 'PENDING' : 'LOST';
  const stageIdx = { DRAFT: 0, SOLVED: 1, PENDING: 2, REJECTED: 1, LOST: 1, APPROVED: 3, UPLINKED: 4 }[eff];
  const expired = plan.from > 0 && Date.now() > plan.from + plan.span;
  const locked = eff === 'PENDING' ? 'Waiting for the Flight Director; the plan is frozen while it is reviewed.' : eff === 'APPROVED' ? 'Approved: uplink it or start the next plan.' : eff === 'UPLINKED' ? 'Uplinked: start the next plan to change anything.' : expired ? 'This plan window has passed.' : undefined;
  const editReason = !mayPlan.allowed ? mayPlan.reason : locked;

  const sats = useMemo(() => [...new Set(plan.activities.map((a) => a.sat))].sort(), [plan.activities]);
  const sel = q.sat && sats.includes(q.sat) ? q.sat : plan.conflicts[0]?.sat ?? sats[0];
  const shown = requests.filter((r) => view === 'all' || r.state === 'NEW' || r.state === 'PLACED' || r.state === 'NOT_PLACED' || (r.state === 'SCHEDULED' && !!r.placement));
  const x = (t: number) => Math.min(100, Math.max(0, ((t - plan.from) / plan.span) * 100));
  const solved = plan.solved && plan.stage !== 'DRAFT';
  const conflictSats = new Set(plan.conflicts.map((c) => c.sat));

  const runSolve = () => { setSolving(true); window.setTimeout(() => { usePlanStore.getState().solve(user.name); setSolving(false); }, 30); };

  return (
    <>
      <PageHead crumb="Plan / Mission plan" title={`Plan ${plan.planId}`}
        sub={plan.from ? <>Plan window <span className="font-mono-code text-[#C9CED6]">{hm(plan.from)} to {hm(plan.from + plan.span)} UTC</span></> : undefined}
        actions={
          <div className="w-[440px] max-w-full flex gap-1" role="list" aria-label={`Plan stage: ${STAGES[stageIdx]}, ${stageIdx + 1} of 5`}>
            {STAGES.map((n, i) => (
              <span key={n} role="listitem" className="flex-1 flex flex-col gap-1.5">
                <span className="h-1.5 rounded-[3px] block" style={{ background: i < stageIdx || (i === 4 && stageIdx === 4) ? '#4ADE9A' : i === stageIdx ? '#F28C28' : '#232936' }} />
                <span className="text-[12px]" style={{ color: i === stageIdx ? '#E9ECF1' : i < stageIdx ? '#9AA3B2' : '#6B7383' }}>{n}</span>
              </span>
            ))}
          </div>} />

      {expired && <Banner kind="warn" lead="Plan window passed." action={<Button size="sm" variant="secondary" disabled={!mayPlan.allowed} reason={mayPlan.reason} onClick={() => plan.init(true)}>Start next plan</Button>}>Open requests carry over to the next plan.</Banner>}
      {eff === 'REJECTED' && <Banner kind="crit" lead={`Rejected by ${appr?.decided_by}.`}>{appr?.reject_reason || 'No reason given.'} Change the plan and send it again.</Banner>}
      {eff === 'LOST' && <Banner kind="warn" lead="Approval request not found.">The approval queue was reset (console reload). Send the plan for approval again.</Banner>}

      {solved && plan.conflicts.map((c) => (
        <section key={c.id} className="bg-[#11141B] border border-[#1A1E27] rounded-2xl px-5 py-4 mb-4 flex flex-wrap justify-between gap-3 items-center">
          <div className="flex flex-col gap-1.5 flex-[1_1_360px] min-w-0">
            <span className="flex flex-wrap items-center gap-2.5"><Pill tone="warn">Conflict after solve</Pill><span className="text-[14px] font-medium">{c.title} UTC</span></span>
            <span className="text-[13px] text-[#9AA3B2]">{c.detail}</span>
          </div>
          <span className="flex flex-wrap gap-2">
            {c.fixes.map((f) => <Button key={f.label} variant="secondary" disabled={!!editReason} onClick={() => plan.applyFix(f, user.name)}>{f.label}</Button>)}
            {editReason && <span className="text-[12.5px] text-[#9AA3B2] self-center max-w-[36ch]">{editReason}</span>}
          </span>
        </section>
      ))}

      <Card title="Timeline" actions={<span className="flex flex-wrap gap-1.5">
        {Object.values(KIND).map(([c, , l]) => <span key={l} className="flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[12px] bg-[#161A22] text-[#C9CED6]"><i className="w-2.5 h-1.5 rounded-[3px] block" style={{ background: c }} />{l}</span>)}
        <Pill tone="crit">Conflict</Pill></span>}>
        <div className="overflow-x-auto">
          <div className="min-w-[760px] flex flex-col gap-1.5">
            <div className="grid grid-cols-[80px_1fr] font-mono-code text-[11px] text-[#6B7383]"><span /><span className="flex justify-between">{[0, 3, 6, 9, 12].map((h) => <span key={h}>{hm(plan.from + h * 3600_000)}</span>)}</span></div>
            {sats.map((s) => (
              <div key={s} className="grid grid-cols-[80px_1fr] h-8 items-center">
                <button type="button" onClick={() => setQ({ sat: s })} aria-pressed={s === sel} className={`font-mono-code text-[12.5px] text-left ${s === sel ? 'text-[#F2A65A]' : 'text-[#C9CED6] hover:text-[#E9ECF1]'}`}>{s}</button>
                <div className="relative h-8 rounded-lg bg-[#161A22]" style={s === sel ? { boxShadow: 'inset 0 0 0 1px #232936' } : undefined}>
                  {plan.activities.filter((a) => a.sat === s).map((a) => {
                    const bad = solved && conflictSats.has(s) && a.kind === 'DL' && STATIONS.find((st) => st.id === a.station)?.state === 'MAINTENANCE';
                    const [bg, tc, name] = KIND[a.kind];
                    const w = x(a.end) - x(a.start);
                    return (
                      <span key={a.id} title={`${s} · ${name} · ${a.label} · ${hm(a.start)}–${hm(a.end)} UTC${a.fixed ? ' · from the approved plan' : ''}`}
                        className="absolute top-1 bottom-1 rounded-[7px] font-mono-code text-[11px] font-medium px-1.5 box-border overflow-hidden whitespace-nowrap flex items-center min-w-[10px]"
                        style={{ left: `${x(a.start)}%`, width: `max(${w}%, ${a.kind === 'IMG' ? 64 : 34}px)`, background: bad ? 'rgba(255,107,107,0.12)' : bg, color: bad ? '#FF7A7A' : tc, border: `1.5px solid ${bad ? '#FF6B6B' : 'transparent'}` }}>
                        {a.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-4 mt-4">
        <div className="flex-[999_1_560px] min-w-0">
          <Card title="Requests" actions={<>
            <Segmented size="sm" value={view} onChange={(v) => setQ({ view: v === 'open' ? undefined : v })} options={[{ value: 'open', label: 'In this plan' }, { value: 'all', label: 'All' }]} />
            <Button size="sm" variant="secondary" disabled={!maySubmit.allowed} title={maySubmit.reason} onClick={() => setAdding(true)}><Plus size={14} /> New request</Button>
          </>}>
            <p className="text-[12px] text-[#7C8594] -mt-1 mb-2">From customers (portal) and operations. States come from the solver.</p>
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse">
                <thead><tr><Th>Request</Th><Th>Target</Th><Th>Priority</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {shown.map((r) => { const [label, tone] = reqStatus(r); return (
                    <tr key={r.id} data-request={r.id} data-state={r.state}>
                      <Td className="font-mono-code font-medium">{r.id}</Td>
                      <Td><span className="flex flex-col gap-0.5"><span>{r.target}</span><span className="text-[12px] text-[#7C8594]">{r.requestedBy} · {r.tenant}</span></span></Td>
                      <Td><Pill className="font-mono-code">{r.priority}</Pill></Td>
                      <Td><Pill tone={tone} className="whitespace-normal">{label}</Pill></Td>
                    </tr>); })}
                  {shown.length === 0 && <tr><Td colSpan={4} className="text-[#7C8594]">No requests in the queue.</Td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="flex-[1_1_320px] min-w-0">
          <Card title="Solver result" actions={plan.solved && solved && <span className="font-mono-code text-[12px] text-[#7C8594]">{hm(plan.solved.at)}</span>}>
            <div className="flex flex-col gap-3.5">
              {!solved || !plan.solved ? (
                <p className="text-[13px] text-[#9AA3B2]">Draft: activities carried over from the approved plan. Solve to place the {requests.filter((r) => r.state === 'NEW' || r.state === 'NOT_PLACED' || r.state === 'PLACED').length} open requests against contacts, storage and power.</p>
              ) : (<>
                <div className="flex flex-col gap-1">
                  <span className="flex items-baseline gap-2"><span className="text-[40px] font-semibold tracking-[-0.02em]">{plan.solved.placed}</span><span className="text-[14px] text-[#7C8594]">of {plan.solved.total} requests placed</span></span>
                  <span className="flex gap-[3px] h-2">{plan.solved.placed > 0 && <span className="rounded bg-[#4ADE9A]" style={{ flex: plan.solved.placed }} />}{plan.solved.total - plan.solved.placed > 0 && <span className="rounded bg-[#F5C451]" style={{ flex: plan.solved.total - plan.solved.placed }} />}</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Tile><span className="text-[24px] font-semibold">{plan.activities.filter((a) => a.kind === 'DL').length}</span><span className="block text-[12px] text-[#7C8594]">downlinks in plan</span></Tile>
                  <Tile><span className="text-[24px] font-semibold">{plan.solved.score.toFixed(3)}</span><span className="block text-[12px] text-[#7C8594]">score · greedy, {Math.max(1, Math.round(plan.solved.ms))} ms</span></Tile>
                </div>
                {Object.keys(plan.solved.unplaced).length > 0 && (
                  <ul className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2] leading-[1.45]">
                    {Object.entries(plan.solved.unplaced).map(([id, why]) => <li key={id}><span className="font-mono-code text-[#C9CED6]">{id}</span> {why.charAt(0).toLowerCase() + why.slice(1)}</li>)}
                  </ul>
                )}
              </>)}

              {eff !== 'UPLINKED' && eff !== 'APPROVED' && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" className="flex-1" isLoading={solving} disabled={!!editReason || solving} onClick={runSolve}>{solved ? 'Solve again' : 'Solve plan'}</Button>
                  <Button className="flex-1" disabled={!!editReason || !solved || plan.conflicts.length > 0 || eff === 'PENDING'}
                    onClick={() => plan.sendForApproval(user.name)}>{eff === 'PENDING' ? 'Sent for approval' : 'Send for approval'}</Button>
                </div>
              )}
              {eff === 'APPROVED' && <Button disabled={!mayPlan.allowed} reason={mayPlan.reason} onClick={() => setConfirmUplink(true)}>Uplink as PUS-11 schedule</Button>}
              {eff === 'UPLINKED' && <Button variant="secondary" disabled={!mayPlan.allowed} reason={mayPlan.reason} onClick={() => plan.init(true)}>Start next plan</Button>}
              <span className="text-[12px] text-[#7C8594] leading-[1.45]">
                {editReason && eff !== 'UPLINKED' && eff !== 'APPROVED' ? `${editReason} ` : ''}
                {solved && plan.conflicts.length > 0 ? 'Resolve the conflict before sending. ' : ''}
                {eff === 'APPROVED' ? `Approved by ${appr?.decided_by}. ` : ''}
                A Flight Director other than the sender approves the plan; then it is uplinked as a time-tagged schedule.
              </span>
              {(eff === 'PENDING' || eff === 'APPROVED') && <RoleLink to="approvals" onNavigate={onNavigate}>Approval {plan.approvalId}</RoleLink>}
            </div>
          </Card>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mt-4">
        <div className="flex-[999_1_560px] min-w-0">
          <Card title={sel ? `Resources · ${sel}` : 'Resources'}>
            {sel ? <div className="overflow-x-auto"><Tracks sat={sel} /></div> : <p className="text-[13px] text-[#7C8594]">No activities yet.</p>}
            <p className="text-[12px] text-[#7C8594] mt-2">Pick a satellite on the timeline. Storage starts from the on-board level; images add 6 GB, downlinks drain 1.1 GB/min. <SampleTag>Start levels sample</SampleTag></p>
          </Card>
        </div>
        <div className="flex-[1_1_320px] min-w-0">
          {plan.pus11 ? (
            <Card title="PUS-11 schedule uplinked" actions={<span className="font-mono-code text-[12px] text-[#7C8594]">CRC {plan.pus11.crc}</span>}>
              <p className="text-[13px] text-[#9AA3B2] mb-2">{utc(plan.pus11.at)} by {plan.pus11.by}: TC(11,4) insert {plan.pus11.total} activities into the time-based schedule of {plan.pus11.perSat.length} satellites.</p>
              <table className="w-full border-collapse"><thead><tr><Th>Satellite</Th><Th>Activities</Th><Th>Release</Th></tr></thead>
                <tbody>{plan.pus11.perSat.map((p) => <tr key={p.sat}><Td className="font-mono-code">{p.sat}</Td><Td className="tabular-nums">{p.tcs}</Td><Td className="font-mono-code text-[12px]">{hm(p.first)}–{hm(p.last)}</Td></tr>)}</tbody></table>
              {plan.pus11.sessions.length > 0 && <div className="mt-3 flex flex-col gap-1"><span className="text-[12px] text-[#7C8594]">Payload sessions opened</span>{plan.pus11.sessions.map((s) => <RoleLink key={s} to={`payload?id=${s}`} onNavigate={onNavigate}>{s}</RoleLink>)}</div>}
            </Card>
          ) : (
            <Card title="Plan log">
              {plan.log.length === 0 ? <p className="text-[13px] text-[#7C8594]">Nothing yet.</p> : (
                <ol className="flex flex-col gap-1.5 text-[12.5px] text-[#9AA3B2]">{plan.log.slice(0, 8).map((l, i) => <li key={i}><span className="font-mono-code text-[#7C8594]">{hm(l.at)}</span> {l.text} · {l.by}</li>)}</ol>
              )}
            </Card>
          )}
          <div className="mt-4"><EngineeringNotes editReason={mayPlan.allowed ? undefined : mayPlan.reason} onNavigate={onNavigate} /></div>
        </div>
      </div>

      {adding && (
        <Modal title="New imaging request" wide onClose={() => setAdding(false)} footer={<Button variant="secondary" onClick={() => setAdding(false)}>Close</Button>}>
          <ImagingRequestForm tenant={tenantOfPerson(user)} requestedBy={`${user.name} (operations)`} withPriority onDone={() => setAdding(false)} />
        </Modal>
      )}
      {confirmUplink && (
        <Modal title={`Uplink ${plan.planId}?`} onClose={() => setConfirmUplink(false)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setConfirmUplink(false)}>Not yet</Button><Button onClick={() => { plan.uplink(user.name); setConfirmUplink(false); }}>Uplink</Button></>}>
          <p className="text-[13.5px] text-[#C9CED6]">Sends TC(11,4) to {sats.length} satellites with {plan.activities.length} time-tagged activities, requests the station bookings the downlinks rely on, and opens a payload session for each placed request. Once loaded on board, changes need a new plan.</p>
          <SampleTag>Uplink simulated: no PUS-11 service on the ground link yet</SampleTag>
        </Modal>
      )}
    </>
  );
};
