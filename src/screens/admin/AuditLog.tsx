import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Link2, Link2Off } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Pill } from '../../components/atoms/Badge';
import { Card, Drawer, PageHead, SampleTag, Td, Th } from '../../components/molecules/Page';
import { useMissionStore } from '../../store/useMissionStore';
import { useAuthStore } from '../../store/useAuthStore';
import { kindOf, toCsv, useLedgerStore } from '../../store/useLedgerStore';
import { utc } from '../../store/govern';
import { can } from '../../auth/policy';
import { toast } from '../../store/useToastStore';
import type { AuditRecord } from '../../types';
import { Select } from '../../components/molecules/Select';
import { DateInput } from '../../components/molecules/DateInput';

const KINDS = ['Access', 'Command', 'Alarm', 'Advisory', 'Keys', 'On-call', 'Platform', 'Simulator', 'Mission database', 'Audit'];
const chip = 'flex gap-2 items-center h-9 px-3 rounded-full bg-[#11141B] border border-[#1A1E27] text-[13px]';
const bare = 'bg-transparent border-0 text-[#E9ECF1] outline-none [color-scheme:dark]';

/** S26 · Audit ledger — read only; each record carries the hash of the one before. */
export const AuditLog: React.FC<{ onNavigate: (to: string) => void }> = () => {
  const audit = useMissionStore((s) => s.audit);
  const { verification, filters, setFilters, verify, seals } = useLedgerStore();
  const me = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const gate = can('audit:verify', role);
  const [selected, setSelected] = useState<AuditRecord | null>(null);

  const actors = useMemo(() => [...new Set(audit.map((r) => r.operator_name))].sort(), [audit]);
  const rows = audit.filter((r) => {
    const day = r.timestamp_utc.slice(0, 10);
    return (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to)
      && (!filters.actor || r.operator_name === filters.actor) && (!filters.kind || kindOf(r.command_mnemonic) === filters.kind);
  });
  const badIds = new Set(verification?.problems.map((p) => p.record_id));
  const addedSince = verification && verification.state !== 'RUNNING' ? audit.findIndex((r) => r.record_id === verification.headId) : 0;
  const rangeOk = !filters.from || !filters.to || filters.from <= filters.to;

  const runVerify = async () => {
    const v = await verify(me.name);
    if (v.state === 'BROKEN') toast.critical('Audit chain broken', { body: `${v.problems.length} record(s) failed the hash walk.` });
    else toast.success('Chain intact', { body: `${v.checked} records checked.` });
  };

  const exportCsv = () => {
    const name = `vyuh_audit_${filters.from || 'start'}_${filters.to || 'now'}${filters.actor ? `_${filters.actor.replace(/\W+/g, '-')}` : ''}${filters.kind ? `_${filters.kind.replace(/\W+/g, '-')}` : ''}.csv`;
    const url = URL.createObjectURL(new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    useMissionStore.getState().appendAudit({
      timestamp_utc: new Date().toISOString(), operator_id: me.id, operator_name: me.name, sat_id: '—', command_mnemonic: 'AUDIT_EXPORT',
      procedure_id: '—', procedure_version: '—', sequence_count: 0, result: 'ACK',
      params_summary: `Exported ${rows.length} records (${filters.from || 'start'} to ${filters.to || 'now'}${filters.actor ? `, actor ${filters.actor}` : ''}${filters.kind ? `, kind ${filters.kind}` : ''})`,
    });
    toast.success('Export downloaded', { body: `${name} · ${rows.length} records` });
  };

  const v = verification;
  const tone = !v ? 'idle' : v.state === 'RUNNING' ? 'idle' : v.state === 'INTACT' ? 'ok' : 'crit';

  return (
    <>
      <PageHead
        title="Audit ledger"
        sub="Every sign-in, command, approval, alarm action, access change and key change. Read only; each record carries the hash of the one before."
        actions={<>
          <Button variant="secondary" onClick={exportCsv} disabled={!gate.allowed || !rangeOk || rows.length === 0}
            reason={!gate.allowed ? gate.reason : !rangeOk ? 'The From date is after the To date.' : rows.length === 0 ? 'No records match the filters.' : undefined}>Export CSV</Button>
          <Button onClick={runVerify} isLoading={v?.state === 'RUNNING'} disabled={!gate.allowed}>Verify chain</Button>
        </>}
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className={clsx('w-11 h-11 flex-none rounded-xl flex items-center justify-center',
            tone === 'ok' ? 'bg-[#4ADE9A]/12 text-[#4ADE9A]' : tone === 'crit' ? 'bg-[#FF6B6B]/15 text-[#FF7A7A]' : 'bg-[#232936] text-[#9AA3B2]')}>
            {tone === 'crit' ? <Link2Off size={22} /> : <Link2 size={22} />}
          </span>
          <span className="flex flex-col gap-1 mr-auto min-w-0">
            <span className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[16px] font-semibold">{!v ? 'Not verified in this session' : v.state === 'RUNNING' ? 'Walking the chain…' : v.state === 'INTACT' ? 'Chain intact' : 'Chain broken'}</span>
              {v && v.state !== 'RUNNING' && <Pill tone={v.state === 'INTACT' ? 'ok' : 'crit'}>{v.state === 'INTACT' ? 'Verified' : `${v.problems.length} problem${v.problems.length > 1 ? 's' : ''}`}</Pill>}
            </span>
            <span className="text-[13px] text-[#9AA3B2]">
              {!v ? (gate.allowed ? 'Verify walks every record from the first, re-checking each link and each content seal.' : gate.reason)
                : v.state === 'RUNNING' ? 'Re-hashing every record.'
                : <>Checked from <span className="font-mono-code text-[#C9CED6]">{v.first ? utc(v.first) : '—'}</span> to <span className="font-mono-code text-[#C9CED6]">{v.last ? utc(v.last, true) : '—'}</span>, by {v.by} at {utc(v.at, true)}.
                  {addedSince > 0 && <span className="text-[#F5C451]"> {addedSince} record{addedSince > 1 ? 's' : ''} added since; verify again.</span>}</>}
            </span>
          </span>
          {v && v.state !== 'RUNNING' && <span className="flex items-baseline gap-2"><span className="text-[34px] font-semibold tracking-[-0.02em] numeric">{v.checked}</span><span className="text-[14px] text-[#7C8594]">records checked</span></span>}
        </div>
        {v?.state === 'BROKEN' && (
          <ul className="mt-4 flex flex-col gap-1.5">
            {v.problems.map((p) => (
              <li key={p.record_id + p.reason} className="text-[13px] text-[#FF7A7A]">
                <button className="font-mono-code underline-offset-2 hover:underline" onClick={() => setSelected(audit.find((r) => r.record_id === p.record_id) ?? null)}>{p.record_id}</button> · {p.reason}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex flex-wrap gap-2 mb-4">
        <label className={chip}><span className="text-[#7C8594]">From</span><DateInput type="date" value={filters.from} onChange={(e) => setFilters({ from: e.target.value })} className={bare} /></label>
        <label className={chip}><span className="text-[#7C8594]">To</span><DateInput type="date" value={filters.to} onChange={(e) => setFilters({ to: e.target.value })} className={bare} /></label>
        <label className={chip}><span className="text-[#7C8594]">Actor</span>
          <Select value={filters.actor} onChange={(e) => setFilters({ actor: e.target.value })} className={bare}><option value="">Anyone</option>{actors.map((a) => <option key={a}>{a}</option>)}</Select></label>
        <label className={chip}><span className="text-[#7C8594]">Kind</span>
          <Select value={filters.kind} onChange={(e) => setFilters({ kind: e.target.value })} className={bare}><option value="">All</option>{KINDS.map((k) => <option key={k}>{k}</option>)}</Select></label>
        {(filters.actor || filters.kind) && <Button size="sm" variant="ghost" onClick={() => setFilters({ actor: '', kind: '' })}>Clear filters</Button>}
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        <Card className="flex-[999_1_560px] min-w-0" title="Records" flush actions={<span className="text-[#7C8594]">{rows.length} of {audit.length} · newest first</span>}>
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full min-w-[860px] border-collapse">
              <thead><tr><Th>Time UTC</Th><Th>Who</Th><Th>What</Th><Th>Target</Th><Th>Result</Th><Th>Hash</Th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><Td colSpan={6} className="text-[#7C8594]">No records match these filters.</Td></tr>}
                {rows.map((r) => (
                  <tr key={r.record_id} onClick={() => setSelected(r)} className={clsx('cursor-pointer hover:bg-[#161A22]', badIds.has(r.record_id) && 'bg-[#FF6B6B]/[0.07]')}>
                    <Td className="font-mono-code text-[12px] whitespace-nowrap">{utc(r.timestamp_utc, true)}</Td>
                    <Td><span className="flex flex-col"><span className="text-[#E9ECF1]">{r.operator_name}</span><span className="text-[12px] text-[#7C8594]">{kindOf(r.command_mnemonic)}</span></span></Td>
                    <Td><span className="font-mono-code text-[12px] text-[#9AA3B2]">{r.command_mnemonic}</span> {r.params_summary}</Td>
                    <Td className="font-mono-code text-[12px]">{r.sat_id}</Td>
                    <Td><Pill tone={r.result === 'ACK' ? 'ok' : r.result === 'NACK' ? 'crit' : 'warn'}>{r.result === 'ACK' ? 'Done' : r.result === 'NACK' ? 'Refused' : 'Timed out'}</Pill></Td>
                    <Td className="font-mono-code text-[12px] text-[#6B7383]">{r.bytes_sha256.slice(0, 8)}…</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="flex-[1_1_320px] min-w-0" title="Where the ledger lives" actions={<SampleTag>Configuration placeholder</SampleTag>}>
          <p className="text-[13px] text-[#9AA3B2] leading-[1.55]">
            In this console the ledger is kept in the browser session. Each record is sealed (SHA-256 of every field) when it arrives, and
            Verify re-checks every link and seal. Anchoring to write-once storage and streaming to a SIEM are part of the target design and are not connected here.
          </p>
          <p className="text-[12.5px] text-[#7C8594] mt-3">{Object.keys(seals).length} of {audit.length} records sealed.</p>
        </Card>
      </div>

      {selected && (
        <Drawer title={selected.record_id} onClose={() => setSelected(null)}>
          {badIds.has(selected.record_id) && <p className="text-[13px] text-[#FF7A7A]">{verification?.problems.filter((p) => p.record_id === selected.record_id).map((p) => p.reason).join(' ')}</p>}
          <dl className="flex flex-col gap-3 text-[13px]">
            {([
              ['Time', utc(selected.timestamp_utc, true)],
              ['Actor', `${selected.operator_name} (${selected.operator_id})`],
              ['Kind', kindOf(selected.command_mnemonic)],
              ['Action', selected.command_mnemonic],
              ['Target', selected.sat_id],
              ['Procedure', `${selected.procedure_id} ${selected.procedure_version}`],
              ['Sequence', String(selected.sequence_count)],
              ['Result', selected.result],
              ['Details', selected.params_summary],
              ['This record', selected.bytes_sha256],
              ['Previous record', selected.prev_record_sha256],
              ['Content seal', seals[selected.record_id] ?? 'not sealed yet'],
            ] as const).map(([k, val]) => (
              <div key={k} className="flex flex-col gap-0.5">
                <dt className="text-[12px] text-[#7C8594]">{k}</dt>
                <dd className={clsx('break-all', /record|seal|Sequence|Action|Target/.test(k) && 'font-mono-code text-[12px]')}>{val}</dd>
              </div>
            ))}
          </dl>
        </Drawer>
      )}
    </>
  );
};
