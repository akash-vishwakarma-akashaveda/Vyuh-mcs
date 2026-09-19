import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Play, SkipForward, Pause, Square } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Banner, Card, PageHead } from '../../components/molecules/Page';
import { PROCEDURE_PR_THM_004 as PROC } from '../../data/fleet';
import { useAuthStore } from '../../store/useAuthStore';
import { useFleetStore } from '../../store/useFleetStore';
import { isLiveSatellite } from '../../store/useLinkStore';
import { useMissionStore, demoApprovalNow, ProcState } from '../../store/useMissionStore';
import { can } from '../../auth/policy';

type StepState = 'PENDING' | 'RUNNING' | 'DONE' | 'SKIPPED';

const SAT = 'AKV-03';

/** S14 · Procedure runner — every command step goes through Command Service gates. */
export const TCDashboard: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const { approvals, commands, requestApproval, addCommand, setCommandStatus, switchHeaterB, appendAudit } = useMissionStore();
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const mayRun = can('procedure:run', role);
  const batTemp = useFleetStore((s) => s.cvt[SAT]?.BAT_TEMP?.eu_value);

  const [mode, setMode] = useState<'CONTINUOUS' | 'STEP' | 'BREAKPOINT'>('STEP');
  const [state, setState] = useState<ProcState>('READY');
  const [cursor, setCursor] = useState(0); // steps completed
  const [log, setLog] = useState<string[]>([]);
  const runId = `PR-20260917-03`;

  const approval = approvals.find((a) => a.command_id === 'CMD-8841');
  const stamp = (t: string) => setLog((l) => [`${new Date().toISOString().slice(11, 19)}  ${t}`, ...l]);

  // Step 5 is critical: the run stops until a second person approves (Q-14, C-07).
  useEffect(() => {
    if (state !== 'WAIT_APPROVAL') return;
    if (approval?.state === 'APPROVED') {
      if (isLiveSatellite(SAT)) {
        // The real uplink takes it from here; its status follows the acknowledgement and
        // is confirmed by telemetry (live/director.ts), not assumed.
        switchHeaterB();
        stamp('step 5 approved by ' + approval.decided_by + ' — HTR_SWITCH HEATER=B STATE=ON released to the uplink');
      } else {
        setCommandStatus('CMD-8841', 'ACCEPTED');
        switchHeaterB();
        setCommandStatus('CMD-8841', 'COMPLETED');
        stamp('step 5 approved by ' + approval.decided_by + ' — HTR_SWITCH HEATER=B STATE=ON completed');
      }
      setCursor(5);
      setState('RUNNING');
    } else if (approval?.state === 'REJECTED') {
      stamp('step 5 rejected — run aborted');
      setState('ABORTED');
    }
  }, [approval?.state, state, setCommandStatus, switchHeaterB, approval?.decided_by]);

  const stepState = (n: number): StepState =>
    n <= cursor ? 'DONE' : n === cursor + 1 && state !== 'READY' ? 'RUNNING' : 'PENDING';

  const start = () => {
    setState('RUNNING');
    stamp(`Run ${runId} started · ${PROC.id} ${PROC.version} on ${SAT}`);
  };

  const step = () => {
    const next = PROC.steps[cursor];
    if (!next) return;

    if (next.critical) {
      // Raise the approval request instead of sending.
      addCommand({
        command_id: 'CMD-8841', sat_id: SAT, mnemonic: next.mnemonic!, params: next.params!,
        status: 'AWAITING_APPROVAL', requested_by: user.name, epoch: 17,
        utc: new Date().toISOString(), critical: true,
      });
      requestApproval(demoApprovalNow());
      appendAudit({
        timestamp_utc: new Date().toISOString(), operator_id: 'USR-001', operator_name: user.name,
        sat_id: SAT, command_mnemonic: next.mnemonic!, procedure_id: PROC.id, procedure_version: PROC.version,
        sequence_count: 0, result: 'ACK', params_summary: 'second approval requested',
      });
      stamp(`step ${next.n}: ${next.mnemonic} requires a second approver — waiting`);
      setState('WAIT_APPROVAL');
      return;
    }

    stamp(`step ${next.n} done: ${next.text}`);
    setCursor((c) => c + 1);
    if (cursor + 1 >= PROC.steps.length) {
      setState('COMPLETED');
      stamp('Procedure completed');
    }
  };

  const banner =
    state === 'WAIT_APPROVAL' ? { kind: 'warn' as const, lead: 'Waiting for approval.', text: `Step 5 is with Command Service. Requested by ${user.name}.` }
    : state === 'ABORTED' ? { kind: 'crit' as const, lead: 'Aborted.', text: 'The approval was rejected.' }
    : state === 'COMPLETED' ? { kind: 'ok' as const, lead: 'Completed.', text: 'All steps done; the run log is the record.' }
    : null;

  return (
    <>
      <PageHead
        title={`${PROC.id} ${PROC.name}`}
        sub={`${runId} · ${SAT} · version ${PROC.version} (a running procedure keeps its original version)`}
        actions={
          <div className="flex gap-1.5">
            {(['CONTINUOUS', 'STEP', 'BREAKPOINT'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={clsx('h-[30px] px-3 text-[12px] font-bold border rounded',
                  mode === m ? 'bg-[#1A1D24] text-[#F3F4F6] border-[#2B303B] border-b-2 border-b-[#3CB992]' : 'text-[#A1A7B3] border-[#2B303B]')}>
                {m[0] + m.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        }
      />

      {!mayRun.allowed && <Banner kind="warn" lead="Read only.">{mayRun.reason}</Banner>}

      {banner && (
        <Banner kind={banner.kind} lead={banner.lead}
          action={state === 'WAIT_APPROVAL' ? <Button size="sm" onClick={() => onNavigate('approvals')}>Open approvals</Button> : undefined}>
          {banner.text}
        </Banner>
      )}

      <div className="flex items-center gap-2 mb-4">
        <Button onClick={start} disabled={state !== 'READY' || !mayRun.allowed} title={mayRun.reason}><Play size={16} /> Start</Button>
        <Button variant="secondary" onClick={step} title={mayRun.reason}
          disabled={state !== 'RUNNING' || cursor >= PROC.steps.length || !mayRun.allowed}>
          <SkipForward size={16} /> Step
        </Button>
        <Button variant="secondary" onClick={() => setState('PAUSED_LOS')} disabled={state !== 'RUNNING'}><Pause size={16} /> Pause</Button>
        <Button variant="danger" onClick={() => { setState('ABORTED'); stamp('Aborted by operator'); }} disabled={state === 'READY' || state === 'COMPLETED'}>
          <Square size={16} /> Abort
        </Button>
        <span className="ml-auto font-mono-code text-[12px] text-[#A1A7B3]">
          {cursor}/{PROC.steps.length} · {state.replace('_', ' ')}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <Card title="Steps">
          <ol className="flex flex-col">
            {PROC.steps.map((s) => {
              const st = stepState(s.n);
              return (
                <li key={s.n} className={clsx('flex items-start gap-3 py-2.5 border-b border-[#23272F] last:border-0',
                  st === 'RUNNING' && 'bg-[#4A9EFF]/[0.06] -mx-3.5 px-3.5')}>
                  <span className={clsx('w-5 h-5 rounded-full border flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5',
                    st === 'DONE' ? 'border-[#4CAF81] text-[#4CAF81]' : st === 'RUNNING' ? 'border-[#4A9EFF] text-[#4A9EFF]' : 'border-[#2B303B] text-[#5E6572]')}>
                    {st === 'DONE' ? '✓' : s.n}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-[13px]">{s.text}</span>
                    <span className="font-mono-code text-[11.5px] text-[#A1A7B3]">
                      {s.kind}{s.mnemonic ? ` · ${s.mnemonic} ${Object.entries(s.params ?? {}).map(([k, v]) => `${k}=${v}`).join(' ')}` : ''}
                    </span>
                  </div>
                  {s.critical && (
                    <span className="ml-auto font-mono-code text-[10.5px] font-bold rounded-full border border-[#9C9AEC]/60 bg-[#9C9AEC]/12 text-[#9C9AEC] px-2 h-5 flex items-center shrink-0">
                      SECOND PERSON
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Current condition">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-mono-code text-[#3CB992]">BAT_TEMP</span>
              <span className="font-display-title text-[24px] font-bold tabular-nums">
                {batTemp?.toFixed(1) ?? '—'}<span className="text-[13px] text-[#A1A7B3] ml-1">°C</span>
              </span>
            </div>
            <p className="text-[12px] text-[#A1A7B3] mt-2">Live from Live Telemetry; a stale value fails the gate closed.</p>
          </Card>

          <Card title="Commands raised">
            {commands.length === 0 && <p className="text-[13px] text-[#A1A7B3]">None yet.</p>}
            {commands.map((c) => (
              <div key={c.command_id} className="flex items-center justify-between py-1.5 text-[12.5px]">
                <span className="font-mono-code text-[#3CB992]">{c.mnemonic}</span>
                <span className="text-[#A1A7B3]">{c.status.replace('_', ' ')}</span>
              </div>
            ))}
          </Card>

          <Card title="Run log">
            <div className="flex flex-col gap-1 max-h-[260px] overflow-y-auto">
              {log.length === 0 && <span className="text-[12px] text-[#A1A7B3]">Press Start.</span>}
              {log.map((l, i) => <span key={i} className="font-mono-code text-[12px] text-[#A1A7B3]">{l}</span>)}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
};
