import React, { useState } from 'react';
import { Button } from '../../components/atoms/Button';
import { Pill } from '../../components/atoms/Badge';
import { Banner, Card, KpiRow, KpiTile, PageHead, SampleTag } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { STATIONS } from '../../data/fleet';
import { PASS_REPORTS } from '../../demo/scenario';
import { chunksIn, stageOf, useDeliveryStore } from '../../store/useDeliveryStore';
import { can } from '../../auth/policy';
import { useAuthStore } from '../../store/useAuthStore';
import { useMissionStore } from '../../store/useMissionStore';
import { usePassOpsStore } from '../../store/usePassConfigStore';
import { RouteLink, utc } from '../commanding/gates';
import { Select } from '../../components/molecules/Select';

const th = 'px-3 py-1 font-normal text-left';

/** S11 · Pass report. Final only when every gap is backfilled or declared unrecoverable (BR-S11-01). */
export const PassReportScreen: React.FC<{ onNavigate: (to: string) => void; sessionId?: string }> = ({ onNavigate, sessionId }) => {
  const role = useAuthStore((s) => s.activeRole);
  const user = useAuthStore((s) => s.user);
  const opsAll = usePassOpsStore((s) => s.ops);
  const put = usePassOpsStore((s) => s.put);
  const [confirm, setConfirm] = useState<'UNRECOVERABLE' | 'FINAL' | null>(null);
  const sessions = useDeliveryStore((s) => s.sessions);

  const found = PASS_REPORTS.find((r) => r.session_id === sessionId);
  const base = found ?? PASS_REPORTS[0];
  const ops = opsAll[base.session_id] ?? {};
  const gaps = base.gaps.map((g) => (g.backfill === 'RUNNING' && ops.gapResolution ? { ...g, backfill: ops.gapResolution } : g));
  const status = ops.finalBy ? 'FINAL' : base.status;
  const station = STATIONS.find((s) => s.id === base.station_id);
  // The payload sessions this pass brought down: same satellite and station, started during the pass.
  const deliveries = sessions.filter((d) => d.sat === base.sat_id && d.station === base.station_id && d.startedAt >= Date.parse(base.aos_utc) && d.startedAt <= Date.parse(base.los_utc));
  const openGaps = gaps.filter((g) => g.backfill === 'RUNNING');
  const gate = can('booking:edit', role);
  const canFinalise = openGaps.length === 0 && status === 'PROVISIONAL' && gate.allowed;

  const audit = (text: string) => useMissionStore.getState().appendAudit({ timestamp_utc: new Date().toISOString(), operator_id: user.id, operator_name: user.name, sat_id: base.sat_id, command_mnemonic: 'PASS_REPORT', procedure_id: '—', procedure_version: '—', sequence_count: 0, result: 'ACK', params_summary: `${base.report_id}: ${text}` });
  const resolve = (as: 'DONE' | 'UNRECOVERABLE') => { put(base.session_id, { gapResolution: as }); audit(as === 'DONE' ? 'backfill completed for open gaps' : 'open gaps declared unrecoverable'); };
  const finalise = () => { put(base.session_id, { finalBy: user.name, finalUtc: new Date().toISOString() }); audit('marked final'); };

  return (
    <>
      <PageHead
        crumb={<RouteLink to="schedule" onNavigate={onNavigate}>← Passes</RouteLink>}
        title={`Pass report · ${base.sat_id} over ${station?.name ?? base.station_id}`}
        sub={<span className="font-mono-code">{base.report_id} · AOS {utc(base.aos_utc)} · LOS {utc(base.los_utc)}</span>}
        actions={<>
          <label className="flex items-center gap-2 h-[38px] rounded-[10px] bg-[#11141B] border border-[#1A1E27] px-3 text-[13px]">
            <span className="text-[#7C8594]">Report</span>
            <Select aria-label="Pass report" value={base.session_id} onChange={(e) => onNavigate(`report?session=${e.target.value}`)} className="bg-transparent text-[#E9ECF1] font-mono-code text-[13px] outline-none">
              {PASS_REPORTS.map((r) => <option key={r.report_id} value={r.session_id} className="bg-[#11141B]">{r.sat_id} · {r.station_id} · {utc(r.aos_utc, false)}</option>)}
            </Select>
          </label>
          <Button disabled={!canFinalise} reason={status === 'FINAL' ? undefined : !gate.allowed ? 'Ground Station Engineers finalise reports' : openGaps.length ? 'Resolve open gaps first' : undefined} onClick={() => setConfirm('FINAL')}>Mark report final</Button>
        </>} />

      {sessionId && !found && <Banner kind="info" lead="No report yet.">Session <span className="font-mono-code">{sessionId}</span> has no report: it is written when the pass closes. Showing the latest report instead.</Banner>}

      {status === 'PROVISIONAL' ? (
        <Banner kind="warn" lead="Provisional, backfill running."
          action={openGaps.length ? <Button size="sm" variant="secondary" disabled={!gate.allowed} onClick={() => resolve('DONE')}>Backfill received</Button> : undefined}>
          A report becomes final only when every gap is backfilled or declared unrecoverable.{!gate.allowed ? ` ${gate.reason}` : ''}
        </Banner>
      ) : (
        <Banner kind="ok" lead="Final.">All gaps resolved{ops.finalBy ? `; made final by ${ops.finalBy} at ${utc(ops.finalUtc)} UTC` : ''}.</Banner>
      )}

      <KpiRow>
        <KpiTile label="Completeness" value={`${base.completeness_pct}%`} tone={base.completeness_pct > 99 ? 'ok' : 'warn'} />
        <KpiTile label="Frames received" value={base.frames_received.toLocaleString('en-US')} sub={`of ${base.frames_expected.toLocaleString('en-US')} expected`} />
        <KpiTile label="Duplicates merged" value={base.duplicates_merged} />
        <KpiTile label="Latency p99" value={<>{base.latency_p99_ms} <span className="text-[14px] text-[#7C8594] font-normal">ms</span></>} tone={base.latency_p99_ms < 100 ? 'plain' : 'warn'} sub={`p50 ${base.latency_p50_ms} · p95 ${base.latency_p95_ms} ms`} />
        <KpiTile label="Gaps" value={gaps.length} tone={openGaps.length ? 'warn' : 'ok'} sub={`${openGaps.length} open`} />
      </KpiRow>

      <div className="flex flex-wrap gap-4 items-start mb-4">
        <Card title="Gaps and backfill" actions={<SampleTag />} flush className="flex-[1_1_440px] min-w-0">
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full text-[13px] border-separate" style={{ borderSpacing: '0 4px' }}>
              <thead><tr className="text-[12px] text-[#6B7383]"><th className={th}>Window (UTC)</th><th className={`${th} text-right`}>Frames</th><th className={th}>Source</th><th className={th}>Status</th></tr></thead>
              <tbody>
                {gaps.map((g, i) => (
                  <tr key={i} className="bg-[#141821]">
                    <td className="px-3 py-2.5 rounded-l-[10px] font-mono-code text-[12.5px]">{utc(g.from_utc)} → {utc(g.to_utc).slice(-8)}</td>
                    <td className="px-3 py-2.5 text-right font-mono-code">{g.frames}</td>
                    <td className="px-3 py-2.5 text-[#9AA3B2]">{g.source}</td>
                    <td className="px-3 py-2.5 rounded-r-[10px]"><Pill tone={g.backfill === 'DONE' ? 'ok' : g.backfill === 'RUNNING' ? 'warn' : 'crit'}>{g.backfill === 'DONE' ? 'Backfilled' : g.backfill === 'RUNNING' ? 'Backfill running' : 'Unrecoverable'}</Pill></td>
                  </tr>
                ))}
                {gaps.length === 0 && <tr><td colSpan={4} className="px-3 py-3 bg-[#141821] rounded-[10px] text-[#7C8594]">No gaps this pass.</td></tr>}
              </tbody>
            </table>
            {openGaps.length > 0 && <div className="px-3 pt-1"><Button size="sm" variant="danger" disabled={!gate.allowed} onClick={() => setConfirm('UNRECOVERABLE')}>Declare remaining gaps unrecoverable…</Button></div>}
          </div>
        </Card>

        <Card title="Commands sent and verified" flush className="flex-[1_1_320px] min-w-0">
          <div className="px-2 pb-2">
            <table className="w-full text-[13px] border-separate" style={{ borderSpacing: '0 4px' }}>
              <thead><tr className="text-[12px] text-[#6B7383]"><th className={th}>Command</th><th className={th}>Result</th></tr></thead>
              <tbody>
                {base.commands.map((c, i) => (
                  <tr key={i} className="bg-[#141821]">
                    <td className="px-3 py-2.5 rounded-l-[10px] font-mono-code text-[12.5px]">{c.mnemonic}</td>
                    <td className="px-3 py-2.5 rounded-r-[10px]"><Pill tone={c.result === 'VERIFIED' ? 'ok' : 'crit'}>{c.result === 'VERIFIED' ? 'Verified' : 'Failed'}</Pill></td>
                  </tr>
                ))}
                {base.commands.length === 0 && <tr><td colSpan={2} className="px-3 py-3 bg-[#141821] rounded-[10px] text-[#7C8594]">No commands this pass.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Bulk payload deliveries" flush>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="w-full min-w-[640px] text-[13px] border-separate" style={{ borderSpacing: '0 4px' }}>
            <thead><tr className="text-[12px] text-[#6B7383]"><th className={th}>Delivery</th><th className={th}>Size</th><th className={th}>Chunks</th><th className={th}>State</th><th className={th}>Open</th></tr></thead>
            <tbody>
              {deliveries.map((d) => { const st = stageOf(d); return (
                <tr key={d.id} className="bg-[#141821]">
                  <td className="px-3 py-2.5 rounded-l-[10px] font-mono-code text-[12.5px]">{d.id}</td>
                  <td className="px-3 py-2.5 font-mono-code">{d.sizeMb.toLocaleString('en-US')} MB</td>
                  <td className="px-3 py-2.5 font-mono-code">{chunksIn(d)}/{d.chunksTotal}</td>
                  <td className="px-3 py-2.5"><Pill tone={st === 'DELIVERED' || st === 'L0_READY' ? 'ok' : st === 'CHECKSUM_FAILED' ? 'crit' : 'info'}>{st.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Pill></td>
                  <td className="px-3 py-2.5 rounded-r-[10px]"><RouteLink to={`payload?id=${d.id}`} onNavigate={onNavigate}>Delivery</RouteLink></td>
                </tr>); })}
              {deliveries.length === 0 && <tr><td colSpan={5} className="px-3 py-3 bg-[#141821] rounded-[10px] text-[#7C8594]">No payload came down on this pass.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {confirm && (
        <Modal title={confirm === 'FINAL' ? 'Mark this report final?' : 'Declare the open gaps unrecoverable?'} onClose={() => setConfirm(null)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant={confirm === 'FINAL' ? 'primary' : 'danger'} onClick={() => { if (confirm === 'FINAL') finalise(); else resolve('UNRECOVERABLE'); setConfirm(null); }}>{confirm === 'FINAL' ? 'Mark final' : 'Declare unrecoverable'}</Button></>}>
          <p className="text-[13.5px] text-[#C9CED6]">{confirm === 'FINAL'
            ? `${base.report_id} is closed and can no longer change. Recorded in the audit ledger under ${user.name}.`
            : `${openGaps.reduce((a, g) => a + g.frames, 0)} frames are given up for good; completeness stays at ${base.completeness_pct}%. Recorded in the audit ledger.`}</p>
        </Modal>
      )}
    </>
  );
};
