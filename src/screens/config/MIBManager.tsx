import React, { useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Check, FlaskConical, CalendarClock, RotateCcw, Upload, Send } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Banner, Card, PageHead, Td, Th } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { PARAMETERS } from '../../data/fleet';
import { can } from '../../auth/policy';
import { useAuthStore } from '../../store/useAuthStore';
import { useMdbStore } from '../../store/useMdbStore';
import { toast } from '../../store/useToastStore';

const PIPE = ['Change', 'Review', 'Compile & sign', 'Simulator verify', 'Release'];
const STATE_LABEL: Record<string, string> = { DRAFT: 'Draft', IN_REVIEW: 'In review', VERIFIED: 'Verified', SCHEDULED: 'Scheduled', ACTIVE: 'Active', ROLLED_BACK: 'Rolled back' };
const STATE_TONE: Record<string, string> = { DRAFT: 'text-[#A3B1C2] border-[#3E5370]', IN_REVIEW: 'text-[#9C9AEC] border-[#9C9AEC]/50', VERIFIED: 'text-[#2DCCFF] border-[#2DCCFF]/50', SCHEDULED: 'text-[#FCE83A] border-[#FCE83A]/50', ACTIVE: 'text-[#56F000] border-[#56F000]/50', ROLLED_BACK: 'text-[#8496AB] border-[#3E5370]' };
const Pill: React.FC<{ s: string }> = ({ s }) => <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[10.5px] font-bold ${STATE_TONE[s]}`}>{STATE_LABEL[s]}</span>;
const utc = (iso: string) => iso.slice(0, 16).replace('T', ' ') + ' UTC';

/** S19 · Mission database: release pipeline with two reviewers, simulator verification, scheduling and rollback. */
export const MIBManager: React.FC<{ satId: string; onNavigate: (path: string) => void }> = () => {
  const { releases, verifying, approve, verify, schedule, activate, rollback, draftFromUpload } = useMdbStore();
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const mayEdit = can('mdb:edit', role);

  const [sel, setSel] = useState(releases[0].version);
  const [rolling, setRolling] = useState(false);
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [tab, setTab] = useState<'release' | 'contents'>('release');
  const file = useRef<HTMLInputElement>(null);

  const rel = releases.find((r) => r.version === sel) ?? releases[0];
  const approvals = rel.reviewers.filter((r) => r.approved).length;
  const pct = verifying[rel.version];
  const isVerifying = pct !== undefined;
  const step = rel.state === 'DRAFT' ? 0 : rel.state === 'IN_REVIEW' ? (approvals >= 2 ? 3 : 1) : rel.state === 'VERIFIED' ? 4 : 5;
  const family = releases.filter((r) => r.version.split('-')[0] === rel.version.split('-')[0] && r.version !== rel.version && r.state !== 'DRAFT' && r.state !== 'IN_REVIEW');

  const doApprove = () => { const r = approve(rel.version, user.name); r.ok ? toast.success(`Review approved: ${rel.version}`) : toast.warning(r.reason ?? 'Not allowed'); };
  const approveBlock = rel.state !== 'IN_REVIEW' ? 'Only a release in review can be approved.' : rel.author === user.name ? 'The author cannot review their own release.' : rel.reviewers.some((r) => r.name === user.name && r.approved) ? 'You already approved this release.' : approvals >= 2 ? 'Two approvals are in.' : '';

  return (
    <>
      <PageHead title="Mission database" sub="Telemetry and command dictionaries: two reviewers, simulator verification, effective time per satellite, rollback"
        actions={<>
          <input ref={file} type="file" accept=".xml,.xtce,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { draftFromUpload(f.name, user.name); toast.info('Draft created from upload', { body: f.name }); } e.target.value = ''; }} />
          <Button variant="secondary" onClick={() => file.current?.click()} disabled={!mayEdit.allowed} title={mayEdit.reason}><Upload size={15} /> New draft from file</Button>
        </>} />

      <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
        <Card title="Releases">
          <div className="-m-2 flex flex-col">
            {releases.map((r) => (
              <button key={r.version} onClick={() => setSel(r.version)} className={clsx('text-left px-3 py-2.5 rounded-lg flex items-center gap-2', r.version === sel ? 'bg-[#2E6FD8]/20' : 'hover:bg-[#172434]')}>
                <span className="flex-1 min-w-0"><b className="block font-mono-code text-[12.5px]">{r.version}</b><span className="block text-[11.5px] text-[#8496AB]">{r.author} · {utc(r.created_utc).slice(0, 10)}</span></span>
                <Pill s={r.state} />
              </button>
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-4 min-w-0">
          <div className="flex gap-1 border-b border-[#2A3B52]" role="tablist">
            {([['release', 'Release'], ['contents', 'Dictionary contents']] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx('px-4 py-2.5 text-[13px] font-semibold border-b-2 -mb-px', tab === k ? 'border-[#4DACFF] text-[#E6EDF3]' : 'border-transparent text-[#A3B1C2]')}>{l}</button>
            ))}
          </div>

          {tab === 'release' && (
            <>
              <Card title={rel.version}>
                <div className="flex flex-wrap items-center gap-2 -mt-1 mb-3"><Pill s={rel.state} /><span className="font-mono-code text-[11.5px] text-[#8496AB]">bundle {rel.bundle_sha256.slice(0, 12)}…</span></div>
                <ol className="grid grid-cols-5 gap-2">
                  {PIPE.map((p, k) => (
                    <li key={p} className="flex flex-col gap-1.5">
                      <span className={clsx('h-1 rounded-full', k < step ? 'bg-[#4DACFF]' : k === step ? 'bg-[#2DCCFF]' : 'bg-[#2A3B52]')} />
                      <span className={clsx('text-[11.5px]', k === step ? 'font-bold text-[#E6EDF3]' : 'text-[#A3B1C2]')}>{p}{k === 3 && isVerifying ? ` · ${pct}%` : ''}</span>
                    </li>
                  ))}
                </ol>
                {rel.state === 'ROLLED_BACK' && <div className="mt-3"><Banner kind="warn" lead="Withdrawn.">{rel.rollbackReason ?? 'Rolled back'}{rel.rolledBackTo ? ` · satellites returned to ${rel.rolledBackTo} at their next AOS` : ''}</Banner></div>}
                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-[#213044]">
                  <Button variant="secondary" onClick={doApprove} disabled={Boolean(approveBlock)} title={approveBlock}><Check size={15} /> Approve as reviewer</Button>
                  <Button variant="secondary" onClick={() => verify(rel.version)} disabled={rel.state !== 'IN_REVIEW' || approvals < 2 || isVerifying}><FlaskConical size={15} /> {isVerifying ? `Verifying ${pct}%` : 'Run simulator verification'}</Button>
                  {rel.state === 'SCHEDULED'
                    ? <Button onClick={() => { activate(rel.version); toast.success(`${rel.version} is active`); }}><Send size={15} /> Mark active at AOS</Button>
                    : <Button onClick={() => { schedule(rel.version); toast.info(`Release scheduled: ${rel.version}`, { body: 'Effective per satellite at its next AOS.' }); }} disabled={rel.state !== 'VERIFIED'}><CalendarClock size={15} /> Schedule release</Button>}
                  <Button variant="ghost" onClick={() => { setTarget(family[0]?.version ?? ''); setReason(''); setRolling(true); }} disabled={!['ACTIVE', 'SCHEDULED'].includes(rel.state) || family.length === 0}><RotateCcw size={15} /> Rollback</Button>
                </div>
                {rel.state === 'DRAFT' && <p className="text-[12px] text-[#8496AB] mt-2">A draft goes to review when its author submits it. Reviewers appear below once it does.</p>}
              </Card>

              <Card title="Semantic diff">
                <div className="-m-4 overflow-x-auto">
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead><tr><Th>Change</Th><Th>Item</Th><Th>Old</Th><Th>New</Th></tr></thead>
                    <tbody>
                      {rel.diff.map((d, i) => (
                        <tr key={i}>
                          <Td><span className={clsx('text-[11px] font-bold', d.change === 'ADDED' ? 'text-[#56F000]' : d.change === 'REMOVED' ? 'text-[#FF3838]' : 'text-[#FCE83A]')}>{d.change}</span></Td>
                          <Td className="font-mono-code">{d.item}</Td>
                          <Td className="font-mono-code text-[#FF3838]">{d.from ?? '—'}</Td><Td className="font-mono-code text-[#56F000]">{d.to ?? '—'}</Td>
                        </tr>
                      ))}
                      {rel.diff.length === 0 && <tr><Td className="text-[#8496AB]">No changes recorded.</Td></tr>}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="grid md:grid-cols-2 gap-4">
                <Card title={`Reviewers · ${approvals} of 2 required`}>
                  <div className="flex flex-col gap-2">
                    {rel.reviewers.map((r) => (
                      <div key={r.name} className="flex items-center gap-3 rounded-lg border border-[#213044] px-3 py-2">
                        <span className="w-8 h-8 rounded-full bg-[#1F2D40] text-[#4DACFF] text-[11px] font-bold flex items-center justify-center">{r.name.split(' ').map((w) => w[0]).join('')}</span>
                        <b className="flex-1 text-[13px] font-semibold">{r.name}</b>
                        <span className={clsx('text-[11px] font-bold', r.approved ? 'text-[#56F000]' : 'text-[#FCE83A]')}>{r.approved ? 'Approved' : 'Pending'}</span>
                      </div>
                    ))}
                    <p className="text-[11.5px] text-[#8496AB]">Two reviewers are required; the author ({rel.author}) cannot be one.</p>
                  </div>
                </Card>
                <Card title="Effective time per satellite">
                  <div className="-m-4 max-h-[260px] overflow-y-auto">
                    <table className="w-full text-[12.5px]"><thead><tr><Th>Satellite</Th><Th>Effective</Th></tr></thead>
                      <tbody>
                        {rel.effective.map((e) => <tr key={e.sat_id}><Td className="font-mono-code">{e.sat_id}</Td><Td className="font-mono-code tabular-nums">{utc(e.effective_utc)}</Td></tr>)}
                        {rel.effective.length === 0 && <tr><Td className="text-[#8496AB]">{rel.state === 'ROLLED_BACK' ? '—' : 'Not scheduled yet.'}</Td></tr>}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
              <Banner kind="info">Every telemetry sample and command records the bundle version that decoded it, so history stays interpretable after a release or a rollback.</Banner>
            </>
          )}

          {tab === 'contents' && (
            <Card title="Dictionary contents · limits and calibration">
              <div className="-m-4 overflow-x-auto max-h-[560px] overflow-y-auto">
                <table className="w-full text-[12.5px] border-collapse">
                  <thead className="sticky top-0 bg-[#111A25]"><tr><Th>Parameter</Th><Th>Subsystem</Th><Th>Unit</Th><Th>Calibration</Th><Th>Warning</Th><Th>Critical</Th></tr></thead>
                  <tbody>
                    {Object.entries(PARAMETERS).flatMap(([sub, defs]) => defs.map((d) => (
                      <tr key={d.param_id}>
                        <Td><b className="font-mono-code text-[#4DACFF]">{d.param_id}</b><span className="block text-[11px] text-[#8496AB]">{d.name}</span></Td>
                        <Td>{sub[0] + sub.slice(1).toLowerCase()}</Td><Td>{d.unit || '—'}</Td>
                        <Td className="font-mono-code text-[11.5px]">EU = DN × 0.0625</Td>
                        <Td className="font-mono-code text-[11.5px]">{d.warnLo} … {d.warnHi}</Td><Td className="font-mono-code text-[11.5px]">{d.critLo} … {d.critHi}</Td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>

      {rolling && (
        <Modal title={`Roll back ${rel.version}`} onClose={() => setRolling(false)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setRolling(false)}>Cancel</Button>
            <Button variant="danger" disabled={reason.trim().length < 8 || !target} onClick={() => { rollback(rel.version, target, reason.trim()); setRolling(false); toast.warning(`Rolled back ${rel.version}`, { body: `Satellites return to ${target} at their next AOS.` }); }}>Roll back</Button></>}>
          <label className="flex flex-col gap-1 text-[12px] text-[#A3B1C2]">Target bundle
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="h-9 rounded-md bg-[#0A1018] border border-[#2A3B52] px-2.5 text-[13px] font-mono-code">{family.map((r) => <option key={r.version}>{r.version}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-[#A3B1C2]">Reason
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why this bundle is being withdrawn" className="rounded-md bg-[#0A1018] border border-[#2A3B52] px-2.5 py-2 text-[13px] outline-none focus:border-[#2DCCFF]" />
            <span className={reason && reason.trim().length < 8 ? 'text-[#FF3838]' : 'text-[#5F7087]'}>At least 8 characters</span>
          </label>
          <Banner kind="warn" lead="Effect.">The previous signed bundle is re-uplinked to each satellite at its next AOS. Recorded telemetry keeps its original bundle version.</Banner>
        </Modal>
      )}
    </>
  );
};
