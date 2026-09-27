import React, { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { ArrowLeft, Check, FlaskConical, Plus, Send, ShieldCheck, TriangleAlert, Wand2, XCircle } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Banner, Card, PageHead } from '../../components/molecules/Page';
import { PROCEDURE_PR_THM_004 as PROC } from '../../data/fleet';
import { COMMAND_DICT } from '../../ops/commandDict';
import { can } from '../../auth/policy';
import { PEOPLE, useAuthStore } from '../../store/useAuthStore';
import { useMissionStore } from '../../store/useMissionStore';
import { toast } from '../../store/useToastStore';

const LH = 20;
const FLOW = ['Draft', 'Validated', 'Test passed', 'In review', 'Released'];
const BUNDLE = 'akv-mdb 4.19.0';
interface Finding { sev: 'ERROR' | 'WARNING'; line: number; text: string; fix?: boolean }

// The procedure as YAML. Step 5 is left without its approval policy on purpose, so the fix is visible.
function toYaml(): string {
  const L = [`id: ${PROC.id}`, `name: ${PROC.name}`, `version: ${PROC.version}-draft`, `satellite_class: ${BUNDLE}`, 'steps:'];
  for (const s of PROC.steps) {
    L.push(`  - n: ${s.n}`, `    kind: ${s.kind}`, `    text: "${s.text.replace(' (critical — second approver)', '')}"`);
    if (s.mnemonic) L.push(`    cmd: ${s.mnemonic} ${Object.entries(s.params ?? {}).map(([k, v]) => `${k}=${v}`).join(' ')}`);
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
      else if (pd.type === 'number' && (+v < pd.min! || +v > pd.max!)) out.push({ sev: 'ERROR', line: i + 1, text: `${def.mnemonic}: ${k}=${v} is outside ${pd.min}–${pd.max} ${pd.unit ?? ''}` });
      else if (pd.type === 'enum' && !pd.values!.includes(v)) out.push({ sev: 'ERROR', line: i + 1, text: `${def.mnemonic}: ${k}=${v} is not one of ${pd.values!.join(', ')}` });
    }
  });
  close();
  return out;
}

