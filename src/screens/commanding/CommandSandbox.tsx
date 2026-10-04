import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Check, Search, TriangleAlert, X } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Pill } from '../../components/atoms/Badge';
import { Banner, Card, PageHead } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { FLEET } from '../../data/fleet';
import { COMMAND_GROUP } from '../../data/mission';
import { COMMAND_DICT, CmdDef, encodePreview, validate } from '../../ops/commandDict';
import { can } from '../../auth/policy';
import { useAuthStore } from '../../store/useAuthStore';
import { isFinalStatus, useMissionStore, type CommandRecord } from '../../store/useMissionStore';
import { useSimulatorStore } from '../../store/useSimulatorStore';
import { toast } from '../../store/useToastStore';
import { cancelCommand } from '../../live/release';
import {
  Gate, LifecycleTrack, RouteLink, approversFor, contactOf, field, interlocksFor, isSat, mmss, orList, paramText, setHashParams, snapshot, useNow, utc,
} from './gates';
import { Select } from '../../components/molecules/Select';

const hex = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');
const defaults = (c: CmdDef) => Object.fromEntries(c.params.map((p) => [p.id, String(p.def)]));
const GATE_STYLE: Record<Gate, { bg: string; fg: string; label: string }> = {
  pass: { bg: 'rgba(74,222,154,0.12)', fg: '#4ADE9A', label: 'Passed' },
  warn: { bg: 'rgba(245,196,81,0.14)', fg: '#F5C451', label: 'Needs attention' },
  pending: { bg: 'rgba(245,196,81,0.14)', fg: '#F5C451', label: 'Needs attention' },
  fail: { bg: 'rgba(255,107,107,0.15)', fg: '#FF7A7A', label: 'Failed' },
};

