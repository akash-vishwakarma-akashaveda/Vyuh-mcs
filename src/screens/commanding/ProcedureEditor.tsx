import React, { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Check, FlaskConical, Plus, Send, ShieldCheck, TriangleAlert, Undo2, Wand2, XCircle } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Pill } from '../../components/atoms/Badge';
import { Banner, Card, PageHead, SampleTag } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { PROCEDURES, PROCEDURE_STEPS } from '../../data/mission';
import { COMMAND_DICT } from '../../ops/commandDict';
import { can } from '../../auth/policy';
import { PEOPLE, useAuthStore } from '../../store/useAuthStore';
import { useMissionStore } from '../../store/useMissionStore';
import { useProcedureDraftStore, type DraftStage } from '../../store/useProcedureDraftStore';
import { useProcedureRunStore, versionOf } from '../../store/useProcedureRunStore';
import { toast } from '../../store/useToastStore';
import { RouteLink, field, utc } from './gates';
import { Select } from '../../components/molecules/Select';

const LH = 20;
const FLOW = ['Draft', 'Validated', 'Test passed', 'In review', 'Released'];
const BUNDLE = 'akv-mdb 4.19.0';
interface Finding { sev: 'ERROR' | 'WARNING'; line: number; text: string; fix?: boolean }

const bump = (v: string) => { const p = v.split('.').map(Number); return p.length === 3 && p.every((n) => !Number.isNaN(n)) ? `${p[0]}.${p[1]}.${p[2] + 1}` : `${v}.1`; };

