import React, { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Check, Clock } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Pill } from '../../components/atoms/Badge';
import { Banner, Card, PageHead, Segmented } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { FLEET } from '../../data/fleet';
import { PROCEDURES } from '../../data/mission';
import { can } from '../../auth/policy';
import { useAuthStore } from '../../store/useAuthStore';
import { useFleetStore } from '../../store/useFleetStore';
import { useMissionStore } from '../../store/useMissionStore';
import { Run, stepsOf, useProcedureRunStore, versionOf } from '../../store/useProcedureRunStore';
import { cancelCommand } from '../../live/release';
import { isStale } from '../../utils/stalenessUtils';
import { RouteLink, approversFor, field, isSat, mmss, orList, setHashParams, useHashParams, useNow, utc } from './gates';
import { Select } from '../../components/molecules/Select';

/** Extra values worth watching per procedure, beyond the ones its checks and waits read. */
const WATCH: Record<string, string[]> = { 'PR-THM-004': ['BAT_TEMP', 'HTR_A_DUTY', 'HTR_B_STATE'], 'PR-ADCS-011': ['ATT_ERR'] };
const runnable = PROCEDURES.filter((p) => p.state === 'RELEASED' && stepsOf(p.id).length > 0);

/** S14 · Procedure runner. The run lives in a store and is driven by the release pipeline, so it survives navigation. */
export const TCDashboard: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const params = useHashParams();
  const role = useAuthStore((s) => s.activeRole);
  const user = useAuthStore((s) => s.user);
  const runs = useProcedureRunStore((s) => s.runs);
  const store = useProcedureRunStore.getState();
  const approvals = useMissionStore((s) => s.approvals);
  const now = useNow(1000);
  const mayRun = can('procedure:run', role);

  const procId = runnable.some((p) => p.id === params.proc) ? params.proc : 'PR-THM-004';
  const sat = isSat(params.sat) ? params.sat : 'AKV-03';
  const run: Run | undefined = runs.find((r) => r.id === params.run) ?? runs.find((r) => r.procId === procId && r.satId === sat);
  const proc = PROCEDURES.find((p) => p.id === (run?.procId ?? procId))!;
  const defs = stepsOf(proc.id);
  const active = run && run.state !== 'COMPLETED' && run.state !== 'ABORTED';

  const [abortOpen, setAbortOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [why, setWhy] = useState('');

  const start = () => {
    const id = store.start(procId, sat, run?.mode ?? 'STEP');
    setHashParams({ proc: procId, sat, run: id });
  };
  const abort = async () => {
    if (!run) return;
    const cmd = run.steps[run.cursor]?.commandId;
    if (cmd) await cancelCommand(cmd); // withdraws it if not yet radiated; a radiated command cannot be called back
    store.abort(run.id, why.trim());
    setAbortOpen(false); setWhy('');
  };

  const cur = run ? defs[run.cursor] : undefined;
  const curRun = run?.steps[run.cursor];
  const appr = curRun?.approvalId ? approvals.find((a) => a.approval_id === curRun.approvalId) : undefined;
  const doneCount = run ? run.steps.filter((s) => s.status === 'DONE' || s.status === 'SKIPPED').length : 0;

  return (
    <>
      <PageHead
        crumb={<span>Procedures{run ? <> · Run <span className="font-mono-code">{run.id}</span></> : null}</span>}
        title={`${proc.id} ${proc.name} on ${run?.satId ?? sat}`}
        sub={run
          ? `Version ${run.version}, released by ${proc.author}. Started by ${run.startedBy} ${utc(run.startedUtc, false)} UTC. A running procedure keeps its version.`
          : `Version ${versionOf(proc.id)}, released by ${proc.author}. ${defs.length} steps.`}
        actions={active ? <>
          <Segmented value={run.mode} onChange={(m) => store.setMode(run.id, m)} options={[{ value: 'STEP', label: 'Step by step' }, { value: 'AUTO', label: 'Run to breakpoint' }]} />
          {run.state === 'PAUSED'
            ? <Button variant="secondary" onClick={() => store.resume(run.id)} disabled={!mayRun.allowed}>Resume</Button>
            : <Button variant="secondary" onClick={() => store.pause(run.id)} disabled={!mayRun.allowed || run.state === 'HELD'}>Pause</Button>}
          <Button variant="danger" onClick={() => setAbortOpen(true)} disabled={!mayRun.allowed}>Abort…</Button>
        </> : undefined} />

      {!mayRun.allowed && <Banner kind="warn" lead="Read only.">{mayRun.reason}</Banner>}

      {!active && (
        <Card title={run ? `Run ${run.id} ${run.state === 'COMPLETED' ? 'completed' : 'aborted'} ${utc(run.finishedUtc, false)} UTC` : 'Start a run'} className="mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2]">Procedure
              <Select value={procId} onChange={(e) => setHashParams({ proc: e.target.value, run: undefined })} className={clsx(field, 'min-w-[280px]')}>
                {runnable.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.name} · v{versionOf(p.id)}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2]">Satellite
              <Select value={sat} onChange={(e) => setHashParams({ sat: e.target.value, run: undefined })} className={clsx(field, 'font-mono-code')}>
                {FLEET.map((f) => <option key={f.sat_id}>{f.sat_id}</option>)}
              </Select>
            </label>
            <Button onClick={start} disabled={!mayRun.allowed} reason={mayRun.allowed ? undefined : 'Your role cannot run procedures'}>{run ? 'Start a new run' : 'Start run'}</Button>
          </div>
          {runs.filter((r) => r.state !== 'COMPLETED' && r.state !== 'ABORTED').length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4 text-[13px] text-[#9AA3B2]">Running elsewhere:
              {runs.filter((r) => r.state !== 'COMPLETED' && r.state !== 'ABORTED').map((r) => (
                <button key={r.id} type="button" className="text-[#F2A65A] hover:text-[#FFC48A] font-mono-code" onClick={() => setHashParams({ proc: r.procId, sat: r.satId, run: r.id })}>{r.procId} · {r.satId} · {r.id}</button>
              ))}
            </div>
          )}
        </Card>
      )}

      {run && active && run.waitingFor === 'APPROVAL' && appr && (
        <div className="rounded-2xl px-5 py-4 mb-4 flex flex-wrap gap-3.5 items-center" style={{ background: 'rgba(242,140,40,0.08)', border: '1px solid rgba(242,140,40,0.18)' }}>
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(242,140,40,0.16)' }}><Clock size={18} color="#F2A65A" aria-hidden="true" /></span>
          <span className="flex-[1_1_360px] flex flex-col gap-[3px]">
            <span className="text-[14px] font-medium">Step {cur?.n} is waiting for a Flight Director</span>
            <span className="text-[13px] text-[#C9CED6] leading-[1.45]">Asked {orList(approversFor(appr.requested_by))} at {utc(appr.requested_utc, false)}. The run continues by itself once approved, even if you leave this screen.</span>
          </span>
          <Pill tone="action"><span className="font-mono-code">{appr.approval_id}</span> · expires <span className="font-mono-code">{mmss((Date.parse(appr.expires_utc) - now) / 1000)}</span></Pill>
          <RouteLink to={`approvals?id=${appr.approval_id}`} onNavigate={onNavigate}>Open in approvals</RouteLink>
        </div>
      )}
      {run?.state === 'HELD' && (
        <Banner kind="crit" lead={`Step ${cur?.n} held.`} action={<span className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={!mayRun.allowed} onClick={() => store.retry(run.id)}>Retry step</Button>
          <Button size="sm" variant="secondary" disabled={!mayRun.allowed} onClick={() => setSkipOpen(true)}>Skip with reason…</Button>
        </span>}>{run.held}</Banner>
      )}
      {run?.state === 'WAITING' && run.waitingFor === 'NEXT' && cur && (
        <Banner kind="action" lead={run.mode === 'AUTO' ? `Breakpoint before step ${cur.n}.` : `Ready for step ${cur.n}.`}
          action={<Button size="sm" disabled={!mayRun.allowed} onClick={() => store.next(run.id)}>{run.mode === 'AUTO' ? 'Continue' : `Run step ${cur.n}`}</Button>}>{cur.text}</Banner>
      )}
      {run?.state === 'WAITING' && run.waitingFor === 'OPERATOR' && cur && (
        <Banner kind="action" lead="Your decision." action={<Button size="sm" disabled={!mayRun.allowed} onClick={() => store.confirm(run.id)}>Confirm</Button>}>{cur.text}</Banner>
      )}
      {run?.state === 'PAUSED' && <Banner kind="warn" lead="Paused.">Nothing new is sent until you resume. A command already raised carries on.</Banner>}
      {run?.state === 'COMPLETED' && <Banner kind="ok" lead="Completed.">All {defs.length} steps done; the run log is in the audit ledger.</Banner>}
      {run?.state === 'ABORTED' && <Banner kind="crit" lead="Aborted.">{run.log.find((l) => l.x.startsWith('Aborted'))?.x}</Banner>}

      <div className="flex flex-wrap gap-4 items-start">
        <Card title="Steps" actions={run ? <Pill>{doneCount} of {defs.length} done</Pill> : undefined} className="flex-[999_1_560px] min-w-0">
          <ol className="flex flex-col">
            {defs.map((d, i) => {
              const sr = run?.steps[i];
              const status = sr?.status ?? 'TODO';
              const isCur = run && i === run.cursor && active;
              const tone = status === 'DONE' || status === 'SKIPPED' ? 'done' : status === 'FAILED' ? 'fail' : isCur && status === 'ACTIVE' ? 'wait' : 'todo';
              const C = { done: ['rgba(74,222,154,0.12)', 'rgba(74,222,154,0.12)', '#4ADE9A'], wait: ['rgba(242,140,40,0.14)', '#F28C28', '#F2A65A'], fail: ['rgba(255,107,107,0.15)', '#FF6B6B', '#FF7A7A'], todo: ['transparent', '#2A303C', '#7C8594'] }[tone];
              const bp = run?.breakpoints.includes(d.n);
              const cmdText = d.mnemonic ? `${d.mnemonic} ${Object.entries(d.params ?? {}).map(([k, v]) => `${k}=${v}`).join(' ')}` : '';
              return (
                <li key={d.n} className="grid grid-cols-[26px_1fr] gap-3">
                  <span className="relative block">
                    <button type="button" disabled={!active || run?.mode !== 'AUTO'} onClick={() => run && store.toggleBreakpoint(run.id, d.n)}
                      title={run?.mode === 'AUTO' ? (bp ? 'Remove breakpoint' : 'Stop before this step') : undefined}
                      className="absolute left-0 top-2 w-[26px] h-[26px] rounded-full flex items-center justify-center font-mono-code text-[11.5px] disabled:cursor-default"
                      style={{ background: C[0], border: `1.5px ${bp ? 'dashed' : 'solid'} ${bp ? '#F28C28' : C[1]}`, color: C[2] }}>
                      {tone === 'done' ? <Check size={13} strokeWidth={2.8} aria-label="Done" /> : d.n}
                    </button>
                    {i < defs.length - 1 && <span className="absolute left-3 top-[38px] -bottom-1 w-0.5 rounded" style={{ background: tone === 'done' ? 'rgba(74,222,154,0.35)' : '#232936' }} />}
                  </span>
                  <span className={clsx('rounded-xl px-3 py-2.5 mb-1 flex flex-wrap justify-between items-start gap-2', isCur ? 'bg-[#1B2130]' : '')}>
                    <span className="flex flex-col gap-[3px] min-w-0">
                      <span className={clsx('text-[13.5px]', tone === 'todo' ? 'text-[#9AA3B2]' : 'text-[#E9ECF1]')}><span className="text-[#6B7383]">{d.n}.</span> {d.text}</span>
                      <span className="font-mono-code text-[12px] text-[#7C8594]">{d.kind}{cmdText ? ` · ${cmdText}` : ''}{d.critical ? ' · critical' : ''}{d.timeoutS ? ` · timeout ${d.timeoutS >= 60 ? `${Math.round(d.timeoutS / 60)} min` : `${d.timeoutS} s`}` : ''}</span>
                      {sr?.note && <span className="text-[12px] text-[#9AA3B2]">{sr.note}</span>}
                    </span>
                    {sr && status !== 'TODO' && (
                      <Pill tone={tone === 'done' ? 'ok' : tone === 'fail' ? 'crit' : 'action'}>
                        {status === 'DONE' ? `Done ${sr.at ?? ''}` : status === 'SKIPPED' ? `Skipped ${sr.at ?? ''}` : status === 'FAILED' ? 'Held' : run?.waitingFor === 'APPROVAL' ? 'Waiting approval' : run?.waitingFor === 'OPERATOR' ? 'Waiting for you' : 'Running'}
                      </Pill>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>

        <aside className="flex-[1_1_320px] min-w-0 flex flex-col gap-4">
          <Watched procId={proc.id} sat={run?.satId ?? sat} />
          <Card title="Run log">
            <div className="flex flex-col gap-1.5 max-h-[320px] overflow-y-auto">
              {!run && <span className="text-[12.5px] text-[#7C8594]">No run yet. Start one above.</span>}
              {run?.log.map((l, i) => <div key={i} className="grid grid-cols-[68px_1fr] gap-2.5 text-[12.5px] leading-[1.4]"><span className="font-mono-code text-[#7C8594]">{l.t}</span><span className="text-[#C9CED6]">{l.x}</span></div>)}
            </div>
          </Card>
        </aside>
      </div>

      {abortOpen && run && (
        <Modal title={`Abort run ${run.id}?`} onClose={() => setAbortOpen(false)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setAbortOpen(false)}>Keep running</Button><Button variant="danger" disabled={!why.trim()} reason={!why.trim() ? 'A reason is required' : undefined} onClick={() => void abort()}>Abort run</Button></>}>
          <p className="text-[13.5px] text-[#C9CED6]">The run stops at step {cur?.n}. {curRun?.commandId ? `Its command ${curRun.commandId} is cancelled if it has not been radiated yet. ` : ''}The abort is recorded in the audit ledger, signed by {user.name}.</p>
          <label className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2]">Reason<input value={why} onChange={(e) => setWhy(e.target.value)} className={field} /></label>
        </Modal>
      )}
      {skipOpen && run && (
        <Modal title={`Skip step ${cur?.n}?`} onClose={() => setSkipOpen(false)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setSkipOpen(false)}>Cancel</Button><Button variant="warning" disabled={!why.trim()} reason={!why.trim() ? 'A reason is required' : undefined} onClick={() => { store.skip(run.id, why.trim()); setSkipOpen(false); setWhy(''); }}>Skip step</Button></>}>
          <p className="text-[13.5px] text-[#C9CED6]">{run.held} Skipping continues the run without this step. It is recorded in the audit ledger as a deviation, signed by {user.name}.</p>
          <label className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2]">Reason<input value={why} onChange={(e) => setWhy(e.target.value)} className={field} /></label>
        </Modal>
      )}
    </>
  );
};

/** The values this procedure's checks and waits read, live, with a short trace since the screen opened. */
const Watched: React.FC<{ procId: string; sat: string }> = ({ procId, sat }) => {
  const cvt = useFleetStore((s) => s.cvt[sat]);
  const conds = stepsOf(procId).flatMap((d) => (d.cond && 'param' in d.cond ? [d.cond] : []));
  const names = [...new Set([...conds.map((c) => c.param), ...(WATCH[procId] ?? [])])];
  const main = names[0];
  const limit = conds.find((c) => c.param === main);
  const trace = useRef<number[]>([]);
  const [, bump] = useState(0);
  useEffect(() => {
    trace.current = [];
    const t = window.setInterval(() => {
      const v = useFleetStore.getState().cvt[sat]?.[main ?? '']?.eu_value;
      if (v !== undefined) { trace.current = [...trace.current.slice(-59), v]; bump((n) => n + 1); }
    }, 1000);
    return () => clearInterval(t);
  }, [sat, main]);

  if (!main) return <Card title="Watched by this procedure"><p className="text-[13px] text-[#7C8594]">This procedure reads no telemetry directly; its checks are contact and PUS-1 reports.</p></Card>;
  const p = cvt?.[main];
  const stale = !p || isStale(p);
  const pts = trace.current;
  const lo = Math.min(...pts, limit?.value ?? Infinity), hi = Math.max(...pts, limit?.value ?? -Infinity);
  const y = (v: number) => (hi === lo ? 35 : 64 - ((v - lo) / (hi - lo)) * 56);
  const path = pts.map((v, i) => `${i ? 'L' : 'M'}${(i / Math.max(1, pts.length - 1)) * 300} ${y(v).toFixed(1)}`).join(' ');
  const age = p ? Math.max(0, (Date.now() - Date.parse(p.timestamp_utc)) / 1000) : 0;
  return (
    <Card title="Watched by this procedure">
      <div className="flex flex-col gap-3">
        <span className="flex flex-col gap-0.5">
          <span className="text-[12px] text-[#9AA3B2]">{p?.name ?? main} · <span className="font-mono-code">{main}</span></span>
          <span className="flex items-baseline gap-1.5"><span className={clsx('text-[34px] font-semibold tracking-[-0.02em]', stale ? 'text-[#7C8594]' : limit && (limit.op === '<' ? p!.eu_value >= limit.value : p!.eu_value <= limit.value) ? 'text-[#E9ECF1]' : 'text-[#F5C451]')}>{p ? p.eu_value.toFixed(Math.abs(p.eu_value) < 1 ? 3 : 1) : '—'}</span><span className="text-[14px] text-[#7C8594]">{p?.unit}</span></span>
        </span>
        {pts.length > 1 && (
          <svg viewBox="0 0 300 70" width="100%" height="70" role="img" aria-label={`${main} trace since this screen opened`}>
            {limit && <line x1="0" x2="300" y1={y(limit.value)} y2={y(limit.value)} stroke="#F5C451" strokeOpacity="0.6" strokeDasharray="3 4" />}
            <path d={`${path} L300 70 L0 70 Z`} fill="rgba(108,184,255,0.10)" />
            <path d={path} fill="none" stroke="#6CB8FF" strokeWidth="1.8" />
            {limit && <text x="4" y={y(limit.value) - 4} fill="#6B7383" fontSize="10" fontFamily="Geist Mono, monospace">{limit.value} {limit.unit}</text>}
          </svg>
        )}
        {names.length > 1 && (
          <div className="grid grid-cols-2 gap-2.5">
            {names.slice(1).map((n) => {
              const q = cvt?.[n];
              const v = !q ? '—' : n.endsWith('_STATE') ? (q.eu_value >= 1 ? 'ON' : 'OFF') : `${q.eu_value.toFixed(q.eu_value < 1 ? 3 : 0)}${q.unit ? ` ${q.unit}` : ''}`;
              return <span key={n} className="rounded-xl bg-[#161A22] px-3 py-2.5 flex flex-col gap-0.5"><span className="text-[18px] font-semibold font-mono-code">{v}</span><span className="font-mono-code text-[11.5px] text-[#7C8594]">{n}</span></span>;
            })}
          </div>
        )}
        <span className="text-[12px] text-[#7C8594] leading-[1.45]">{stale ? 'No fresh value: checks on it fail closed.' : `Live, ${age.toFixed(1)} s old. A value older than 10 s fails its check closed.`}</span>
      </div>
    </Card>
  );
};
