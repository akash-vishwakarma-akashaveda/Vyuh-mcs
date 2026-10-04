import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/atoms/Button';
import { Pill } from '../../components/atoms/Badge';
import { Banner, Card, KpiRow, KpiTile, Meter, PageHead, SampleTag, Segmented } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { FLEET } from '../../data/fleet';
import { COMMAND_DICT } from '../../ops/commandDict';
import { can } from '../../auth/policy';
import { useAuthStore } from '../../store/useAuthStore';
import { useMissionStore } from '../../store/useMissionStore';
import { crc16, useServicesStore, type MemArea, type SchedEntry } from '../../store/useServicesStore';
import { toast } from '../../store/useToastStore';
import { LifecycleTrack, ago, field, isSat, paramText, setHashParams, useHashParams, useNow, utc } from './gates';
import { Select } from '../../components/molecules/Select';
import { DateInput } from '../../components/molecules/DateInput';
import { Stepper } from '../../components/molecules/Stepper';

type Tab = 'schedule' | 'memory' | 'files' | 'reports';
const mb = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${(b / 1024).toFixed(1)} kB`);
const th = 'px-3 py-1 font-normal text-left';
const row = 'bg-[#141821]';

/** S30 · Spacecraft services: PUS-11 schedule, PUS-6 memory, CFDP files, PUS-3/5 report definitions. */
export const SpacecraftServices: React.FC<{ onNavigate: (to: string) => void }> = () => {
  const params = useHashParams();
  const sat = isSat(params.sat) ? params.sat : 'AKV-03';
  const tab: Tab = (['schedule', 'memory', 'files', 'reports'] as Tab[]).includes(params.tab as Tab) ? (params.tab as Tab) : 'schedule';
  const role = useAuthStore((s) => s.activeRole);
  const user = useAuthStore((s) => s.user);
  const sv = useServicesStore((s) => s.sats[sat]) ?? useServicesStore.getState().of(sat);
  const commands = useMissionStore((s) => s.commands);
  const { issue, patch } = useServicesStore.getState();
  useNow(5000);
  useEffect(() => { if (!useServicesStore.getState().sats[sat]) useServicesStore.getState().patch(sat, () => ({})); }, [sat]); // fix the sample model for this satellite

  const gate = (critical: boolean) => (critical ? can('command:request', role) : can('command:send', role));
  const routine = gate(false);
  const cmdOf = (id?: string) => (id ? commands.find((c) => c.command_id === id) : undefined);
  const audit = (mn: string, text: string) => useMissionStore.getState().appendAudit({ timestamp_utc: new Date().toISOString(), operator_id: user.id, operator_name: user.name, sat_id: sat, command_mnemonic: mn, procedure_id: '—', procedure_version: '—', sequence_count: 0, result: 'ACK', params_summary: text });

  // ---- schedule ------------------------------------------------------------------------
  const [ins, setIns] = useState<{ mnemonic: string; at: string } | null>(null);
  const [shift, setShift] = useState<{ e: SchedEntry; by: string } | null>(null);
  const [del, setDel] = useState<SchedEntry | null>(null);
  const onDone = (title: string) => () => toast.success(title, { body: `${sat} on-board schedule updated` });
  const onFail = (title: string) => (why: string) => toast.warning(title, { body: why });

  const insert = () => {
    if (!ins) return;
    const def = COMMAND_DICT.find((c) => c.mnemonic === ins.mnemonic)!;
    const release = new Date(ins.at).toISOString();
    const id = `${sat}-S${Date.now() % 100000}`;
    const p = Object.fromEntries(def.params.map((x) => [x.id, x.def]));
    const commandId = issue(sat, 'PUS11_INSERT', { CMD: def.mnemonic, AT: release.slice(0, 16) }, def.critical, `Insert ${def.mnemonic} at ${release.slice(0, 16)}Z in the on-board schedule`,
      () => patch(sat, (s) => ({ schedule: s.schedule.map((x) => (x.id === id ? { ...x, pending: undefined } : x)) })),
      (why) => { patch(sat, (s) => ({ schedule: s.schedule.filter((x) => x.id !== id) })); onFail(`Not inserted: ${def.mnemonic}`)(why); });
    patch(sat, (s) => ({ schedule: [...s.schedule, { id, mnemonic: def.mnemonic, params: p, release_utc: release, critical: def.critical, pending: 'INSERT', commandId }] }));
    setIns(null);
  };
  const doShift = () => {
    if (!shift) return;
    const by = Number(shift.by);
    const to = new Date(Date.parse(shift.e.release_utc) + by * 60_000).toISOString();
    const id = shift.e.id;
    const commandId = issue(sat, 'PUS11_SHIFT', { ID: id, BY_S: by * 60 }, shift.e.critical, `Shift ${shift.e.mnemonic} by ${by} min`,
      () => { patch(sat, (s) => ({ schedule: s.schedule.map((x) => (x.id === id ? { ...x, release_utc: to, pending: undefined, shiftTo: undefined } : x)) })); onDone('Time-shift applied')(); },
      (why) => { patch(sat, (s) => ({ schedule: s.schedule.map((x) => (x.id === id ? { ...x, pending: undefined, shiftTo: undefined } : x)) })); onFail('Time-shift not applied')(why); });
    patch(sat, (s) => ({ schedule: s.schedule.map((x) => (x.id === id ? { ...x, pending: 'SHIFT', shiftTo: to, commandId } : x)) }));
    setShift(null);
  };
  const doDelete = () => {
    if (!del) return;
    const id = del.id;
    const commandId = issue(sat, 'PUS11_DELETE', { ID: id }, del.critical, `Delete ${del.mnemonic} at ${del.release_utc.slice(0, 16)}Z from the on-board schedule`,
      () => { patch(sat, (s) => ({ schedule: s.schedule.filter((x) => x.id !== id) })); onDone('Deleted from the schedule')(); },
      (why) => { patch(sat, (s) => ({ schedule: s.schedule.map((x) => (x.id === id ? { ...x, pending: undefined } : x)) })); onFail('Not deleted')(why); });
    patch(sat, (s) => ({ schedule: s.schedule.map((x) => (x.id === id ? { ...x, pending: 'DELETE', commandId } : x)) }));
    setDel(null);
  };
  const report = () => {
    const id = issue(sat, 'PUS11_REPORT', { SUMMARY: 'ALL' }, false, 'Report the on-board schedule (TC 11,17)', () => { patch(sat, () => ({ scheduleSyncUtc: new Date().toISOString() })); toast.success('Schedule summary received', { body: `${sat}: ground model matches on board` }); });
    // Say so at once: the reply only comes once the command has gone up at the next contact.
    toast.info(`Schedule report requested: ${id}`, { body: `${sat}: TC(11,17) is in the uplink queue; the summary arrives when it completes.`, key: id });
  };
  const syncAge = (Date.now() - Date.parse(sv.scheduleSyncUtc)) / 60_000;
  const pendingSched = sv.schedule.filter((e) => e.pending).length;

  // ---- memory ---------------------------------------------------------------------------
  const [load, setLoad] = useState<{ area: MemArea; name?: string; crc?: string; bytes?: number } | null>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const memOp = (area: MemArea, op: 'LOAD' | 'DUMP' | 'CHECK', extra: Record<string, string | number> = {}, after?: () => void) => {
    const critical = op === 'LOAD' && area.critical;
    patch(sat, (s) => ({ memory: s.memory.map((m) => (m.id === area.id ? { ...m, busy: op.toLowerCase() } : m)) }));
    issue(sat, `PUS6_${op}`, { AREA: area.id, ...extra }, critical, `${op.toLowerCase()} ${area.name}`,
      () => { patch(sat, (s) => ({ memory: s.memory.map((m) => (m.id === area.id ? { ...m, busy: undefined, lastOp: `${op.toLowerCase()} ${utc(Date.now(), false)}` } : m)) })); after?.(); },
      (why) => { patch(sat, (s) => ({ memory: s.memory.map((m) => (m.id === area.id ? { ...m, busy: undefined } : m)) })); toast.warning(`${op.toLowerCase()} failed on ${area.name}`, { body: why }); });
  };
  const pickFile = async (f: File | undefined) => {
    if (!f || !load) return;
    if (f.size > load.area.sizeKb * 1024) { toast.warning('Image too large', { body: `${f.name} is ${mb(f.size)}; ${load.area.name} holds ${load.area.sizeKb} kB.` }); return; }
    setLoad({ ...load, name: f.name, crc: crc16(await f.arrayBuffer()), bytes: f.size });
  };

  // ---- files ------------------------------------------------------------------------------
  const [newXfer, setNewXfer] = useState<{ dir: 'UP' | 'DOWN'; file: string; bytes: number; cls: 1 | 2 } | null>(null);
  const upIn = useRef<HTMLInputElement>(null);
  const setXfer = (id: string, state: 'RUNNING' | 'SUSPENDED' | 'CANCELLED') => {
    patch(sat, (s) => ({ transfers: s.transfers.map((t) => (t.id === id ? { ...t, state } : t)) }));
    audit('CFDP', `${id} ${state === 'RUNNING' ? 'resumed' : state.toLowerCase()}`);
  };
  const startXfer = () => {
    if (!newXfer) return;
    const id = `${sat}-F${Date.now() % 100000}`;
    patch(sat, (s) => ({ transfers: [{ id, ...newXfer, done: 0, state: 'RUNNING', startedBy: user.name, utc: new Date().toISOString() }, ...s.transfers] }));
    audit('CFDP', `${newXfer.dir === 'UP' ? 'put' : 'get (proxy put)'} ${newXfer.file} class ${newXfer.cls}`);
    setNewXfer(null);
  };

  // ---- reports ------------------------------------------------------------------------------
  const setReport = (id: string, change: { enabled?: boolean; rateS?: number }) => {
    const d = sv.reports.find((r) => r.id === id)!;
    const svc = d.kind === 'HK' ? 3 : 5;
    const mn = change.rateS !== undefined ? 'PUS3_RATE' : `PUS${svc}_${change.enabled ? 'ENABLE' : 'DISABLE'}`;
    const commandId = issue(sat, mn, { ID: d.id.replace(/\s/g, '_'), ...(change.rateS !== undefined ? { RATE_S: change.rateS } : {}) }, false, `${d.name}: ${change.rateS !== undefined ? `every ${change.rateS} s` : change.enabled ? 'enable' : 'disable'}`,
      () => patch(sat, (s) => ({ reports: s.reports.map((r) => (r.id === id ? { ...r, ...change, pending: undefined, commandId: undefined } : r)) })),
      (why) => { patch(sat, (s) => ({ reports: s.reports.map((r) => (r.id === id ? { ...r, pending: undefined, commandId: undefined } : r)) })); toast.warning(`${d.name} unchanged`, { body: why }); });
    patch(sat, (s) => ({ reports: s.reports.map((r) => (r.id === id ? { ...r, pending: change.rateS !== undefined ? `rate → ${change.rateS} s` : change.enabled ? 'enabling' : 'disabling', commandId } : r)) }));
  };

  const PendingCell: React.FC<{ id?: string }> = ({ id }) => { const c = cmdOf(id); return c ? <LifecycleTrack c={c} /> : null; };

  return (
    <>
      <PageHead title="Spacecraft services" sub={<>On-board services for <span className="font-mono-code">{sat}</span>. Every change is a command: same gates, approvals, uplink queue and audit as the console. <SampleTag /></>}
        actions={<>
          <label className="flex items-center gap-2.5 h-[38px] rounded-[10px] bg-[#11141B] border border-[#1A1E27] px-3 text-[13px]">
            <span className="text-[#7C8594]">Satellite</span>
            <Select aria-label="Satellite" value={sat} onChange={(e) => setHashParams({ sat: e.target.value })} className="bg-transparent text-[#E9ECF1] font-mono-code text-[13.5px] outline-none">
              {FLEET.map((f) => <option key={f.sat_id} value={f.sat_id} className="bg-[#11141B]">{f.sat_id}</option>)}
            </Select>
          </label>
          <Segmented value={tab} onChange={(v) => setHashParams({ tab: v })} options={[{ value: 'schedule', label: 'Schedule' }, { value: 'memory', label: 'Memory' }, { value: 'files', label: 'Files' }, { value: 'reports', label: 'Reports' }]} />
        </>} />

      {!routine.allowed && <Banner kind="warn" lead="Read only.">{routine.reason}</Banner>}

      {tab === 'schedule' && (
        <>
          <KpiRow>
            <KpiTile label="Time-tagged commands on board" value={sv.schedule.filter((e) => e.pending !== 'INSERT').length} />
            <KpiTile label="Changes on their way" value={pendingSched} tone={pendingSched ? 'action' : 'plain'} />
            <KpiTile label="Ground model" value={syncAge > 60 ? 'Stale' : 'In sync'} tone={syncAge > 60 ? 'warn' : 'ok'} sub={`last schedule report ${ago(sv.scheduleSyncUtc)}`} />
            <KpiTile label="Next release" value={<span className="font-mono-code text-[24px]">{utc([...sv.schedule].sort((a, b) => Date.parse(a.release_utc) - Date.parse(b.release_utc))[0]?.release_utc, false)}</span>} />
          </KpiRow>
          <Card title="On-board schedule · PUS-11" actions={<>
            <Button size="sm" variant="secondary" disabled={!routine.allowed} onClick={report}>Request report</Button>
            <Button size="sm" disabled={!routine.allowed} onClick={() => setIns({ mnemonic: 'IMG_CAPTURE', at: new Date(Date.now() + 90 * 60_000).toISOString().slice(0, 16) })}>Insert command…</Button>
          </>} flush>
            <div className="overflow-x-auto px-2 pb-2">
              <table className="w-full min-w-[820px] text-[13px] border-separate" style={{ borderSpacing: '0 4px' }}>
                <thead><tr className="text-[12px] text-[#6B7383]"><th className={th}>Release (UTC)</th><th className={th}>Command</th><th className={th}>State</th><th className={`${th} text-right`}>Change</th></tr></thead>
                <tbody>
                  {[...sv.schedule].sort((a, b) => Date.parse(a.release_utc) - Date.parse(b.release_utc)).map((e) => {
                    const g = gate(e.critical);
                    return (
                      <tr key={e.id} className={row}>
                        <td className="px-3 py-2.5 rounded-l-[10px] font-mono-code">{utc(e.release_utc, false)}{e.shiftTo && <span className="block text-[11.5px] text-[#F2A65A]">→ {utc(e.shiftTo, false)}</span>}</td>
                        <td className="px-3 py-2.5 font-mono-code text-[12.5px]">{e.mnemonic} {paramText(e.params)} {e.critical && <Pill tone="warn" className="ml-1 font-sans">Critical</Pill>}</td>
                        <td className="px-3 py-2.5">{e.pending ? <span className="flex flex-col gap-1"><span className="text-[12px] text-[#F2A65A]">{e.pending === 'INSERT' ? 'Inserting' : e.pending === 'DELETE' ? 'Deleting' : 'Shifting'}</span><PendingCell id={e.commandId} /></span> : <Pill tone="ok" glyph="normal">On board</Pill>}</td>
                        <td className="px-3 py-2 rounded-r-[10px] text-right whitespace-nowrap">
                          <span className="inline-flex gap-2">
                            <Button size="sm" variant="secondary" disabled={!!e.pending || !g.allowed} onClick={() => setShift({ e, by: '10' })}>Time-shift…</Button>
                            <Button size="sm" variant="danger" disabled={!!e.pending || !g.allowed} onClick={() => setDel(e)}>Delete…</Button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {sv.schedule.length === 0 && <tr><td colSpan={4} className="px-3 py-3 bg-[#141821] rounded-[10px] text-[#7C8594]">Nothing scheduled on board.</td></tr>}
                </tbody>
              </table>
              <p className="px-3 text-[12px] text-[#7C8594]">A change shows here as soon as it is raised; it is applied to the model only when the spacecraft completes it. Critical commands need a Flight Director.</p>
            </div>
          </Card>
        </>
      )}

      {tab === 'memory' && (
        <Card title="Memory areas · PUS-6" flush>
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full min-w-[860px] text-[13px] border-separate" style={{ borderSpacing: '0 4px' }}>
              <thead><tr className="text-[12px] text-[#6B7383]"><th className={th}>Area</th><th className={th}>Start · size</th><th className={th}>Checksum ground / on board</th><th className={th}>Last</th><th className={`${th} text-right`}>Operation</th></tr></thead>
              <tbody>
                {sv.memory.map((m) => {
                  const match = m.expectedCrc === m.onboardCrc;
                  const g = gate(m.critical);
                  return (
                    <tr key={m.id} className={row}>
                      <td className="px-3 py-2.5 rounded-l-[10px]">{m.name}<span className="block font-mono-code text-[11.5px] text-[#7C8594]">{m.id}{m.critical ? ' · critical to load' : ''}{!m.writable ? ' · read only' : ''}</span></td>
                      <td className="px-3 py-2.5 font-mono-code text-[12.5px]">{m.start} · {m.sizeKb} kB</td>
                      <td className="px-3 py-2.5 font-mono-code text-[12.5px]">{m.expectedCrc} / {m.onboardCrc} <Pill tone={match ? 'ok' : 'crit'} className="ml-1 font-sans">{match ? 'Match' : 'Differs'}</Pill></td>
                      <td className="px-3 py-2.5 text-[#9AA3B2]">{m.busy ? <span className="text-[#F2A65A]">{m.busy} running</span> : m.lastOp}{m.dump && <span className="block font-mono-code text-[11.5px] text-[#7C8594]">{m.dump}</span>}</td>
                      <td className="px-3 py-2 rounded-r-[10px] text-right whitespace-nowrap">
                        <span className="inline-flex gap-2">
                          <Button size="sm" variant="secondary" disabled={!!m.busy || !routine.allowed} onClick={() => memOp(m, 'CHECK', {}, () => patch(sat, (s) => ({ memory: s.memory.map((x) => (x.id === m.id ? { ...x, lastOp: `checked ${utc(Date.now(), false)}: ${x.expectedCrc === x.onboardCrc ? 'match' : 'MISMATCH'}` } : x)) })))}>Check</Button>
                          <Button size="sm" variant="secondary" disabled={!!m.busy || !routine.allowed} onClick={() => memOp(m, 'DUMP', { LEN_KB: Math.min(4, m.sizeKb) }, () => patch(sat, (s) => ({ memory: s.memory.map((x) => (x.id === m.id ? { ...x, dump: `4 kB from ${m.start}, crc ${x.onboardCrc}` } : x)) })))}>Dump</Button>
                          <Button size="sm" disabled={!m.writable || !!m.busy || !g.allowed} onClick={() => setLoad({ area: m })}>Load…</Button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-3 text-[12px] text-[#7C8594]">Load sends the image in TC(6,2) segments; Check asks the spacecraft for TC(6,9) checksums and compares them with the ground copy.</p>
          </div>
        </Card>
      )}

      {tab === 'files' && (
        <Card title="File transfers · CFDP" actions={<>
          <Button size="sm" variant="secondary" disabled={!routine.allowed} onClick={() => setNewXfer({ dir: 'DOWN', file: '/payload/', bytes: 25_000_000, cls: 2 })}>Request downlink…</Button>
          <Button size="sm" disabled={!routine.allowed} onClick={() => upIn.current?.click()}>Uplink a file…</Button>
          <input ref={upIn} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setNewXfer({ dir: 'UP', file: `/obc/upload/${f.name}`, bytes: f.size, cls: 2 }); e.target.value = ''; }} />
        </>} flush>
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full min-w-[860px] text-[13px] border-separate" style={{ borderSpacing: '0 4px' }}>
              <thead><tr className="text-[12px] text-[#6B7383]"><th className={th}>File</th><th className={th}>Direction · class</th><th className={th}>Progress</th><th className={th}>State</th><th className={`${th} text-right`}>Control</th></tr></thead>
              <tbody>
                {sv.transfers.map((t) => (
                  <tr key={t.id} className={row}>
                    <td className="px-3 py-2.5 rounded-l-[10px] font-mono-code text-[12.5px]">{t.file}<span className="block text-[11.5px] text-[#7C8594] font-sans">{t.startedBy} · {ago(t.utc)}</span></td>
                    <td className="px-3 py-2.5">{t.dir === 'UP' ? 'Uplink' : 'Downlink'} · class {t.cls} {t.cls === 2 ? '(acknowledged)' : '(unacknowledged)'}</td>
                    <td className="px-3 py-2.5 min-w-[180px]"><Meter value={t.done} max={t.bytes} color={t.state === 'COMPLETE' ? '#4ADE9A' : '#6CB8FF'} /><span className="font-mono-code text-[11.5px] text-[#9AA3B2]">{mb(t.done)} of {mb(t.bytes)}{t.naks ? ` · ${t.naks} NAK` : ''}</span></td>
                    <td className="px-3 py-2.5"><Pill tone={t.state === 'COMPLETE' ? 'ok' : t.state === 'RUNNING' ? 'info' : t.state === 'SUSPENDED' || t.state === 'WAITING' ? 'warn' : 'neutral'}>{t.state === 'WAITING' ? 'Waiting for contact' : t.state.charAt(0) + t.state.slice(1).toLowerCase()}</Pill></td>
                    <td className="px-3 py-2 rounded-r-[10px] text-right whitespace-nowrap">
                      <span className="inline-flex gap-2">
                        {(t.state === 'SUSPENDED' || t.state === 'WAITING') && <Button size="sm" variant="secondary" disabled={!routine.allowed} onClick={() => setXfer(t.id, 'RUNNING')}>{t.state === 'WAITING' ? 'Start' : 'Resume'}</Button>}
                        {t.state === 'RUNNING' && <Button size="sm" variant="secondary" disabled={!routine.allowed} onClick={() => setXfer(t.id, 'SUSPENDED')}>Suspend</Button>}
                        {['RUNNING', 'SUSPENDED', 'WAITING'].includes(t.state) && <Button size="sm" variant="danger" disabled={!routine.allowed} onClick={() => setXfer(t.id, 'CANCELLED')}>Cancel</Button>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'reports' && (
        <div className="flex flex-wrap gap-4 items-start">
          {(['HK', 'EVENT'] as const).map((k) => (
            <Card key={k} title={k === 'HK' ? 'Housekeeping reports · PUS-3' : 'Event reports · PUS-5'} flush className="flex-[1_1_480px] min-w-0">
              <div className="overflow-x-auto px-2 pb-2">
                <table className="w-full min-w-[440px] text-[13px] border-separate" style={{ borderSpacing: '0 4px' }}>
                  <thead><tr className="text-[12px] text-[#6B7383]"><th className={th}>Definition</th><th className={th}>{k === 'HK' ? 'Rate' : 'Severity'}</th><th className={th}>State</th><th className={`${th} text-right`}>Change</th></tr></thead>
                  <tbody>
                    {sv.reports.filter((r) => r.kind === k).map((r) => (
                      <tr key={r.id} className={row}>
                        <td className="px-3 py-2.5 rounded-l-[10px]">{r.name}<span className="block font-mono-code text-[11.5px] text-[#7C8594]">{r.id}</span></td>
                        <td className="px-3 py-2.5">
                          {k === 'HK' ? (
                            <Select aria-label={`${r.name} rate`} value={r.rateS} disabled={!!r.pending || !routine.allowed} onChange={(e) => setReport(r.id, { rateS: Number(e.target.value) })} className="h-8 rounded-xl bg-[#161A22] border border-[#232936] px-2 font-mono-code text-[12.5px] text-[#E9ECF1]">
                              {[1, 2, 5, 10, 30, 60].map((s) => <option key={s} value={s}>every {s} s</option>)}
                            </Select>
                          ) : <span className="font-mono-code text-[12.5px]">{r.severity}</span>}
                        </td>
                        <td className="px-3 py-2.5">{r.pending ? <span className="flex flex-col gap-1"><span className="text-[12px] text-[#F2A65A]">{r.pending}</span><PendingCell id={r.commandId} /></span> : <Pill tone={r.enabled ? 'ok' : 'neutral'} glyph={r.enabled ? 'normal' : 'off'}>{r.enabled ? 'Enabled' : 'Disabled'}</Pill>}</td>
                        <td className="px-3 py-2 rounded-r-[10px] text-right"><Button size="sm" variant="secondary" disabled={!!r.pending || !routine.allowed} onClick={() => setReport(r.id, { enabled: !r.enabled })}>{r.enabled ? 'Disable' : 'Enable'}</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      {ins && (
        <Modal title="Insert into the on-board schedule" onClose={() => setIns(null)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setIns(null)}>Cancel</Button>
            <Button disabled={!gate(!!COMMAND_DICT.find((c) => c.mnemonic === ins.mnemonic)?.critical).allowed || Date.parse(ins.at) <= Date.now()} reason={Date.parse(ins.at) <= Date.now() ? 'Pick a time in the future' : undefined} onClick={insert}>
              {COMMAND_DICT.find((c) => c.mnemonic === ins.mnemonic)?.critical ? 'Request approval' : 'Insert'}
            </Button></>}>
          <label className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2]">Command (dictionary defaults)
            <Select value={ins.mnemonic} onChange={(e) => setIns({ ...ins, mnemonic: e.target.value })} className={`${field} font-mono-code`}>
              {COMMAND_DICT.filter((c) => c.mnemonic !== 'PUS11_LOAD').map((c) => <option key={c.mnemonic} value={c.mnemonic}>{c.mnemonic}{c.critical ? ' (critical)' : ''}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2]">Release time (UTC)
            <DateInput type="datetime-local" value={ins.at} onChange={(e) => setIns({ ...ins, at: e.target.value })} className={`${field} font-mono-code`} />
          </label>
          <p className="text-[12.5px] text-[#7C8594]">Sent as TC(11,4). A critical command needs a Flight Director before it is inserted.</p>
        </Modal>
      )}
      {shift && (
        <Modal title={`Time-shift ${shift.e.mnemonic}`} onClose={() => setShift(null)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setShift(null)}>Cancel</Button><Button disabled={!Number(shift.by)} onClick={doShift}>{shift.e.critical ? 'Request approval' : 'Shift'}</Button></>}>
          <label className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2]">Shift by (minutes, negative is earlier)
            <span className="flex gap-1">
              <input type="number" value={shift.by} onChange={(e) => setShift({ ...shift, by: e.target.value })} className={`${field} font-mono-code flex-1 min-w-0`} />
              <Stepper value={Number(shift.by) || 0} onChange={(n) => setShift({ ...shift, by: String(n) })} label="shift minutes" />
            </span>
          </label>
          <p className="text-[12.5px] text-[#7C8594]">{utc(shift.e.release_utc, false)} → {Number(shift.by) ? utc(Date.parse(shift.e.release_utc) + Number(shift.by) * 60_000, false) : '—'} UTC. Sent as TC(11,15).</p>
        </Modal>
      )}
      {del && (
        <Modal title={`Delete ${del.mnemonic} from the schedule?`} onClose={() => setDel(null)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setDel(null)}>Keep it</Button><Button variant="danger" onClick={doDelete}>{del.critical ? 'Request approval' : 'Delete'}</Button></>}>
          <p className="text-[13.5px] text-[#C9CED6]"><span className="font-mono-code">{del.mnemonic} {paramText(del.params)}</span> due at {utc(del.release_utc, false)} UTC is removed on board with TC(11,5). Recorded in the audit ledger.</p>
        </Modal>
      )}
      {load && (
        <Modal title={`Load ${load.area.name}`} onClose={() => setLoad(null)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setLoad(null)}>Cancel</Button>
            <Button disabled={!load.crc} reason={!load.crc ? 'Choose an image file' : undefined} onClick={() => { const { area, crc, name, bytes } = load; memOp(area, 'LOAD', { IMAGE: name!, BYTES: bytes!, CRC: crc! }, () => patch(sat, (s) => ({ memory: s.memory.map((x) => (x.id === area.id ? { ...x, expectedCrc: crc, onboardCrc: crc } : x)) }))); setLoad(null); }}>
              {load.area.critical ? 'Request approval' : 'Load'}
            </Button></>}>
          <p className="text-[13px] text-[#9AA3B2]">Writes from <span className="font-mono-code">{load.area.start}</span>, up to {load.area.sizeKb} kB.{load.area.critical ? ' Critical area: a Flight Director approves before anything is sent.' : ''}</p>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => fileIn.current?.click()}>Choose image…</Button>
            <input ref={fileIn} type="file" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />
            {load.name && <span className="font-mono-code text-[12.5px]">{load.name} · {mb(load.bytes!)} · CRC {load.crc}</span>}
          </div>
          {load.crc && <p className="text-[12.5px] text-[#7C8594]">After the load, a check compares the on-board checksum with {load.crc}.</p>}
        </Modal>
      )}
      {newXfer && (
        <Modal title={newXfer.dir === 'UP' ? 'Uplink a file' : 'Request a downlink'} onClose={() => setNewXfer(null)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setNewXfer(null)}>Cancel</Button><Button disabled={newXfer.file.endsWith('/')} onClick={startXfer}>Start transfer</Button></>}>
          <label className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2]">{newXfer.dir === 'UP' ? 'Destination on board' : 'File on board'}
            <input value={newXfer.file} onChange={(e) => setNewXfer({ ...newXfer, file: e.target.value })} className={`${field} font-mono-code`} />
          </label>
          <Segmented value={String(newXfer.cls) as '1' | '2'} onChange={(v) => setNewXfer({ ...newXfer, cls: Number(v) as 1 | 2 })} options={[{ value: '2', label: 'Class 2, acknowledged' }, { value: '1', label: 'Class 1, unacknowledged' }]} />
          <p className="text-[12.5px] text-[#7C8594]">{newXfer.dir === 'UP' ? `${mb(newXfer.bytes)} from your computer.` : 'Size is read from the on-board directory when the transfer starts.'} Class 2 retransmits lost segments (NAK); class 1 does not.</p>
        </Modal>
      )}
    </>
  );
};
