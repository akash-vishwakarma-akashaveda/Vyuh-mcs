import React, { useState } from 'react';
import { clsx } from 'clsx';
import { Copy, KeyRound } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Pill, Tone } from '../../components/atoms/Badge';
import { Banner, Card, Drawer, KpiRow, KpiTile, PageHead, Segmented, Td, Th, Tile } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { useAuthStore } from '../../store/useAuthStore';
import {
  ALL_ROLES, Grant, Person, SCOPE_OPTIONS, approveBlock, approversFor, isCommanding, useUsersStore,
} from '../../store/useUsersStore';
import { initials, utc } from '../../store/govern';
import { Action, can, capabilitiesOf } from '../../auth/policy';
import { parseHash } from '../../router/routes';
import { toast } from '../../store/useToastStore';
import type { UserRole } from '../../types';
import { Select } from '../../components/molecules/Select';

const inputCls = 'h-9 rounded-[10px] bg-[#0D1016] border border-[#232936] px-3 text-[13px] text-[#E9ECF1] outline-none focus:border-[#6CB8FF]';
const STATUS_TONE: Record<string, Tone> = { Active: 'ok', Invited: 'info', Suspended: 'crit' };
const KEY_TONE: Record<string, Tone> = { OPEN: 'info', AWAITING_SECOND: 'action', REDEEMED: 'ok', REVOKED: 'neutral' };
const KEY_LABEL: Record<string, string> = { OPEN: 'Open', AWAITING_SECOND: 'Waiting for a second administrator', REDEEMED: 'Redeemed', REVOKED: 'Revoked' };

const Avatar: React.FC<{ name: string; big?: boolean }> = ({ name, big }) => (
  <span className={clsx('flex-none rounded-full bg-[#232936] text-[#C9CED6] flex items-center justify-center font-semibold', big ? 'w-11 h-11 text-[14px]' : 'w-8 h-8 text-[12px]')}>{initials(name)}</span>
);

type Confirm = { title: string; body: string; label: string; run: () => string | null } | null;

/** S25 · Users and access. Every rule is enforced in useUsersStore; this screen shows it. */
export const UserManagement: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const tab = parseHash().params.tab === 'rules' ? 'rules' : 'people';
  const { people, grants, keys } = useUsersStore();
  const role = useAuthStore((s) => s.activeRole);
  const manage = can('user:manage', role);
  const [inviteOpen, setInviteOpen] = useState(false);
  const pending = grants.filter((g) => g.state === 'PENDING');
  const openKeys = keys.filter((k) => k.state === 'OPEN' || k.state === 'AWAITING_SECOND');

  return (
    <>
      <PageHead
        title="Users and access"
        sub={<>{people.length} people · {openKeys.length} invite keys open{pending.length > 0 && <> · <span className="text-[#F2A65A]">{pending.length} role change{pending.length > 1 ? 's' : ''} waiting for a second administrator</span></>}</>}
        actions={<>
          <Segmented value={tab} onChange={(v) => onNavigate(v === 'rules' ? 'users?tab=rules' : 'users')}
            options={[{ value: 'people', label: 'People' }, { value: 'rules', label: 'Access rules' }]} />
          <Button onClick={() => setInviteOpen(true)} disabled={!manage.allowed} reason={manage.reason}>Issue invite key</Button>
        </>}
      />
      {tab === 'rules' ? <AccessRules /> : <People />}
      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
    </>
  );
};

/* ------------------------------------------------------------------ people */

