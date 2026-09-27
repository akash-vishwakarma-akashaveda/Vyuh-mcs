import React, { useState } from 'react';
import { clsx } from 'clsx';
import { ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { create } from 'zustand';
import { Button } from '../../components/atoms/Button';
import { Banner, Card, Drawer, KpiTile, PageHead, Td, Th } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { PEOPLE, useAuthStore } from '../../store/useAuthStore';
import { useMissionStore } from '../../store/useMissionStore';
import { can } from '../../auth/policy';
import { toast } from '../../store/useToastStore';
import type { UserRole } from '../../types';

const ROLES: UserRole[] = ['Flight Director', 'Spacecraft Operator', 'Flight Engineer', 'Mission Planner', 'Ground Station Engineer', 'Mission Database Engineer', 'ML Engineer', 'Security Officer', 'Platform Administrator', 'Customer User'];
const COMMANDING: UserRole[] = ['Flight Director', 'Spacecraft Operator', 'Flight Engineer'];
const SCOPES = ['AKV plane A', 'AKV plane B', 'NBH-01/02', 'TRA-01/02', 'Stations', 'Dictionaries'];
type Status = 'Active' | 'Invited' | 'Suspended';
interface Row { id: string; name: string; email: string; roles: UserRole[]; scope: string; passkeys: number; last: string; status: Status; assign: [string, UserRole | '—'][]; pendingBy?: string; pendingAssign?: Row['assign'] }
const SESS = [['Chrome 128 · macOS', 'BLR ops floor', '09:12 UTC', 'passkey acr=2'], ['Firefox 130 · Ubuntu', 'VPN 10.20.4.17', '06:55 UTC', 'passkey acr=1']];

const scopeOf = (scope: string[]) => (scope.includes('*') ? 'All' : scope.some((s) => s.startsWith('AKV')) ? 'All AKV' : scope.some((s) => s.startsWith('NBH')) ? 'NBH-01/02' : 'TRA-01/02');
const assignOf = (roles: UserRole[], scope: string): Row['assign'] => SCOPES.map((s) => [s, scope === 'All' || (scope === 'All AKV' && s.startsWith('AKV')) || scope === s ? roles[0] : '—']);
const seedRows = (): Row[] => PEOPLE.map((p, i) => { const scope = scopeOf(p.satellite_scope); return { id: p.id, name: p.name, email: p.email, roles: p.roles, scope, passkeys: i === 6 ? 1 : 2, last: `${String(6 + (i % 5)).padStart(2, '0')}:${String(10 + i * 4).padStart(2, '0')} UTC`, status: 'Active', assign: assignOf(p.roles, scope) }; });

// Administration changes stay put when you leave the screen.
const useUsers = create<{ users: Row[]; set: (fn: (u: Row[]) => Row[]) => void }>((set) => ({ users: seedRows(), set: (fn) => set((s) => ({ users: fn(s.users) })) }));

const audit = (text: string, result: 'ACK' | 'NACK' = 'ACK') =>
  useMissionStore.getState().appendAudit({ timestamp_utc: new Date().toISOString(), operator_id: 'ACCESS', operator_name: useAuthStore.getState().user.name, sat_id: '—', command_mnemonic: 'ACCESS', procedure_id: '—', procedure_version: '—', sequence_count: 0, result, params_summary: text });
const inputCls = 'h-9 rounded-md bg-[#0A1018] border border-[#2A3B52] px-2.5 text-[13px] text-[#E6EDF3] outline-none focus:border-[#2DCCFF]';

/** S25 · Users and access. Commanding-role changes are pending until a second administrator approves them. */
export const UserManagement: React.FC<{ onNavigate: (path: string) => void }> = () => {
  const { users, set } = useUsers();
  const me = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const mayManage = can('user:manage', role);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Row['assign']>([]);
  const [sessions, setSessions] = useState(SESS);
  const [invite, setInvite] = useState<{ name: string; email: string; role: UserRole; scope: string } | null>(null);
  const [errs, setErrs] = useState<{ name?: string; email?: string }>({});

  const list = users.filter((u) => (u.name + u.email + u.roles.join()).toLowerCase().includes(q.toLowerCase()));
  const sel = users.find((u) => u.id === open);
  const pending = users.filter((u) => u.pendingBy);
  const patch = (id: string, p: Partial<Row>) => set((us) => us.map((u) => (u.id === id ? { ...u, ...p } : u)));

  const openUser = (u: Row) => { setOpen(u.id); setDraft(u.assign.map((a) => [...a] as Row['assign'][number])); setSessions(SESS); };
  const save = () => {
    if (!sel) return;
    const commanding = draft.some((a, k) => a[1] !== sel.assign[k][1] && (COMMANDING.includes(a[1] as UserRole) || COMMANDING.includes(sel.assign[k][1] as UserRole)));
    patch(sel.id, commanding ? { pendingBy: me.name, pendingAssign: draft } : { assign: draft, roles: [...new Set(draft.map((a) => a[1]).filter((r): r is UserRole => r !== '—'))] });
    audit(`Role assignments changed for ${sel.name}${commanding ? ' (commanding role, waiting for a second administrator)' : ''}`);
    commanding ? toast.info('Waiting for a second administrator', { body: `Commanding role change for ${sel.name}` }) : toast.success('Access updated', { body: sel.name });
    setOpen(null);
  };
  // the second administrator applies the staged draft
  const approve = (u: Row) => {
    if (u.pendingBy === me.name) return;
    const a = u.pendingAssign;
    patch(u.id, { pendingBy: undefined, pendingAssign: undefined, ...(a ? { assign: a, roles: [...new Set(a.map((x) => x[1]).filter((r): r is UserRole => r !== '—'))] } : {}) });
    audit(`Commanding role change for ${u.name} approved by ${me.name}`);
    toast.success('Change approved', { body: u.name });
  };
  const sendInvite = () => {
    if (!invite) return;
    const e: typeof errs = {};
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(invite.email)) e.email = 'Enter a valid email address';
    if (invite.name.trim().length < 3) e.name = 'Enter the full name';
    setErrs(e);
    if (Object.keys(e).length) return;
    const commanding = COMMANDING.includes(invite.role);
    set((us) => [...us, { id: `USR-${100 + us.length}`, name: invite.name.trim(), email: invite.email.trim(), roles: [invite.role], scope: invite.scope, passkeys: 0, last: '—', status: 'Invited', assign: SCOPES.map((s) => [s, s === invite.scope ? invite.role : '—']) as Row['assign'], pendingBy: commanding ? me.name : undefined }]);
    audit(`Invited ${invite.email} as ${invite.role} (${invite.scope})`);
    toast.success('Invitation sent', { body: `${invite.email}: passkey enrolment link valid 72 h` });
    setInvite(null);
  };

  return (
    <>
      <PageHead title="Users & access" sub="Who can do what, on which satellites. Every change is written to the audit ledger."
        actions={<>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users" aria-label="Search users" className={clsx(inputCls, 'w-48')} />
          <Button onClick={() => { setErrs({}); setInvite({ name: '', email: '', role: 'Flight Engineer', scope: 'AKV plane A' }); }} disabled={!mayManage.allowed} title={mayManage.reason}><UserPlus size={15} /> Invite user</Button>
        </>} />
      <Banner kind="warn" lead="Two-person rule.">Changes to commanding roles take effect only after a second administrator approves them.</Banner>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiTile value={users.filter((u) => u.status === 'Active').length} label="Active" />
        <KpiTile value={users.filter((u) => u.status === 'Invited').length} label="Invited" tone="pending" />
        <KpiTile value={users.filter((u) => u.passkeys === 0).length} label="Without a passkey" sub="cannot sign in" tone="warn" />
        <KpiTile value={pending.length} label="Pending approval" sub="commanding role changes" tone="pending" />
      </div>

      <div className="flex flex-col gap-4">
        <Card title={`Users · ${list.length} shown`}>
          <div className="-m-4 overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse min-w-[760px]">
              <thead><tr><Th>Name</Th><Th>Roles</Th><Th>Scope</Th><Th>Passkeys</Th><Th>Last sign-in</Th><Th>Status</Th></tr></thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id} onClick={() => openUser(u)} className={clsx('cursor-pointer hover:bg-[#172434]', open === u.id && 'bg-[#2E6FD8]/15')}>
                    <Td><b className="block font-semibold">{u.name}</b><span className="text-[11.5px] text-[#8496AB]">{u.email}</span></Td>
                    <Td>{u.roles.map((r) => <span key={r} className="inline-block mr-1 mb-0.5 rounded-full border border-[#2A3B52] px-2 text-[11px] leading-5">{r}</span>)}</Td>
                    <Td className="font-mono-code text-[#A3B1C2]">{u.scope}</Td>
                    <Td className={clsx('tabular-nums', u.passkeys === 0 && 'text-[#FCE83A] font-bold')}>{u.passkeys}</Td>
                    <Td className="text-[#A3B1C2]">{u.last}</Td>
                    <Td><span className={clsx('text-[11.5px] font-bold', u.status === 'Active' ? 'text-[#56F000]' : u.status === 'Invited' ? 'text-[#9C9AEC]' : 'text-[#FF3838]')}>{u.status}</span>{u.pendingBy && <span className="ml-2 text-[11px] font-bold text-[#FCE83A]">Pending approval</span>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Policy bundle" actions={<ShieldCheck size={15} className="text-[#56F000]" />}>
            <dl className="grid grid-cols-2 gap-y-1.5 text-[13px]"><dt className="text-[#8496AB]">Bundle</dt><dd className="font-mono-code">vyuh-authz 2.14.3</dd><dt className="text-[#8496AB]">Signed</dt><dd className="font-mono-code">cosign · 2026-09-15</dd><dt className="text-[#8496AB]">Rules</dt><dd>212</dd><dt className="text-[#8496AB]">Loaded on</dt><dd>31 of 31 services</dd><dt className="text-[#8496AB]">Decision logs</dt><dd>Audit ledger</dd></dl>
            <Button size="sm" variant="ghost" className="mt-3" onClick={() => toast.success('Bundle verified', { body: 'vyuh-authz 2.14.3: signature valid on all 31 services' })}>Verify signature</Button>
          </Card>
          <Card title="Pending second approval">
            {pending.length === 0 ? <p className="text-[13px] text-[#8496AB]">No pending changes.</p> : (
              <div className="flex flex-col gap-2">
                {pending.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 rounded-lg border border-[#213044] px-3 py-2">
                    <span className="flex-1 text-[13px]"><b>{u.name}</b><span className="block text-[11.5px] text-[#8496AB]">requested by {u.pendingBy}</span></span>
                    <Button size="sm" onClick={() => approve(u)} disabled={u.pendingBy === me.name || !mayManage.allowed} title={u.pendingBy === me.name ? 'You cannot approve your own change.' : mayManage.reason}>Approve</Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[12px] text-[#8496AB] mt-3">You ({me.name}) cannot approve your own change.</p>
          </Card>
        </div>
      </div>

      {sel && (
        <Drawer title={sel.name} onClose={() => setOpen(null)}
          footer={<>
            <Button variant="ghost" disabled={!mayManage.allowed} onClick={() => { const next: Status = sel.status === 'Suspended' ? 'Active' : 'Suspended'; patch(sel.id, { status: next }); audit(`${sel.name} ${next === 'Active' ? 'reactivated' : 'suspended'}`); toast.warning(next === 'Active' ? 'User reactivated' : 'User suspended', { body: sel.name }); }}>{sel.status === 'Suspended' ? 'Reactivate' : 'Suspend'}</Button>
            <Button onClick={save} disabled={!mayManage.allowed} title={mayManage.reason}>Save changes</Button>
          </>}>
          <p className="text-[12.5px] text-[#8496AB] -mt-2">{sel.email} · {sel.status}</p>
          {sel.pendingBy && <Banner kind="info" lead="Pending approval.">A commanding role change waits for a second administrator.</Banner>}
          {sel.passkeys === 0 && <Banner kind="warn">No passkey enrolled. The user cannot sign in until enrolment completes.</Banner>}
          <span className="label-caps">Role per scope</span>
          <div className="flex flex-col gap-2">
            {draft.map((a, k) => (
              <div key={a[0]} className="flex items-center gap-3">
                <label htmlFor={`scope-${k}`} className="w-28 shrink-0 font-mono-code text-[12px]">{a[0]}</label>
                <select id={`scope-${k}`} value={a[1]} onChange={(e) => setDraft((d) => d.map((x, j) => (j === k ? [x[0], e.target.value as UserRole | '—'] : x)))} className={clsx(inputCls, 'flex-1')}><option>—</option>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
                {COMMANDING.includes(a[1] as UserRole) && <span className="text-[10.5px] font-bold text-[#FCE83A]">cmd</span>}
              </div>
            ))}
          </div>
          <span className="label-caps">Active sessions</span>
          {sessions.length === 0 && <p className="text-[13px] text-[#8496AB]">No active sessions.</p>}
          {sessions.map((s) => (
            <div key={s[0]} className="flex items-center gap-3 rounded-lg border border-[#213044] px-3 py-2">
              <span className="flex-1 text-[13px]"><b>{s[0]}</b><span className="block text-[11.5px] text-[#8496AB]">{s[1]} · since {s[2]} · <span className="font-mono-code">{s[3]}</span></span></span>
              <Button size="sm" variant="ghost" disabled={!mayManage.allowed} onClick={() => { setSessions((ss) => ss.filter((x) => x !== s)); audit(`Session revoked for ${sel.name} (${s[0]})`); toast.success('Session revoked', { body: `${sel.name} · ${s[0]}` }); }}><Trash2 size={13} /> Revoke</Button>
            </div>
          ))}
        </Drawer>
      )}

      {invite && (
        <Modal title="Invite user" onClose={() => setInvite(null)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setInvite(null)}>Cancel</Button><Button onClick={sendInvite}>Send invitation</Button></>}>
          <label className="flex flex-col gap-1 text-[12px] text-[#A3B1C2]">Full name<input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} className={inputCls} />{errs.name && <span className="text-[#FF3838]">{errs.name}</span>}</label>
          <label className="flex flex-col gap-1 text-[12px] text-[#A3B1C2]">Email<input value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="name@akashaveda.com" className={inputCls} />{errs.email && <span className="text-[#FF3838]">{errs.email}</span>}</label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-[#A3B1C2]">Role<select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as UserRole })} className={inputCls}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-[12px] text-[#A3B1C2]">Scope<select value={invite.scope} onChange={(e) => setInvite({ ...invite, scope: e.target.value })} className={inputCls}>{SCOPES.map((r) => <option key={r}>{r}</option>)}</select></label>
          </div>
          {COMMANDING.includes(invite.role) && <Banner kind="warn">Commanding role: a second administrator must approve before the role takes effect.</Banner>}
        </Modal>
      )}
    </>
  );
};
