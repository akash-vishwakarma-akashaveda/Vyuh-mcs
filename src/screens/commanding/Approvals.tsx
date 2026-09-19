import React, { useState } from 'react';
import { Fingerprint, ShieldAlert } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Banner, Card, PageHead } from '../../components/molecules/Page';
import { useAuthStore } from '../../store/useAuthStore';
import { useMissionStore } from '../../store/useMissionStore';
import { canApprove } from '../../auth/policy';

const mins = (utc: string) => Math.max(0, Math.round((Date.parse(utc) - Date.now()) / 60000));

/** S13 · Approvals — second-person approval with passkey step-up (Q-14, C-07). */
export const Approvals: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const { approvals, decideApproval } = useMissionStore();
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const signInAs = useAuthStore((s) => s.signInAs);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stepUp, setStepUp] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const pending = approvals.filter((a) => a.state === 'PENDING');
  const selected = approvals.find((a) => a.approval_id === (selectedId ?? pending[0]?.approval_id));

  const decision = selected
    ? canApprove(role, selected.requested_by, user.name)
    : { allowed: false as const, reason: undefined };
  const isRequester = selected?.requested_by === user.name;

  return (
    <>
      <PageHead
        title="Approvals"
        sub="Critical commands and procedures need a second person"
        actions={role !== 'Flight Director' ? <Button variant="secondary" onClick={() => signInAs('USR-002', 'Flight Director')}>Switch to Flight Director</Button> : undefined}
      />

      {selected && !decision.allowed && decision.reason && (
        <Banner kind={isRequester ? 'crit' : 'warn'} lead={isRequester ? 'Blocked.' : 'Read only.'}>
          {decision.reason}
        </Banner>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        <Card title={`Pending · ${pending.length}`}>
          {pending.length === 0 && <p className="text-[13px] text-[#A1A7B3]">Nothing waiting for approval.</p>}
          <div className="flex flex-col gap-2">
            {pending.map((a) => {
              const left = mins(a.expires_utc);
              return (
                <button key={a.approval_id} onClick={() => setSelectedId(a.approval_id)}
                  className={`text-left border rounded p-3 flex flex-col gap-1 ${selected?.approval_id === a.approval_id ? 'border-[#3CB992] bg-[#0F6E56]/10' : 'border-[#2B303B] hover:bg-[#1A1D24]'}`}>
                  <span className="flex items-center justify-between">
                    <span className="font-mono-code text-[12.5px] text-[#3CB992]">{a.mnemonic}</span>
                    <span className={`font-mono-code text-[10.5px] font-bold ${left <= 3 ? 'text-[#FF6B6B]' : 'text-[#E8943A]'}`}>
                      {left} min to LOS
                    </span>
                  </span>
                  <span className="text-[13px]">{a.sat_id} · {a.reason}</span>
                  <span className="text-[12px] text-[#A1A7B3]">Requested by {a.requested_by}</span>
                </button>
              );
            })}
          </div>
        </Card>

        {selected ? (
          <Card title={`${selected.mnemonic} · ${selected.sat_id}`}>
            <dl className="grid grid-cols-2 gap-3 mb-4 text-[13px]">
              <div><dt className="text-[#A1A7B3] text-[11px] uppercase tracking-[0.06em] font-bold">Who asked</dt><dd>{selected.requested_by}</dd></div>
              <div><dt className="text-[#A1A7B3] text-[11px] uppercase tracking-[0.06em] font-bold">When</dt><dd className="font-mono-code">{selected.requested_utc.slice(11, 19)} UTC</dd></div>
              <div className="col-span-2"><dt className="text-[#A1A7B3] text-[11px] uppercase tracking-[0.06em] font-bold">Why</dt><dd>{selected.reason}</dd></div>
              <div className="col-span-2">
                <dt className="text-[#A1A7B3] text-[11px] uppercase tracking-[0.06em] font-bold">Parameters</dt>
                <dd className="font-mono-code text-[12.5px]">{Object.entries(selected.params).map(([k, v]) => `${k}=${v}`).join('  ')}</dd>
              </div>
            </dl>

            <div className="border border-[#2B303B] rounded">
              <div className="px-3 py-2 border-b border-[#23272F] flex items-center gap-2">
                <ShieldAlert size={15} className="text-[#4A9EFF]" />
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#A1A7B3]">Interlock snapshot</span>
              </div>
              {selected.interlocks.map((i) => (
                <div key={i.param} className="flex items-center justify-between px-3 py-2 border-b border-[#23272F] last:border-0 text-[13px]">
                  <span className="font-mono-code text-[12.5px] text-[#3CB992]">{i.param}</span>
                  <span className="tabular-nums">{i.value}</span>
                  <span className="text-[#A1A7B3] text-[12px]">{i.rule}</span>
                  <span className={i.pass ? 'text-[#4CAF81]' : 'text-[#FF6B6B]'}>{i.pass ? 'PASS' : 'FAIL'}</span>
                </div>
              ))}
            </div>

            {selected.state === 'PENDING' ? (
              <div className="flex items-center gap-2 mt-4">
                <Button variant="ghost" onClick={() => setRejecting((v) => !v)}>Reject…</Button>
                <Button disabled={!decision.allowed} onClick={() => setStepUp(true)}>
                  <Fingerprint size={16} /> Approve with passkey
                </Button>
              </div>
            ) : (
              <Banner kind={selected.state === 'APPROVED' ? 'ok' : 'crit'} lead={selected.state === 'APPROVED' ? 'Approved.' : 'Rejected.'}>
                {selected.decided_by} · {selected.decided_utc?.slice(11, 19)} UTC {selected.reject_reason ? `— ${selected.reject_reason}` : ''}
              </Banner>
            )}

            {rejecting && selected.state === 'PENDING' && (
              <div className="flex flex-col gap-2 mt-3 border border-[#2B303B] rounded p-3">
                <label className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#A1A7B3]">Reason (required)</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)}
                  className="h-9 bg-[#0C0D10] border border-[#2B303B] focus:border-[#4A9EFF] rounded-[2px] px-2.5 text-[14px] outline-none" />
                <Button size="sm" variant="danger" disabled={!reason.trim() || !decision.allowed}
                  onClick={() => { decideApproval(selected.approval_id, false, user.name, reason); setRejecting(false); setReason(''); }}>
                  Reject request
                </Button>
              </div>
            )}
          </Card>
        ) : (
          <Card><p className="text-[13px] text-[#A1A7B3]">Select a request.</p></Card>
        )}
      </div>

      {/* Step-up confirmation — Cancel has default focus (BR-S12-03). */}
      {stepUp && selected && (
        <div className="fixed inset-0 bg-[#1B1F26]/[0.62] z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="w-[520px] max-w-full bg-[#22262F] border border-[#2B303B] rounded-xl">
            <header className="flex items-center gap-2 px-5 py-4 border-b border-[#2B303B]">
              <Fingerprint size={20} className="text-[#3CB992]" />
              <h2 className="text-[16px] font-bold">Confirm with passkey</h2>
            </header>
            <div className="p-5 text-[13px] text-[#A1A7B3]">
              Approving <span className="font-mono-code text-[#F3F4F6]">{selected.mnemonic} {Object.entries(selected.params).map(([k, v]) => `${k}=${v}`).join(' ')}</span> on {selected.sat_id}. Step-up to acr=2.
            </div>
            <footer className="flex justify-end gap-2 px-5 py-4 border-t border-[#2B303B]">
              <Button variant="ghost" autoFocus onClick={() => setStepUp(false)}>Cancel</Button>
              <Button onClick={() => {
                decideApproval(selected.approval_id, true, user.name);
                setStepUp(false);
                onNavigate(`uplink?sat=${selected.sat_id}`);
              }}>
                Use passkey
              </Button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
};