const People: React.FC = () => {
  const { people, grants, keys, sessions, approveGrant, closeGrant, revokeKey } = useUsersStore();
  const me = useAuthStore((s) => s.user);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const pending = grants.filter((g) => g.state === 'PENDING');
  const openKeys = keys.filter((k) => k.state === 'OPEN' || k.state === 'AWAITING_SECOND');
  const list = people.filter((p) => (p.name + p.email + p.roles.join()).toLowerCase().includes(q.toLowerCase()));
  const nameOf = (id?: string) => people.find((p) => p.id === id)?.name ?? id ?? '—';
  const keyOf = (personId: string) => keys.find((k) => k.personId === personId && (k.state === 'OPEN' || k.state === 'AWAITING_SECOND'));
  const pendingFor = (personId: string) => pending.find((g) => g.personId === personId);
  const say = (err: string | null, ok: string) => (err ? toast.warning('Not done', { body: err }) : toast.success(ok));

  return (
    <>
      <KpiRow>
        <KpiTile value={people.filter((p) => p.status === 'Active').length} label="People" sub="with console access" />
        <KpiTile value={openKeys.length} label="Invite keys open" sub="not yet redeemed" />
        <KpiTile value={pending.length} label="Role changes waiting" sub="need a second administrator" tone={pending.length ? 'action' : 'plain'} />
      </KpiRow>

      <div className="flex flex-wrap gap-4 items-start">
        <Card className="flex-[999_1_560px] min-w-0" title="People" flush
          actions={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" className={clsx(inputCls, 'h-8 w-48')} />}>
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full min-w-[720px] border-collapse">
              <thead><tr><Th>Person</Th><Th>Roles</Th><Th>Satellites</Th><Th className="text-right">Passkeys</Th><Th>Status</Th></tr></thead>
              <tbody>
                {list.length === 0 && <tr><Td colSpan={5} className="text-[#7C8594]">Nobody matches “{q}”.</Td></tr>}
                {list.map((p) => {
                  const g = pendingFor(p.id), k = keyOf(p.id);
                  return (
                    <tr key={p.id} data-person={p.name} data-status={p.status} onClick={() => setOpen(p.id)} className={clsx('cursor-pointer hover:bg-[#161A22]', open === p.id && 'bg-[#1B2130]')}>
                      <Td><span className="flex items-center gap-2.5"><Avatar name={p.name} /><span className="flex flex-col min-w-0"><span className="text-[#E9ECF1]">{p.name}{p.id === me.id && <span className="text-[#7C8594]"> · you</span>}</span><span className="text-[12px] text-[#7C8594]">{p.email}</span></span></span></Td>
                      <Td><span className="flex flex-wrap gap-1">{p.roles.map((r) => <Pill key={r}>{r}</Pill>)}</span></Td>
                      <Td className="font-mono-code text-[12px]">{p.scope.join(', ')}</Td>
                      <Td className={clsx('text-right font-mono-code', p.passkeys === 0 && 'text-[#F5C451]')}>{p.passkeys}</Td>
                      <Td>
                        {g ? <Pill tone="action">Grant pending</Pill>
                          : p.status === 'Invited' && k ? <Pill tone="info">Invited · key expires {utc(k.expiresAt)}</Pill>
                          : <Pill tone={STATUS_TONE[p.status]}>{p.status}</Pill>}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-4">
          <Card title="Pending grants" actions={pending.length > 0 && <Pill tone="action">Waiting for a second administrator</Pill>}>
            {pending.length === 0 && <p className="text-[13px] text-[#7C8594]">Nothing waiting. A commanding role (grant or invite) appears here until another administrator approves it.</p>}
            <div className="flex flex-col gap-5">
              {pending.map((g) => <PendingGrant key={g.id} g={g} people={people} nameOf={nameOf}
                onApprove={() => say(approveGrant(g.id), `${g.role} approved for ${nameOf(g.personId)}`)}
                onClose={(how) => setConfirm({
                  title: how === 'WITHDRAWN' ? 'Withdraw request' : 'Reject request',
                  body: `${g.role} for ${nameOf(g.personId)} will not be granted${g.keyId ? ' and the invite key is revoked' : ''}. This is recorded in the audit ledger.`,
                  label: how === 'WITHDRAWN' ? 'Withdraw request' : 'Reject request', run: () => closeGrant(g.id, how),
                })} />)}
            </div>
          </Card>

          <Card title="Invite keys">
            {keys.length === 0 && <p className="text-[13px] text-[#7C8594]">No keys issued.</p>}
            <div className="flex flex-col gap-2">
              {keys.map((k) => (
                <Tile key={k.id} className="flex flex-col gap-1.5">
                  <span className="flex items-center justify-between gap-2"><span className="font-mono-code text-[12.5px]">{k.masked}</span><Pill tone={KEY_TONE[k.state]}>{KEY_LABEL[k.state]}</Pill></span>
                  <span className="text-[12.5px] text-[#9AA3B2]">{nameOf(k.personId)} · {k.role} · <span className="font-mono-code">{k.scope.join(', ')}</span></span>
                  <span className="text-[12px] text-[#7C8594]">Issued by {nameOf(k.issuedBy)}{k.approvedBy && `, approved by ${nameOf(k.approvedBy)}`} · expires {utc(k.expiresAt)}</span>
                  {(k.state === 'OPEN' || k.state === 'AWAITING_SECOND') && (
                    <Button size="sm" variant="danger" className="self-start" disabled={!can('user:manage', useAuthStore.getState().activeRole).allowed}
                      onClick={() => setConfirm({ title: 'Revoke invite key', body: `${k.masked} stops working at once. ${nameOf(k.personId)} will need a new key.`, label: 'Revoke key', run: () => revokeKey(k.id) })}>Revoke key</Button>
                  )}
                </Tile>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {open && <PersonDrawer person={people.find((p) => p.id === open)!} sessions={sessions.filter((s) => s.personId === open)} onClose={() => setOpen(null)} setConfirm={setConfirm} />}

      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { say(confirm.run(), `${confirm.label}: done`); setConfirm(null); }}>{confirm.label}</Button></>}>
          <p className="text-[13.5px] text-[#C9CED6] leading-[1.55]">{confirm.body}</p>
        </Modal>
      )}
    </>
  );
};

const PendingGrant: React.FC<{ g: Grant; people: Person[]; nameOf: (id?: string) => string; onApprove: () => void; onClose: (how: 'WITHDRAWN' | 'REJECTED') => void }> = ({ g, people, nameOf, onApprove, onClose }) => {
  const meId = useAuthStore((s) => s.user.id);
  useAuthStore((s) => s.activeRole); // re-render on role change
  const block = approveBlock(g);
  const mine = g.requestedBy === meId;
  const approvers = approversFor(g, people);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={nameOf(g.personId)} big />
        <span className="flex flex-col gap-0.5"><span className="text-[17px] font-semibold tracking-[-0.01em]">Grant {nameOf(g.personId)}</span><span className="text-[13px] text-[#9AA3B2]">{g.role}{g.keyId && ' · by invite key'}</span></span>
      </div>
      <span className="text-[13px] text-[#9AA3B2] leading-[1.5]">Requested by {nameOf(g.requestedBy)} {utc(g.requestedAt)}. A commanding role takes effect only after another administrator approves.</span>
      <Tile className="flex flex-col gap-2 text-[13px]">
        <span className="flex justify-between gap-3"><span className="text-[#7C8594]">Satellites</span><span className="font-mono-code">{g.scope.join(', ')}</span></span>
        <span className="flex justify-between gap-3"><span className="text-[#7C8594]">Can approve</span><span className="text-right">{approvers.join(', ') || 'Nobody else holds an administrator role'}</span></span>
      </Tile>
      <Button onClick={onApprove} disabled={!!block} reason={block ?? undefined}>Approve grant</Button>
      {mine
        ? <Button variant="danger" onClick={() => onClose('WITHDRAWN')}>Withdraw request</Button>
        : <Button variant="danger" onClick={() => onClose('REJECTED')} disabled={!can('user:manage', useAuthStore.getState().activeRole).allowed}>Reject request</Button>}
    </div>
  );
};

/* ------------------------------------------------------------------ person */

const PersonDrawer: React.FC<{ person: Person; sessions: ReturnType<typeof useUsersStore.getState>['sessions']; onClose: () => void; setConfirm: (c: Confirm) => void }> = ({ person, sessions, onClose, setConfirm }) => {
  const { requestGrant, setStatus, revokeSession, grants } = useUsersStore();
  const me = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const manage = can('user:manage', role);
  const self = person.id === me.id;
  const [grantRole, setGrantRole] = useState<UserRole>(ALL_ROLES.find((r) => !person.roles.includes(r)) ?? 'Flight Engineer');
  const [scope, setScope] = useState<string[]>(person.scope);
  const [err, setErr] = useState<string | null>(null);
  const blocked = !manage.allowed ? manage.reason : self ? 'You cannot change your own account. Ask another administrator.' : undefined;
  const suspend = person.status === 'Suspended' ? 'Active' : 'Suspended';
  const history = grants.filter((g) => g.personId === person.id);

  const grant = () => {
    if (!scope.length) return setErr('Choose at least one satellite scope.');
    const e = requestGrant(person.id, grantRole, scope);
    setErr(e);
    if (!e) toast.success(isCommanding(grantRole) ? 'Waiting for a second administrator' : 'Role granted', { body: `${grantRole} for ${person.name}` });
  };

  return (
    <Drawer title={person.name} onClose={onClose}
      footer={<Button variant={suspend === 'Suspended' ? 'danger' : 'secondary'} disabled={!!blocked || person.status === 'Invited'} reason={blocked ?? (person.status === 'Invited' ? 'Not signed in yet; revoke the invite key instead.' : undefined)}
        onClick={() => setConfirm({
          title: suspend === 'Suspended' ? `Suspend ${person.name}` : `Reactivate ${person.name}`,
          body: suspend === 'Suspended' ? `${person.name} is signed out everywhere and cannot sign in until reactivated. Every open session is revoked.` : `${person.name} can sign in again with their passkey.`,
          label: suspend === 'Suspended' ? 'Suspend' : 'Reactivate', run: () => setStatus(person.id, suspend),
        })}>{suspend === 'Suspended' ? 'Suspend' : 'Reactivate'}</Button>}>
      <div className="flex items-center gap-3">
        <Avatar name={person.name} big />
        <span className="flex flex-col"><span className="text-[13px] text-[#9AA3B2]">{person.email}</span><span className="flex gap-1.5 mt-1"><Pill tone={STATUS_TONE[person.status]}>{person.status}</Pill><Pill>{person.passkeys} passkey{person.passkeys === 1 ? '' : 's'}</Pill></span></span>
      </div>
      {person.passkeys === 0 && <Banner kind="warn">No passkey enrolled. This person cannot sign in until they redeem their invite key and enrol one.</Banner>}

      <section className="flex flex-col gap-2">
        <h3 className="text-[14px] font-medium">Roles</h3>
        <span className="flex flex-wrap gap-1.5">{person.roles.map((r) => <Pill key={r} tone={isCommanding(r) ? 'action' : 'neutral'}>{r}</Pill>)}</span>
        <span className="text-[12.5px] text-[#7C8594]">Satellites <span className="font-mono-code text-[#C9CED6]">{person.scope.join(', ')}</span></span>
      </section>

      <section className="flex flex-col gap-2.5">
        <h3 className="text-[14px] font-medium">Grant a role</h3>
        <Select value={grantRole} onChange={(e) => setGrantRole(e.target.value as UserRole)} aria-label="Role to grant" className={inputCls} disabled={!!blocked}>
          {ALL_ROLES.filter((r) => !person.roles.includes(r)).map((r) => <option key={r} value={r}>{r}{isCommanding(r) ? ' (commanding)' : ''}</option>)}
        </Select>
        <ScopePicker value={scope} onChange={setScope} disabled={!!blocked} />
        {isCommanding(grantRole) && <p className="text-[12.5px] text-[#F5C451]">Commanding role: takes effect only after a second administrator approves.</p>}
        {err && <p className="text-[12.5px] text-[#FF7A7A]">{err}</p>}
        <Button size="sm" className="self-start" onClick={grant} disabled={!!blocked} reason={blocked}>{isCommanding(grantRole) ? 'Request grant' : 'Grant role'}</Button>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[14px] font-medium">Sessions</h3>
        {sessions.length === 0 && <p className="text-[13px] text-[#7C8594]">No sessions.</p>}
        {sessions.map((s) => (
          <Tile key={s.id} className={clsx('flex items-center gap-3', s.revoked && 'opacity-60')}>
            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="text-[13px]">{s.device}</span>
              <span className="text-[12px] text-[#7C8594]">{s.where} · since {utc(s.since)} · <span className="font-mono-code">{s.acr}</span></span>
              {s.revoked && <span className="text-[12px] text-[#FF7A7A]">Revoked by {s.revoked.by} {utc(s.revoked.at)}</span>}
            </span>
            {!s.revoked && <Button size="sm" variant="danger" disabled={!manage.allowed}
              onClick={() => setConfirm({ title: 'Revoke session', body: `${person.name} is signed out of ${s.device} (${s.where}) at once. The session cannot be restored.`, label: 'Revoke session', run: () => revokeSession(s.id) })}>Revoke</Button>}
          </Tile>
        ))}
      </section>

      {history.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[14px] font-medium">Grant history</h3>
          {history.map((g) => <span key={g.id} className="text-[12.5px] text-[#9AA3B2]"><span className="font-mono-code">{g.id}</span> · {g.role} · {g.state.toLowerCase()}{g.decidedAt && ` ${utc(g.decidedAt)}`}</span>)}
        </section>
      )}
    </Drawer>
  );
};

const ScopePicker: React.FC<{ value: string[]; onChange: (v: string[]) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => (
  <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
    <legend className="text-[12.5px] text-[#9AA3B2] mb-1">Satellites</legend>
    {SCOPE_OPTIONS.map((o) => (
      <label key={o.value} className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={value.includes(o.value)} 
          onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value))} />
        {o.label}
      </label>
    ))}
  </fieldset>
);