/** S16 · Procedure editor: YAML with dictionary validation, a simulator run, and one reviewer before release. */
export const ProcedureEditor: React.FC<{ procedureId?: string; onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const me = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const mayEdit = can('procedure:author', role);
  const [text, setText] = useState(toYaml);
  const [results, setResults] = useState<Finding[] | null>(null);
  const [stage, setStage] = useState(0);
  const [test, setTest] = useState<{ pct: number } | { verdict: 'PASSED' } | null>(null);
  const reviewers = PEOPLE.filter((p) => p.name !== me.name && p.roles.some((r) => r === 'Flight Director' || r === 'Flight Engineer')).map((p) => p.name);
  const [reviewer, setReviewer] = useState(reviewers[0] ?? '');
  const ta = useRef<HTMLTextAreaElement>(null), gutter = useRef<HTMLDivElement>(null), timer = useRef<number>();
  useEffect(() => () => clearInterval(timer.current), []);
  const lines = text.split('\n').length;
  const errLines = new Set((results ?? []).map((r) => r.line));
  const locked = stage >= 3;
  const audit = (text: string, result: 'ACK' | 'NACK' = 'ACK') => useMissionStore.getState().appendAudit({ timestamp_utc: new Date().toISOString(), operator_id: 'PROC', operator_name: me.name, sat_id: 'AKV-*', command_mnemonic: 'PROCEDURE', procedure_id: PROC.id, procedure_version: PROC.version, sequence_count: 0, result, params_summary: text });

  const edit = (v: string) => { setText(v); setResults(null); setTest(null); setStage(0); };
  const insert = (mn: string) => {
    const def = COMMAND_DICT.find((c) => c.mnemonic === mn)!;
    const snippet = `    cmd: ${mn}${def.params.map((p) => ` ${p.id}=${p.def}`).join('')}\n`;
    const el = ta.current;
    const pos = el ? text.lastIndexOf('\n', Math.max(0, el.selectionStart - 1)) + 1 : text.length;
    edit(text.slice(0, pos) + snippet + text.slice(pos));
    toast.info('Inserted from dictionary', { body: `${mn} · PUS ${def.service}` });
  };
  const runValidate = () => {
    const r = validate(text); setResults(r);
    const ok = r.length === 0; setStage(ok ? 1 : 0);
    ok ? toast.success('Validation passed', { body: `${PROC.id} matches dictionary ${BUNDLE}` }) : toast.warning('Validation findings', { body: `${r.length} finding${r.length > 1 ? 's' : ''}` });
  };
  const applyFix = (r: Finding) => {
    const L = text.split('\n'); let i = r.line;
    while (i < L.length && !/^\s*critical:\s*true/.test(L[i])) i++;
    L.splice(i + 1, 0, '    approval: two-person');
    const v = L.join('\n'); setText(v); setResults(validate(v)); setTest(null);
  };
  const runTest = () => {
    setTest({ pct: 0 }); let pct = 0;
    timer.current = window.setInterval(() => {
      pct += 12;
      if (pct >= 100) { clearInterval(timer.current); setTest({ verdict: 'PASSED' }); setStage(2); toast.success('Simulator run passed', { body: `${PROC.id}: ${PROC.steps.length} of ${PROC.steps.length} steps on SIM-AKV-03` }); }
      else setTest({ pct });
    }, 400);
  };
  const submit = () => { setStage(3); audit(`${PROC.id} submitted for review to ${reviewer}`); toast.info('Submitted for review', { body: `${PROC.id} → ${reviewer}` }); };
  const release = () => {
    // the reviewer decides, not the author: the console stands in for that person only when they are signed in
    if (me.name !== reviewer) { toast.warning('Only the reviewer can release', { body: `Sign in as ${reviewer} to approve ${PROC.id}.` }); return; }
    setStage(4); audit(`${PROC.id} v${PROC.version} released, reviewed by ${reviewer}`); toast.success(`Released ${PROC.id}`, { body: `Approved by ${reviewer}` });
  };

  const stepN = test && 'pct' in test ? Math.round((test.pct / 100) * PROC.steps.length) : 0;
  const errors = (results ?? []).filter((r) => r.sev === 'ERROR').length;
  const verdict = test && 'verdict' in test;
  const disabledWhy = mayEdit.allowed ? undefined : mayEdit.reason;

  return (
    <>
      <PageHead title="Procedure editor" sub={`${PROC.id} · ${PROC.name}`}
        actions={<>
          <Button variant="ghost" onClick={() => onNavigate('/procedure')}><ArrowLeft size={15} /> Procedures</Button>
          <span className="inline-flex h-6 items-center rounded-full border border-[#3E5370] px-2.5 text-[11px] font-bold text-[#A3B1C2]">{FLOW[stage]}</span>
          <Button variant="secondary" onClick={runValidate} disabled={locked || !mayEdit.allowed} title={disabledWhy}><Check size={15} /> Validate</Button>
          <Button onClick={runTest} disabled={stage < 1 || locked || (test !== null && !verdict) || !mayEdit.allowed} title={disabledWhy}><FlaskConical size={15} /> Run simulator test</Button>
        </>} />

      <Card>
        <ol className="grid grid-cols-5 gap-2">
          {FLOW.map((f, k) => <li key={f} className="flex flex-col gap-1.5"><span className={clsx('h-1 rounded-full', k < stage ? 'bg-[#4DACFF]' : k === stage ? 'bg-[#2DCCFF]' : 'bg-[#2A3B52]')} /><span className={clsx('text-[11.5px]', k === stage ? 'font-bold' : 'text-[#A3B1C2]')}>{f}</span></li>)}
        </ol>
      </Card>

      <div className="grid xl:grid-cols-[280px_minmax(0,1fr)] gap-4 mt-4 items-start">
        <Card title={`Command palette · ${BUNDLE}`}>
          <div className="-m-4 flex flex-col">
            {COMMAND_DICT.map((c) => (
              <button key={c.mnemonic} onClick={() => insert(c.mnemonic)} disabled={locked || !mayEdit.allowed} className="flex items-center gap-2 px-4 py-2 text-left border-b border-[#1A2738] hover:bg-[#172434] disabled:opacity-50">
                <span className="flex-1 min-w-0"><b className="block font-mono-code text-[12.5px] text-[#4DACFF]">{c.mnemonic}</b><span className="block text-[11.5px] text-[#8496AB] truncate">{c.name} · PUS {c.service}</span></span>
                {c.critical && <span className="text-[10px] font-bold text-[#FCE83A]">critical</span>}<Plus size={14} className="text-[#8496AB]" />
              </button>
            ))}
          </div>
          <p className="text-[11.5px] text-[#8496AB] mt-4">A click inserts a <span className="font-mono-code">cmd:</span> line with default arguments at the cursor line.</p>
        </Card>

        <div className="flex flex-col gap-4 min-w-0">
          <Card title={`procedures/thermal/${PROC.id.toLowerCase()}.yaml · ${lines} lines`}>
            <div className="-m-4 flex h-[420px] bg-[#0A1018] rounded-b-xl overflow-hidden">
              <div ref={gutter} aria-hidden="true" className="w-11 shrink-0 overflow-hidden border-r border-[#1A2738] pt-2.5 pb-10 text-right text-[12px] text-[#5F7087] font-mono-code" style={{ lineHeight: `${LH}px` }}>
                {Array.from({ length: lines }, (_, i) => <div key={i} className={clsx('pr-2', errLines.has(i + 1) && 'text-[#FCE83A] bg-[#FCE83A]/10')} style={{ height: LH }}>{i + 1}</div>)}
              </div>
              <textarea ref={ta} value={text} spellCheck={false} readOnly={locked || !mayEdit.allowed} onChange={(e) => edit(e.target.value)} onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }} aria-label="Procedure YAML"
                className="flex-1 resize-none border-0 bg-transparent text-[#E6EDF3] px-3 py-2.5 text-[12.5px] font-mono-code whitespace-pre overflow-auto" style={{ lineHeight: `${LH}px`, outline: 'none', boxShadow: 'none' }} />
            </div>
          </Card>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Validation results">
              {results === null ? <p className="text-[13px] text-[#8496AB]">Not validated since the last edit. Validation checks commands and arguments against the dictionary and the policy rules.</p>
                : results.length === 0 ? <Banner kind="ok" lead="No findings.">{PROC.steps.length} steps, every argument in range.</Banner>
                  : <div className="flex flex-col gap-2">
                    {results.map((r, k) => (
                      <div key={k} className="flex items-start gap-2 text-[12.5px]">
                        {r.sev === 'ERROR' ? <XCircle size={15} className="text-[#FF3838] shrink-0 mt-0.5" /> : <TriangleAlert size={15} className="text-[#FCE83A] shrink-0 mt-0.5" />}
                        <span className="flex-1"><span className="font-mono-code text-[#8496AB]">line {r.line}</span> {r.text}</span>
                        {r.fix && <Button size="sm" variant="ghost" onClick={() => applyFix(r)}><Wand2 size={13} /> Apply fix</Button>}
                      </div>
                    ))}
                    <p className="text-[11.5px] text-[#8496AB]">{errors} error{errors === 1 ? '' : 's'}, {results.length - errors} warning{results.length - errors === 1 ? '' : 's'}</p>
                  </div>}
            </Card>
            <Card title="Simulator test run · SIM-AKV-03">
              {!test ? <p className="text-[13px] text-[#8496AB]">{stage < 1 ? 'Validate without findings to enable the test run.' : 'Ready. The run executes every step against the simulated satellite.'}</p>
                : verdict ? <Banner kind="ok" lead="Passed.">{PROC.steps.length} of {PROC.steps.length} steps completed in 3 min 12 s of simulated time; BAT_TEMP rose 4.1 °C after heater B came on.</Banner>
                  : <div className="flex flex-col gap-2"><div className="h-2 rounded bg-[#1F2D40]"><i className="block h-full rounded bg-[#2DCCFF]" style={{ width: `${'pct' in test ? test.pct : 0}%` }} /></div>
                    <span className="text-[12.5px] text-[#A3B1C2]">Step {Math.max(1, stepN)} of {PROC.steps.length} · {PROC.steps[Math.max(0, stepN - 1)].text}</span></div>}
            </Card>
          </div>

          <Card title="Review · one reviewer and a passing simulator run are required to release">
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-[12px] text-[#A3B1C2] w-60">Reviewer
                <select value={reviewer} disabled={locked} onChange={(e) => setReviewer(e.target.value)} className="h-9 rounded-md bg-[#0A1018] border border-[#2A3B52] px-2.5 text-[13px] text-[#E6EDF3]">{reviewers.map((r) => <option key={r}>{r}</option>)}</select>
              </label>
              <div className="text-[13px]"><span className="block text-[11.5px] text-[#8496AB]">Author</span>{me.name}</div>
              <span className="flex-1" />
              {stage < 3 && <Button onClick={submit} disabled={stage !== 2 || !mayEdit.allowed} title={stage !== 2 ? 'Needs a passing simulator run' : disabledWhy}><Send size={15} /> Submit for review</Button>}
              {stage === 3 && <Button onClick={release}><ShieldCheck size={15} /> Approve and release as {reviewer}</Button>}
              {stage === 4 && <span className="text-[13px] font-bold text-[#56F000]">Released v{PROC.version}</span>}
            </div>
            {stage === 3 && me.name !== reviewer && <p className="text-[12px] text-[#8496AB] mt-3">Waiting for {reviewer}. The author cannot approve their own procedure.</p>}
          </Card>
        </div>
      </div>
    </>
  );
};
