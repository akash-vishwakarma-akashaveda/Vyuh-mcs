import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Clock, Fingerprint, Lock } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Pill } from '../../components/atoms/Badge';
import { Banner, Card, PageHead, Segmented } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { useAuthStore } from '../../store/useAuthStore';
import { useMissionStore, type MissionApproval } from '../../store/useMissionStore';
import { canApprove } from '../../auth/policy';
import { toast } from '../../store/useToastStore';
import { RouteLink, ago, approversFor, contactOf, effectiveState, field, interlocksFor, mmss, orList, paramText, setHashParams, useHashParams, useNow, utc } from './gates';

type Tab = 'waiting' | 'decided' | 'expired';
const today = (iso?: string) => !!iso && iso.slice(0, 10) === new Date().toISOString().slice(0, 10);

/** S13 · Approvals: second-person approval with passkey step-up. The requester can never approve. */
export const Approvals: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const approvals = useMissionStore((s) => s.approvals);
  const decideApproval = useMissionStore((s) => s.decideApproval);
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const params = useHashParams();
  const now = useNow(1000);

  const tab: Tab = params.tab === 'decided' || params.tab === 'expired' ? params.tab : 'waiting';
  const withState = approvals.map((a) => ({ a, st: effectiveState(a, now) }));
  const lists: Record<Tab, MissionApproval[]> = {
    waiting: withState.filter((x) => x.st === 'PENDING').map((x) => x.a).sort((x, y) => Date.parse(x.requested_utc) - Date.parse(y.requested_utc)),
    decided: withState.filter((x) => (x.st === 'APPROVED' || x.st === 'REJECTED' || x.st === 'WITHDRAWN') && today(x.a.decided_utc)).map((x) => x.a),
    expired: withState.filter((x) => x.st === 'EXPIRED').map((x) => x.a),
  };
  const list = lists[tab];
  const selected = list.find((a) => a.approval_id === params.id) ?? list[0];
  const st = selected ? effectiveState(selected, now) : undefined;

  const [stepUp, setStepUp] = useState<'idle' | 'open' | 'touching'>('idle');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  useEffect(() => { setStepUp('idle'); setRejecting(false); setReason(''); }, [selected?.approval_id]);

  const decision = selected ? canApprove(role, selected.requested_by, user.name) : { allowed: false };
  const mine = lists.waiting.filter((a) => a.requested_by === user.name);

  const approve = () => {
    if (!selected) return;
    setStepUp('touching');
    // ponytail: the passkey ceremony is simulated (acr=2 recorded); wire navigator.credentials.get when Keycloak step-up lands.
    window.setTimeout(() => {
      if (effectiveState(useMissionStore.getState().approvals.find((a) => a.approval_id === selected.approval_id)!, Date.now()) !== 'PENDING') {
        setStepUp('idle'); toast.warning('Not approved', { body: 'The request expired or was withdrawn while you were confirming.' }); return;
      }
      decideApproval(selected.approval_id, true, user.name);
      setStepUp('idle');
      toast.success(`Approved: ${selected.mnemonic} on ${selected.sat_id}`, { body: `Released to the uplink. ${selected.requested_by} sees the progress in their console.`, key: selected.approval_id });
    }, 700);
  };
  const reject = () => {
    if (!selected || !reason.trim()) return;
    decideApproval(selected.approval_id, false, user.name, reason.trim());
    setRejecting(false); setReason('');
  };

  return (
    <>
      <PageHead title="Approvals" sub={<>Command · signed in as <span className="text-[#C9CED6]">{user.name}, {role}</span></>}
        actions={<Segmented value={tab} onChange={(v) => setHashParams({ tab: v === 'waiting' ? undefined : v, id: undefined })}
          options={[{ value: 'waiting', label: `Waiting · ${lists.waiting.length}` }, { value: 'decided', label: `Decided today · ${lists.decided.length}` }, { value: 'expired', label: `Expired · ${lists.expired.length}` }]} />} />

      <div className="flex flex-wrap gap-4 items-start mb-4">
        <section className="flex-[1_1_320px] min-w-0 bg-[#11141B] border border-[#1A1E27] rounded-2xl p-[18px] flex flex-col gap-2.5">
          <span className="flex justify-between items-center"><span className="text-[14px] font-medium">{tab === 'waiting' ? 'Waiting for a Flight Director' : tab === 'decided' ? 'Decided today' : 'Expired without a decision'}</span><span className="text-[12px] text-[#7C8594]">{tab === 'waiting' ? 'oldest first' : 'newest first'}</span></span>
          {list.length === 0 && <p className="text-[13px] text-[#9AA3B2] py-2">{tab === 'waiting' ? 'Nothing waiting for approval.' : tab === 'decided' ? 'Nothing decided today.' : 'Nothing has expired.'}</p>}
          {list.map((a) => {
            const left = (Date.parse(a.expires_utc) - now) / 1000;
            const los = contactOf(a.sat_id, now).los;
            const on = selected?.approval_id === a.approval_id;
            return (
              <button key={a.approval_id} data-approval={a.approval_id} data-requester={a.requested_by} type="button" aria-pressed={on} onClick={() => setHashParams({ id: a.approval_id })}
                className={clsx('w-full text-left rounded-xl p-3.5 flex flex-col gap-1.5', on ? 'bg-[#1B2130]' : 'bg-[#161A22] hover:bg-[#1A1E27]')}>
                <span className="flex justify-between items-center gap-2 flex-wrap">
                  <span className="font-mono-code text-[13px]">{a.mnemonic}</span>
                  {tab === 'waiting' ? (
                    <span className="flex gap-1.5">
                      <Pill tone={left < 180 ? 'crit' : left < 600 ? 'warn' : 'neutral'}><Clock size={12} aria-hidden="true" /><span className="font-mono-code" aria-label="Expires in">{mmss(left)}</span></Pill>
                      {los && <Pill tone="info"><span>LOS</span><span className="font-mono-code">{mmss((los - now) / 1000)}</span></Pill>}
                    </span>
                  ) : <Pill tone={effectiveState(a, now) === 'APPROVED' ? 'ok' : effectiveState(a, now) === 'WITHDRAWN' ? 'neutral' : 'crit'}>{({ APPROVED: 'Approved', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn', EXPIRED: 'Expired', PENDING: 'Waiting' } as Record<string, string>)[effectiveState(a, now)]}</Pill>}
                </span>
                <span className="text-[13.5px] leading-[1.4]"><span className="font-mono-code">{a.sat_id}</span> · {a.reason || 'No reason given'}</span>
                <span className="text-[12px] text-[#7C8594]">{a.requested_by}{a.requested_by === user.name ? ' (you)' : ''} · {ago(a.requested_utc)}</span>
              </button>
            );
          })}
        </section>

        {selected ? (
          <section className="flex-[999_1_560px] min-w-0 bg-[#11141B] border border-[#1A1E27] rounded-2xl p-5 flex flex-col gap-[18px]">
            <div className="flex flex-wrap justify-between items-start gap-3">
              <div className="flex flex-col gap-1.5 min-w-0">
                <span className="font-mono-code text-[20px] font-medium break-all">{selected.mnemonic} {paramText(selected.params)}</span>
                <span className="text-[13px] text-[#9AA3B2]"><span className="font-mono-code">{selected.sat_id} · {selected.approval_id} · {selected.command_id}</span>{selected.source ? <> · from <span className="font-mono-code">{selected.source}</span></> : null}</span>
              </div>
              {st === 'PENDING' && (
                <div className="flex flex-wrap gap-1.5">
                  <Pill tone="warn">Expires in <span className="font-mono-code">{mmss((Date.parse(selected.expires_utc) - now) / 1000)}</span></Pill>
                  {(() => { const c = contactOf(selected.sat_id, now); return c.los ? <Pill tone="info">LOS in <span className="font-mono-code">{mmss((c.los - now) / 1000)}</span></Pill> : <Pill tone="neutral">Not in contact{c.nextAos ? ` · next AOS ${utc(c.nextAos, false)}` : ''}</Pill>; })()}
                </div>
              )}
            </div>

            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <div className="rounded-xl bg-[#161A22] px-4 py-3.5 flex flex-col gap-1"><span className="text-[12px] text-[#7C8594]">Asked by</span><span className="text-[14px]">{selected.requested_by}{selected.requester_role ? ` · ${selected.requester_role}` : ''}</span><span className="text-[12px] text-[#9AA3B2]"><span className="font-mono-code">{utc(selected.requested_utc)}</span> UTC</span></div>
              <div className="rounded-xl bg-[#161A22] px-4 py-3.5 flex flex-col gap-1"><span className="text-[12px] text-[#7C8594]">Why</span><span className="text-[14px] leading-[1.5]">{selected.reason || 'No reason given'}</span></div>
            </div>

            <InterlockTable a={selected} now={now} live={st === 'PENDING'} />

            {st === 'PENDING' ? (
              <div className="flex flex-wrap justify-between items-center gap-4 mt-auto pt-1">
                <span className="text-[13px] text-[#9AA3B2] max-w-[440px] leading-[1.5]">
                  {decision.allowed
                    ? <>Approving releases it to the uplink at once. {selected.requested_by} sees the progress in their console; you stay here.</>
                    : selected.requested_by === user.name
                      ? <>You raised this request. {orList(approversFor(user.name)) || 'Another Flight Director'} has been asked to approve it.</>
                      : decision.reason}
                </span>
                <div className="flex flex-wrap gap-2.5">
                  <Button variant="danger" disabled={!decision.allowed} onClick={() => setRejecting(true)}>Reject with reason</Button>
                  <Button disabled={!decision.allowed} onClick={() => setStepUp('open')}>{decision.allowed ? <Fingerprint size={15} /> : <Lock size={14} />} Approve with passkey</Button>
                </div>
              </div>
            ) : (
              <Banner kind={st === 'APPROVED' ? 'ok' : st === 'WITHDRAWN' ? 'info' : 'crit'}
                lead={st === 'APPROVED' ? 'Approved.' : st === 'WITHDRAWN' ? 'Withdrawn.' : st === 'EXPIRED' ? 'Expired.' : 'Rejected.'}>
                {st === 'EXPIRED' ? `Nobody decided before ${utc(selected.expires_utc)} UTC; the command was never sent. ${selected.requested_by} can raise it again.`
                  : st === 'WITHDRAWN' ? `${selected.requested_by} cancelled the request at ${utc(selected.decided_utc)} UTC before anyone decided.`
                  : `${selected.decided_by} at ${utc(selected.decided_utc)} UTC${selected.reject_reason ? `: ${selected.reject_reason}` : ''}`}
              </Banner>
            )}
            {st === 'APPROVED' && <span className="text-[13px] text-[#9AA3B2]">Follow the command: <RouteLink to={`uplink?sat=${selected.sat_id}`} onNavigate={onNavigate}>Uplink &amp; COP-1</RouteLink></span>}
          </section>
        ) : (
          <Card className="flex-[999_1_560px] min-w-0"><p className="text-[13px] text-[#9AA3B2]">Select a request to see who asked, why, and the interlocks then and now.</p></Card>
        )}
      </div>

      {mine.length > 0 && tab === 'waiting' && (
        <Card title="Your own requests">
          <div className="flex flex-col gap-2">
            {mine.map((a) => (
              <div key={a.approval_id} className="flex flex-wrap gap-3.5 items-center">
                <Button disabled reason={`You raised ${a.mnemonic} on ${a.sat_id}. ${orList(approversFor(user.name)) || 'Another Flight Director'} has been asked to approve it.`}><Lock size={14} /> Approve with passkey</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {stepUp !== 'idle' && selected && (
        <Modal title="Confirm with your passkey" onClose={() => setStepUp('idle')}
          footer={<>
            <Button variant="secondary" autoFocus onClick={() => setStepUp('idle')}>Cancel</Button>
            <Button onClick={approve} isLoading={stepUp === 'touching'}><Fingerprint size={15} /> Use passkey</Button>
          </>}>
          <p className="text-[13.5px] text-[#C9CED6] leading-[1.5]">
            Approving <span className="font-mono-code text-[#E9ECF1]">{selected.mnemonic} {paramText(selected.params)}</span> on <span className="font-mono-code">{selected.sat_id}</span>, requested by {selected.requested_by}. A fresh passkey touch (step-up to acr=2) is recorded with your decision in the audit ledger.
          </p>
          {stepUp === 'touching' && <Banner kind="info" lead="Touch your security key.">Waiting for the authenticator…</Banner>}
        </Modal>
      )}

      {rejecting && selected && (
        <Modal title={`Reject ${selected.mnemonic}`} onClose={() => setRejecting(false)}
          footer={<>
            <Button variant="secondary" autoFocus onClick={() => setRejecting(false)}>Keep waiting</Button>
            <Button variant="danger" disabled={!reason.trim()} reason={!reason.trim() ? 'A reason is required' : undefined} onClick={reject}>Reject request</Button>
          </>}>
          <label className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2]">Reason, shown to {selected.requested_by} and kept in the ledger
            <input value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && reject()} className={field} placeholder="What has to change before this can go" />
          </label>
        </Modal>
      )}
    </>
  );
};

/** The interlocks when the request was raised next to their values now. */
const InterlockTable: React.FC<{ a: MissionApproval; now: number; live: boolean }> = ({ a, now, live }) => {
  const nowRows = live ? interlocksFor(a.mnemonic, a.sat_id, now) : [];
  const params = [...new Set([...a.interlocks.map((i) => i.param), ...nowRows.map((r) => r.param)])];
  return (
    <div className="flex flex-col gap-1 overflow-x-auto">
      <span className="flex justify-between items-center gap-2"><span className="text-[14px] font-medium">Interlock</span><span className="text-[12px] text-[#7C8594]">{live ? 'at request and now' : 'at request'}</span></span>
      <table className="w-full min-w-[480px] text-[13px] border-separate" style={{ borderSpacing: '0 4px' }}>
        <thead><tr className="text-left text-[12px] text-[#6B7383]"><th className="px-3 py-1 font-normal">Parameter</th><th className="px-3 py-1 font-normal">When asked {utc(a.requested_utc, false)}</th>{live && <th className="px-3 py-1 font-normal">Now {utc(now, false)}</th>}<th className="px-3 py-1 font-normal">Result</th></tr></thead>
        <tbody>
          {params.map((p) => {
            const then = a.interlocks.find((i) => i.param === p);
            const cur = nowRows.find((r) => r.param === p);
            const pass = live ? (cur?.pass ?? false) : (then?.pass ?? false);
            return (
              <tr key={p} className="bg-[#141821]">
                <td className="px-3 py-2.5 rounded-l-[10px] font-mono-code">{p}</td>
                <td className="px-3 py-2.5 font-mono-code text-[#C9CED6]">{then ? `${then.value}${then.rule && then.rule !== 'reported' ? ` (${then.rule})` : ''}` : '—'}</td>
                {live && <td className="px-3 py-2.5 font-mono-code">{cur ? cur.value : '—'}</td>}
                <td className="px-3 py-2.5 rounded-r-[10px]"><Pill tone={pass ? 'ok' : 'crit'}>{pass ? 'Pass' : 'Fail'}</Pill></td>
              </tr>
            );
          })}
          {params.length === 0 && <tr><td colSpan={live ? 4 : 3} className="px-3 py-2.5 bg-[#141821] rounded-[10px] text-[#7C8594]">No interlock defined for this command.</td></tr>}
        </tbody>
      </table>
    </div>
  );
};