/* ------------------------------------------------------------------ invite */

const InviteModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const issueInvite = useUsersStore((s) => s.issueInvite);
  const [f, setF] = useState({ name: '', email: '', role: 'Flight Engineer' as UserRole, scope: ['AKV-*'], expiresH: 48 });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [issued, setIssued] = useState<string | null>(null);

  const submit = () => {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 3) e.name = 'Enter the full name.';
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(f.email.trim())) e.email = 'Enter a valid email address.';
    if (!f.scope.length) e.scope = 'Choose at least one satellite scope.';
    if (f.role === 'Customer User' && f.scope.some((s) => s === '*' || s === 'AKV-*')) e.scope = 'A customer can only be scoped to their own tenant.';
    setErrs(e);
    if (Object.keys(e).length) return;
    const r = issueInvite(f);
    if (r.error) return setErrs({ email: r.error });
    setIssued(r.key!);
  };

  if (issued) {
    return (
      <Modal title="Invite key issued" onClose={onClose}
        footer={<Button autoFocus onClick={onClose}>Done, I have copied it</Button>}>
        <p className="text-[13.5px] text-[#C9CED6]">Give this key to {f.name} through a separate channel. It is shown once; only its last four characters are kept.</p>
        <Tile className="flex items-center justify-between gap-3">
          <span className="font-mono-code text-[18px] tracking-[0.04em]">{issued}</span>
          <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(issued).then(() => toast.success('Key copied'), () => toast.warning('Copy failed', { body: 'Select the key and copy it by hand.' }))}><Copy size={14} /> Copy</Button>
        </Tile>
        {isCommanding(f.role)
          ? <Banner kind="action" lead="Not usable yet.">{f.role} is a commanding role: the key opens once a second administrator approves it under Pending grants.</Banner>
          : <Banner kind="ok">The key works now and expires in {f.expiresH} h.</Banner>}
      </Modal>
    );
  }

  return (
    <Modal title="Issue invite key" onClose={onClose}
      footer={<><Button variant="secondary" autoFocus onClick={onClose}>Cancel</Button><Button onClick={submit}><KeyRound size={15} /> Issue key</Button></>}>
      <label className="flex flex-col gap-1 text-[12.5px] text-[#9AA3B2]">Full name
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} />
        {errs.name && <span className="text-[#FF7A7A]">{errs.name}</span>}
      </label>
      <label className="flex flex-col gap-1 text-[12.5px] text-[#9AA3B2]">Email
        <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@akashaveda.com" className={inputCls} />
        {errs.email && <span className="text-[#FF7A7A]">{errs.email}</span>}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[12.5px] text-[#9AA3B2]">Role
          <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as UserRole })} className={inputCls}>
            {ALL_ROLES.map((r) => <option key={r} value={r}>{r}{isCommanding(r) ? ' (commanding)' : ''}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-[#9AA3B2]">Key expires in
          <Select value={f.expiresH} onChange={(e) => setF({ ...f, expiresH: Number(e.target.value) })} className={inputCls}>
            {[24, 48, 72].map((h) => <option key={h} value={h}>{h} hours</option>)}
          </Select>
        </label>
      </div>
      <ScopePicker value={f.scope} onChange={(scope) => setF({ ...f, scope })} />
      {errs.scope && <span className="text-[12.5px] text-[#FF7A7A]">{errs.scope}</span>}
      {isCommanding(f.role) && <Banner kind="warn">Commanding role: the key stays locked until a second administrator approves it.</Banner>}
    </Modal>
  );
};

/* ------------------------------------------------------------------ rules */

const COLS: [string, UserRole][] = [
  ['OPR', 'Spacecraft Operator'], ['FD', 'Flight Director'], ['FE', 'Flight Engineer'], ['MDB', 'Mission Database Engineer'],
  ['ML', 'ML Engineer'], ['PLN', 'Mission Planner'], ['GSE', 'Ground Station Engineer'], ['SEC', 'Security Officer'],
  ['PADM', 'Platform Administrator'], ['SADM', 'System Administrator'], ['CUST', 'Customer User'],
];

/** Every Action in auth/policy.ts. A note equal to the policy's second-person text marks the "needs a second person" cells. */
const ROWS: [string, Action, string, string][] = [
  ['Telemetry', 'telemetry:read', 'View telemetry and history', 'customers see only their own satellites'],
  ['Telemetry', 'alarm:ack', 'Acknowledge alarms', ''],
  ['Telemetry', 'alarm:shelve', 'Shelve alarms', 'needs a reason and an expiry'],
  ['Commanding', 'command:send', 'Send a routine command', ''],
  ['Commanding', 'command:request', 'Send a critical command', 'a Flight Director who did not raise it approves'],
  ['Commanding', 'command:approve', 'Approve a critical command', 'never your own request'],
  ['Commanding', 'procedure:run', 'Run a procedure', ''],
  ['Commanding', 'procedure:author', 'Write a procedure', 'release reviewed by a second engineer'],
  ['Planning', 'plan:edit', 'Edit and solve the mission plan', 'plan approved by a Flight Director'],
  ['Planning', 'booking:edit', 'Book or release passes', ''],
  ['Planning', 'tasking:submit', 'Submit imaging tasking', ''],
  ['Mission data and models', 'mdb:edit', 'Edit a dictionary', ''],
  ['Mission data and models', 'mdb:release', 'Release a dictionary', 'two reviewers and a simulator check'],
  ['Mission data and models', 'model:promote', 'Promote an anomaly model', ''],
  ['Mission data and models', 'sim:run', 'Run the simulator', ''],
  ['Governance', 'user:manage', 'Invite users, change roles', 'a commanding role needs a second administrator'],
  ['Governance', 'audit:verify', 'Verify and export the audit ledger', ''],
  ['Governance', 'platform:admin', 'Run the platform', ''],
];

const RULES = [
  ['R1', 'One person, one role, one session', 'You hold roles; a session runs in one. Switching signs you in again.'],
  ['R2', 'Two people for anything critical', 'Critical commands, dictionary releases, commanding role grants and every key change need a second person.'],
  ['R3', 'Never approve your own request', 'Binds to the person, not the role: a Flight Director’s own request goes to another Flight Director. Nobody approves a change to their own account.'],
  ['R4', 'Administrators cannot fly', 'System and platform administrators open every screen but hold no spacecraft authority.'],
  ['R5', 'Customers see only their tenant', 'Their satellites, passes and products. No command endpoint is reachable with their credentials.'],
];

const CELL = {
  y: { label: 'Allowed', color: '#4ADE9A', bg: 'rgba(74,222,154,0.12)', d: 'M5 12l4 4 10-10' },
  s: { label: 'Needs a second person', color: '#F5C451', bg: 'rgba(245,196,81,0.14)', d: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19a5 5 0 0 1 10 0M11 19a5 5 0 0 1 10 0' },
  n: { label: 'Refused', color: '#3A4252', bg: 'transparent', d: 'M10 12h4' },
};

const AccessRules: React.FC = () => {
  const caps = Object.fromEntries(COLS.map(([, r]) => [r, capabilitiesOf(r).second]));
  const cell = (a: Action, r: UserRole, note: string) =>
    !can(a, r).allowed ? CELL.n : note && caps[r].some((x) => x.endsWith(`: ${note}`)) ? CELL.s : CELL.y;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-[13.5px] text-[#9AA3B2] max-w-[80ch]">Who may do what. Read live from the console's policy table; the server re-checks every decision, so a hidden button is a courtesy, not the control.</p>
        <span className="flex flex-wrap gap-1.5"><Pill tone="ok">Allowed</Pill><Pill tone="warn">Needs a second person</Pill><Pill>Refused</Pill></span>
      </div>
      <Card title="Permissions by role" flush actions={<span className="text-[#7C8594]">{ROWS.length} actions · {COLS.length} roles · hover a column for the full role name</span>}>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="w-full min-w-[1000px] border-collapse">
            <thead><tr><Th>Action</Th>{COLS.map(([s, r]) => <Th key={s} className="text-center font-mono-code"><abbr title={r} className="no-underline">{s}</abbr></Th>)}</tr></thead>
            <tbody>
              {ROWS.map(([group, a, label, note], i) => (
                <React.Fragment key={a}>
                  {(i === 0 || ROWS[i - 1][0] !== group) && <tr><td colSpan={COLS.length + 1} className="px-3 pt-4 pb-1 text-[12px] text-[#7C8594]">{group}</td></tr>}
                  <tr>
                    <Td><span className="flex flex-col gap-0.5"><span className="text-[#E9ECF1]">{label}</span>{note && <span className="text-[12px] text-[#7C8594]">{note}</span>}</span></Td>
                    {COLS.map(([s, r]) => {
                      const c = cell(a, r, note);
                      return (
                        <Td key={s} className="text-center">
                          <span title={`${r}: ${c.label}`} className="w-[30px] h-6 mx-auto rounded-full flex items-center justify-center" style={{ background: c.bg }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={`${r}: ${c.label}`}><path d={c.d} /></svg>
                          </span>
                        </Td>
                      );
                    })}
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {RULES.map(([id, title, text]) => (
          <Card key={id}>
            <div className="flex flex-col gap-2.5">
              <span className="self-start"><Pill className="font-mono-code">{id}</Pill></span>
              <span className="text-[14px] font-medium leading-[1.35]">{title}</span>
              <span className="text-[13px] text-[#9AA3B2] leading-[1.5]">{text}</span>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
};
