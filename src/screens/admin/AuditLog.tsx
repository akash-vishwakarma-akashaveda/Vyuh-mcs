import React, { useState } from 'react';
import { ShieldCheck, Download } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Banner, Card, Drawer, KpiTile, PageHead, Td, Th } from '../../components/molecules/Page';
import { useMissionStore } from '../../store/useMissionStore';
import { AuditRecord } from '../../types';
import { toast } from '../../store/useToastStore';

/** S26 · Audit ledger — append-only, hash-chained, anchored to WORM storage. */
export const AuditLog: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const { audit, chainVerified, verifyChain } = useMissionStore();
  const [selected, setSelected] = useState<AuditRecord | null>(null);
  const [from, setFrom] = useState(new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  // BR-S26-02: exports require a bounded date range.
  const exportable = Boolean(from && to && Date.parse(from) <= Date.parse(to));

  const [exporting, setExporting] = useState(false);

  // The export runs as a job: a large range takes time, so the console says it started and when it is ready.
  const exportCsv = () => {
    setExporting(true);
    toast.info('Export started', { body: `Audit records ${from} to ${to}. You will be told when it is ready.` });
    window.setTimeout(() => { downloadCsv(); setExporting(false); toast.success('Export ready', { body: `vyuh_audit_${from}_${to}.csv` }); }, 1500);
  };

  const downloadCsv = () => {
    const header = 'record_id,timestamp_utc,operator,sat_id,command,result,sha256,prev_sha256\n';
    const rows = audit
      .filter((r) => r.timestamp_utc.slice(0, 10) >= from && r.timestamp_utc.slice(0, 10) <= to)
      .map((r) => [r.record_id, r.timestamp_utc, r.operator_name, r.sat_id, r.command_mnemonic, r.result, r.bytes_sha256, r.prev_record_sha256].join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([header + rows], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `vyuh_audit_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHead
        title="Audit ledger"
        sub="Every command, approval and policy decision — read only"
        actions={
          <>
            <Button variant="secondary" disabled={!exportable || exporting} isLoading={exporting} onClick={exportCsv}>
              <Download size={16} /> Export
            </Button>
            <Button onClick={verifyChain} isLoading={chainVerified === 'RUNNING'}>
              <ShieldCheck size={16} /> Verify chain
            </Button>
          </>
        }
      />

      {chainVerified === 'VERIFIED' && (
        <Banner kind="ok" lead="Chain verified.">
          Anchor #4412 matches · {audit.length} records checked · no gaps or tampering.
        </Banner>
      )}
      {chainVerified === 'BROKEN' && (
        <Banner kind="crit" lead="Break detected.">A record does not link to its predecessor. The ledger is not trustworthy.</Banner>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiTile value={audit.length} label="Records" />
        <KpiTile value={chainVerified === 'VERIFIED' ? 'VERIFIED' : chainVerified === 'BROKEN' ? 'BROKEN' : '—'} label="Integrity"
          tone={chainVerified === 'VERIFIED' ? 'ok' : chainVerified === 'BROKEN' ? 'crit' : 'plain'} sub="anchor #4412 · S3 object lock" />
        <KpiTile value="LIVE" label="SIEM export" tone="ok" sub="streaming to Splunk" />
        <KpiTile value={audit.filter((r) => r.result !== 'ACK').length} label="Non-ACK results" tone="warn" />
      </div>

      <Card title="Records" actions={
        <div className="flex items-center gap-2 text-[12px]">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date"
            className="h-8 bg-[#0A1018] border border-[#2A3B52] rounded-[2px] px-2 outline-none focus:border-[#2DCCFF]" />
          <span className="text-[#A3B1C2]">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date"
            className="h-8 bg-[#0A1018] border border-[#2A3B52] rounded-[2px] px-2 outline-none focus:border-[#2DCCFF]" />
        </div>
      }>
        {audit.length === 0 ? (
          <p className="text-[13px] text-[#A3B1C2]">
            No records yet in this session. Run the guided demo, or{' '}
            <button className="text-[#4DACFF] hover:underline" onClick={() => onNavigate('command')}>send a command</button>.
          </p>
        ) : (
          <div className="overflow-x-auto -m-3.5">
            <table className="w-full border-collapse">
              <thead>
                <tr><Th>Record</Th><Th>Time</Th><Th>Actor</Th><Th>Target</Th><Th>Action</Th><Th>Result</Th><Th>Hash</Th></tr>
              </thead>
              <tbody>
                {audit.map((r) => (
                  <tr key={r.record_id} onClick={() => setSelected(r)} className="cursor-pointer hover:bg-[#172434]">
                    <Td className="font-mono-code text-[12.5px] text-[#4DACFF]">{r.record_id}</Td>
                    <Td className="font-mono-code text-[12px] tabular-nums text-[#A3B1C2]">{r.timestamp_utc.slice(11, 19)}</Td>
                    <Td>{r.operator_name}</Td>
                    <Td className="font-mono-code text-[12.5px]">{r.sat_id}</Td>
                    <Td className="font-mono-code text-[12.5px]">{r.command_mnemonic}</Td>
                    <Td className={r.result === 'ACK' ? 'text-[#56F000]' : 'text-[#FF3838]'}>{r.result}</Td>
                    <Td className="font-mono-code text-[11.5px] text-[#2DCCFF]">{r.bytes_sha256.slice(0, 16)}…</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <Drawer title={selected.record_id} onClose={() => setSelected(null)}>
          <dl className="flex flex-col gap-3 text-[13px]">
            {[
              ['Time', selected.timestamp_utc],
              ['Actor', `${selected.operator_name} (${selected.operator_id})`],
              ['Target', selected.sat_id],
              ['Action', selected.command_mnemonic],
              ['Procedure', `${selected.procedure_id} ${selected.procedure_version}`],
              ['Sequence', String(selected.sequence_count)],
              ['Result', selected.result],
              ['Details', selected.params_summary],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#A3B1C2]">{k}</dt>
                <dd className="font-mono-code text-[12.5px] break-all">{v}</dd>
              </div>
            ))}
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#A3B1C2]">This record</dt>
              <dd className="font-mono-code text-[11.5px] text-[#2DCCFF] break-all">{selected.bytes_sha256}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#A3B1C2]">Previous record</dt>
              <dd className="font-mono-code text-[11.5px] text-[#A3B1C2] break-all">{selected.prev_record_sha256}</dd>
            </div>
          </dl>
        </Drawer>
      )}
    </>
  );
};
