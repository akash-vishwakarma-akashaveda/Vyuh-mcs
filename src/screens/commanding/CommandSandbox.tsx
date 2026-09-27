import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { CheckCircle2, CircleDashed, ShieldCheck, Send, XCircle } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { StatusBadge } from '../../components/atoms/Badge';
import { Banner, Card, PageHead } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { FLEET } from '../../data/fleet';
import { COMMAND_DICT, CmdDef, encodePreview, validate } from '../../ops/commandDict';
import { can } from '../../auth/policy';
import { useAuthStore } from '../../store/useAuthStore';
import { useFleetStore } from '../../store/useFleetStore';
import { useMissionStore } from '../../store/useMissionStore';
import { toast } from '../../store/useToastStore';
import { isStale } from '../../utils/stalenessUtils';

type Gate = 'pass' | 'fail' | 'pending';
const hex = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');
let seq = 100;

/** S12 · Command console: typed parameters, live safety gates, second-person approval for critical commands. */
export const CommandSandbox: React.FC<{ onNavigate: (to: string) => void; satId?: string }> = ({ onNavigate, satId }) => {
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const cvtAll = useFleetStore((s) => s.cvt);
  const sats = useFleetStore((s) => s.satellites);
  const windows = useFleetStore((s) => s.contactWindows);
  const { commands, addCommand, requestApproval } = useMissionStore();

  const [sat, setSat] = useState(satId && FLEET.some((f) => f.sat_id === satId) ? satId : 'AKV-03');
  const [find, setFind] = useState('');
  const [cmd, setCmd] = useState<CmdDef>(COMMAND_DICT[0]);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(COMMAND_DICT[0].params.map((p) => [p.id, String(p.def)])));
  const [reason, setReason] = useState('');
  const [simulateStale, setSimulateStale] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');

  const pick = (c: CmdDef) => { setCmd(c); setValues(Object.fromEntries(c.params.map((p) => [p.id, String(p.def)]))); setReason(''); };
  const errors = validate(cmd, values);
  const args = cmd.params.map((p) => `${p.id}=${values[p.id]}`).join(' ');

  // ---- gates ---------------------------------------------------------------------------
  const cvt = cvtAll[sat] ?? {};
  const inContact = windows.some((w) => w.sat_id === sat && Date.parse(w.aos_utc) <= Date.now() && Date.parse(w.los_utc) > Date.now());
  const interlock = ((): [Gate, string] => {
    if (cmd.interlock === 'BAT_TEMP') {
      const p = cvt.BAT_TEMP;
      if (!p || simulateStale || isStale(p)) return ['fail', 'BAT_TEMP is stale, so the interlock fails closed'];
      return p.eu_value < 10 || sats[sat]?.health_state === 'CRITICAL' ? ['pass', `BAT_TEMP ${p.eu_value.toFixed(1)} °C is below 10 °C`] : ['fail', `BAT_TEMP ${p.eu_value.toFixed(1)} °C; heater switching needs it below 10 °C`];
    }
    if (cmd.interlock === 'ATT_ERR') {
      const p = cvt.ATT_ERR;
      if (!p || simulateStale || isStale(p)) return ['fail', 'ATT_ERR is stale, so the interlock fails closed'];
      return p.eu_value < 0.08 ? ['pass', `ATT_ERR ${p.eu_value.toFixed(3)}° is under 0.080°`] : ['fail', `ATT_ERR ${p.eu_value.toFixed(3)}° is not under 0.080°`];
    }
    if (cmd.interlock === 'CONTACT') return inContact ? ['pass', 'Satellite is in contact with a station'] : ['fail', 'No station is in contact'];
    return ['pass', 'No interlock defined for this command'];
  })();
  const policy = cmd.critical ? can('command:request', role) : can('command:send', role);
  const gates: { name: string; state: Gate; text: string }[] = [
    { name: 'Identity', state: 'pass', text: `${user.name} · signed in as ${role}` },
    { name: 'Dictionary', state: Object.keys(errors).length ? 'fail' : 'pass', text: Object.keys(errors).length ? 'A parameter is outside the dictionary range' : `${cmd.mnemonic} matches the active dictionary` },
    { name: 'Policy', state: policy.allowed ? 'pass' : 'fail', text: policy.allowed ? `Allowed for ${role}` : policy.reason ?? 'Not allowed' },
    { name: 'Second person', state: cmd.critical ? 'pending' : 'pass', text: cmd.critical ? 'Critical: a Flight Director approves with a fresh passkey' : 'Not required for this command' },
    { name: 'Interlock', state: interlock[0], text: interlock[1] },
  ];
  const blocked = gates.some((g) => g.state === 'fail') || (cmd.critical && !reason.trim());

  const pkt = useMemo(() => encodePreview(cmd, values, (seq + 1) & 0x3fff), [cmd, values]);
  const bytes = [...pkt.prim, ...pkt.sec, ...pkt.data, ...pkt.crc];
  const tint = (i: number) => (i < 6 ? '#2DCCFF' : i < 11 ? '#9C9AEC' : i < bytes.length - 2 ? 'var(--neutral-50)' : '#4DACFF');

  const send = () => {
    setConfirm(false); setTyped('');
    const id = `CMD-${++seq}`;
    const params = Object.fromEntries(cmd.params.map((p) => [p.id, p.type === 'number' ? Number(values[p.id]) : values[p.id]]));
    const base = { command_id: id, sat_id: sat, mnemonic: cmd.mnemonic, params, requested_by: user.name, epoch: 17, utc: new Date().toISOString(), critical: cmd.critical };
    if (cmd.critical) {
      addCommand({ ...base, status: 'AWAITING_APPROVAL' });
      requestApproval({
        approval_id: `AP-${seq}`, command_id: id, sat_id: sat, mnemonic: cmd.mnemonic, params, reason, requested_by: user.name,
        requested_utc: new Date().toISOString(), expires_utc: new Date(Date.now() + 20 * 60_000).toISOString(), state: 'PENDING',
        interlocks: gates.filter((g) => g.name === 'Interlock').map((g) => ({ param: cmd.interlock ?? 'none', value: g.text, rule: 'evaluated at request time', pass: g.state === 'pass' })),
      });
      toast.info(`Approval requested: ${cmd.mnemonic} on ${sat}`, { action: { label: 'Open approvals', route: 'approvals' }, key: id });
    } else {
      addCommand({ ...base, status: 'RELEASED' }); // the release layer takes it from here
      toast.info(`Command released: ${cmd.mnemonic} on ${sat}`, { key: id });
    }
  };

  const list = COMMAND_DICT.filter((c) => (c.mnemonic + c.name).toLowerCase().includes(find.toLowerCase()));
  const recent = commands.slice(0, 8);
  const field = 'h-9 rounded-md bg-[#0A1018] border px-2.5 text-[13px] font-mono-code outline-none focus:border-[#2DCCFF]';

  return (
    <>
      <PageHead title="Command console" sub="Typed parameters, live safety gates and a second person for critical commands"
        actions={<select value={sat} onChange={(e) => setSat(e.target.value)} aria-label="Satellite" className="h-9 rounded-md bg-[#0A1018] border border-[#2A3B52] px-2.5 font-mono-code text-[13px]">
          {FLEET.map((f) => <option key={f.sat_id} value={f.sat_id}>{f.sat_id}</option>)}
        </select>} />

      <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)_300px] gap-4 mb-4 items-start">
        <Card title="Commands">
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search mnemonic or name" aria-label="Search commands"
            className="w-full h-9 mb-2 rounded-md bg-[#0A1018] border border-[#2A3B52] px-2.5 text-[13px] outline-none focus:border-[#2DCCFF]" />
          <div className="flex flex-col -mx-2 max-h-[420px] overflow-y-auto">
            {list.map((c) => (
              <button key={c.mnemonic} onClick={() => pick(c)} className={clsx('text-left px-2 py-2 rounded-md flex flex-col gap-0.5', c.mnemonic === cmd.mnemonic ? 'bg-[#2E6FD8]/20' : 'hover:bg-[#172434]')}>
                <span className="flex items-center gap-2"><b className="font-mono-code text-[12.5px]">{c.mnemonic}</b>{c.critical && <span className="text-[10px] font-bold text-[#FF3838] border border-[#D42C2C]/50 rounded px-1">critical</span>}</span>
                <span className="text-[11.5px] text-[#8496AB]">{c.name}</span>
              </button>
            ))}
            {list.length === 0 && <p className="text-[12.5px] text-[#8496AB] px-2 py-3">No command matches "{find}".</p>}
          </div>
        </Card>

        <div className="flex flex-col gap-4 min-w-0">
          <Card title={cmd.mnemonic}>
            <p className="text-[12.5px] text-[#A3B1C2] -mt-1 mb-3">{cmd.name} · PUS {cmd.service} · APID {cmd.apid}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {cmd.params.map((p) => (
                <label key={p.id} className="flex flex-col gap-1 text-[12px] text-[#A3B1C2]">
                  <span>{p.id}{p.unit ? ` (${p.unit})` : ''}</span>
                  {p.type === 'enum' ? (
                    <select value={values[p.id]} onChange={(e) => setValues({ ...values, [p.id]: e.target.value })} className={`${field} border-[#2A3B52]`}>{p.values!.map((o) => <option key={o}>{o}</option>)}</select>
                  ) : (
                    <input type="number" step="any" value={values[p.id]} onChange={(e) => setValues({ ...values, [p.id]: e.target.value })} className={`${field} ${errors[p.id] ? 'border-[#D42C2C]' : 'border-[#2A3B52]'}`} />
                  )}
                  <span className={errors[p.id] ? 'text-[#FF3838]' : 'text-[#5F7087]'}>{errors[p.id] ?? (p.type === 'enum' ? p.values!.join(' | ') : `range ${p.min} … ${p.max}${p.unit ? ' ' + p.unit : ''}`)}</span>
                </label>
              ))}
              {cmd.params.length === 0 && <span className="text-[13px] text-[#8496AB]">This command has no parameters.</span>}
              {cmd.critical && (
                <label className="flex flex-col gap-1 text-[12px] text-[#A3B1C2] sm:col-span-2">
                  <span>Reason for the approver (required)</span>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this needed now?" className={`${field} border-[#2A3B52] font-sans-body`} />
                </label>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-[#213044]">
              <span className="font-mono-code text-[12px] text-[#A3B1C2] truncate">{sat} ▸ {cmd.mnemonic} {args}</span>
              <span className="flex-1" />
              <Button onClick={() => setConfirm(true)} disabled={blocked}>{cmd.critical ? <><ShieldCheck size={15} /> Request approval</> : <><Send size={15} /> Send command</>}</Button>
            </div>
            {blocked && gates.some((g) => g.state === 'fail') && (
              <div className="mt-3"><Banner kind="crit" lead="Blocked.">{gates.filter((g) => g.state === 'fail').map((g) => `${g.name}: ${g.text}`).join(' · ')}</Banner></div>
            )}
          </Card>

          <Card title={`Encoded packet preview · ${bytes.length} bytes · seq ${(seq + 1) & 0x3fff}`}>
            <div className="grid gap-x-1 gap-y-1 font-mono-code text-[13px]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(26px, 1fr))' }}>
              {bytes.map((b, i) => <span key={i} style={{ color: tint(i) }}>{hex(b)}</span>)}
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-[11.5px] text-[#A3B1C2]">
              {[['#2DCCFF', 'CCSDS primary header'], ['#9C9AEC', 'PUS-C secondary header'], ['var(--neutral-50)', 'function ID and parameters'], ['#4DACFF', 'CRC-16']].map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm" style={{ background: c }} />{l}</span>)}
            </div>
          </Card>
        </div>

        <Card title="Safety gates">
          <div className="flex flex-col gap-3">
            {gates.map((g) => {
              const Icon = g.state === 'pass' ? CheckCircle2 : g.state === 'fail' ? XCircle : CircleDashed;
              return (
                <div key={g.name} className="flex gap-2.5 items-start">
                  <Icon size={18} className={clsx('shrink-0 mt-0.5', g.state === 'pass' ? 'text-[#56F000]' : g.state === 'fail' ? 'text-[#FF3838]' : 'text-[#9C9AEC]')} aria-label={g.state} />
                  <span className="flex flex-col"><b className="text-[13px]">{g.name}</b><span className="text-[12px] text-[#A3B1C2]">{g.text}</span></span>
                </div>
              );
            })}
            <label className="flex items-center gap-2 text-[12px] text-[#8496AB] cursor-pointer pt-1">
              <input type="checkbox" checked={simulateStale} onChange={(e) => setSimulateStale(e.target.checked)} className="accent-[#2E6FD8]" />
              Simulate stale interlock telemetry
            </label>
          </div>
        </Card>
      </div>

      <Card title="Recent commands">
        <div className="-m-4 overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-left text-[11px] text-[#8496AB]">{['ID', 'Satellite', 'Command', 'By', 'Approver', 'Status'].map((h) => <th key={h} className="px-4 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {recent.map((c) => (
                <tr key={c.command_id} onClick={() => onNavigate(c.status === 'AWAITING_APPROVAL' ? 'approvals' : `uplink?sat=${c.sat_id}`)} className="cursor-pointer hover:bg-[#172434] border-t border-[#1A2738]">
                  <td className="px-4 py-2 font-mono-code text-[#4DACFF]">{c.command_id}</td><td className="px-4 py-2 font-mono-code">{c.sat_id}</td>
                  <td className="px-4 py-2"><span className="font-mono-code">{c.mnemonic}</span> <span className="font-mono-code text-[#8496AB]">{Object.entries(c.params).map(([k, v]) => `${k}=${v}`).join(' ')}</span></td>
                  <td className="px-4 py-2">{c.requested_by}</td><td className="px-4 py-2 text-[#A3B1C2]">{c.approved_by ?? (c.critical ? '—' : 'n/a')}</td>
                  <td className="px-4 py-2"><StatusBadge status={c.status === 'AWAITING_APPROVAL' ? 'PENDING' : c.status === 'RELEASED' ? 'QUEUED' : c.status} size="sm" /></td>
                </tr>
              ))}
              {recent.length === 0 && <tr><td className="px-4 py-4 text-[#8496AB]">No commands yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {confirm && (
        <Modal title={cmd.critical ? 'Request second approval' : 'Send command'} onClose={() => setConfirm(false)}
          footer={<>
            <Button variant="secondary" autoFocus onClick={() => setConfirm(false)}>Cancel</Button>
            <Button onClick={send} disabled={cmd.critical && typed !== cmd.mnemonic}>{cmd.critical ? 'Request approval' : 'Send command'}</Button>
          </>}>
          <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-[13px]">
            <dt className="text-[#A3B1C2]">Satellite</dt><dd className="font-mono-code">{sat}</dd>
            <dt className="text-[#A3B1C2]">Command</dt><dd className="font-mono-code">{cmd.mnemonic} {args}</dd>
            <dt className="text-[#A3B1C2]">Service</dt><dd className="font-mono-code">PUS {cmd.service} · APID {cmd.apid}</dd>
            <dt className="text-[#A3B1C2]">Interlock</dt><dd>{interlock[1]}</dd>
            {cmd.critical && <><dt className="text-[#A3B1C2]">Reason</dt><dd>{reason}</dd></>}
          </dl>
          {cmd.critical ? (
            <label className="flex flex-col gap-1 text-[12px] text-[#A3B1C2]">Type {cmd.mnemonic} to confirm
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={`${field} border-[#2A3B52]`} />
              <span className="text-[#5F7087]">The request goes to a Flight Director and is not uplinked until approved.</span>
            </label>
          ) : <Banner kind="info" lead="Released to the uplink.">COP-1 delivers it exactly once; status follows the spacecraft's acknowledgement.</Banner>}
        </Modal>
      )}
    </>
  );
};
