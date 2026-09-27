import React, { useState } from 'react';
import { Button } from '../../components/atoms/Button';
import { Banner, Card, KpiTile, PageHead, Td, Th } from '../../components/molecules/Page';
import { DELIVERIES, PASS_REPORTS, STATIONS } from '../../data/fleet';

/** S11 · Pass report — Final only when every gap is backfilled or unrecoverable (BR-S11-01). */
export const PassReportScreen: React.FC<{ onNavigate: (to: string) => void; sessionId?: string }> = ({ onNavigate, sessionId }) => {
  const base = PASS_REPORTS.find((r) => r.session_id === sessionId) ?? PASS_REPORTS[0];
  const [report, setReport] = useState(base);
  const station = STATIONS.find((s) => s.id === report.station_id);
  const openGaps = report.gaps.filter((g) => g.backfill === 'RUNNING');
  const canFinalise = openGaps.length === 0 && report.status === 'PROVISIONAL';

  const resolveGaps = (as: 'DONE' | 'UNRECOVERABLE') =>
    setReport((r) => ({ ...r, gaps: r.gaps.map((g) => (g.backfill === 'RUNNING' ? { ...g, backfill: as } : g)) }));

  return (
    <>
      <PageHead
        title={`Pass report · ${report.sat_id}`}
        sub={`${report.report_id} · ${station?.name} · ${report.aos_utc.slice(11, 16)}–${report.los_utc.slice(11, 16)} UTC`}
        actions={
          <>
            <select value={report.report_id} onChange={(e) => onNavigate(`report?session=${PASS_REPORTS.find((r) => r.report_id === e.target.value)?.session_id}`)}
              aria-label="Pass report"
              className="h-9 bg-[#0A1018] border border-[#2A3B52] rounded-[2px] px-2.5 font-mono-code text-[13px] outline-none focus:border-[#2DCCFF]">
              {PASS_REPORTS.map((r) => (
                <option key={r.report_id} value={r.report_id}>{r.sat_id} · {r.station_id} · {r.status}</option>
              ))}
            </select>
          <Button disabled={!canFinalise} onClick={() => setReport((r) => ({ ...r, status: 'FINAL' }))}>
            Mark report final
          </Button>
          </>
        }
      />

      {report.status === 'PROVISIONAL' ? (
        <Banner kind="warn" lead="Provisional — backfill running."
          action={<Button size="sm" variant="secondary" onClick={() => resolveGaps('DONE')}>Complete backfill</Button>}>
          A report becomes Final only when every gap is backfilled or declared unrecoverable.
        </Banner>
      ) : (
        <Banner kind="ok" lead="Final.">All gaps resolved; the report is closed.</Banner>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <KpiTile value={`${report.completeness_pct}%`} label="Completeness" tone={report.completeness_pct > 99 ? 'ok' : 'warn'} />
        <KpiTile value={report.frames_received.toLocaleString()} label="Frames received" sub={`of ${report.frames_expected.toLocaleString()} expected`} />
        <KpiTile value={report.duplicates_merged} label="Duplicates merged" />
        <KpiTile value={`${report.latency_p99_ms} ms`} label="Latency P99" tone={report.latency_p99_ms < 100 ? 'ok' : 'warn'} sub={`P50 ${report.latency_p50_ms} · P95 ${report.latency_p95_ms}`} />
        <KpiTile value={report.gaps.length} label="Gaps" tone={openGaps.length ? 'warn' : 'ok'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Gaps and backfill">
          <table className="w-full border-collapse">
            <thead><tr><Th>Window</Th><Th>Frames</Th><Th>Source</Th><Th>Status</Th></tr></thead>
            <tbody>
              {report.gaps.map((g, i) => (
                <tr key={i}>
                  <Td className="font-mono-code text-[12.5px]">{g.from_utc.slice(11, 19)} → {g.to_utc.slice(11, 19)}</Td>
                  <Td className="tabular-nums">{g.frames}</Td>
                  <Td className="text-[#A3B1C2]">{g.source}</Td>
                  <Td className={g.backfill === 'DONE' ? 'text-[#56F000]' : g.backfill === 'RUNNING' ? 'text-[#FCE83A]' : 'text-[#FF3838]'}>{g.backfill}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          {openGaps.length > 0 && (
            <Button size="sm" variant="ghost" className="mt-3" onClick={() => resolveGaps('UNRECOVERABLE')}>
              Declare remaining gaps unrecoverable
            </Button>
          )}
        </Card>

        <Card title="Commands sent and verified">
          <table className="w-full border-collapse">
            <thead><tr><Th>Mnemonic</Th><Th>Result</Th></tr></thead>
            <tbody>
              {report.commands.map((c, i) => (
                <tr key={i}>
                  <Td className="font-mono-code text-[12.5px] text-[#4DACFF]">{c.mnemonic}</Td>
                  <Td className={c.result === 'VERIFIED' ? 'text-[#56F000]' : 'text-[#FF3838]'}>{c.result}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Bulk payload deliveries" className="lg:col-span-2">
          <table className="w-full border-collapse">
            <thead><tr><Th>Delivery</Th><Th>Satellite</Th><Th>Size</Th><Th>Chunks</Th><Th>State</Th></tr></thead>
            <tbody>
              {DELIVERIES.filter((d) => d.sat_id === report.sat_id).map((d) => (
                <tr key={d.delivery_id} className="cursor-pointer hover:bg-[#172434]" onClick={() => onNavigate(`payload?id=${d.delivery_id}`)}>
                  <Td className="font-mono-code text-[12.5px] text-[#4DACFF]">{d.delivery_id}</Td>
                  <Td className="font-mono-code text-[12.5px]">{d.sat_id}</Td>
                  <Td className="tabular-nums">{d.size_mb} MB</Td>
                  <Td className="tabular-nums">{d.chunks_received}/{d.chunks_total}</Td>
                  <Td>{d.state}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
};