/** The procedure as YAML. Critical steps are left without their approval policy on purpose, so validation has something to fix. */
function toYaml(procId: string): string {
  const proc = PROCEDURES.find((p) => p.id === procId)!;
  const L = [`id: ${proc.id}`, `name: ${proc.name}`, `version: ${bump(versionOf(proc.id))}-draft`, `satellite_class: ${BUNDLE}`, 'steps:'];
  for (const s of PROCEDURE_STEPS[procId] ?? []) {
    L.push(`  - n: ${s.n}`, `    kind: ${s.kind}`, `    text: "${s.text}"`);
    if (s.mnemonic) L.push(`    cmd: ${s.mnemonic} ${Object.entries(s.params ?? {}).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    if (s.cond && 'param' in s.cond) L.push(`    condition: ${s.cond.param} ${s.cond.op} ${s.cond.value}`);
    if (s.waitFor) L.push('    for: pus1.completion');
    if (s.timeoutS) L.push(`    timeout: ${s.timeoutS}s`);
    if (s.critical) L.push('    critical: true');
  }
  return L.join('\n') + '\n';
}

function validate(text: string): Finding[] {
  const out: Finding[] = [];
  let step: string | null = null, crit = false, appr = false, stepLine = 0;
  const close = () => { if (step && crit && !appr) out.push({ sev: 'WARNING', line: stepLine, text: `Step ${step}: a critical command needs "approval: two-person"`, fix: true }); };
  text.split('\n').forEach((l, i) => {
    const m = l.match(/^\s*-\s*n:\s*(\d+)/);
    if (m) { close(); step = m[1]; crit = false; appr = false; stepLine = i + 1; return; }
    if (/^\s*critical:\s*true/.test(l) && step) crit = true;
    if (/^\s*approval:\s*two-person/.test(l)) appr = true;
    const c = l.match(/^\s*cmd:\s*(\S+)(.*)$/);
    if (!c) return;
    const def = COMMAND_DICT.find((d) => d.mnemonic === c[1]);
    if (!def) { out.push({ sev: 'ERROR', line: i + 1, text: `Unknown command ${c[1]} (not in dictionary ${BUNDLE})` }); return; }
    for (const [, k, v] of c[2].matchAll(/(\w+)=(\S+)/g)) {
      const pd = def.params.find((x) => x.id === k);
      if (!pd) out.push({ sev: 'ERROR', line: i + 1, text: `${def.mnemonic}: unknown argument ${k}` });
      else if (pd.type === 'number' && (+v < pd.min! || +v > pd.max!)) out.push({ sev: 'ERROR', line: i + 1, text: `${def.mnemonic}: ${k}=${v} is outside ${pd.min} to ${pd.max} ${pd.unit ?? ''}` });
      else if (pd.type === 'enum' && !pd.values!.includes(v)) out.push({ sev: 'ERROR', line: i + 1, text: `${def.mnemonic}: ${k}=${v} is not one of ${pd.values!.join(', ')}` });
    }
  });
  close();
  return out;
}

/** S16 · Procedure editor: YAML with dictionary validation, a simulator run, and one reviewer (a second Flight Engineer) before release. */
export const ProcedureEditor: React.FC<{ procedureId?: string; onNavigate: (path: string) => void }> = ({ procedureId, onNavigate }) => {
  const me = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const mayEdit = can('procedure:author', role);
  const procId = PROCEDURES.some((p) => p.id === procedureId) ? procedureId! : 'PR-THM-004';
  const proc = PROCEDURES.find((p) => p.id === procId)!;
  const draft = useProcedureDraftStore((s) => s.drafts[procId]);
  const put = useProcedureDraftStore((s) => s.put);
  useProcedureRunStore((s) => s.released[procId]); // re-render on release
  const text = draft?.text || toYaml(procId);
  const stage: DraftStage = draft?.stage ?? 0;

  const [results, setResults] = useState<Finding[] | null>(null);
  const [test, setTest] = useState<{ pct: number } | null>(null);
  const [returning, setReturning] = useState(false);
  const [why, setWhy] = useState('');
  const engineers = PEOPLE.filter((p) => p.status === 'ACTIVE' && p.roles.includes('Flight Engineer'));
  const reviewers = engineers.filter((p) => p.name !== (draft?.author ?? me.name)).map((p) => p.name);
  const [reviewer, setReviewer] = useState(draft?.reviewer ?? reviewers[0] ?? '');
  const ta = useRef<HTMLTextAreaElement>(null), gutter = useRef<HTMLDivElement>(null), timer = useRef<number>();
  useEffect(() => () => clearInterval(timer.current), []);
  useEffect(() => { setResults(null); setTest(null); clearInterval(timer.current); }, [procId]);

  const lines = text.split('\n').length;
  const errLines = new Set((results ?? []).map((r) => r.line));
  const locked = stage >= 3;
  const isAuthor = !draft?.author || draft.author === me.name;
  const audit = (t: string, result: 'ACK' | 'NACK' = 'ACK') => useMissionStore.getState().appendAudit({ timestamp_utc: new Date().toISOString(), operator_id: me.id, operator_name: me.name, sat_id: 'AKV-*', command_mnemonic: 'PROCEDURE', procedure_id: procId, procedure_version: versionOf(procId), sequence_count: 0, result, params_summary: t });

  const edit = (v: string) => { put(procId, { text: v, stage: 0, returnedReason: undefined }); setResults(null); setTest(null); };
  const insert = (mn: string) => {
    const def = COMMAND_DICT.find((c) => c.mnemonic === mn)!;
    const snippet = `    cmd: ${mn}${def.params.map((p) => ` ${p.id}=${p.def}`).join('')}\n`;
    const el = ta.current;
    const pos = el ? text.lastIndexOf('\n', Math.max(0, el.selectionStart - 1)) + 1 : text.length;
    edit(text.slice(0, pos) + snippet + text.slice(pos));
  };
  const runValidate = () => { const r = validate(text); setResults(r); put(procId, { text, stage: r.length === 0 ? 1 : 0 }); };
  const applyFix = (r: Finding) => {
    const L = text.split('\n'); let i = r.line;
    while (i < L.length && !/^\s*critical:\s*true/.test(L[i]) && !/^\s*-\s*n:/.test(L[i])) i++;
    L.splice(/^\s*critical:\s*true/.test(L[i] ?? '') ? i + 1 : i, 0, '    approval: two-person');
    const v = L.join('\n'); put(procId, { text: v, stage: 0 }); setResults(validate(v)); setTest(null);
  };
  const steps = PROCEDURE_STEPS[procId] ?? [];
  const runTest = () => {
    setTest({ pct: 0 }); let pct = 0;
    timer.current = window.setInterval(() => {
      pct += 12;
      if (pct >= 100) { clearInterval(timer.current); setTest(null); put(procId, { stage: 2 }); audit(`simulator test run passed on SIM-AKV-03 (${steps.length} steps)`); }
      else setTest({ pct });
    }, 400);
  };
  const submit = () => {
    put(procId, { stage: 3, author: me.name, reviewer, submittedUtc: new Date().toISOString() });
    audit(`submitted for review to ${reviewer}`);
    toast.info('Submitted for review', { body: `${reviewer} or any other Flight Engineer can release it from this editor.` });
  };
  const release = () => {
    const v = bump(versionOf(procId));
    put(procId, { stage: 4, decidedBy: me.name, decidedUtc: new Date().toISOString(), releasedVersion: v });
    useProcedureRunStore.getState().release(procId, v);
    audit(`v${v} released, reviewed by ${me.name}, authored by ${draft?.author}`);
    toast.success(`Released ${procId} v${v}`, { body: 'New runs use this version; runs already going keep theirs.' });
  };
  const sendBack = () => {
    put(procId, { stage: 0, returnedReason: `${me.name}: ${why.trim()}`, decidedBy: me.name, decidedUtc: new Date().toISOString() });
    audit(`returned to ${draft?.author}: ${why.trim()}`, 'NACK');
    setReturning(false); setWhy('');
  };
  const newDraft = () => { put(procId, { text: toYaml(procId), stage: 0, author: undefined, reviewer: undefined, decidedBy: undefined, returnedReason: undefined }); setResults(null); };

  const stepN = test ? Math.round((test.pct / 100) * steps.length) : 0;
  const errors = (results ?? []).filter((r) => r.sev === 'ERROR').length;
  const disabledWhy = mayEdit.allowed ? undefined : mayEdit.reason;
  const releaseBlock = !mayEdit.allowed ? mayEdit.reason : isAuthor ? 'You wrote this draft: a second Flight Engineer reviews and releases it.' : undefined;

  return (
    <>
      <PageHead title="Procedure editor"
        crumb={<label className="inline-flex items-center gap-2">Procedure
          <Select value={procId} onChange={(e) => onNavigate(`editor?proc=${e.target.value}`)} aria-label="Procedure" className="bg-transparent text-[#E9ECF1] font-mono-code outline-none">
            {PROCEDURES.map((p) => <option key={p.id} value={p.id} className="bg-[#11141B]">{p.id} · {p.name}</option>)}
          </Select></label>}
        sub={<>{proc.name} · released v{versionOf(procId)} · author of record {proc.author} · <RouteLink to={`procedure?proc=${procId}`} onNavigate={onNavigate}>Open in the runner</RouteLink></>}
        actions={<>
          <Pill tone={stage === 4 ? 'ok' : stage === 3 ? 'action' : 'neutral'}>{FLOW[stage]}</Pill>
          <Button variant="secondary" onClick={runValidate} disabled={locked || !mayEdit.allowed}><Check size={15} /> Validate</Button>
          <Button onClick={runTest} disabled={stage < 1 || locked || test !== null || !mayEdit.allowed}><FlaskConical size={15} /> Run simulator test</Button>
        </>} />

      {!mayEdit.allowed && <Banner kind="warn" lead="Read only.">{disabledWhy}</Banner>}
      {draft?.returnedReason && stage === 0 && <Banner kind="warn" lead="Returned by the reviewer.">{draft.returnedReason}</Banner>}

      <Card>
        <ol className="grid grid-cols-5 gap-2">
          {FLOW.map((f, k) => <li key={f} className="flex flex-col gap-1.5"><span className={clsx('h-1 rounded-full', k <= stage ? 'bg-[#6CB8FF]' : 'bg-[#232936]')} /><span className={clsx('text-[12px]', k === stage ? 'text-[#E9ECF1] font-medium' : 'text-[#9AA3B2]')}>{f}</span></li>)}
        </ol>
      </Card>

      <div className="flex flex-wrap gap-4 mt-4 items-start">
        <Card title={`Command palette · ${BUNDLE}`} flush className="flex-[1_1_280px] max-w-[340px] min-w-0">
          <div className="flex flex-col px-2 pb-3">
            {COMMAND_DICT.map((c) => (
              <button key={c.mnemonic} onClick={() => insert(c.mnemonic)} disabled={locked || !mayEdit.allowed} className="flex items-center gap-2 px-2.5 py-2 rounded-[10px] text-left hover:bg-[#161A22] disabled:opacity-50">
                <span className="flex-1 min-w-0"><b className="block font-mono-code text-[12.5px] font-normal">{c.mnemonic}</b><span className="block text-[12px] text-[#7C8594] truncate">{c.name} · PUS {c.service}</span></span>
                {c.critical && <Pill tone="warn" className="text-[11px] px-2 py-[2px]">Critical</Pill>}<Plus size={14} className="text-[#7C8594]" />
              </button>
            ))}
            <p className="text-[12px] text-[#7C8594] mt-3 px-2.5">A click inserts a <span className="font-mono-code">cmd:</span> line with default arguments at the cursor line.</p>
          </div>
        </Card>

        <div className="flex-[999_1_560px] min-w-0 flex flex-col gap-4">
          <Card title={`procedures/${proc.category.toLowerCase().replace(/\s+/g, '-')}/${procId.toLowerCase()}.yaml · ${lines} lines`} flush>
            <div className="flex h-[420px] bg-[#090B10] rounded-b-2xl overflow-hidden mx-px mb-px">
              <div ref={gutter} aria-hidden="true" className="w-11 shrink-0 overflow-hidden border-r border-[#161A22] pt-2.5 pb-10 text-right text-[12px] text-[#6B7383] font-mono-code" style={{ lineHeight: `${LH}px` }}>
                {Array.from({ length: lines }, (_, i) => <div key={i} className={clsx('pr-2', errLines.has(i + 1) && 'text-[#F5C451] bg-[#F5C451]/10')} style={{ height: LH }}>{i + 1}</div>)}
              </div>
              <textarea ref={ta} value={text} spellCheck={false} readOnly={locked || !mayEdit.allowed} onChange={(e) => edit(e.target.value)} onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }} aria-label="Procedure YAML"
                className="flex-1 resize-none border-0 bg-transparent text-[#E9ECF1] px-3 py-2.5 text-[12.5px] font-mono-code whitespace-pre overflow-auto" style={{ lineHeight: `${LH}px`, outline: 'none', boxShadow: 'none' }} />
            </div>
          </Card>

          <div className="flex flex-wrap gap-4">
            <Card title="Validation results" className="flex-[1_1_320px] min-w-0">
              {results === null ? <p className="text-[13px] text-[#7C8594]">{stage >= 1 ? 'Validated: every command and argument matches the dictionary.' : 'Not validated since the last edit. Validation checks commands and arguments against the dictionary and the policy rules.'}</p>
                : results.length === 0 ? <Banner kind="ok" lead="No findings.">{steps.length} steps, every argument in range.</Banner>
                  : <div className="flex flex-col gap-2">
                    {results.map((r, k) => (
                      <div key={k} className="flex items-start gap-2 text-[12.5px]">
                        {r.sev === 'ERROR' ? <XCircle size={15} className="text-[#FF6B6B] shrink-0 mt-0.5" /> : <TriangleAlert size={15} className="text-[#F5C451] shrink-0 mt-0.5" />}
                        <span className="flex-1"><span className="font-mono-code text-[#7C8594]">line {r.line}</span> {r.text}</span>
                        {r.fix && <Button size="sm" variant="ghost" onClick={() => applyFix(r)} disabled={!mayEdit.allowed}><Wand2 size={13} /> Apply fix</Button>}
                      </div>
                    ))}
                    <p className="text-[12px] text-[#7C8594]">{errors} error{errors === 1 ? '' : 's'}, {results.length - errors} warning{results.length - errors === 1 ? '' : 's'}</p>
                  </div>}
            </Card>
            <Card title="Simulator test run · SIM-AKV-03" actions={<SampleTag>Simulated run</SampleTag>} className="flex-[1_1_320px] min-w-0">
              {test ? <div className="flex flex-col gap-2"><div className="h-2 rounded bg-[#1A1E27]"><i className="block h-full rounded bg-[#6CB8FF]" style={{ width: `${test.pct}%` }} /></div>
                <span className="text-[12.5px] text-[#9AA3B2]">Step {Math.max(1, stepN)} of {steps.length} · {steps[Math.max(0, stepN - 1)]?.text}</span></div>
                : stage >= 2 ? <Banner kind="ok" lead="Passed.">{steps.length} of {steps.length} steps completed against the simulated satellite.</Banner>
                  : <p className="text-[13px] text-[#7C8594]">{stage < 1 ? 'Validate without findings to enable the test run.' : 'Ready. The run executes every step against the simulated satellite.'}</p>}
            </Card>
          </div>

          <Card title="Review · one reviewer and a passing simulator run are required to release">
            {stage < 3 && (
              <div className="flex flex-wrap items-end gap-4">
                <label className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2] w-64">Ask a reviewer
                  <Select value={reviewer} onChange={(e) => setReviewer(e.target.value)} className={field}>{reviewers.map((r) => <option key={r}>{r}</option>)}</Select>
                </label>
                <span className="text-[12.5px] text-[#7C8594] max-w-[46ch]">Any Flight Engineer other than the author can release it from this editor; the one you ask is notified first.</span>
                <span className="flex-1" />
                {stage === 4 ? <Button variant="secondary" onClick={newDraft} disabled={!mayEdit.allowed}>Start a new draft</Button>
                  : <Button onClick={submit} disabled={stage !== 2 || !mayEdit.allowed || !reviewer} reason={stage !== 2 && mayEdit.allowed ? 'Needs a passing simulator run' : undefined}><Send size={15} /> Submit for review</Button>}
              </div>
            )}
            {stage === 3 && (
              <div className="flex flex-col gap-3">
                <p className="text-[13.5px] text-[#C9CED6]">Submitted by <b className="font-medium">{draft?.author}</b> at {utc(draft?.submittedUtc)} UTC; {draft?.reviewer} was asked to review. {isAuthor ? 'Waiting for a second Flight Engineer: they open this procedure in the editor to release it.' : 'You can release it, or send it back with a reason.'}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" disabled={!!releaseBlock} onClick={() => setReturning(true)}><Undo2 size={15} /> Send back…</Button>
                  <Button disabled={!!releaseBlock} reason={releaseBlock} onClick={release}><ShieldCheck size={15} /> Approve and release v{bump(versionOf(procId))}</Button>
                </div>
              </div>
            )}
            {stage === 4 && <p className="text-[13px] text-[#4ADE9A] mt-3">Released v{draft?.releasedVersion} by {draft?.decidedBy} at {utc(draft?.decidedUtc)} UTC. New runs use it.</p>}
          </Card>
        </div>
      </div>

      {returning && (
        <Modal title="Send back to the author" onClose={() => setReturning(false)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setReturning(false)}>Cancel</Button><Button variant="danger" disabled={!why.trim()} reason={!why.trim() ? 'A reason is required' : undefined} onClick={sendBack}>Send back</Button></>}>
          <label className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2]">What has to change<input value={why} onChange={(e) => setWhy(e.target.value)} className={field} /></label>
        </Modal>
      )}
    </>
  );
};