/** S12 · Command console: catalogue, typed builder, live safety gates, and your commands as they move. */
export const CommandSandbox: React.FC<{ onNavigate: (to: string) => void; satId?: string }> = ({ onNavigate, satId }) => {
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const commands = useMissionStore((s) => s.commands);
  const approvals = useMissionStore((s) => s.approvals);
  useMissionStore((s) => s.fop); // re-render as frames go out
  const now = useNow(1000);

  const sat = isSat(satId) ? satId : 'AKV-03';
  const [find, setFind] = useState('');
  const [cmd, setCmd] = useState<CmdDef>(COMMAND_DICT[0]);
  const [values, setValues] = useState<Record<string, string>>(() => defaults(COMMAND_DICT[0]));
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  const [cancelling, setCancelling] = useState<CommandRecord | null>(null);

  const pick = (c: CmdDef, v?: Record<string, string>) => { setCmd(c); setValues(v ?? defaults(c)); setReason(''); };
  const errors = validate(cmd, values);
  const args = cmd.params.map((p) => `${p.id}=${values[p.id]}`).join(' ');
  const contact = contactOf(sat, now);
  const approvers = approversFor(user.name);

  // ---- gates (all live) -------------------------------------------------------------------
  const policy = cmd.critical ? can('command:request', role) : can('command:send', role);
  // Subscribed so the gate flips the moment the Simulator marks interlock telemetry stale (interlocksFor reads it).
  const staleInterlock = useSimulatorStore((s) => s.staleInterlock);
  const locks = interlocksFor(cmd.mnemonic, sat, now);
  const failedLocks = locks.filter((l) => !l.pass);
  const gates: { name: string; state: Gate; text: string }[] = [
    { name: 'Identity', state: 'pass', text: `${user.name}, ${role}` },
    { name: 'Dictionary', state: Object.keys(errors).length ? 'fail' : 'pass', text: Object.keys(errors).length ? `${Object.keys(errors).join(', ')} outside the dictionary range` : `${cmd.mnemonic} exists in akv-mdb 4.19.0, arguments valid` },
    { name: 'Your role', state: policy.allowed ? 'pass' : 'fail', text: policy.allowed ? `${role} may ${cmd.critical ? 'request critical' : 'send routine'} commands` : policy.reason ?? 'Not allowed' },
    { name: 'Interlock', state: locks.length === 0 ? 'pass' : failedLocks.length ? 'fail' : 'pass', text: locks.length === 0 ? 'No interlock defined for this command' : (staleInterlock ? 'Interlock telemetry is stale (Simulator fault): failing closed · ' : '') + locks.map((l) => `${l.param} ${l.value}${l.rule === 'reported' ? '' : `, needs ${l.rule}`}`).join(' · ') },
    {
      name: 'Contact', state: contact.inContact ? 'pass' : 'warn',
      text: contact.inContact ? `In contact with ${contact.station}, LOS in ${mmss((contact.los! - now) / 1000)}` : `Not in contact. A released command waits in the uplink queue${contact.nextAos ? ` for AOS ${contact.nextStation} ${utc(contact.nextAos, false)}` : ''}.`,
    },
    {
      name: 'Second person', state: cmd.critical ? 'pending' : 'pass',
      text: cmd.critical ? `Needs a Flight Director. ${approvers.length} on shift who are not you.` : 'Routine command: not required',
    },
  ];
  const failing = gates.filter((g) => g.state === 'fail');
  const blocked = failing.length > 0 || (cmd.critical && !reason.trim());
  const passed = gates.filter((g) => g.state === 'pass').length;

  const seqNext = (useMissionStore.getState().fopOf(sat).vS + 1) & 0x3fff;
  const pkt = useMemo(() => encodePreview(cmd, values, seqNext), [cmd, values, seqNext]);
  const bytes = [...pkt.prim, ...pkt.sec, ...pkt.data, ...pkt.crc];
  const chunks: [number[], string, string][] = [[pkt.prim, 'rgba(108,184,255,0.12)', '#8CC8FF'], [pkt.sec, 'rgba(155,140,255,0.14)', '#B7ACFF'], [pkt.data, '#232936', '#E9ECF1'], [pkt.crc, '#1A1E27', '#7C8594']];

  const send = () => {
    setConfirm(false); setTyped('');
    const params = Object.fromEntries(cmd.params.map((p) => [p.id, p.type === 'number' ? Number(values[p.id]) : values[p.id]]));
    const { command_id, approval_id } = useMissionStore.getState().raiseCommand({
      sat_id: sat, mnemonic: cmd.mnemonic, params, critical: cmd.critical, reason: reason.trim() || undefined, source: 'Command console',
      interlocks: snapshot(cmd.mnemonic, sat), los_utc: contact.los ? new Date(contact.los).toISOString() : undefined,
    });
    toast.info(approval_id ? `Approval requested: ${cmd.mnemonic} on ${sat}` : `Released: ${cmd.mnemonic} on ${sat}`, {
      body: approval_id ? `Asked ${orList(approvers)}. It shows below as it moves.` : `${command_id} is in the uplink queue.`, key: command_id,
    });
    setReason('');
  };

  const doCancel = async (c: CommandRecord) => {
    setCancelling(null);
    const why = await cancelCommand(c.command_id);
    if (why) toast.warning(`Not cancelled: ${c.mnemonic}`, { body: why, key: `x-${c.command_id}` });
    else toast.info(`Cancelled: ${c.mnemonic} on ${c.sat_id}`, { key: `x-${c.command_id}` });
  };

  // Commands this person raised this pass (or the last two hours when not in contact), and every one still open.
  const since = contact.inContact && contact.aos ? Math.min(contact.aos, now - 30 * 60_000) : now - 2 * 3600_000;
  const mine = commands.filter((c) => c.requested_by === user.name && (Date.parse(c.utc) >= since || !isFinalStatus(c.status)));

  const list = COMMAND_DICT.filter((c) => (c.mnemonic + c.name).toLowerCase().includes(find.toLowerCase()));
  const groups = [...new Set(list.map((c) => COMMAND_GROUP[c.mnemonic] ?? 'Other'))];
  const mayCommand = can('command:send', role).allowed || can('command:request', role).allowed;

  return (
    <>
      <PageHead title="Command console" sub={<>Command · Console · dictionary <span className="font-mono-code">akv-mdb 4.19.0</span></>}
        actions={<>
          <label className="flex items-center gap-2.5 h-[38px] rounded-[10px] bg-[#11141B] border border-[#1A1E27] px-3 text-[13px]">
            <span className="text-[#7C8594]">Satellite</span>
            <Select value={sat} onChange={(e) => setHashParams({ sat: e.target.value })} aria-label="Satellite" className="bg-transparent text-[#E9ECF1] font-mono-code text-[13.5px] outline-none">
              {FLEET.map((f) => <option key={f.sat_id} value={f.sat_id} className="bg-[#11141B]">{f.sat_id}</option>)}
            </Select>
          </label>
          {contact.inContact
            ? <Pill tone="info" glyph="normal" className="h-[38px] px-3 text-[13px] rounded-[10px]">In contact · {contact.station} · LOS <span className="font-mono-code">{mmss((contact.los! - now) / 1000)}</span></Pill>
            : <Pill tone="neutral" glyph="off" className="h-[38px] px-3 text-[13px] rounded-[10px]">No contact{contact.nextAos ? <> · next AOS <span className="font-mono-code">{utc(contact.nextAos, false)}</span></> : null}</Pill>}
        </>} />

      {!mayCommand && <Banner kind="warn" lead="Read only.">{can('command:send', role).reason}</Banner>}

      <div className="flex flex-wrap gap-4 items-start mb-4">
        <section className="flex-[1_1_260px] max-w-[320px] min-w-0 bg-[#11141B] border border-[#1A1E27] rounded-2xl px-3 py-4 flex flex-col gap-1">
          <span className="text-[14px] font-medium px-1.5 pb-2">Catalogue</span>
          <label className="flex items-center gap-2 h-[38px] rounded-[10px] bg-[#161A22] px-3 mb-1 text-[#6B7383] text-[13px]">
            <Search size={15} aria-hidden="true" />
            <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a command" aria-label="Find a command" className="flex-1 min-w-0 bg-transparent text-[#E9ECF1] outline-none" />
          </label>
          <div className="flex flex-col max-h-[520px] overflow-y-auto">
            {groups.map((g) => (
              <React.Fragment key={g}>
                <span className="text-[12px] text-[#6B7383] px-2 pt-3 pb-1">{g}</span>
                {list.filter((c) => (COMMAND_GROUP[c.mnemonic] ?? 'Other') === g).map((c) => (
                  <button key={c.mnemonic} type="button" aria-pressed={c.mnemonic === cmd.mnemonic} onClick={() => pick(c)}
                    className={clsx('text-left rounded-[10px] px-2.5 py-2 min-h-[44px] flex justify-between gap-2 items-center', c.mnemonic === cmd.mnemonic ? 'bg-[#1B2130]' : 'hover:bg-[#161A22]')}>
                    <span className="flex flex-col gap-0.5 min-w-0"><span className="font-mono-code text-[13px]">{c.mnemonic}</span><span className="text-[12px] text-[#9AA3B2] truncate">{c.name}</span></span>
                    {c.critical && <Pill tone="warn" className="text-[11px] px-2 py-[2px]">Critical</Pill>}
                  </button>
                ))}
              </React.Fragment>
            ))}
            {list.length === 0 && <p className="text-[12.5px] text-[#7C8594] px-2 py-3">No command matches "{find}".</p>}
          </div>
        </section>

        <section className="flex-[999_1_480px] min-w-0 bg-[#11141B] border border-[#1A1E27] rounded-2xl p-5 flex flex-col gap-[18px]">
          <div className="flex flex-col gap-1.5">
            <span className="flex flex-wrap gap-2.5 items-center">
              <span className="font-mono-code text-[20px] font-medium">{cmd.mnemonic}</span>
              {cmd.critical ? <Pill tone="warn">Critical · two-person</Pill> : <Pill tone="neutral">Routine</Pill>}
            </span>
            <span className="text-[13px] text-[#9AA3B2]">{cmd.name} · <span className="font-mono-code">PUS {cmd.service} · APID {cmd.apid}</span> · dictionary <span className="font-mono-code">akv-mdb 4.19.0</span></span>
          </div>
          <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {cmd.params.map((p) => (
              <label key={p.id} className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2]">
                <span>{p.id}{p.unit ? ` (${p.unit})` : ''}</span>
                <span className={clsx('font-mono-code text-[12px] -mt-1', errors[p.id] ? 'text-[#FF7A7A]' : 'text-[#6B7383]')}>{errors[p.id] ?? (p.type === 'enum' ? p.values!.join(' | ') : `${p.min} to ${p.max}${p.unit ? ' ' + p.unit : ''}`)}</span>
                {p.type === 'enum' ? (
                  <Select value={values[p.id]} onChange={(e) => setValues({ ...values, [p.id]: e.target.value })} className={clsx(field, 'font-mono-code')}>{p.values!.map((o) => <option key={o}>{o}</option>)}</Select>
                ) : (
                  <input type="number" step="any" value={values[p.id]} onChange={(e) => setValues({ ...values, [p.id]: e.target.value })} className={clsx(field, 'font-mono-code', errors[p.id] && 'border-[#FF6B6B]')} aria-invalid={!!errors[p.id]} />
                )}
              </label>
            ))}
            {cmd.params.length === 0 && <span className="text-[13px] text-[#7C8594]">This command has no parameters.</span>}
            {cmd.critical && (
              <label className="col-span-full flex flex-col gap-1.5 text-[13px] text-[#9AA3B2]">Why now
                <span className="text-[12px] text-[#6B7383] -mt-1">Shown to the approver and kept in the audit ledger</span>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What happened and why this command fixes it" className={field} />
              </label>
            )}
          </div>

          <div className="rounded-xl bg-[#161A22] px-4 py-3.5 flex flex-col gap-3">
            <span className="flex flex-wrap justify-between gap-2 text-[13px]"><span className="text-[#9AA3B2]">Packet preview</span><span className="font-mono-code text-[12px] text-[#7C8594]">{bytes.length} bytes · seq {seqNext}</span></span>
            <span className="flex flex-wrap gap-1.5 font-mono-code text-[13.5px]">
              {chunks.map(([b, bg, fg], i) => <span key={i} className="rounded-lg px-2.5 py-[5px]" style={{ background: bg, color: fg }}>{b.map(hex).join(' ')}</span>)}
            </span>
            <span className="flex flex-wrap gap-3.5 text-[12px] text-[#9AA3B2]">
              {[['#6CB8FF', 'Header'], ['#9B8CFF', 'PUS secondary header'], ['#C9CED6', 'Function and arguments'], ['#6B7383', 'CRC']].map(([c, l]) => <span key={l}><span style={{ color: c }}>●</span> {l}</span>)}
            </span>
          </div>

          {failing.length > 0 && <Banner kind="crit" lead="Blocked.">{failing.map((g) => `${g.name}: ${g.text}`).join(' · ')}</Banner>}

          <div className="flex flex-wrap justify-between items-center gap-4 mt-auto">
            <span className="text-[13px] text-[#9AA3B2] max-w-[440px] leading-[1.5]">
              {cmd.critical
                ? approvers.length ? <>Goes to a Flight Director on shift: <span className="text-[#E9ECF1]">{orList(approvers)}</span>. Not sent until one of them approves. You will see it here as it moves.</> : 'No Flight Director other than you is on shift, so nobody can approve this now.'
                : <>Goes straight to the uplink queue for <span className="font-mono-code text-[#E9ECF1]">{sat}</span>. You can cancel it until it is radiated.</>}
            </span>
            <Button onClick={() => setConfirm(true)} disabled={blocked || !mayCommand}
              reason={!mayCommand ? undefined : failing.length ? 'A safety gate failed' : cmd.critical && !reason.trim() ? 'Say why now' : undefined}>
              {cmd.critical ? 'Request approval' : 'Send command'}
            </Button>
          </div>
        </section>

        <section className="flex-[1_1_300px] min-w-0 bg-[#11141B] border border-[#1A1E27] rounded-2xl p-[18px] flex flex-col gap-3.5">
          <span className="flex justify-between items-center gap-2"><span className="text-[14px] font-medium">Safety gates</span><span className="text-[12px] text-[#7C8594]">checked live · {passed} of {gates.length} passed</span></span>
          {gates.map((g) => {
            const st = GATE_STYLE[g.state];
            const Icon = g.state === 'pass' ? Check : g.state === 'fail' ? X : TriangleAlert;
            return (
              <div key={g.name} className="grid grid-cols-[24px_1fr] gap-3 items-start">
                <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: st.bg }}><Icon size={13} color={st.fg} strokeWidth={2.6} aria-label={st.label} /></span>
                <span className="flex flex-col gap-[3px] pt-0.5"><span className="text-[13.5px]">{g.name}</span><span className="text-[12px] text-[#9AA3B2] leading-[1.45]">{g.text}</span></span>
              </div>
            );
          })}
        </section>
      </div>

      <Card title="Your commands this pass" actions={<span className="text-[12px] text-[#7C8594]">{mine.length} command{mine.length === 1 ? '' : 's'}</span>} flush>
        <div className="overflow-x-auto px-2 pb-1">
          <table className="w-full min-w-[960px] text-[13px] border-separate" style={{ borderSpacing: '0 4px' }}>
            <thead><tr className="text-left text-[12px] text-[#6B7383]"><th className="px-3 py-1 font-normal">Command</th><th className="px-3 py-1 font-normal">Progress</th><th className="px-3 py-1 font-normal">Approver</th><th className="px-3 py-1 font-normal">Next</th></tr></thead>
            <tbody>
              {mine.map((c) => {
                const appr = approvals.find((a) => a.command_id === c.command_id);
                const pending = c.status === 'AWAITING_APPROVAL';
                const cancellable = (pending || (c.status === 'RELEASED' && !c.radiated));
                const failed = c.status === 'FAILED' || c.status === 'REJECTED';
                const who = !c.critical ? { t: 'Routine, none needed', c: '#9AA3B2' }
                  : pending ? { t: `Waiting · ${orList(approversFor(c.requested_by))} · expires ${appr ? mmss((Date.parse(appr.expires_utc) - now) / 1000) : '—'}`, c: '#F2A65A' }
                  : appr?.withdrawn ? { t: 'Withdrawn by you', c: '#9AA3B2' }
                  : appr?.state === 'EXPIRED' ? { t: 'Expired: nobody decided in time', c: '#FF7A7A' }
                  : c.status === 'REJECTED' ? { t: `Rejected by ${appr?.decided_by ?? '—'}${appr?.reject_reason ? `: ${appr.reject_reason}` : ''}`, c: '#FF7A7A' }
                  : { t: `Approved by ${c.approved_by ?? appr?.decided_by ?? '—'}`, c: '#4ADE9A' };
                return (
                  <tr key={c.command_id} data-command={c.command_id} data-status={c.status} className="bg-[#141821]">
                    <td className="px-3 py-3 rounded-l-[10px] font-mono-code text-[12.5px]">
                      {c.mnemonic} {paramText(c.params)}
                      <span className="block text-[11.5px] text-[#7C8594] font-sans">{c.command_id} · {c.sat_id} · {utc(c.utc)}{c.source && c.source !== 'Command console' ? ` · ${c.source}` : ''}</span>
                      {c.note && <span className="block text-[11.5px] text-[#FF7A7A] font-sans">{c.note}</span>}
                    </td>
                    <td className="px-3 py-3"><LifecycleTrack c={c} /></td>
                    <td className="px-3 py-3 max-w-[260px]" style={{ color: who.c }}>{who.t}</td>
                    <td className="px-3 py-3 rounded-r-[10px]">
                      {cancellable ? <Button size="sm" variant="danger" onClick={() => setCancelling(c)}>{pending ? 'Cancel request' : 'Cancel'}</Button>
                        : failed || c.status === 'CANCELLED' ? <button type="button" className="text-[13px] text-[#F2A65A] hover:text-[#FFC48A]" onClick={() => { const d = COMMAND_DICT.find((x) => x.mnemonic === c.mnemonic); if (d) pick(d, Object.fromEntries(Object.entries(c.params).map(([k, v]) => [k, String(v)]))); if (c.sat_id !== sat) setHashParams({ sat: c.sat_id }); }}>Edit and resend</button>
                          : <RouteLink to={`uplink?sat=${c.sat_id}`} onNavigate={onNavigate}>View in uplink</RouteLink>}
                    </td>
                  </tr>
                );
              })}
              {mine.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-[#7C8594] bg-[#141821] rounded-[10px]">Nothing sent by you this pass.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {confirm && (
        <Modal title={cmd.critical ? 'Request a second approval' : 'Send command'} onClose={() => setConfirm(false)}
          footer={<>
            <Button variant="secondary" autoFocus onClick={() => setConfirm(false)}>Cancel</Button>
            <Button onClick={send} disabled={cmd.critical && typed !== cmd.mnemonic} reason={cmd.critical && typed !== cmd.mnemonic ? `Type ${cmd.mnemonic}` : undefined}>{cmd.critical ? 'Request approval' : 'Send command'}</Button>
          </>}>
          <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-[13px]">
            <dt className="text-[#9AA3B2]">Satellite</dt><dd className="font-mono-code">{sat}</dd>
            <dt className="text-[#9AA3B2]">Command</dt><dd className="font-mono-code">{cmd.mnemonic} {args}</dd>
            <dt className="text-[#9AA3B2]">Service</dt><dd className="font-mono-code">PUS {cmd.service} · APID {cmd.apid}</dd>
            <dt className="text-[#9AA3B2]">Interlock</dt><dd>{gates[3].text}</dd>
            {cmd.critical && <><dt className="text-[#9AA3B2]">Why</dt><dd>{reason}</dd><dt className="text-[#9AA3B2]">Approver</dt><dd>{orList(approvers)}</dd></>}
          </dl>
          {cmd.critical ? (
            <label className="flex flex-col gap-1 text-[12.5px] text-[#9AA3B2]">Type {cmd.mnemonic} to confirm
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={clsx(field, 'font-mono-code')} />
              <span className="text-[#6B7383]">Not uplinked until a Flight Director approves. You can cancel the request until then.</span>
            </label>
          ) : <Banner kind="info" lead="Released to the uplink.">COP-1 delivers it exactly once; the progress follows the spacecraft's acknowledgement.</Banner>}
        </Modal>
      )}

      {cancelling && (
        <Modal title={`Cancel ${cancelling.mnemonic}?`} onClose={() => setCancelling(null)}
          footer={<>
            <Button variant="secondary" autoFocus onClick={() => setCancelling(null)}>Keep it</Button>
            <Button variant="danger" onClick={() => void doCancel(cancelling)}>Cancel command</Button>
          </>}>
          <p className="text-[13.5px] text-[#C9CED6]"><span className="font-mono-code">{cancelling.command_id} {cancelling.mnemonic} {paramText(cancelling.params)}</span> on {cancelling.sat_id} has not been radiated. Cancelling withdraws it{cancelling.status === 'AWAITING_APPROVAL' ? ' and its approval request' : ' from the uplink queue'}; the audit ledger records it.</p>
        </Modal>
      )}
    </>
  );
};
