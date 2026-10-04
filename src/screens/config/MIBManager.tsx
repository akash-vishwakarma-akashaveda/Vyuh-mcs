import React, { useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Check, Download, FileUp, Lock, LockOpen, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Pill, Tone } from '../../components/atoms/Badge';
import { Banner, Card, PageHead, SampleTag, Segmented, Td, Th, Tile } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { parseHash } from '../../router/routes';
import { can as policyCan } from '../../auth/policy';
import { useAuthStore } from '../../store/useAuthStore';
import { useFleetStore } from '../../store/useFleetStore';
import { Actor, Release, ReleaseState, REVIEWER_ROLES, STATE_LABEL, rollbackTargets, rules, satsOf, useMdbStore } from '../../store/useMdbStore';
import { toast } from '../../store/useToastStore';
import {
  DictParam, Limits, PHASES, PHASE_LABEL, Phase, XtceImport, diffDict, fmtCalib, fmtLimits, fromXtce, limitsFor, num, toXtce, tryDerived, utc,
} from './mdbLib';
import { Select } from '../../components/molecules/Select';

const STATE_TONE: Record<ReleaseState, Tone> = { DRAFT: 'neutral', IN_REVIEW: 'action', VERIFIED: 'info', SCHEDULED: 'violet', ACTIVE: 'ok', SUPERSEDED: 'neutral', ROLLED_BACK: 'crit' };
const CHANGE_TONE = { ADDED: 'ok', CHANGED: 'warn', REMOVED: 'crit' } as const;
const CHANGE_LABEL = { ADDED: 'Added', CHANGED: 'Changed', REMOVED: 'Removed' } as const;
type Tab = 'changes' | 'dictionary' | 'derived' | 'satellites';

const field = 'h-9 rounded-[10px] bg-[#161A22] border border-[#1A1E27] px-3 text-[13px] text-[#E9ECF1] outline-none focus:border-[#6CB8FF] min-w-0';

