import React from 'react';
import { clsx } from 'clsx';
import { Card, KpiTile, PageHead, Td, Th } from '../../components/molecules/Page';
import { Button } from '../../components/atoms/Button';
import { useMissionStore } from '../../store/useMissionStore';

const FOP_STATES = [
  { id: 'S1', label: 'Active' },
  { id: 'S2', label: 'Retransmit' },
  { id: 'S3', label: 'Retransmit wait' },
  { id: 'S4', label: 'Init no BC' },
  { id: 'S5', label: 'Init with BC' },
  { id: 'S6', label: 'Initial (operator)' },
];

const STATUS_CLS: Record<string, string> = {
  COMPLETED: 'text-[#4CAF81]', ACCEPTED: 'text-[#4A9EFF]', RELEASED: 'text-[#4A9EFF]',
  AWAITING_APPROVAL: 'text-[#9C9AEC]', REJECTED: 'text-[#FF6B6B]', FAILED: 'text-[#FF6B6B]',
  DRAFT: 'text-[#A1A7B3]', STARTED: 'text-[#4A9EFF]',
};

/** S15 · Uplink & COP-1 — one lease per satellite, stamped with a fencing epoch. */
export const CommandQueue: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const { fop1, commands } = useMissionStore();

  const Bit = ({ label, on, danger }: { label: string; on: boolean; danger?: boolean }) => (
    <div className="flex items-center justify-between py-1.5 text-[13px] border-b border-[#23272F] last:border-0">
      <span className="font-mono-code text-[12.5px]">{label}</span>
      <span className={clsx('font-mono-code text-[12.5px] font-bold', on && danger ? 'text-[#FF6B6B]' : on ? 'text-[#4A9EFF]' : 'text-[#A1A7B3]')}>
        {on ? '1' : '0'}
      </span>
    </div>
  );

  return (
    <>
      <PageHead
        title="Uplink & COP-1"
        sub="AKV-03 · forward link"
        actions={<Button variant="secondary" onClick={() => onNavigate('command')}>Command console</Button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiTile value={fop1.vS} label="V(S) next frame" tone="info" />
        <KpiTile value={fop1.nnR} label="NN(R) acknowledged" />
        <KpiTile value={fop1.owner} label="Shard owner" sub={`fencing epoch ${fop1.epoch}`} />
        <KpiTile value={commands.filter((c) => c.status === 'COMPLETED').length} label="Completed this pass" tone="ok" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        <div className="flex flex-col gap-4">
          <Card title="FOP-1 state machine">
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {FOP_STATES.map((s) => (
                <div key={s.id}
                  className={clsx('border rounded p-2.5 flex flex-col gap-0.5',
                    fop1.state === s.id ? 'border-[#4A9EFF] bg-[#4A9EFF]/12' : 'border-[#2B303B]')}>
                  <span className={clsx('font-mono-code text-[12.5px] font-bold', fop1.state === s.id ? 'text-[#4A9EFF]' : 'text-[#A1A7B3]')}>{s.id}</span>
                  <span className="text-[11px] text-[#A1A7B3]">{s.label}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Sliding window">
            <div className="flex gap-1">
              {Array.from({ length: 10 }, (_, i) => {
                const seq = fop1.nnR - 2 + i;
                const sent = seq < fop1.vS;
                const acked = seq < fop1.nnR;
                return (
                  <div key={seq} className="flex-1 flex flex-col items-center gap-1">
                    <span className={clsx('w-full h-7 rounded-[3px] border',
                      acked ? 'bg-[#4CAF81]/25 border-[#4CAF81]/60' : sent ? 'bg-[#4A9EFF]/25 border-[#4A9EFF]/60' : 'bg-[#1A1D24] border-[#2B303B]')} />
                    <span className="font-mono-code text-[10.5px] text-[#A1A7B3] tabular-nums">{seq}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[12px] text-[#A1A7B3] mt-3">
              Acknowledged up to NN(R)={fop1.nnR}; next frame V(S)={fop1.vS}. Duplicates are structurally impossible (Q-04).
            </p>
          </Card>

          <Card title="Queue">
            <table className="w-full border-collapse">
              <thead><tr><Th>Command</Th><Th>Mnemonic</Th><Th>Parameters</Th><Th>Requested by</Th><Th>Approver</Th><Th>Epoch</Th><Th>Status</Th></tr></thead>
              <tbody>
                {commands.length === 0 && (
                  <tr><Td className="text-[#A1A7B3]">Queue empty — run a procedure or send a command.</Td></tr>
                )}
                {commands.map((c) => (
                  <tr key={c.command_id}>
                    <Td className="font-mono-code text-[12.5px] text-[#3CB992]">{c.command_id}</Td>
                    <Td className="font-mono-code text-[12.5px]">{c.mnemonic}</Td>
                    <Td className="font-mono-code text-[12px] text-[#A1A7B3]">{Object.entries(c.params).map(([k, v]) => `${k}=${v}`).join(' ')}</Td>
                    <Td>{c.requested_by}</Td>
                    <Td className={c.approved_by ? '' : 'text-[#5E6572]'}>{c.approved_by ?? '—'}</Td>
                    <Td className="font-mono-code tabular-nums">{c.epoch}</Td>
                    <Td className={STATUS_CLS[c.status]}>{c.status.replace('_', ' ')}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="CLCW register">
            <Bit label="lockout" on={fop1.lockout} danger />
            <Bit label="wait" on={fop1.wait} danger />
            <Bit label="retransmit" on={fop1.retransmit} />
            <div className="flex items-center justify-between py-1.5 text-[13px]">
              <span className="font-mono-code text-[12.5px]">FARM-B counter</span>
              <span className="font-mono-code text-[12.5px] tabular-nums">{fop1.farmB}</span>
            </div>
            <p className="text-[12px] text-[#A1A7B3] mt-2">CLCW feedback must reach FOP-1 within 100 ms (Q-05).</p>
          </Card>

          <Card title="Single writer">
            <div className="flex flex-col gap-1.5 text-[13px]">
              <div className="flex justify-between"><span>Owner</span><span className="font-mono-code text-[12.5px]">{fop1.owner}</span></div>
              <div className="flex justify-between"><span>Fencing epoch</span><span className="font-mono-code text-[12.5px] tabular-nums">{fop1.epoch}</span></div>
              <div className="flex justify-between"><span>Lease</span><span className="font-mono-code text-[12.5px] text-[#4CAF81]">held</span></div>
            </div>
            <p className="text-[12px] text-[#A1A7B3] mt-2">A hand-over increments the epoch; frames stamped with an older epoch are refused.</p>
          </Card>
        </div>
      </div>
    </>
  );
};