/** S19 · Mission database: release pipeline, XTCE exchange, limit sets per phase, derived parameters, baseline freeze. */
export const MIBManager: React.FC<{ satId: string; onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const s = useMdbStore();
  const user = useAuthStore((x) => x.user);
  const role = useAuthStore((x) => x.activeRole);
  const actor: Actor = { id: user.id, name: user.name, role };
  const cvt = useFleetStore((x) => x.cvt);
  const fleetSats = useFleetStore((x) => x.satellites);

  const params = parseHash().params;
  const rel = s.releases.find((r) => r.version === params.v) ?? s.releases.find((r) => r.state === 'DRAFT' || r.state === 'IN_REVIEW') ?? s.releases[0];
  const tab = (['changes', 'dictionary', 'derived', 'satellites'].includes(params.tab) ? params.tab : 'changes') as Tab;
  const go = (p: { v?: string; tab?: Tab }) => onNavigate(`mdb?${new URLSearchParams({ v: p.v ?? rel.version, tab: p.tab ?? tab }).toString()}`);

  const diff = useMemo(() => s.diffOf(rel.version), [s, rel]);
  const approvals = rel.reviewers.filter((r) => r.approved).length;
  const pct = s.checking[rel.version];
  const targets = rollbackTargets(s.releases, rel);
  const say = (r: { ok: boolean; reason?: string }, ok: string, body?: string) => (r.ok ? toast.success(ok, body ? { body } : {}) : toast.warning('Not done', { body: r.reason }));

  const [modal, setModal] = useState<null | 'import' | 'rollback' | 'freeze' | 'draft' | 'discard'>(null);
  const [editing, setEditing] = useState<{ p: DictParam; phase: Phase } | null>(null);

  const editR = rules.edit(rel, actor);
  const submitR = rules.submit(rel, actor, diff.length);
  const approveR = rules.approve(rel, actor);
  const checkR = rules.check(rel, actor);
  const schedR = rules.schedule(rel, actor, s.freeze);
  const actR = rules.activate(rel, actor, s.freeze);
  const rollR = rules.rollback(rel, actor, targets);

  const exportXtce = () => {
    const blob = new Blob([toXtce(rel.version, rel.dict)], { type: 'application/xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${rel.version.replace(' ', '-')}.xtce.xml`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHead crumb="Engineer / Mission database" title={rel.version}
        sub={<span className="flex flex-wrap items-center gap-2"><Pill tone={STATE_TONE[rel.state]}>{STATE_LABEL[rel.state]}</Pill>
          Telemetry dictionary for {satsOf(rel.line).length} {rel.line.split('-')[0].toUpperCase()} satellites · {rel.source.toLowerCase()} · by {rel.author}, {utc(rel.created_utc)}</span>}
        actions={<>
          <Select aria-label="Release" value={rel.version} onChange={(e) => go({ v: e.target.value })} className={clsx(field, 'h-10 font-mono-code')}>
            {s.releases.map((r) => <option key={r.version} value={r.version}>{r.version} · {STATE_LABEL[r.state]}</option>)}
          </Select>
          <Button variant="secondary" onClick={() => setModal('import')} disabled={!can(actor, 'mdb:edit')} title={why(actor, 'mdb:edit')}><FileUp size={15} /> Import XTCE</Button>
          <Button variant="secondary" onClick={exportXtce}><Download size={15} /> Export XTCE</Button>
          <Button variant="secondary" onClick={() => setModal('freeze')}>{s.freeze.on ? <><LockOpen size={15} /> Lift freeze</> : <><Lock size={15} /> Freeze baseline</>}</Button>
        </>} />

      {!can(actor, 'mdb:edit') && <Banner kind="info" lead="Read only.">{role} can review and read the dictionary. Editing and releasing need a Mission Database Engineer.</Banner>}
      {s.freeze.on && <Banner kind="warn" lead="Baseline frozen.">{s.freeze.by} froze {s.freeze.baseline?.join(', ')} at {utc(s.freeze.at)}: {s.freeze.reason}. Scheduling and activation are blocked until the freeze is lifted; rollback stays available.</Banner>}

      <Pipeline rel={rel} approvals={approvals} pct={pct} />

      <div className="flex flex-wrap gap-4 mt-4">
        <div className="flex-[999_1_560px] min-w-0 flex flex-col gap-4">
          <Segmented<Tab> value={tab} onChange={(t) => go({ tab: t })} options={[
            { value: 'changes', label: `Changes · ${diff.length}` }, { value: 'dictionary', label: `Dictionary · ${rel.dict.params.length}` },
            { value: 'derived', label: `Derived · ${rel.dict.derived.length}` }, { value: 'satellites', label: 'Satellites' },
          ]} className="self-start max-w-full overflow-x-auto" />

          {tab === 'changes' && (
            <Card flush title={<>What changes against <span className="font-mono-code">{rel.base ?? 'nothing'}</span></>}
              actions={rel.base ? <Pill tone={s.releases.find((r) => r.version === rel.base)?.state === 'ACTIVE' ? 'ok' : 'neutral'}>{rel.base} {STATE_LABEL[s.releases.find((r) => r.version === rel.base)?.state ?? 'SUPERSEDED'].toLowerCase()}</Pill> : undefined}>
              <div className="overflow-x-auto px-2 pb-2">
                <table className="w-full min-w-[640px] border-separate border-spacing-y-1 text-[13px]">
                  <thead><tr><Th>Change</Th><Th>Item</Th><Th>Before</Th><Th>After</Th><Th>Why</Th></tr></thead>
                  <tbody>
                    {diff.map((d, i) => (
                      <tr key={i} className="bg-[#141821]">
                        <td className="px-3 py-2.5 rounded-l-[10px]"><Pill tone={CHANGE_TONE[d.change]}>{CHANGE_LABEL[d.change]}</Pill></td>
                        <td className="px-3 py-2.5 font-mono-code font-medium">{d.item}</td>
                        <td className="px-3 py-2.5 font-mono-code text-[12.5px] text-[#7C8594]">{d.from ?? '—'}</td>
                        <td className="px-3 py-2.5 font-mono-code text-[12.5px]">{d.to ?? '—'}</td>
                        <td className="px-3 py-2.5 rounded-r-[10px] text-[12.5px] text-[#9AA3B2]">{rel.why[d.item] ?? rel.why[d.item.split(' ')[0]] ?? '—'}</td>
                      </tr>
                    ))}
                    {diff.length === 0 && <tr><Td colSpan={5} className="text-[#7C8594]">{rel.base ? 'No differences.' : 'First release of this line: everything is new.'}{rel.state === 'DRAFT' ? ' Edit limits on the Dictionary tab or add a derived parameter.' : ''}</Td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === 'dictionary' && <DictionaryTab rel={rel} cvtSat={firstSat(rel)} editable={editR.ok} reason={editR.ok ? undefined : editR.reason} onEdit={(p, phase) => setEditing({ p, phase })} actor={actor} />}
          {tab === 'derived' && <DerivedTab rel={rel} editable={editR.ok} reason={editR.ok ? undefined : editR.reason} actor={actor} cvt={cvt} />}
          {tab === 'satellites' && (
            <Card flush title={`Effective time per satellite · ${rel.effective.length}`} actions={<span className="text-[#7C8594]">each loads the bundle at its next contact</span>}>
              <div className="max-h-[420px] overflow-y-auto px-2 pb-2">
                <table className="w-full text-[13px]"><thead><tr><Th>Satellite</Th><Th>Effective</Th><Th>Running now</Th></tr></thead>
                  <tbody>
                    {rel.effective.map((e) => <tr key={e.sat_id}><Td className="font-mono-code">{e.sat_id}</Td><Td className="font-mono-code">{utc(e.effective_utc)}</Td><Td className="font-mono-code text-[#9AA3B2]">{fleetSats[e.sat_id]?.mib_version ?? '—'}</Td></tr>)}
                    {rel.effective.length === 0 && <tr><Td colSpan={3} className="text-[#7C8594]">{rel.state === 'ROLLED_BACK' ? 'Withdrawn: no satellite runs this bundle.' : 'Not scheduled yet. Times appear when the release is scheduled.'}</Td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <p className="text-[12.5px] text-[#7C8594]">Every telemetry sample and command records the bundle that decoded it, so history stays readable after a release or a rollback. Bundle <span className="font-mono-code">{rel.bundle_sha256.slice(0, 16)}…</span></p>
        </div>

        <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-4">
          <Card title="Reviewers" actions={<span className="text-[#7C8594]">{approvals} of 2 approved</span>}>
            <div className="flex flex-col gap-2">
              {rel.reviewers.map((r) => (
                <div key={r.name} data-reviewer={r.name} data-role={r.role} className="contents"><Tile className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 items-center">
                  {/* Avatar + name and role on one line; the status sits below, so nothing gets squeezed. */}
                  <span className="row-span-2 self-start w-8 h-8 rounded-full bg-[#1E2430] text-[12px] font-semibold flex items-center justify-center">{r.name.split(' ').map((w) => w[0]).join('')}</span>
                  <span className="min-w-0 truncate text-[13px] whitespace-nowrap">{r.name} <span className="text-[12px] text-[#7C8594]">· {r.role}</span></span>
                  <span className="justify-self-start"><Pill tone={r.approved ? 'ok' : 'neutral'}>{r.approved ? `Approved ${utc(r.at)}` : 'Asked'}</Pill></span>
                </Tile></div>
              ))}
              {rel.reviewers.length === 0 && <p className="text-[13px] text-[#7C8594]">{rel.state === 'DRAFT' ? 'Reviewers sign off once the draft is submitted.' : 'No reviews recorded.'}</p>}
              <p className="text-[12px] text-[#7C8594]">Two people holding {REVIEWER_ROLES.join(' or ')}, neither of them the author ({rel.author}).</p>
              {rel.state === 'IN_REVIEW' && <Button variant="secondary" onClick={() => say(s.approve(rel.version, actor), `You approved ${rel.version}`)} disabled={!approveR.ok} reason={approveR.ok ? undefined : approveR.reason}><Check size={15} /> Approve as reviewer</Button>}
            </div>
          </Card>

          <Card title="Next step">
            <div className="flex flex-col gap-3 text-[13px]">
              {rel.state === 'DRAFT' && <>
                <p className="text-[#C9CED6]">Edit the draft, then submit it. Two reviewers sign off before the simulator check.</p>
                <Button onClick={() => say(s.submit(rel.version, actor), `${rel.version} submitted for review`)} disabled={!submitR.ok} reason={submitR.ok ? undefined : submitR.reason}>Submit for review</Button>
                <Button variant="danger" onClick={() => setModal('discard')} disabled={!editR.ok}><Trash2 size={15} /> Discard draft</Button>
              </>}
              {rel.state === 'IN_REVIEW' && <>
                <p className="text-[#C9CED6]">The simulator check validates every limit, packet layout and derived expression, then loads the dictionary against the current values of each simulated satellite.</p>
                <Button onClick={() => say(s.runCheck(rel.version, actor), 'Simulator check started')} disabled={!checkR.ok || pct !== undefined} reason={checkR.ok ? undefined : checkR.reason} isLoading={pct !== undefined}>{pct !== undefined ? `Checking ${pct}%` : 'Run simulator check'}</Button>
              </>}
              {rel.state === 'VERIFIED' && <>
                <p className="text-[#C9CED6]">Schedule it: each satellite loads the bundle at its next contact.</p>
                <Button onClick={() => say(s.schedule(rel.version, actor), `${rel.version} scheduled`, 'Effective per satellite at its next contact.')} disabled={!schedR.ok} reason={schedR.ok ? undefined : schedR.reason}>Schedule per satellite</Button>
              </>}
              {rel.state === 'SCHEDULED' && <>
                <p className="text-[#C9CED6]">First satellite loads it at {utc([...rel.effective].sort((a, b) => a.effective_utc.localeCompare(b.effective_utc))[0]?.effective_utc)}.</p>
                <Button onClick={() => say(s.activate(rel.version, actor), `${rel.version} is active`)} disabled={!actR.ok} reason={actR.ok ? undefined : actR.reason}>Mark active</Button>
                <Button variant="secondary" onClick={() => say(s.cancelSchedule(rel.version, actor), 'Schedule cancelled')} disabled={!can(actor, 'mdb:release')} reason={why(actor, 'mdb:release')}>Cancel schedule</Button>
              </>}
              {rel.state === 'ACTIVE' && <p className="text-[#C9CED6]">Active on every {rel.line.split('-')[0].toUpperCase()} satellite. Start a new draft to change it.</p>}
              {(rel.state === 'SUPERSEDED' || rel.state === 'ROLLED_BACK') && <p className="text-[#C9CED6]">{rel.state === 'ROLLED_BACK' ? `Withdrawn: ${rel.rollbackReason}. Satellites returned to ${rel.rolledBackTo}. A withdrawn bundle is never offered for rollback.` : 'Replaced by a newer release. It can be brought back with a rollback from the active release.'}</p>}
              {rel.check && (
                <Tile className="flex flex-col gap-1">
                  <span className="flex items-center gap-2"><Pill tone={rel.check.failures.length ? 'crit' : 'ok'}>{rel.check.failures.length ? 'Check failed' : 'Check passed'}</Pill><span className="text-[12px] text-[#7C8594]">{rel.check.checks} checks · {utc(rel.check.at)} · {rel.check.by}</span></span>
                  {rel.check.failures.slice(0, 4).map((f) => <span key={f} className="text-[12.5px] text-[#FF7A7A]">{f}</span>)}
                  {rel.check.warnings.length > 0 && <span className="text-[12.5px] text-[#F5C451]">{rel.check.warnings.length} satellite values would alarm: {rel.check.warnings.slice(0, 2).join('; ')}{rel.check.warnings.length > 2 ? '…' : ''}</span>}
                </Tile>
              )}
              {(['ACTIVE', 'SUPERSEDED'].includes(rel.state) && can(actor, 'mdb:edit') && !s.releases.some((r) => r.line === rel.line && r.state === 'DRAFT')) && (
                <Button variant="secondary" onClick={() => setModal('draft')}><Plus size={15} /> New draft from {rel.version.split(' ')[1]}</Button>
              )}
            </div>
          </Card>

          <Card title="Rollback">
            <div className="flex flex-col gap-2 text-[13px]">
              <p className="text-[#9AA3B2]">{targets.length ? <>Earlier signed releases: <span className="font-mono-code text-[#C9CED6]">{targets.map((t) => t.version.split(' ')[1]).join(', ')}</span>. Withdrawn bundles are excluded.</> : 'No earlier signed release of this line to return to.'}</p>
              <Button variant="danger" onClick={() => setModal('rollback')} disabled={!rollR.ok} reason={rollR.ok ? undefined : rollR.reason}><RotateCcw size={15} /> Roll back {rel.version.split(' ')[1]}</Button>
            </div>
          </Card>

          <Card title="Limit set in use" actions={<SampleTag>Console only</SampleTag>}>
            <div className="flex flex-col gap-2 text-[13px]">
              <Segmented<Phase> size="sm" value={s.phase[rel.line] ?? 'NOMINAL'} options={PHASES.map((p) => ({ value: p, label: PHASE_LABEL[p] }))}
                onChange={(p) => say(s.setPhase(rel.line, p, actor), `${rel.line} now uses the ${PHASE_LABEL[p]} limit set`)} />
              <p className="text-[12px] text-[#7C8594]">{can(actor, 'mdb:release') ? 'Mission phase for this line. Parameters without a set for the phase use their nominal limits. The backend alarm engine still applies nominal limits until phase switching is wired.' : `Only a Mission Database Engineer can switch the phase. ${role} sees it read only.`}</p>
            </div>
          </Card>
        </div>
      </div>

      {modal === 'import' && <ImportModal actor={actor} onClose={() => setModal(null)} onDone={(v) => { setModal(null); go({ v, tab: 'changes' }); }} />}
      {modal === 'draft' && (
        <Modal title={`New draft from ${rel.version}`} onClose={() => setModal(null)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={() => { const r = s.newDraft(rel.line, actor); if (r.ok && r.version) { setModal(null); go({ v: r.version, tab: 'dictionary' }); toast.success(`${r.version} drafted`); } else toast.warning('Not done', { body: r.ok ? undefined : r.reason }); }}>Create draft</Button></>}>
          <p className="text-[13px] text-[#C9CED6]">Copies the active {rel.line} dictionary into a new draft you can edit. Nothing changes on any satellite until the draft is reviewed, checked and scheduled.</p>
        </Modal>
      )}
      {modal === 'discard' && (
        <Modal title={`Discard ${rel.version}`} onClose={() => setModal(null)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setModal(null)}>Keep draft</Button>
            <Button variant="danger" onClick={() => { const r = s.discard(rel.version, actor); setModal(null); say(r, `${rel.version} discarded`); if (r.ok) go({ v: s.releases.find((x) => x.line === rel.line && x.state === 'ACTIVE')?.version, tab: 'changes' }); }}>Discard draft</Button></>}>
          <p className="text-[13px] text-[#C9CED6]">The draft and its {diff.length} changes are deleted. The audit ledger keeps a record that it existed.</p>
        </Modal>
      )}
      {modal === 'rollback' && <RollbackModal rel={rel} targets={targets} onClose={() => setModal(null)} onConfirm={(to, reason) => { const r = s.rollback(rel.version, to, reason, actor); say(r, `Rolled back ${rel.version}`, `Satellites return to ${to} at their next contact.`); if (r.ok) setModal(null); }} />}
      {modal === 'freeze' && <FreezeModal on={s.freeze.on} actor={actor} onClose={() => setModal(null)} />}
      {editing && <LimitsModal rel={rel} p={editing.p} phase={editing.phase} actor={actor} onClose={() => setEditing(null)} />}
    </>
  );
};

const can = (a: Actor, action: 'mdb:edit' | 'mdb:release') => policyCan(action, a.role).allowed;
const why = (a: Actor, action: 'mdb:edit' | 'mdb:release') => policyCan(action, a.role).reason;
const firstSat = (rel: Release) => satsOf(rel.line).find((s) => useFleetStore.getState().cvt[s.sat_id])?.sat_id ?? satsOf(rel.line)[0]?.sat_id ?? 'AKV-03';

// ---------------------------------------------------------------------------------------------

const STEPS = [['Draft', 'edited, validated'], ['In review', 'two reviewers'], ['Simulator check', 'limits, layout, values'], ['Scheduled', 'per satellite'], ['Active', 'at contact'], ['Rollback', 'one action']] as const;

const Pipeline: React.FC<{ rel: Release; approvals: number; pct?: number }> = ({ rel, approvals, pct }) => {
  const at = { DRAFT: 0, IN_REVIEW: 1, VERIFIED: 3, SCHEDULED: 3, ACTIVE: 4, SUPERSEDED: 4, ROLLED_BACK: 5 }[rel.state];
  const done = (i: number) => i < at || (rel.state === 'ACTIVE' && i === 4) || (rel.state === 'VERIFIED' && i === 2) || (rel.state === 'SCHEDULED' && i === 2) || (rel.state === 'SUPERSEDED' && i <= 4);
  const sub = (i: number) => {
    if (i === 1 && rel.state === 'IN_REVIEW') return `${approvals} of 2 reviewers`;
    if (i === 2 && pct !== undefined) return `running ${pct}%`;
    if (i === 2 && rel.check) return rel.check.failures.length ? `failed · ${rel.check.failures.length} issues` : `passed · ${rel.check.checks} checks`;
    if (i === 5 && rel.state === 'ROLLED_BACK') return `to ${rel.rolledBackTo?.split(' ')[1]}`;
    return STEPS[i][1];
  };
  return (
    <Card title="Release pipeline">
      <div className="overflow-x-auto"><ol className="grid min-w-[640px]" style={{ gridTemplateColumns: 'repeat(6, minmax(100px, 1fr))' }}>
        {STEPS.map(([n], i) => {
          const isDone = done(i), isNow = i === at && !isDone;
          const failed = i === 2 && rel.check && rel.check.failures.length > 0 && rel.state === 'IN_REVIEW';
          const c = failed ? '#FF7A7A' : isDone ? '#4ADE9A' : isNow ? '#F28C28' : '#232936';
          return (
            <li key={n} className="flex flex-col items-center gap-2.5 text-center">
              <span className="w-full flex items-center">
                <span className="flex-1 h-0.5 rounded" style={{ background: i === 0 ? 'transparent' : done(i - 1) ? '#4ADE9A' : '#232936' }} />
                <span className="w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: c, background: isDone ? '#4ADE9A' : isNow || failed ? `${c}24` : '#161A22' }}>
                  {isDone ? <Check size={14} strokeWidth={3} color="#0A2418" /> : isNow ? <span className="w-2 h-2 rounded-full" style={{ background: c }} /> : null}
                </span>
                <span className="flex-1 h-0.5 rounded" style={{ background: i === STEPS.length - 1 ? 'transparent' : isDone ? '#4ADE9A' : '#232936' }} />
              </span>
              <span className="flex flex-col gap-0.5"><span className={clsx('text-[13px] font-medium', isDone || isNow ? 'text-[#E9ECF1]' : 'text-[#9AA3B2]')}>{n}</span><span className="text-[12px] text-[#7C8594]">{sub(i)}</span></span>
            </li>
          );
        })}
      </ol></div>
    </Card>
  );
};

// ---------------------------------------------------------------------------------------------

const DictionaryTab: React.FC<{ rel: Release; cvtSat: string; editable: boolean; reason?: string; actor: Actor; onEdit: (p: DictParam, phase: Phase) => void }> = ({ rel, cvtSat, editable, reason, onEdit }) => {
  const [phase, setPhase] = useState<Phase>('NOMINAL');
  const [q, setQ] = useState('');
  const live = useFleetStore((x) => x.cvt[cvtSat]);
  const rows = rel.dict.params.filter((p) => !q || `${p.name} ${p.description} ${p.packet}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card flush title="Dictionary contents" actions={<>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a parameter" aria-label="Find a parameter" className={clsx(field, 'h-8 w-[160px]')} />
      <Segmented<Phase> size="sm" value={phase} onChange={setPhase} options={PHASES.map((p) => ({ value: p, label: PHASE_LABEL[p] }))} />
    </>}>
      <p className="px-5 pt-1 pb-2 text-[12.5px] text-[#7C8594]">{editable ? 'Select a limit to change it in this draft.' : reason} Live values from <span className="font-mono-code">{cvtSat}</span>.</p>
      <div className="overflow-x-auto max-h-[560px] overflow-y-auto px-2 pb-2">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead><tr><Th>Parameter</Th><Th>Packet</Th><Th>Encoding</Th><Th>Calibration</Th><Th>{PHASE_LABEL[phase]} limits</Th><Th className="text-right">Live</Th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const own = p.limits[phase];
              const v = live?.[p.name]?.eu_value;
              const lim = limitsFor(p, phase);
              const out = v !== undefined && (v < lim.l || v > lim.h);
              return (
                <tr key={p.name}>
                  <Td><b className="font-mono-code font-medium text-[#E9ECF1]">{p.name}</b><span className="block text-[12px] text-[#7C8594]">{p.description}</span></Td>
                  <Td className="font-mono-code text-[12px]">{p.packet}<span className="block text-[#7C8594]">APID {p.apid}</span></Td>
                  <Td className="font-mono-code text-[12px]">{p.type}{p.bits} @{p.offset}</Td>
                  <Td className="font-mono-code text-[12px]">{fmtCalib(p.calib)}{p.unit && <span className="text-[#7C8594]"> {p.unit}</span>}</Td>
                  <Td>
                    <button type="button" disabled={!editable} onClick={() => onEdit(p, phase)} className={clsx('text-left font-mono-code text-[12px] rounded-lg px-2 py-1 -mx-2', editable && 'hover:bg-[#1B2130]', !own && 'text-[#7C8594]')}>
                      {own ? fmtLimits(own) : `inherits nominal · ${fmtLimits(p.limits.NOMINAL)}`}
                    </button>
                  </Td>
                  <Td className={clsx('font-mono-code text-right', out ? 'text-[#F5C451]' : 'text-[#C9CED6]')}>{v === undefined ? '—' : num(Number(v.toPrecision(5)))}</Td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><Td colSpan={6} className="text-[#7C8594]">No parameter matches “{q}”.</Td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

const LimitsModal: React.FC<{ rel: Release; p: DictParam; phase: Phase; actor: Actor; onClose: () => void }> = ({ rel, p, phase, actor, onClose }) => {
  const editLimits = useMdbStore((x) => x.editLimits);
  const start = limitsFor(p, phase);
  const [v, setV] = useState({ ll: String(start.ll), l: String(start.l), h: String(start.h), hh: String(start.hh) });
  const [why, setWhy] = useState('');
  const lim: Limits = { ll: Number(v.ll), l: Number(v.l), h: Number(v.h), hh: Number(v.hh) };
  const bad = Object.values(v).some((x) => x.trim() === '' || !Number.isFinite(Number(x))) ? 'Every limit must be a number.' : !(lim.ll <= lim.l && lim.l <= lim.h && lim.h <= lim.hh) ? 'Order: critical low ≤ warning low ≤ warning high ≤ critical high.' : '';
  const save = (l: Limits | undefined) => { const r = editLimits(rel.version, p.name, phase, l, why, actor); if (r.ok) { toast.success(`${p.name} ${PHASE_LABEL[phase].toLowerCase()} limits updated`); onClose(); } else toast.warning('Not saved', { body: r.reason }); };
  return (
    <Modal title={`${p.name} · ${PHASE_LABEL[phase]} limits`} sub={`${rel.version} draft · unit ${p.unit || 'none'}`} onClose={onClose}
      footer={<>
        <Button variant="secondary" autoFocus onClick={onClose}>Cancel</Button>
        {phase !== 'NOMINAL' && p.limits[phase] && <Button variant="danger" onClick={() => save(undefined)}>Use nominal instead</Button>}
        <Button onClick={() => save(lim)} disabled={Boolean(bad)} reason={bad || undefined}>Save limits</Button>
      </>}>
      <div className="grid grid-cols-2 gap-3">
        {([['ll', 'Critical low'], ['l', 'Warning low'], ['h', 'Warning high'], ['hh', 'Critical high']] as const).map(([k, l]) => (
          <label key={k} className="flex flex-col gap-1.5 text-[12px] text-[#7C8594]">{l}
            <input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} inputMode="decimal" className={clsx(field, 'font-mono-code')} />
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1.5 text-[12px] text-[#7C8594]">Why (shown in the change list)
        <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="For example: earlier warning after the 3 Oct event" className={field} />
      </label>
      <p className="text-[12px] text-[#7C8594]">Nominal now: {fmtLimits(p.limits.NOMINAL)}</p>
    </Modal>
  );
};

// ---------------------------------------------------------------------------------------------

const DerivedTab: React.FC<{ rel: Release; editable: boolean; reason?: string; actor: Actor; cvt: Record<string, Record<string, { eu_value: number }>> }> = ({ rel, editable, reason, actor, cvt }) => {
  const { setDerived, removeDerived } = useMdbStore();
  const sats = satsOf(rel.line).filter((x) => cvt[x.sat_id]).map((x) => x.sat_id);
  const [sat, setSat] = useState(sats[0] ?? satsOf(rel.line)[0]?.sat_id ?? '');
  const [form, setForm] = useState({ name: '', expression: '', unit: '', description: '', why: '' });
  const known = useMemo(() => new Set(rel.dict.params.map((p) => p.name)), [rel]);
  const get = (n: string) => cvt[sat]?.[n]?.eu_value;
  const preview = form.expression ? tryDerived(form.expression, known, get) : null;
  const add = () => {
    const r = setDerived(rel.version, { name: form.name.trim().toUpperCase(), expression: form.expression.trim(), unit: form.unit.trim(), description: form.description.trim() || 'Derived parameter' }, form.why, actor);
    if (r.ok) { toast.success(`${form.name.toUpperCase()} added to ${rel.version}`); setForm({ name: '', expression: '', unit: '', description: '', why: '' }); }
    else toast.warning('Not added', { body: r.reason });
  };
  return (
    <>
      <Card flush title="Derived parameters" actions={<label className="flex items-center gap-2 text-[#7C8594]">Evaluate on
        <Select value={sat} onChange={(e) => setSat(e.target.value)} className={clsx(field, 'h-8 font-mono-code')}>{satsOf(rel.line).map((x) => <option key={x.sat_id}>{x.sat_id}</option>)}</Select></label>}>
        <p className="px-5 pt-1 pb-2 text-[12.5px] text-[#7C8594]">Computed in the console from the current values of the parameters they reference, recalculated as each value arrives.</p>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="w-full min-w-[600px] text-[13px]">
            <thead><tr><Th>Name</Th><Th>Expression</Th><Th className="text-right">Now on {sat}</Th><Th /></tr></thead>
            <tbody>
              {rel.dict.derived.map((d) => {
                const r = tryDerived(d.expression, known, get);
                return (
                  <tr key={d.name}>
                    <Td><b className="font-mono-code font-medium text-[#E9ECF1]">{d.name}</b><span className="block text-[12px] text-[#7C8594]">{d.description}</span></Td>
                    <Td className="font-mono-code text-[12.5px]">{d.expression}</Td>
                    <Td className="font-mono-code text-right">{r.error ? <span className="text-[#FF7A7A] text-[12px]">{r.error}</span> : `${num(Number(r.value!.toPrecision(5)))} ${d.unit}`}</Td>
                    <Td className="text-right">{editable && <Button size="sm" variant="ghost" onClick={() => { const x = removeDerived(rel.version, d.name, actor); if (!x.ok) toast.warning('Not removed', { body: x.reason }); }} aria-label={`Remove ${d.name}`}><Trash2 size={14} /></Button>}</Td>
                  </tr>
                );
              })}
              {rel.dict.derived.length === 0 && <tr><Td colSpan={4} className="text-[#7C8594]">No derived parameters in {rel.version}.</Td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Define a derived parameter">
        {!editable ? <p className="text-[13px] text-[#7C8594]">{reason}</p> : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1.5 text-[12px] text-[#7C8594] flex-[1_1_160px]">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="BAT_POWER" className={clsx(field, 'font-mono-code')} /></label>
              <label className="flex flex-col gap-1.5 text-[12px] text-[#7C8594] flex-[0_1_100px]">Unit<input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="W" className={field} /></label>
              <label className="flex flex-col gap-1.5 text-[12px] text-[#7C8594] flex-[2_1_240px]">Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Power drawn from the battery bus" className={field} /></label>
            </div>
            <label className="flex flex-col gap-1.5 text-[12px] text-[#7C8594]">Expression (parameters, numbers, + − × ÷ ^, abs, sqrt, min, max, hypot, atan2 …)
              <input value={form.expression} onChange={(e) => setForm({ ...form, expression: e.target.value })} placeholder="BAT_VOLTAGE * BUS_CURRENT" className={clsx(field, 'font-mono-code')} />
            </label>
            <Tile className="text-[13px]">
              {!preview ? <span className="text-[#7C8594]">Preview appears as you type, evaluated on {sat}.</span>
                : preview.error ? <span className="text-[#FF7A7A]">{preview.error}</span>
                  : <span>Preview on <span className="font-mono-code">{sat}</span>: <b className="font-mono-code text-[16px]">{num(Number(preview.value!.toPrecision(6)))}</b> {form.unit} <span className="text-[#7C8594]">from {preview.refs.map((r) => `${r} = ${num(Number((get(r) ?? 0).toPrecision(5)))}`).join(', ')}</span></span>}
            </Tile>
            <label className="flex flex-col gap-1.5 text-[12px] text-[#7C8594]">Why<input value={form.why} onChange={(e) => setForm({ ...form, why: e.target.value })} placeholder="Shown in the change list" className={field} /></label>
            <Button className="self-start" onClick={add} disabled={!form.name.trim() || !preview || Boolean(preview.error)} reason={!form.name.trim() ? 'Name it first.' : preview?.error ? 'Fix the expression first.' : undefined}><Plus size={15} /> Add to {rel.version}</Button>
          </div>
        )}
      </Card>
    </>
  );
};

// ---------------------------------------------------------------------------------------------

const ImportModal: React.FC<{ actor: Actor; onClose: () => void; onDone: (version: string) => void }> = ({ actor, onClose, onDone }) => {
  const { releases, newDraft } = useMdbStore();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [line, setLine] = useState('akv-mdb');
  const file = useRef<HTMLInputElement>(null);
  const parsed: { ok?: XtceImport; error?: string } = useMemo(() => {
    if (!text.trim()) return {};
    try { return { ok: fromXtce(text) }; } catch (x) { return { error: (x as Error).message }; }
  }, [text]);
  const active = releases.find((r) => r.line === line && r.state === 'ACTIVE');
  const changes = parsed.ok ? diffDict(active?.dict, parsed.ok.dict) : [];
  const create = () => {
    if (!parsed.ok) return;
    const r = newDraft(line, actor, { dict: parsed.ok.dict, source: `Imported from XTCE${fileName ? ` ${fileName}` : ''}` });
    if (r.ok && r.version) { toast.success(`${r.version} drafted from XTCE`, { body: `${parsed.ok.dict.params.length} parameters, ${changes.length} changes` }); onDone(r.version); }
    else toast.warning('Not imported', { body: r.ok ? undefined : r.reason });
  };
  return (
    <Modal size="lg" title="Import XTCE" sub="CCSDS 660.0-B-2: parameter types, parameters, sequence containers and text algorithms" onClose={onClose}
      footer={<><Button variant="secondary" autoFocus onClick={onClose}>Cancel</Button><Button onClick={create} disabled={!parsed.ok} reason={parsed.error ? 'Fix the file first.' : !parsed.ok ? 'Paste or choose a file.' : undefined}>Create draft</Button></>}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-[12px] text-[#7C8594]">Dictionary line
          <Select value={line} onChange={(e) => setLine(e.target.value)} className={clsx(field, 'font-mono-code')}>{[...new Set(releases.map((r) => r.line))].map((l) => <option key={l}>{l}</option>)}</Select>
        </label>
        <input ref={file} type="file" accept=".xml,.xtce" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setFileName(f.name); setText(await f.text()); } e.target.value = ''; }} />
        <Button variant="secondary" onClick={() => file.current?.click()}><FileUp size={15} /> Choose file</Button>
        <Button variant="ghost" onClick={() => { const a = releases.find((r) => r.line === line && r.state === 'ACTIVE'); if (a) { setFileName(`${a.version} export`); setText(toXtce(a.version, a.dict)); } }}>Load the active dictionary as XTCE</Button>
      </div>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setFileName(''); }} rows={10} spellCheck={false} placeholder="Paste XTCE XML here"
        className="rounded-[10px] bg-[#161A22] border border-[#1A1E27] p-3 font-mono-code text-[12px] text-[#E9ECF1] outline-none focus:border-[#6CB8FF]" />
      {parsed.error && <Banner kind="crit" lead="Cannot import.">{parsed.error}</Banner>}
      {parsed.ok && (
        <Tile className="flex flex-col gap-1.5 text-[13px]">
          <span><b className="font-mono-code">{parsed.ok.name}</b>: {parsed.ok.dict.params.length} parameters in {parsed.ok.containers} containers, {parsed.ok.dict.derived.length} derived · <b>{changes.length}</b> changes against {active?.version ?? 'nothing'} ({changes.filter((c) => c.change === 'ADDED').length} added, {changes.filter((c) => c.change === 'CHANGED').length} changed, {changes.filter((c) => c.change === 'REMOVED').length} removed)</span>
          {parsed.ok.warnings.slice(0, 5).map((w) => <span key={w} className="text-[12.5px] text-[#F5C451]">{w}</span>)}
          {parsed.ok.warnings.length > 5 && <span className="text-[12px] text-[#7C8594]">and {parsed.ok.warnings.length - 5} more warnings</span>}
        </Tile>
      )}
    </Modal>
  );
};

const RollbackModal: React.FC<{ rel: Release; targets: Release[]; onClose: () => void; onConfirm: (to: string, reason: string) => void }> = ({ rel, targets, onClose, onConfirm }) => {
  const [to, setTo] = useState(targets[0]?.version ?? '');
  const [reason, setReason] = useState('');
  const short = reason.trim().length < 8;
  return (
    <Modal title={`Roll back ${rel.version}`} onClose={onClose}
      footer={<><Button variant="secondary" autoFocus onClick={onClose}>Cancel</Button><Button variant="danger" disabled={short || !to} reason={short ? 'Give a reason of at least 8 characters.' : undefined} onClick={() => onConfirm(to, reason)}>Roll back</Button></>}>
      <label className="flex flex-col gap-1.5 text-[12px] text-[#7C8594]">Return to
        <Select value={to} onChange={(e) => setTo(e.target.value)} className={clsx(field, 'font-mono-code')}>{targets.map((r) => <option key={r.version} value={r.version}>{r.version} · signed {utc(r.created_utc)}</option>)}</Select>
      </label>
      <label className="flex flex-col gap-1.5 text-[12px] text-[#7C8594]">Reason
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why this bundle is being withdrawn" className={clsx(field, 'h-auto py-2')} />
      </label>
      <Banner kind="warn" lead="Effect.">{rel.version} is withdrawn for good and never offered again. Each satellite reloads {to || 'the earlier bundle'} at its next contact. Recorded telemetry keeps the bundle version that decoded it.</Banner>
    </Modal>
  );
};

const FreezeModal: React.FC<{ on: boolean; actor: Actor; onClose: () => void }> = ({ on, actor, onClose }) => {
  const { setFreeze, releases } = useMdbStore();
  const [reason, setReason] = useState('');
  const g = can(actor, 'mdb:release');
  const block = !g ? `${actor.role} cannot change the baseline. Requires Mission Database Engineer.` : !on && reason.trim().length < 8 ? 'Give a reason of at least 8 characters.' : '';
  return (
    <Modal title={on ? 'Lift the baseline freeze' : 'Freeze the configuration baseline'} onClose={onClose}
      footer={<><Button variant="secondary" autoFocus onClick={onClose}>Cancel</Button>
        <Button variant={on ? 'primary' : 'warning'} disabled={Boolean(block)} reason={block || undefined} onClick={() => { const r = setFreeze(!on, reason, actor); if (r.ok) { toast.success(on ? 'Freeze lifted' : 'Baseline frozen'); onClose(); } else toast.warning('Not done', { body: r.reason }); }}>{on ? 'Lift freeze' : 'Freeze'}</Button></>}>
      {on ? <p className="text-[13px] text-[#C9CED6]">Scheduling and activating releases become possible again.</p> : <>
        <p className="text-[13px] text-[#C9CED6]">Records the active releases as the baseline (<span className="font-mono-code">{releases.filter((r) => r.state === 'ACTIVE').map((r) => r.version).join(', ')}</span>) and blocks scheduling or activating any other release until lifted. Drafting, review and rollback stay open.</p>
        <label className="flex flex-col gap-1.5 text-[12px] text-[#7C8594]">Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: LEOP of AKV-11, freeze until commissioning review" className={field} />
        </label>
      </>}
    </Modal>
  );
};
